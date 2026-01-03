/**
 * Metadata Generator Service
 *
 * Generates comprehensive series metadata using LLM with optional web search enrichment.
 * Uses Claude's web_search tool for real-time web searches, returns structured metadata with
 * LLM self-assessed confidence scores.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ContentBlock, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { getApiKey, hasApiKey, getLLMModel } from './config.service.js';
import { createServiceLogger } from './logger.service.js';

// Beta header for web search capability
const WEB_SEARCH_BETA = 'web-search-2025-03-05';

const logger = createServiceLogger('metadata-generator');

// =============================================================================
// Types & Constants
// =============================================================================

/**
 * Valid ComicInfo.xml Age Rating values
 */
export const VALID_AGE_RATINGS = [
  'Unknown',
  'Adults Only 18+',
  'Early Childhood',
  'Everyone',
  'Everyone 10+',
  'G',
  'Kids to Adults',
  'MA15+',
  'Mature 17+',
  'PG',
  'R18+',
  'Rating Pending',
  'Teen',
  'X18+',
] as const;

export type ValidAgeRating = (typeof VALID_AGE_RATINGS)[number];

/**
 * A generated field with LLM self-assessed confidence
 */
export interface GeneratedField<T = string | number | null> {
  value: T;
  confidence: number; // 0-1 scale
}

/**
 * Full generated metadata payload
 */
export interface GeneratedMetadata {
  summary: GeneratedField<string>;
  deck: GeneratedField<string>;
  ageRating: GeneratedField<ValidAgeRating>;
  genres: GeneratedField<string>; // comma-separated
  tags: GeneratedField<string>; // comma-separated
  startYear: GeneratedField<number | null>;
  endYear: GeneratedField<number | null>;
  // Entity fields (generated when generateEntities option is enabled)
  characters: GeneratedField<string>; // comma-separated, max 15
  teams: GeneratedField<string>; // comma-separated, known teams only
  locations: GeneratedField<string>; // comma-separated, max 7
}

/**
 * Context for metadata generation (uses existing series data for disambiguation)
 */
export interface MetadataGenerationContext {
  name: string;
  publisher?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  volume?: number | null;
  type?: 'western' | 'manga';
  existingGenres?: string | null;
  existingTags?: string | null;
  existingSummary?: string | null;
  existingDeck?: string | null;
  existingAgeRating?: string | null;
  existingCharacters?: string | null;
  existingTeams?: string | null;
  existingLocations?: string | null;
}

/**
 * Wikipedia structured data
 */
export interface WikipediaData {
  title?: string;
  extract?: string; // Main summary
  description?: string; // Short description
}

/**
 * Web enrichment result
 */
export interface WebEnrichmentResult {
  success: boolean;
  wikipediaData?: WikipediaData;
  claudeSearchContext?: string;
  error?: string;
}

/**
 * Generation result
 */
export interface MetadataGenerationResult {
  success: boolean;
  metadata?: GeneratedMetadata;
  webSearchUsed: boolean;
  tokensUsed?: number;
  error?: string;
}

// =============================================================================
// Anthropic Client (Singleton)
// =============================================================================

let anthropicClient: Anthropic | null = null;

/**
 * Get or create the Anthropic client
 */
function getClient(): Anthropic {
  if (anthropicClient) {
    return anthropicClient;
  }

  const apiKey = getApiKey('anthropic');
  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

/**
 * Check if metadata generation is available
 */
export function isMetadataGeneratorAvailable(): boolean {
  return hasApiKey('anthropic');
}

// =============================================================================
// Web Search Tool Configuration
// =============================================================================

/**
 * Web search tool definition for Claude API
 */
const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305' as const,
  name: 'web_search',
  max_uses: 3, // Limit searches per request
};

/**
 * Make an API call with optional web search capability.
 * Handles the multi-turn conversation when Claude uses the web_search tool.
 */
async function callWithWebSearch(
  client: Anthropic,
  model: string,
  system: string,
  userContent: string,
  useWebSearch: boolean
): Promise<{ text: string; webSearchUsed: boolean; tokensUsed: number }> {
  const messages: MessageParam[] = [
    { role: 'user', content: userContent },
  ];

  // Configure tools and betas based on web search flag
  const tools = useWebSearch ? [WEB_SEARCH_TOOL] : undefined;
  const betas = useWebSearch ? [WEB_SEARCH_BETA] : undefined;

  let webSearchUsed = false;
  let totalTokens = 0;

  // Loop to handle tool use responses
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Build request options with beta header if web search is enabled
    const requestOptions = betas ? { headers: { 'anthropic-beta': betas.join(',') } } : undefined;

    const response = await client.messages.create(
      {
        model,
        max_tokens: 4096,
        system,
        messages,
        tools: tools as Anthropic.Messages.Tool[] | undefined,
      },
      requestOptions
    );

    totalTokens += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    // Check for tool use in response
    const toolUseBlocks = response.content.filter((block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === 'tool_use'
    );

    // If Claude used web_search tool, we need to handle the encrypted results
    if (toolUseBlocks.length > 0 && response.stop_reason === 'tool_use') {
      webSearchUsed = true;
      logger.debug(`Claude used web_search tool: ${toolUseBlocks.length} search(es)`);

      // Build tool results - for web_search, results come back in the response
      // We pass them back as-is for Claude to process
      const toolResults: ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
        type: 'tool_result' as const,
        tool_use_id: block.id,
        content: 'Search completed', // Placeholder - actual results are encrypted in the response
      }));

      // Add assistant response and tool results to conversation
      messages.push({ role: 'assistant', content: response.content as ContentBlock[] });
      messages.push({ role: 'user', content: toolResults });

      // Continue the loop to get Claude's final response
      continue;
    }

    // Extract final text response
    const textBlock = response.content.find((block): block is Anthropic.Messages.TextBlock =>
      block.type === 'text'
    );

    if (!textBlock) {
      throw new Error('No text response from Claude');
    }

    return {
      text: textBlock.text,
      webSearchUsed,
      tokensUsed: totalTokens,
    };
  }
}

