/**
 * Description Generator Service
 *
 * Handles LLM-based generation of descriptions for series and issues.
 * Uses Claude Haiku for cost-efficient, high-quality description generation.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getApiKey, hasApiKey, getLLMModel } from './config.service.js';
import { createServiceLogger } from './logger.service.js';

const logger = createServiceLogger('description-generator');

// =============================================================================
// Types
// =============================================================================

export interface SeriesDescriptionContext {
  name: string;
  publisher?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  issueCount?: number | null;
  genres?: string | null;
  characters?: string | null;
  teams?: string | null;
  existingSummary?: string | null;
  existingDeck?: string | null;
  webSearchResults?: string | null;
}

export interface IssueDescriptionContext {
  seriesName: string;
  issueNumber?: string | null;
  issueTitle?: string | null;
  publisher?: string | null;
  year?: number | null;
  writer?: string | null;
  characters?: string | null;
  storyArc?: string | null;
  existingSummary?: string | null;
  webSearchResults?: string | null;
}

export interface DescriptionResult {
  success: boolean;
  description?: string;
  deck?: string;
  error?: string;
  tokensUsed?: number;
}

export interface WebSearchResult {
  success: boolean;
  context?: string;
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
 * Check if description generation is available
 */
export function isDescriptionGeneratorAvailable(): boolean {
  return hasApiKey('anthropic');
}

// =============================================================================
// Web Search (DuckDuckGo Instant Answer API)
// =============================================================================

/**
 * Search for additional context about a series or issue
 * Uses DuckDuckGo Instant Answer API (free, no API key required)
 */
export async function searchForContext(
  query: string,
  type: 'series' | 'issue'
): Promise<WebSearchResult> {
  try {
    // Build search query
    const searchQuery = type === 'series'
      ? `${query} comic book series synopsis`
      : `${query} comic book issue summary`;

    // DuckDuckGo Instant Answer API
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&format=json&no_html=1&skip_disambig=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Helixio Comic Manager/1.0',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Search failed with status ${response.status}`,
      };
    }

    const data = await response.json() as {
      Abstract?: string;
      AbstractText?: string;
      RelatedTopics?: Array<{ Text?: string }>;
      Heading?: string;
    };

    // Extract useful context from response
    const contextParts: string[] = [];

    if (data.Abstract) {
      contextParts.push(data.Abstract);
    } else if (data.AbstractText) {
      contextParts.push(data.AbstractText);
    }

    // Add related topics (limited to first 3 for brevity)
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      const topics = data.RelatedTopics
        .slice(0, 3)
        .filter((t) => t.Text)
        .map((t) => t.Text);
      if (topics.length > 0) {
        contextParts.push('Related: ' + topics.join(' | '));
      }
    }

    if (contextParts.length === 0) {
      return {
        success: true,
        context: undefined, // No results found, but not an error
      };
    }

    return {
      success: true,
      context: contextParts.join('\n\n'),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Web search error: ${errorMsg}`,
    };
  }
}

// =============================================================================
// Prompt Templates
// =============================================================================

const SERIES_SYSTEM_PROMPT = `You are a knowledgeable comic book historian and reviewer helping to catalog a comic collection.
Your task is to generate engaging, informative descriptions for comic book series.

Generate TWO outputs:
1. SUMMARY: A 3-4 paragraph description covering the series premise, main characters, themes, and significance in comic history.
2. DECK: A single compelling sentence that captures the essence of the series (like a tagline).

Guidelines:
- Be accurate and informative without major spoilers
- Use an engaging, professional tone suitable for a library catalog
- If web search context is provided, use it for accuracy but write original content
- Focus on what makes this series notable or interesting
- Avoid generic phrases like "This exciting series..." or "In this thrilling comic..."
- Keep the summary between 300-500 words
- Keep the deck under 100 characters

Return ONLY valid JSON in this exact format:
{
  "summary": "Your 3-4 paragraph summary here...",
  "deck": "Your tagline here"
}`;

const ISSUE_SYSTEM_PROMPT = `You are a knowledgeable comic book reviewer helping to catalog individual issues.
Your task is to generate concise, informative summaries for individual comic book issues.

Generate a 2-3 sentence synopsis that:
- Captures the main plot points without major spoilers
- References the story arc context if provided
- Mentions key character moments or events
- Is suitable for a library catalog

Guidelines:
- Be concise but informative (50-100 words)
- Avoid spoilers for major plot twists
- Use present tense
- If web search context is provided, use it for accuracy but write original content

Return ONLY valid JSON in this exact format:
{
  "summary": "Your 2-3 sentence synopsis here..."
}`;

/**
 * Build user prompt for series description
 */
function buildSeriesUserPrompt(context: SeriesDescriptionContext): string {
  let prompt = `Generate a description for the comic series "${context.name}"`;

  if (context.publisher) {
    prompt += ` published by ${context.publisher}`;
  }

  if (context.startYear) {
    prompt += context.endYear && context.endYear !== context.startYear
      ? ` (${context.startYear}-${context.endYear})`
      : ` (${context.startYear}-present)`;
  }
  prompt += '.';

  const details: string[] = [];
  if (context.issueCount) {
    details.push(`Total issues: ${context.issueCount}`);
  }
  if (context.genres) {
    details.push(`Genres: ${context.genres}`);
  }
  if (context.characters) {
    details.push(`Main characters: ${context.characters}`);
  }
  if (context.teams) {
    details.push(`Teams: ${context.teams}`);
  }

  if (details.length > 0) {
    prompt += '\n\n' + details.join('\n');
  }

  if (context.webSearchResults) {
    prompt += `\n\nAdditional context from web search (use for accuracy, but write original content):\n${context.webSearchResults}`;
  }

  return prompt;
}

/**
 * Build user prompt for issue summary
 */
function buildIssueUserPrompt(context: IssueDescriptionContext): string {
  let prompt = `Generate a summary for "${context.seriesName}"`;

  if (context.issueNumber) {
    prompt += ` #${context.issueNumber}`;
  }

  if (context.issueTitle) {
    prompt += ` titled "${context.issueTitle}"`;
  }

  if (context.publisher) {
    prompt += `, published by ${context.publisher}`;
  }

  if (context.year) {
    prompt += ` (${context.year})`;
  }
  prompt += '.';

  const details: string[] = [];
  if (context.writer) {
    details.push(`Writer: ${context.writer}`);
  }
  if (context.characters) {
    details.push(`Characters: ${context.characters}`);
  }
  if (context.storyArc) {
    details.push(`Story Arc: ${context.storyArc}`);
  }

  if (details.length > 0) {
    prompt += '\n\n' + details.join('\n');
  }

  if (context.webSearchResults) {
    prompt += `\n\nAdditional context from web search (use for accuracy, but write original content):\n${context.webSearchResults}`;
  }

  return prompt;
}

