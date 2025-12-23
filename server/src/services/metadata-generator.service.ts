/**
 * Metadata Generator Service
 *
 * Generates comprehensive series metadata using LLM with optional web search enrichment.
 * Uses Wikipedia API + Claude web search for context, returns structured metadata with
 * LLM self-assessed confidence scores.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getApiKey, hasApiKey, getLLMModel } from './config.service.js';
import { createServiceLogger } from './logger.service.js';

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
// Wikipedia API Integration
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

1. summary: 2-3 paragraph description (150-300 words) covering premise, characters, themes, significance
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
- Be accurate and avoid spoilers
- Use professional, engaging tone
- Base answers on the series context provided
- If web search data is provided, use it for accuracy but write original content
- For manga, use appropriate genre terms (Shonen, Seinen, Isekai, etc.)

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
 * Build user prompt for metadata generation
 */
function buildMetadataUserPrompt(
  context: MetadataGenerationContext,
  webData?: WebEnrichmentResult
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

  return parts.join('\n');
}

// =============================================================================
// Main Generation Function
// =============================================================================

/**
 * Generate comprehensive metadata for a series
 */
export async function generateSeriesMetadata(
  context: MetadataGenerationContext,
  options: { useWebSearch?: boolean } = {}
): Promise<MetadataGenerationResult> {
  const { useWebSearch = false } = options;

  if (!isMetadataGeneratorAvailable()) {
    return {
      success: false,
      webSearchUsed: false,
      error: 'Anthropic API key not configured',
    };
  }

  const startTime = Date.now();
  logger.info(`Generating metadata for series: ${context.name} (webSearch: ${useWebSearch})`);

  // Enrich with web search if enabled
  let webData: WebEnrichmentResult | undefined;
  if (useWebSearch) {
    webData = await enrichWithWebSearch(context, { useWebSearch: true });
  }

  try {
    const client = getClient();
    const model = getLLMModel();

    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: METADATA_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildMetadataUserPrompt(context, webData),
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
    };

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