// =============================================================================
// JSON Extraction Utilities
// =============================================================================

/**
 * Extract JSON object from a response that may contain surrounding text.
 * Handles cases like:
 * - "Here is the JSON: {...}"
 * - "```json\n{...}\n```"
 * - "{...} Let me know if you need anything else!"
 * - Pure JSON
 */
function extractJsonFromResponse(response: string): string {
  let text = response.trim();

  // Remove markdown code blocks if present
  if (text.includes('```json')) {
    const jsonStart = text.indexOf('```json');
    const jsonEnd = text.indexOf('```', jsonStart + 7);
    if (jsonEnd !== -1) {
      text = text.substring(jsonStart + 7, jsonEnd).trim();
    }
  } else if (text.includes('```')) {
    // Generic code block
    const codeBlockMatch = text.match(/```[\s\S]*?({[\s\S]*})[\s\S]*?```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      text = codeBlockMatch[1];
    }
  }

  // Find the outermost JSON object by matching balanced braces
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) {
    throw new Error('No JSON object found in response');
  }

  let depth = 0;
  let lastBrace = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = firstBrace; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          lastBrace = i;
          break;
        }
      }
    }
  }

  if (lastBrace === -1) {
    throw new Error('Unbalanced braces in JSON response');
  }

  return text.substring(firstBrace, lastBrace + 1);
}

/**
 * Parse JSON response with robust extraction and error handling
 */
function parseJsonResponse<T>(response: string, context: string): T {
  try {
    // First try direct parse (fastest path for well-behaved responses)
    return JSON.parse(response.trim());
  } catch {
    // Try extracting JSON from surrounding text
    try {
      const extracted = extractJsonFromResponse(response);
      return JSON.parse(extracted);
    } catch (extractErr) {
      const extractError = extractErr instanceof Error ? extractErr.message : String(extractErr);
      logger.error(`Failed to extract JSON for ${context}. Error: ${extractError}`);
      logger.error(`Raw response (first 1500 chars): ${response.substring(0, 1500)}`);
      throw new Error(`Failed to parse response: ${extractError}`);
    }
  }
}

// =============================================================================
// Wikipedia API Integration (Fallback)
// =============================================================================

/**
 * Search Wikipedia for a series and get structured data
 */
export async function searchWikipedia(
  name: string,
  publisher?: string | null,
  type?: 'western' | 'manga'
): Promise<WikipediaData | null> {
  try {
    // Build search query with type awareness
    const searchQuery =
      type === 'manga'
        ? `${name} manga`
        : publisher
          ? `${name} ${publisher} comics`
          : `${name} comic book`;

    logger.debug(`Searching Wikipedia for: "${searchQuery}"`);

    // Step 1: Search for the best matching article
    const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('list', 'search');
    searchUrl.searchParams.set('srsearch', searchQuery);
    searchUrl.searchParams.set('srlimit', '3');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('origin', '*');

    const searchResponse = await fetch(searchUrl.toString(), {
      headers: {
        'User-Agent': 'Helixio Comic Manager/1.0 (https://github.com/helixio)',
      },
    });

    if (!searchResponse.ok) {
      logger.warn(`Wikipedia search failed with status ${searchResponse.status}`);
      return null;
    }

    const searchData = (await searchResponse.json()) as {
      query?: {
        search?: Array<{ title: string; snippet?: string }>;
      };
    };

    const results = searchData.query?.search;
    if (!results || results.length === 0 || !results[0]) {
      logger.debug('No Wikipedia search results found');
      return null;
    }

    // Use the first result's title
    const articleTitle = results[0].title;
    logger.debug(`Found Wikipedia article: "${articleTitle}"`);

    // Step 2: Get the article summary using the REST API
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`;

    const summaryResponse = await fetch(summaryUrl, {
      headers: {
        'User-Agent': 'Helixio Comic Manager/1.0 (https://github.com/helixio)',
      },
    });

    if (!summaryResponse.ok) {
      logger.warn(`Wikipedia summary fetch failed with status ${summaryResponse.status}`);
      return null;
    }

    const summaryData = (await summaryResponse.json()) as {
      title?: string;
      extract?: string;
      description?: string;
    };

    return {
      title: summaryData.title,
      extract: summaryData.extract,
      description: summaryData.description,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Wikipedia search error: ${errorMsg}`);
    return null;
  }
}

/**
 * Enrich context with web search data
 */
export async function enrichWithWebSearch(
  context: MetadataGenerationContext,
  options: { useWebSearch?: boolean } = {}
): Promise<WebEnrichmentResult> {
  if (!options.useWebSearch) {
    return { success: true };
  }

  const result: WebEnrichmentResult = { success: true };

  // Try Wikipedia first
  const wikipediaData = await searchWikipedia(context.name, context.publisher, context.type);
  if (wikipediaData) {
    result.wikipediaData = wikipediaData;
    logger.debug(`Got Wikipedia data for "${context.name}"`);
  }

  return result;
}