// =============================================================================
// Generation Functions
// =============================================================================

/**
 * Generate a description for a series
 */
export async function generateSeriesDescription(
  context: SeriesDescriptionContext,
  options: { useWebSearch?: boolean } = {}
): Promise<DescriptionResult> {
  const { useWebSearch } = options;

  if (!isDescriptionGeneratorAvailable()) {
    return {
      success: false,
      error: 'Anthropic API key not configured',
    };
  }

  const startTime = Date.now();

  // Optionally fetch web search context
  let webContext: string | undefined;
  if (useWebSearch) {
    const searchQuery = context.publisher
      ? `${context.name} ${context.publisher}`
      : context.name;

    logger.debug(`Searching web for context: "${searchQuery}"`);

    const searchResult = await searchForContext(searchQuery, 'series');
    if (searchResult.success && searchResult.context) {
      webContext = searchResult.context;
      logger.debug(`Found web context: ${webContext.substring(0, 100)}...`);
    }
  }

  // Add web context to the context object
  const enrichedContext: SeriesDescriptionContext = {
    ...context,
    webSearchResults: webContext,
  };

  logger.info(`Generating description for series: ${context.name}`);

  try {
    const client = getClient();
    const model = getLLMModel();

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SERIES_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildSeriesUserPrompt(enrichedContext),
        },
      ],
    });

    // Extract text content
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      logger.error('No text response from Claude');
      return {
        success: false,
        error: 'No text response from Claude',
      };
    }

    // Parse JSON response
    let parsed: { summary?: string; deck?: string };
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
      }
    } catch (parseErr) {
      const parseError = parseErr instanceof Error ? parseErr.message : String(parseErr);
      logger.error(`Failed to parse JSON response for series: ${context.name}. Error: ${parseError}`);
      return {
        success: false,
        error: `Failed to parse Claude response: ${parseError}`,
      };
    }

    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
    const duration = Date.now() - startTime;

    logger.info(`Generated series description in ${duration}ms (${tokensUsed} tokens)`);

    return {
      success: true,
      description: parsed.summary,
      deck: parsed.deck,
      tokensUsed,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Claude API error: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Generate a summary for an individual issue
 */
export async function generateIssueSummary(
  context: IssueDescriptionContext,
  options: { useWebSearch?: boolean } = {}
): Promise<DescriptionResult> {
  const { useWebSearch } = options;

  if (!isDescriptionGeneratorAvailable()) {
    return {
      success: false,
      error: 'Anthropic API key not configured',
    };
  }

  const startTime = Date.now();
  const issueLabel = context.issueNumber
    ? `${context.seriesName} #${context.issueNumber}`
    : context.seriesName;

  // Optionally fetch web search context
  let webContext: string | undefined;
  if (useWebSearch) {
    const searchQuery = context.issueNumber
      ? `${context.seriesName} #${context.issueNumber}`
      : context.issueTitle
        ? `${context.seriesName} ${context.issueTitle}`
        : context.seriesName;

    logger.debug(`Searching web for context: "${searchQuery}"`);

    const searchResult = await searchForContext(searchQuery, 'issue');
    if (searchResult.success && searchResult.context) {
      webContext = searchResult.context;
      logger.debug(`Found web context: ${webContext.substring(0, 100)}...`);
    }
  }

  // Add web context to the context object
  const enrichedContext: IssueDescriptionContext = {
    ...context,
    webSearchResults: webContext,
  };

  logger.info(`Generating summary for issue: ${issueLabel}`);

  try {
    const client = getClient();
    const model = getLLMModel();

    const response = await client.messages.create({
      model,
      max_tokens: 512,
      system: ISSUE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildIssueUserPrompt(enrichedContext),
        },
      ],
    });

    // Extract text content
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      logger.error('No text response from Claude');
      return {
        success: false,
        error: 'No text response from Claude',
      };
    }

    // Parse JSON response
    let parsed: { summary?: string };
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
      }
    } catch (parseErr) {
      const parseError = parseErr instanceof Error ? parseErr.message : String(parseErr);
      logger.error(`Failed to parse JSON response for issue: ${issueLabel}. Error: ${parseError}`);
      return {
        success: false,
        error: `Failed to parse Claude response: ${parseError}`,
      };
    }

    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
    const duration = Date.now() - startTime;

    logger.info(`Generated issue summary in ${duration}ms (${tokensUsed} tokens)`);

    return {
      success: true,
      description: parsed.summary,
      tokensUsed,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Claude API error: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
    };
  }
}
