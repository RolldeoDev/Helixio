/**
 * Collection Description Generator Service
 *
 * Handles LLM-based generation of descriptions for collections.
 * Analyzes collection contents (series, files) to identify themes and connections.
 * Uses Claude Haiku for cost-efficient, high-quality description generation.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getApiKey, hasApiKey, getLLMModel } from './config.service.js';
import { createServiceLogger } from './logger.service.js';
import { getDatabase } from './database.service.js';

const logger = createServiceLogger('collection-description-generator');

// =============================================================================
// Types
// =============================================================================

export interface CollectionDescriptionContext {
  /** Collection name */
  name: string;
  /** Existing deck (if any) */
  existingDeck?: string | null;
  /** Existing description (if any) */
  existingDescription?: string | null;
  /** Series in the collection */
  series: Array<{
    name: string;
    publisher?: string | null;
    startYear?: number | null;
    genres?: string | null;
    summary?: string | null;
    deck?: string | null;
  }>;
  /** Individual files in the collection (not part of series) */
  files: Array<{
    filename: string;
    seriesName?: string | null;
    publisher?: string | null;
    year?: number | null;
  }>;
}

export interface CollectionDescriptionResult {
  success: boolean;
  description?: string;
  deck?: string;
  error?: string;
  tokensUsed?: number;
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
 * Check if collection description generation is available
 */
export function isCollectionDescriptionGeneratorAvailable(): boolean {
  return hasApiKey('anthropic');
}

// =============================================================================
// Prompt Template
// =============================================================================

const COLLECTION_SYSTEM_PROMPT = `You are a comic book collection curator helping to describe curated collections.
Your task is to analyze a collection's contents and generate a thematic description that captures its essence.

Generate TWO outputs:
1. DESCRIPTION: A 2-3 paragraph description that:
   - Identifies the common themes, genres, or connections between the items
   - Explains what makes this collection cohesive or interesting
   - Suggests the purpose or appeal of this collection
   - Highlights notable publishers, eras, or creative teams if relevant

2. DECK: A single compelling tagline (under 100 characters) that captures the collection's theme

Guidelines:
- Focus on thematic connections, not just listing contents
- Consider genre patterns, publisher focus, era/time period, character families
- If the collection is diverse, identify the curator's taste or collecting philosophy
- Use an engaging, professional tone suitable for a library catalog
- Avoid generic phrases like "This collection features..." or "A great collection of..."
- Be specific about what ties the collection together

Return ONLY valid JSON in this exact format:
{
  "description": "Your 2-3 paragraph thematic description here...",
  "deck": "Your tagline here"
}`;

// =============================================================================
// Context Building
// =============================================================================

/**
 * Build user prompt from collection context
 */
function buildCollectionUserPrompt(context: CollectionDescriptionContext): string {
  const parts: string[] = [];

  parts.push(`Analyze and describe the collection "${context.name}".`);

  // Series information
  if (context.series.length > 0) {
    parts.push('\n## Series in this collection:');

    // Limit to first 20 series to manage token usage
    const seriesToInclude = context.series.slice(0, 20);

    for (const series of seriesToInclude) {
      let seriesLine = `- ${series.name}`;
      if (series.publisher) seriesLine += ` (${series.publisher})`;
      if (series.startYear) seriesLine += ` [${series.startYear}]`;
      if (series.genres) seriesLine += ` - Genres: ${series.genres}`;
      parts.push(seriesLine);

      // Include deck or summary excerpt if available
      if (series.deck) {
        parts.push(`  Tagline: ${series.deck}`);
      } else if (series.summary) {
        // Truncate long summaries
        const truncatedSummary = series.summary.length > 150
          ? series.summary.substring(0, 150) + '...'
          : series.summary;
        parts.push(`  Summary: ${truncatedSummary}`);
      }
    }

    if (context.series.length > 20) {
      parts.push(`\n(+ ${context.series.length - 20} more series)`);
    }
  }

  // Individual files
  if (context.files.length > 0) {
    parts.push('\n## Individual issues/files:');
    const filesToInclude = context.files.slice(0, 10);
    for (const file of filesToInclude) {
      let fileLine = `- ${file.filename}`;
      if (file.seriesName) fileLine += ` (from ${file.seriesName})`;
      if (file.publisher) fileLine += ` [${file.publisher}]`;
      if (file.year) fileLine += ` (${file.year})`;
      parts.push(fileLine);
    }
    if (context.files.length > 10) {
      parts.push(`(+ ${context.files.length - 10} more files)`);
    }
  }

  // Existing content for reference (if user wants to improve upon it)
  if (context.existingDeck || context.existingDescription) {
    parts.push('\n## Existing content (for reference, you may improve upon it):');
    if (context.existingDeck) {
      parts.push(`Current tagline: ${context.existingDeck}`);
    }
    if (context.existingDescription) {
      const truncatedDesc = context.existingDescription.length > 300
        ? context.existingDescription.substring(0, 300) + '...'
        : context.existingDescription;
      parts.push(`Current description: ${truncatedDesc}`);
    }
  }

  return parts.join('\n');
}

// =============================================================================
// Data Gathering
// =============================================================================

/**
 * Gather context data from collection items
 */
export async function gatherCollectionContext(
  collectionId: string,
  userId: string
): Promise<CollectionDescriptionContext | null> {
  const db = getDatabase();

  // Get collection with items
  const collection = await db.collection.findFirst({
    where: { id: collectionId, userId },
    include: {
      items: {
        where: { isAvailable: true },
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!collection) {
    return null;
  }

  // Extract series IDs and file IDs
  const seriesIds = collection.items
    .filter((item) => item.seriesId)
    .map((item) => item.seriesId!);

  const fileIds = collection.items
    .filter((item) => item.fileId)
    .map((item) => item.fileId!);

  // Fetch series data
  const seriesData = seriesIds.length > 0
    ? await db.series.findMany({
        where: { id: { in: seriesIds } },
        select: {
          id: true,
          name: true,
          publisher: true,
          startYear: true,
          genres: true,
          summary: true,
          deck: true,
        },
      })
    : [];

  // Fetch file data with metadata
  const fileData = fileIds.length > 0
    ? await db.comicFile.findMany({
        where: { id: { in: fileIds } },
        select: {
          id: true,
          filename: true,
          metadata: {
            select: {
              series: true,
              publisher: true,
              year: true,
            },
          },
        },
      })
    : [];

  return {
    name: collection.name,
    existingDeck: collection.deck,
    existingDescription: collection.description,
    series: seriesData.map((s) => ({
      name: s.name,
      publisher: s.publisher,
      startYear: s.startYear,
      genres: s.genres,
      summary: s.summary,
      deck: s.deck,
    })),
    files: fileData.map((f) => ({
      filename: f.filename,
      seriesName: f.metadata?.series ?? null,
      publisher: f.metadata?.publisher ?? null,
      year: f.metadata?.year ?? null,
    })),
  };
}

// =============================================================================
// Generation Function
// =============================================================================

/**
 * Generate a description for a collection
 */
export async function generateCollectionDescription(
  collectionId: string,
  userId: string
): Promise<CollectionDescriptionResult> {
  if (!isCollectionDescriptionGeneratorAvailable()) {
    return {
      success: false,
      error: 'Anthropic API key not configured',
    };
  }

  const startTime = Date.now();

  // Gather context
  const context = await gatherCollectionContext(collectionId, userId);
  if (!context) {
    return {
      success: false,
      error: 'Collection not found',
    };
  }

  // Check if collection has content to analyze
  if (context.series.length === 0 && context.files.length === 0) {
    return {
      success: false,
      error: 'Collection is empty. Add items before generating a description.',
    };
  }

  logger.info(`Generating description for collection: ${context.name}`);

  try {
    const client = getClient();
    const model = getLLMModel();

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: COLLECTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildCollectionUserPrompt(context),
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

    // Parse JSON response (following existing pattern from description-generator.service.ts)
    let parsed: { description?: string; deck?: string };
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
      logger.error(`Failed to parse JSON response for collection: ${context.name}. Error: ${parseError}`);
      return {
        success: false,
        error: `Failed to parse Claude response: ${parseError}`,
      };
    }

    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
    const duration = Date.now() - startTime;

    logger.info(`Generated collection description in ${duration}ms (${tokensUsed} tokens)`);

    return {
      success: true,
      description: parsed.description,
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