// =============================================================================
// Age Rating Normalization
// =============================================================================

/**
 * Normalize LLM-returned age rating to valid ComicInfo.xml value
 */
export function normalizeAgeRating(raw: string): ValidAgeRating {
  if (!raw) return 'Unknown';

  const normalized = raw.trim().toLowerCase();

  // Direct match (case-insensitive)
  const exactMatch = VALID_AGE_RATINGS.find((r) => r.toLowerCase() === normalized);
  if (exactMatch) return exactMatch;

  // Common variations mapping
  const mappings: Record<string, ValidAgeRating> = {
    // Adult content
    '18+': 'Adults Only 18+',
    'adults only': 'Adults Only 18+',
    'adult': 'Adults Only 18+',
    'explicit': 'Adults Only 18+',
    'x18': 'X18+',
    'x-18': 'X18+',
    'xxx': 'X18+',
    'r18': 'R18+',
    'r-18': 'R18+',
    'nc-17': 'Adults Only 18+',
    'nc17': 'Adults Only 18+',

    // Mature
    'mature': 'Mature 17+',
    '17+': 'Mature 17+',
    'm': 'Mature 17+',
    'ma': 'MA15+',
    'ma-15': 'MA15+',
    '15+': 'MA15+',

    // Teen
    'teen': 'Teen',
    't': 'Teen',
    't+': 'Teen',
    '13+': 'Teen',
    'teen+': 'Teen',
    'pg-13': 'Teen',
    'pg13': 'Teen',

    // Everyone/All Ages
    'all ages': 'Everyone',
    'everyone': 'Everyone',
    'e': 'Everyone',
    'general': 'G',
    'g': 'G',
    '10+': 'Everyone 10+',
    'e10': 'Everyone 10+',
    'e10+': 'Everyone 10+',

    // Kids
    'kids': 'Kids to Adults',
    'k-a': 'Kids to Adults',
    'ec': 'Early Childhood',
    'early childhood': 'Early Childhood',

    // PG
    'pg': 'PG',
    'parental guidance': 'PG',

    // Unknown/Pending
    'not rated': 'Unknown',
    'unrated': 'Unknown',
    'pending': 'Rating Pending',
    'rp': 'Rating Pending',
  };

  if (mappings[normalized]) {
    return mappings[normalized];
  }

  // Check for partial matches
  for (const [key, value] of Object.entries(mappings)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  logger.debug(`Unknown age rating "${raw}", defaulting to Unknown`);
  return 'Unknown';
}

// =============================================================================
// LLM Prompt Templates
// =============================================================================

const METADATA_SYSTEM_PROMPT = `You are a comic book and manga metadata specialist with extensive knowledge of the medium.
Your task is to generate comprehensive, accurate metadata for the given series.

For each field, provide:
1. The value (or null if truly unknown)
2. A confidence score from 0.0 to 1.0 based on your certainty:
   - 0.9-1.0: Definitive knowledge, well-documented series
   - 0.7-0.89: High confidence, well-known series or strong context clues
   - 0.5-0.69: Reasonable inference with some uncertainty
   - 0.3-0.49: Educated guess based on limited information
   - 0.0-0.29: Very uncertain, speculative

FIELD GUIDELINES:

1. summary: 3-4 paragraph description covering the series premise, main characters, themes, and significance in comic history.
2. deck: Single compelling tagline under 100 characters
3. ageRating: MUST be one of these exact values:
   - "Unknown" (default if uncertain)
   - "Adults Only 18+" (explicit adult content)
   - "Early Childhood" (ages 3+)
   - "Everyone" (all ages)
   - "Everyone 10+" (ages 10+)
   - "G" (general audiences)
   - "Kids to Adults" (ages 6+)
   - "MA15+" (mature 15+)
   - "Mature 17+" (ages 17+)
   - "PG" (parental guidance)
   - "R18+" (restricted 18+)
   - "Rating Pending" (not yet rated)
   - "Teen" (ages 13+)
   - "X18+" (adults only explicit)
4. genres: Comma-separated list (e.g., "Superhero, Action, Drama")
5. tags: Comma-separated descriptive tags (e.g., "dark themes, vigilante, cape comics")
6. startYear: First publication year as integer, or null if unknown
7. endYear: Final publication year as integer, null if ongoing or unknown

IMPORTANT RULES:
- Be accurate and informative without spoilers
- Use an engaging tone, suitable for a library catalog
- Use natural word choices and natural language flow to make the summary interesting and descriptive
- Avoid generic phrases like "This exciting series..." or "In this thrilling comic..."
- Avoid overly flowery prose, opting to inform and entice rather than overwhelm the reader
- Focus on what makes this series notable or interesting
- Base answers on the series context provided
- If web search data is provided, use it for accuracy but write original content
- For manga, use appropriate genre terms (Shonen, Seinen, Isekai, etc.)
- Generate ~10 tags that are distinct from each other

RATING GUIDELINES:
E- EVERYONE – Appropriate for readers of all ages. May contain cartoon violence and/or some comic mischief. Equivalent to TV-G.
T – TEEN – Appropriate for readers age 12 and older. May contain mild violence, language and/or suggestive themes. Equivalent to TV-PG.
T+ – TEEN PLUS – Appropriate for readers age 15 and older. May contain moderate violence, moderate profanity, graphic imagery and/or suggestive themes. Equivalent to TV-14.
M – MATURE – Appropriate for readers age 17 and older. May contain intense violence, extensive profanity, nudity, sexual themes and other content suitable only for older readers. Equivalent to TV-MA.

Return ONLY valid JSON in this exact format:
{
  "summary": { "value": "...", "confidence": 0.85 },
  "deck": { "value": "...", "confidence": 0.9 },
  "ageRating": { "value": "Teen", "confidence": 0.75 },
  "genres": { "value": "Action, Superhero", "confidence": 0.8 },
  "tags": { "value": "vigilante, dark themes", "confidence": 0.7 },
  "startYear": { "value": 2011, "confidence": 0.95 },
  "endYear": { "value": null, "confidence": 0.6 }
}`;

/**
 * Entity generation prompt extension - appended when generateEntities is enabled.
 * This section defines Characters, Teams, and Locations fields with strict accuracy requirements.
 */
const ENTITY_GENERATION_PROMPT = `

ENTITY FIELDS (additional fields requested):

8. characters: Comma-separated list of major and minor named characters that appear in this series.
   - Include protagonists, antagonists, and significant supporting characters
   - Characters should appear for a good portion of the story OR be significant to the plot
   - Use the character's most commonly known name (e.g., "Peter Parker" or "Spider-Man")
   - For well-known characters, include their real identity (e.g., "Bruce Wayne (Batman)")
   - Maximum of 15 characters - prioritize by importance to the story
   - Order by prominence (main characters first)
   - Confidence 0.8+ means you have definitive knowledge of this character appearing
   - If uncertain, use lower confidence or omit the character entirely

9. teams: Comma-separated list of named groups, teams, or organizations featured in this series.
   - CRITICAL: ONLY include known, established team names that exist in official media
   - Examples: "Avengers", "X-Men", "Justice League", "Bat Family", "Teen Titans", "S.H.I.E.L.D."
   - Can include both official names ("Justice League") and commonly used nicknames ("The Big Three")
   - DO NOT EVER fabricate or invent team names - accuracy is paramount
   - DO NOT include generic descriptors like "the heroes" or "the villains"
   - If you are not certain a team name is real and used, DO NOT include it
   - Return empty string if no known teams are featured
   - Maximum of 5 teams that play significant roles
   - Confidence MUST be 0.8+ to be included - if below 0.8, return empty string
   - When in doubt, leave it empty - false positives pollute the data

10. locations: Comma-separated list of named locations where the story takes place.
    - Include fictional places (e.g., "Gotham City", "Metropolis", "Wakanda", "Garden of Eden")
    - Include real locations if prominent (e.g., "New York City", "Tokyo", "London")
    - Must be named locations that feature prominently in the narrative
    - Avoid generic locations unless they are specifically named settings
    - Maximum of 7 locations - prioritize by prominence in the story
    - Order by importance to the narrative
    - Confidence 0.8+ for locations you are certain about

ENTITY ACCURACY RULES:
- Only return entities you are confident about (0.8+ confidence threshold)
- For teams especially: If you would guess or infer a team name, DO NOT include it
- It is better to return empty strings than to return inaccurate data
- False positives are worse than missing data - be conservative
- Use canonical names from official sources when possible
- If web search data is provided, cross-reference your entities against it

When entity fields are requested, your JSON response MUST include:
{
  ...existing fields...,
  "characters": { "value": "Peter Parker (Spider-Man), Mary Jane Watson, Norman Osborn (Green Goblin)", "confidence": 0.95 },
  "teams": { "value": "Avengers, Daily Bugle Staff", "confidence": 0.9 },
  "locations": { "value": "New York City, Queens, Daily Bugle Building", "confidence": 0.9 }
}`;

/**
 * Build user prompt for metadata generation
 */
function buildMetadataUserPrompt(
  context: MetadataGenerationContext,
  webData?: WebEnrichmentResult,
  generateEntities?: boolean
): string {
  const parts: string[] = [];

  // Basic info
  let intro = `Generate metadata for the ${context.type === 'manga' ? 'manga' : 'comic'} series "${context.name}"`;

  if (context.publisher) {
    intro += ` published by ${context.publisher}`;
  }

  if (context.startYear) {
    intro += context.endYear && context.endYear !== context.startYear
      ? ` (${context.startYear}-${context.endYear})`
      : ` (${context.startYear}-present)`;
  }

  if (context.volume) {
    intro += `, Volume ${context.volume}`;
  }

  intro += '.';
  parts.push(intro);

  // Existing data for reference
  const existingData: string[] = [];
  if (context.existingGenres) {
    existingData.push(`Current genres: ${context.existingGenres}`);
  }
  if (context.existingTags) {
    existingData.push(`Current tags: ${context.existingTags}`);
  }
  if (context.existingAgeRating) {
    existingData.push(`Current age rating: ${context.existingAgeRating}`);
  }
  if (context.existingSummary) {
    existingData.push(`Current summary preview: ${context.existingSummary.substring(0, 200)}...`);
  }
  if (context.existingDeck) {
    existingData.push(`Current deck: ${context.existingDeck}`);
  }

  // Add entity context if generating entities
  if (generateEntities) {
    if (context.existingCharacters) {
      existingData.push(`Current characters: ${context.existingCharacters}`);
    }
    if (context.existingTeams) {
      existingData.push(`Current teams: ${context.existingTeams}`);
    }
    if (context.existingLocations) {
      existingData.push(`Current locations: ${context.existingLocations}`);
    }
  }

  if (existingData.length > 0) {
    parts.push('\nExisting metadata (for reference, you may improve upon it):');
    parts.push(existingData.join('\n'));
  }

  // Web search context
  if (webData?.wikipediaData) {
    parts.push('\nWikipedia information (use for accuracy):');
    if (webData.wikipediaData.description) {
      parts.push(`Short description: ${webData.wikipediaData.description}`);
    }
    if (webData.wikipediaData.extract) {
      parts.push(`Summary: ${webData.wikipediaData.extract}`);
    }
  }

  // Add entity generation instruction if requested
  if (generateEntities) {
    parts.push('\nPLEASE ALSO GENERATE: characters, teams, and locations fields as specified in the entity guidelines above.');
  }

  return parts.join('\n');
}

// =============================================================================
// Main Generation Function
// =============================================================================

/** Confidence threshold for teams - prevents low-confidence fabrications */
const TEAMS_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Generate comprehensive metadata for a series
 */
export async function generateSeriesMetadata(
  context: MetadataGenerationContext,
  options: { useWebSearch?: boolean; generateEntities?: boolean } = {}
): Promise<MetadataGenerationResult> {
  const { useWebSearch = false, generateEntities = false } = options;

  if (!isMetadataGeneratorAvailable()) {
    return {
      success: false,
      webSearchUsed: false,
      error: 'Anthropic API key not configured',
    };
  }

  const startTime = Date.now();
  logger.info(`Generating metadata for series: ${context.name} (webSearch: ${useWebSearch}, entities: ${generateEntities})`);

  // Enrich with web search if enabled
  let webData: WebEnrichmentResult | undefined;
  if (useWebSearch) {
    webData = await enrichWithWebSearch(context, { useWebSearch: true });
  }

  try {
    const client = getClient();
    const model = getLLMModel();

    // Build system prompt - append entity section if entities are requested
    const systemPrompt = generateEntities
      ? METADATA_SYSTEM_PROMPT + ENTITY_GENERATION_PROMPT
      : METADATA_SYSTEM_PROMPT;

    const response = await client.messages.create({
      model,
      max_tokens: generateEntities ? 3000 : 2048, // More tokens needed for character/team/location lists
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: buildMetadataUserPrompt(context, webData, generateEntities),
        },
      ],
    });

    // Extract text content
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      logger.error('No text response from Claude');
      return {
        success: false,
        webSearchUsed: useWebSearch,
        error: 'No text response from Claude',
      };
    }

    // Parse JSON response
    let parsed: {
      summary?: { value: string; confidence: number };
      deck?: { value: string; confidence: number };
      ageRating?: { value: string; confidence: number };
      genres?: { value: string; confidence: number };
      tags?: { value: string; confidence: number };
      startYear?: { value: number | null; confidence: number };
      endYear?: { value: number | null; confidence: number };
      // Entity fields (may be present if generateEntities was enabled)
      characters?: { value: string; confidence: number };
      teams?: { value: string; confidence: number };
      locations?: { value: string; confidence: number };
    };

    try {
      let jsonStr = textContent.text.trim();

      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      // Try direct parse first
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // If direct parse fails, try to extract JSON object from the response
        // Claude sometimes includes explanatory text before/after the JSON
        const jsonMatch = textContent.text.match(/\{[\s\S]*"summary"[\s\S]*"confidence"[\s\S]*\}/);
        if (jsonMatch) {
          // Find the outermost balanced braces
          const text = textContent.text;
          const startIdx = text.indexOf('{');
          if (startIdx !== -1) {
            let depth = 0;
            let endIdx = -1;
            for (let i = startIdx; i < text.length; i++) {
              if (text[i] === '{') depth++;
              else if (text[i] === '}') {
                depth--;
                if (depth === 0) {
                  endIdx = i;
                  break;
                }
              }
            }
            if (endIdx !== -1) {
              jsonStr = text.substring(startIdx, endIdx + 1);
              parsed = JSON.parse(jsonStr);
            } else {
              throw new Error('Could not find balanced JSON object');
            }
          } else {
            throw new Error('No JSON object found in response');
          }
        } else {
          throw new Error('Response does not appear to contain expected JSON structure');
        }
      }
    } catch (parseErr) {
      const parseError = parseErr instanceof Error ? parseErr.message : String(parseErr);
      logger.error(`Failed to parse JSON response for series: ${context.name}. Error: ${parseError}`);
      logger.error(`Raw response (first 1000 chars): ${textContent.text.substring(0, 1000)}`);
      return {
        success: false,
        webSearchUsed: useWebSearch,
        error: `Failed to parse Claude response: ${parseError}`,
      };
    }

    // Build result with normalized age rating
    const metadata: GeneratedMetadata = {
      summary: {
        value: parsed.summary?.value || '',
        confidence: parsed.summary?.confidence || 0,
      },
      deck: {
        value: parsed.deck?.value || '',
        confidence: parsed.deck?.confidence || 0,
      },
      ageRating: {
        value: normalizeAgeRating(parsed.ageRating?.value || 'Unknown'),
        confidence: parsed.ageRating?.confidence || 0,
      },
      genres: {
        value: parsed.genres?.value || '',
        confidence: parsed.genres?.confidence || 0,
      },
      tags: {
        value: parsed.tags?.value || '',
        confidence: parsed.tags?.confidence || 0,
      },
      startYear: {
        value: parsed.startYear?.value ?? null,
        confidence: parsed.startYear?.confidence || 0,
      },
      endYear: {
        value: parsed.endYear?.value ?? null,
        confidence: parsed.endYear?.confidence || 0,
      },
      // Entity fields - always included, may be empty if not generated or filtered
      characters: {
        value: parsed.characters?.value || '',
        confidence: parsed.characters?.confidence || 0,
      },
      // Teams: Apply 0.8+ confidence threshold to prevent fabricated team names
      // When filtered, also set confidence to 0 to indicate no valid teams
      teams: {
        value:
          parsed.teams?.confidence && parsed.teams.confidence >= TEAMS_CONFIDENCE_THRESHOLD
            ? parsed.teams.value || ''
            : '',
        confidence:
          parsed.teams?.confidence && parsed.teams.confidence >= TEAMS_CONFIDENCE_THRESHOLD
            ? parsed.teams.confidence
            : 0,
      },
      locations: {
        value: parsed.locations?.value || '',
        confidence: parsed.locations?.confidence || 0,
      },
    };

    // Log if teams were filtered due to low confidence
    if (parsed.teams?.value && parsed.teams?.confidence && parsed.teams.confidence < TEAMS_CONFIDENCE_THRESHOLD) {
      logger.debug(
        `Teams filtered for "${context.name}": confidence ${parsed.teams.confidence} below ${TEAMS_CONFIDENCE_THRESHOLD} threshold`
      );
    }

    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
    const duration = Date.now() - startTime;

    logger.info(`Generated metadata in ${duration}ms (${tokensUsed} tokens)`);

    return {
      success: true,
      metadata,
      webSearchUsed: useWebSearch && !!webData?.wikipediaData,
      tokensUsed,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Claude API error: ${errorMsg}`);
    return {
      success: false,
      webSearchUsed: useWebSearch,
      error: errorMsg,
    };
  }
}

// =============================================================================
// Issue Metadata Generation
// =============================================================================

/**
 * Context for issue metadata generation
 */
export interface IssueMetadataGenerationContext {
  seriesName: string;
  issueNumber?: string | null;
  issueTitle?: string | null;
  publisher?: string | null;
  year?: number | null;
  writer?: string | null;
  penciller?: string | null;
  type?: 'western' | 'manga';
  // Existing metadata for context
  existingSummary?: string | null;
  existingDeck?: string | null;
  existingAgeRating?: string | null;
  existingGenres?: string | null;
  existingTags?: string | null;
  existingCharacters?: string | null;
  existingTeams?: string | null;
  existingLocations?: string | null;
}

/**
 * Generated issue metadata payload (8 fields)
 */
export interface GeneratedIssueMetadata {
  summary: GeneratedField<string>;
  deck: GeneratedField<string>;
  ageRating: GeneratedField<ValidAgeRating>;
  genres: GeneratedField<string>;
  tags: GeneratedField<string>;
  characters: GeneratedField<string>;
  teams: GeneratedField<string>;
  locations: GeneratedField<string>;
}

/**
 * Issue metadata generation result
 */
export interface IssueMetadataGenerationResult {
  success: boolean;
  metadata?: GeneratedIssueMetadata;
  webSearchUsed: boolean;
  tokensUsed?: number;
  error?: string;
}

/**
 * Issue metadata system prompt
 */
const ISSUE_METADATA_SYSTEM_PROMPT = `You are a comic book and manga metadata specialist with extensive knowledge of the medium.
Your task is to generate comprehensive, accurate metadata for a single comic book issue.

For each field, provide:
1. The value (or null/empty string if truly unknown)
2. A confidence score from 0.0 to 1.0 based on your certainty:
   - 0.9-1.0: Definitive knowledge, well-documented issue
   - 0.7-0.89: High confidence, well-known issue or strong context clues
   - 0.5-0.69: Reasonable inference with some uncertainty
   - 0.3-0.49: Educated guess based on limited information
   - 0.0-0.29: Very uncertain, speculative

FIELD GUIDELINES:

1. summary: 2-3 paragraph description of THIS SPECIFIC ISSUE's plot, events, and significance.
   - Focus on what happens in this issue, not the overall series
   - Avoid major spoilers but describe the story beats
   - 100-250 words

2. deck: Single compelling tagline under 100 characters for this issue

3. ageRating: MUST be one of these exact values:
   - "Unknown" (default if uncertain)
   - "Adults Only 18+" (explicit adult content)
   - "Early Childhood" (ages 3+)
   - "Everyone" (all ages)
   - "Everyone 10+" (ages 10+)
   - "G" (general audiences)
   - "Kids to Adults" (ages 6+)
   - "MA15+" (mature 15+)
   - "Mature 17+" (ages 17+)
   - "PG" (parental guidance)
   - "R18+" (restricted 18+)
   - "Rating Pending" (not yet rated)
   - "Teen" (ages 13+)
   - "X18+" (adults only explicit)

4. genres: Comma-separated list of genres applicable to this issue

5. tags: Comma-separated descriptive tags specific to this issue's content (~5-8 tags)

6. characters: Comma-separated list of characters that APPEAR IN THIS ISSUE
   - Include protagonists, antagonists, and significant supporting characters
   - Use the character's most commonly known name
   - Maximum of 10 characters - prioritize by prominence in this issue
   - Order by importance to this issue's story

7. teams: Comma-separated list of teams/organizations featured IN THIS ISSUE
   - ONLY include known, established team names
   - DO NOT fabricate team names
   - Return empty string if no known teams appear
   - Maximum of 5 teams

8. locations: Comma-separated list of named locations where THIS ISSUE takes place
   - Include fictional places (e.g., "Gotham City", "Metropolis")
   - Include real locations if prominent
   - Maximum of 5 locations

IMPORTANT RULES:
- Focus on THIS SPECIFIC ISSUE, not the overall series
- Be accurate without spoilers
- Use an engaging, professional tone
- If web search data is provided, use it for accuracy but write original content
- For manga, use appropriate terminology

CRITICAL OUTPUT REQUIREMENT:
Your response MUST be ONLY the JSON object - no other text before or after.
Do NOT include phrases like "Here is the JSON" or "Let me know if you need anything else".
Do NOT wrap the JSON in markdown code blocks.
Output the raw JSON object directly, starting with { and ending with }.

Return this exact JSON format:
{
  "summary": { "value": "...", "confidence": 0.85 },
  "deck": { "value": "...", "confidence": 0.9 },
  "ageRating": { "value": "Teen", "confidence": 0.75 },
  "genres": { "value": "Action, Superhero", "confidence": 0.8 },
  "tags": { "value": "first appearance, origin story", "confidence": 0.7 },
  "characters": { "value": "Batman, Joker, Alfred Pennyworth", "confidence": 0.9 },
  "teams": { "value": "Justice League", "confidence": 0.85 },
  "locations": { "value": "Gotham City, Wayne Manor", "confidence": 0.9 }
}`;

/**
 * Build user prompt for issue metadata generation
 */
function buildIssueMetadataUserPrompt(context: IssueMetadataGenerationContext): string {
  const parts: string[] = [];

  // Basic info
  let intro = `Generate metadata for the ${context.type === 'manga' ? 'manga chapter/issue' : 'comic issue'}`;

  if (context.seriesName) {
    intro += ` "${context.seriesName}"`;
  }

  if (context.issueNumber) {
    intro += ` #${context.issueNumber}`;
  }

  if (context.issueTitle) {
    intro += ` titled "${context.issueTitle}"`;
  }

  if (context.publisher) {
    intro += `, published by ${context.publisher}`;
  }

  if (context.year) {
    intro += ` (${context.year})`;
  }

  intro += '.';
  parts.push(intro);

  // Creator info
  const creatorInfo: string[] = [];
  if (context.writer) {
    creatorInfo.push(`Writer: ${context.writer}`);
  }
  if (context.penciller) {
    creatorInfo.push(`Artist: ${context.penciller}`);
  }
  if (creatorInfo.length > 0) {
    parts.push('\nCreators:');
    parts.push(creatorInfo.join('\n'));
  }

  // Existing data for reference
  const existingData: string[] = [];
  if (context.existingGenres) {
    existingData.push(`Current genres: ${context.existingGenres}`);
  }
  if (context.existingTags) {
    existingData.push(`Current tags: ${context.existingTags}`);
  }
  if (context.existingAgeRating) {
    existingData.push(`Current age rating: ${context.existingAgeRating}`);
  }
  if (context.existingSummary) {
    existingData.push(`Current summary preview: ${context.existingSummary.substring(0, 200)}...`);
  }
  if (context.existingDeck) {
    existingData.push(`Current deck: ${context.existingDeck}`);
  }
  if (context.existingCharacters) {
    existingData.push(`Current characters: ${context.existingCharacters}`);
  }
  if (context.existingTeams) {
    existingData.push(`Current teams: ${context.existingTeams}`);
  }
  if (context.existingLocations) {
    existingData.push(`Current locations: ${context.existingLocations}`);
  }

  if (existingData.length > 0) {
    parts.push('\nExisting metadata (for reference, you may improve upon it):');
    parts.push(existingData.join('\n'));
  }

  return parts.join('\n');
}

/**
 * Search Wikipedia for an issue
 */
async function searchWikipediaForIssue(
  seriesName: string,
  issueNumber?: string | null,
  issueTitle?: string | null,
  type?: 'western' | 'manga'
): Promise<WikipediaData | null> {
  // Try issue-specific search first
  let searchQuery: string;

  if (issueNumber) {
    searchQuery = type === 'manga'
      ? `${seriesName} chapter ${issueNumber} manga`
      : `${seriesName} #${issueNumber} comic`;
  } else if (issueTitle) {
    searchQuery = type === 'manga'
      ? `${seriesName} ${issueTitle} manga`
      : `${seriesName} ${issueTitle} comic`;
  } else {
    // Fall back to series-level search
    searchQuery = type === 'manga'
      ? `${seriesName} manga`
      : `${seriesName} comic`;
  }

  logger.debug(`Searching Wikipedia for issue: "${searchQuery}"`);

  try {
    // Step 1: Search for the best matching article
    const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('list', 'search');
    searchUrl.searchParams.set('srsearch', searchQuery);
    searchUrl.searchParams.set('srlimit', '3');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('origin', '*');

    const searchResponse = await fetch(searchUrl.toString(), {
      headers: {
        'User-Agent': 'Helixio Comic Manager/1.0 (https://github.com/helixio)',
      },
    });

    if (!searchResponse.ok) {
      logger.warn(`Wikipedia search failed with status ${searchResponse.status}`);
      return null;
    }

    const searchData = (await searchResponse.json()) as {
      query?: {
        search?: Array<{ title: string; snippet?: string }>;
      };
    };

    const results = searchData.query?.search;
    if (!results || results.length === 0 || !results[0]) {
      logger.debug('No Wikipedia search results found for issue');
      return null;
    }

    // Use the first result's title
    const articleTitle = results[0].title;
    logger.debug(`Found Wikipedia article: "${articleTitle}"`);

    // Step 2: Get the article summary using the REST API
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`;

    const summaryResponse = await fetch(summaryUrl, {
      headers: {
        'User-Agent': 'Helixio Comic Manager/1.0 (https://github.com/helixio)',
      },
    });

    if (!summaryResponse.ok) {
      logger.warn(`Wikipedia summary fetch failed with status ${summaryResponse.status}`);
      return null;
    }

    const summaryData = (await summaryResponse.json()) as {
      title?: string;
      extract?: string;
      description?: string;
    };

    return {
      title: summaryData.title,
      extract: summaryData.extract,
      description: summaryData.description,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Wikipedia search error for issue: ${errorMsg}`);
    return null;
  }
}

/**
 * Generate comprehensive metadata for an issue
 */
export async function generateIssueMetadata(
  context: IssueMetadataGenerationContext,
  options: { useWebSearch?: boolean } = {}
): Promise<IssueMetadataGenerationResult> {
  const { useWebSearch = false } = options;

  if (!isMetadataGeneratorAvailable()) {
    return {
      success: false,
      webSearchUsed: false,
      error: 'Anthropic API key not configured',
    };
  }

  const issueLabel = context.issueNumber
    ? `${context.seriesName} #${context.issueNumber}`
    : context.issueTitle
      ? `${context.seriesName}: ${context.issueTitle}`
      : context.seriesName;

  const startTime = Date.now();
  logger.info(`Generating metadata for issue: ${issueLabel} (webSearch: ${useWebSearch})`);

  try {
    const client = getClient();
    const model = getLLMModel();

    // Build system prompt with web search instructions if enabled
    const systemPrompt = useWebSearch
      ? ISSUE_METADATA_SYSTEM_PROMPT + `

## Web Search Available
You have access to the web_search tool. USE IT to search for accurate information about this comic issue.
Search for: "${context.seriesName}" comic ${context.issueNumber ? `issue #${context.issueNumber}` : context.issueTitle || ''} ${context.publisher || ''}
Look for plot summaries, character appearances, and other metadata on Wikipedia, comic databases, or review sites.
Incorporate the search results to provide more accurate and detailed metadata.`
      : ISSUE_METADATA_SYSTEM_PROMPT;

    // Use web search helper for API call
    const response = await callWithWebSearch(
      client,
      model,
      systemPrompt,
      buildIssueMetadataUserPrompt(context),
      useWebSearch
    );

    // Parse JSON response using robust extraction
    type ParsedIssueMetadata = {
      summary?: { value: string; confidence: number };
      deck?: { value: string; confidence: number };
      ageRating?: { value: string; confidence: number };
      genres?: { value: string; confidence: number };
      tags?: { value: string; confidence: number };
      characters?: { value: string; confidence: number };
      teams?: { value: string; confidence: number };
      locations?: { value: string; confidence: number };
    };

    let parsed: ParsedIssueMetadata;
    try {
      parsed = parseJsonResponse<ParsedIssueMetadata>(response.text, `issue: ${issueLabel}`);
    } catch (parseErr) {
      const parseError = parseErr instanceof Error ? parseErr.message : String(parseErr);
      return {
        success: false,
        webSearchUsed: response.webSearchUsed,
        error: `Failed to parse Claude response: ${parseError}`,
      };
    }

    // Build result with normalized age rating
    const metadata: GeneratedIssueMetadata = {
      summary: {
        value: parsed.summary?.value || '',
        confidence: parsed.summary?.confidence || 0,
      },
      deck: {
        value: parsed.deck?.value || '',
        confidence: parsed.deck?.confidence || 0,
      },
      ageRating: {
        value: normalizeAgeRating(parsed.ageRating?.value || 'Unknown'),
        confidence: parsed.ageRating?.confidence || 0,
      },
      genres: {
        value: parsed.genres?.value || '',
        confidence: parsed.genres?.confidence || 0,
      },
      tags: {
        value: parsed.tags?.value || '',
        confidence: parsed.tags?.confidence || 0,
      },
      characters: {
        value: parsed.characters?.value || '',
        confidence: parsed.characters?.confidence || 0,
      },
      // Teams: Apply confidence threshold
      teams: {
        value:
          parsed.teams?.confidence && parsed.teams.confidence >= TEAMS_CONFIDENCE_THRESHOLD
            ? parsed.teams.value || ''
            : '',
        confidence:
          parsed.teams?.confidence && parsed.teams.confidence >= TEAMS_CONFIDENCE_THRESHOLD
            ? parsed.teams.confidence
            : 0,
      },
      locations: {
        value: parsed.locations?.value || '',
        confidence: parsed.locations?.confidence || 0,
      },
    };

    // Log if teams were filtered due to low confidence
    if (parsed.teams?.value && parsed.teams?.confidence && parsed.teams.confidence < TEAMS_CONFIDENCE_THRESHOLD) {
      logger.debug(
        `Teams filtered for issue "${issueLabel}": confidence ${parsed.teams.confidence} below ${TEAMS_CONFIDENCE_THRESHOLD} threshold`
      );
    }

    const duration = Date.now() - startTime;

    logger.info(`Generated issue metadata in ${duration}ms (${response.tokensUsed} tokens, webSearch: ${response.webSearchUsed})`);

    return {
      success: true,
      metadata,
      webSearchUsed: response.webSearchUsed,
      tokensUsed: response.tokensUsed,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Claude API error for issue: ${errorMsg}`);
    return {
      success: false,
      webSearchUsed: false,
      error: errorMsg,
    };
  }
}
