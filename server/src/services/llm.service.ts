/**
 * LLM Service
 *
 * Handles integration with Claude API for intelligent filename parsing.
 * Sends batch requests with naming conventions to extract metadata.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';
import { getApiKey, hasApiKey, getLLMModel } from './config.service.js';
import { MetadataFetchLogger } from './metadata-fetch-logger.service.js';
import type { LibraryType } from './metadata-search.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// Types
// =============================================================================

export interface ParsedFileMetadata {
  /** Original filename */
  filename: string;
  /** Original folder path (if provided) */
  folderPath?: string;
  /** Extracted series name */
  series?: string;
  /** Type of file: issue, volume, book, special (or chapter for manga) */
  type?: 'issue' | 'volume' | 'book' | 'special' | 'chapter';
  /** Issue or volume number */
  number?: number | string;
  /** Title (issue title or volume subtitle) */
  title?: string;
  /** Publication year */
  year?: number;
  /** Publication month */
  month?: number;
  /** Publication day */
  day?: number;
  /** Writer/author name */
  writer?: string;
  /** Publisher name */
  publisher?: string;
  /** Tokens that were identified as noise and ignored */
  ignoredTokens?: string[];
  /** Confidence score (0-1) */
  confidence?: number;
  /** Error message if parsing failed */
  error?: string;

  // Manga-specific fields
  /** Volume number (for manga v5c12 patterns) */
  volume?: string;
  /** Chapter number (for manga v5c12 patterns) */
  chapter?: string;
  /** Content type for manga: chapter, volume, omake, extra, bonus, oneshot */
  contentType?: 'chapter' | 'volume' | 'omake' | 'extra' | 'bonus' | 'oneshot';
}

export interface BatchParseResult {
  success: boolean;
  results: ParsedFileMetadata[];
  totalTokens?: number;
  error?: string;
}

export interface NamingConventions {
  series_folder?: {
    patterns: string[];
    examples?: string[];
  };
  issue_file?: {
    patterns: string[];
    examples?: string[];
  };
  volume_file?: {
    patterns: string[];
    examples?: string[];
  };
  book_file?: {
    patterns: string[];
    examples?: string[];
  };
  special_file?: {
    patterns: string[];
    examples?: string[];
  };
  noise_tokens?: string[];
  type_indicators?: Record<string, string[]>;
  publisher_aliases?: Record<string, string[]>;
  date_formats?: string[];
  number_patterns?: Record<string, string[]>;
}

// =============================================================================
// Convention Loading
// =============================================================================

let cachedConventions: NamingConventions | null = null;

/**
 * Load naming conventions from YAML file
 */
export function loadConventions(): NamingConventions {
  if (cachedConventions) {
    return cachedConventions;
  }

  try {
    const conventionsPath = join(__dirname, '../data/conventions.yaml');
    const content = readFileSync(conventionsPath, 'utf-8');
    cachedConventions = yaml.load(content) as NamingConventions;
    return cachedConventions;
  } catch (err) {
    console.error('Failed to load conventions.yaml:', err);
    // Return minimal defaults
    return {
      noise_tokens: [],
      series_folder: { patterns: [] },
      issue_file: { patterns: [] },
      volume_file: { patterns: [] },
    };
  }
}

/**
 * Clear cached conventions (for reloading)
 */
export function clearConventionsCache(): void {
  cachedConventions = null;
}

/**
 * Get conventions as a compact string for LLM context
 */
function getConventionsContext(): string {
  const conventions = loadConventions();

  return `
# Naming Conventions

## Series Folder Patterns
${conventions.series_folder?.patterns?.join('\n') || 'None specified'}

## Issue File Patterns
${conventions.issue_file?.patterns?.join('\n') || 'None specified'}

## Volume File Patterns
${conventions.volume_file?.patterns?.join('\n') || 'None specified'}

## Special File Patterns
${conventions.special_file?.patterns?.join('\n') || 'None specified'}

## Noise Tokens to Ignore
${conventions.noise_tokens?.slice(0, 20).join(', ') || 'None'}

## Type Indicators
- Issues: ${conventions.type_indicators?.issue?.join(', ') || '#, Issue'}
- Volumes: ${conventions.type_indicators?.volume?.join(', ') || 'Vol, Volume, TPB'}
- Books: ${conventions.type_indicators?.book?.join(', ') || 'Book, OGN'}
- Specials: ${conventions.type_indicators?.special?.join(', ') || 'Annual, Special'}
`.trim();
}

// =============================================================================
// Claude API Integration
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
 * Check if LLM service is available
 */
export function isLLMAvailable(): boolean {
  return hasApiKey('anthropic');
}

/**
 * Build the system prompt for filename parsing
 */
function buildSystemPrompt(libraryType?: LibraryType): string {
  const conventionsContext = getConventionsContext();

  // Use manga-specific prompt for manga libraries
  if (libraryType === 'manga') {
    return buildMangaSystemPrompt(conventionsContext);
  }

  // Default comic/western prompt
  return `You are a metadata extraction assistant for comic book files. Your task is to parse filenames and folder paths to extract structured metadata.

${conventionsContext}

# Instructions

1. Parse each filename to extract:
   - series: The comic series name (clean, without noise)
   - type: One of "issue", "volume", "book", or "special"
   - number: The issue or volume number (as a number if possible)
   - title: The issue title or volume subtitle
   - year: Publication year (4 digits)
   - month: Publication month (1-12) if available
   - day: Publication day (1-31) if available
   - writer: Author name if present in filename
   - ignoredTokens: List of noise tokens that were ignored

2. If the folder path is provided, use it to infer the series name if not clear from the filename.

3. For messy filenames, identify and strip noise tokens like scanner group names, quality indicators, etc.

4. Provide a confidence score (0.0-1.0) based on how certain you are about the extraction.

5. Return valid JSON only. No explanations or markdown formatting.`;
}

/**
 * Build manga-specific system prompt
 */
function buildMangaSystemPrompt(conventionsContext: string): string {
  return `You are a metadata extraction assistant for manga/anime files. Your task is to parse filenames and folder paths to extract structured metadata specific to manga naming conventions.

${conventionsContext}

# Manga-Specific Naming Patterns

## Volume + Chapter Patterns (most common)
- v5c12, v05c012, V5C12 (volume 5, chapter 12)
- Vol.5 Ch.12, Vol 5 Ch 12
- Volume 5 Chapter 12
- Vol 5 - Ch 12

## Chapter-Only Patterns
- c12, Ch.12, Ch 12, Chapter 12
- - 012, - 12 (trailing number after dash)
- #012, #12

## Volume-Only Patterns
- v5, Vol.5, Vol 5, Volume 5

## Special Content Types
- Omake (bonus/extra chapters)
- Extra, Bonus (additional content)
- Side Story, Gaiden (side stories)
- One-Shot, Oneshot (standalone stories)

## Decimal Chapters (common for manga)
- c12.5, Chapter 12.5 (between chapter releases)
- c10.1, c10.2 (sub-chapters)

# Instructions

1. Parse each filename to extract:
   - series: The manga series name (clean, without noise)
   - type: One of "chapter", "volume", "book", or "special"
   - number: The chapter or volume number (preserve decimals like 12.5)
   - volume: Volume number if separate from chapter (for v5c12 patterns)
   - chapter: Chapter number if separate from volume
   - title: The chapter title if present
   - year: Publication year (4 digits) if present
   - contentType: One of "chapter", "volume", "omake", "extra", "bonus", "oneshot" (for special detection)
   - ignoredTokens: List of noise tokens that were ignored

2. If the folder path is provided, use it to infer the series name if not clear from the filename.

3. For manga specifically:
   - Prefer "chapter" over "issue" terminology
   - Look for volume indicators (v, vol, volume) vs chapter indicators (c, ch, chapter)
   - Detect special content: omake, extras, bonus chapters, side stories
   - Preserve decimal chapter numbers (12.5, 10.1)
   - Numbers like "- 012" at the end typically indicate chapters, not issues

4. Common manga noise tokens to ignore:
   - Scanner groups: [Digital], [Viz], [Seven Seas], [J-Novel Club]
   - Quality indicators: [HQ], [LQ], [HD], [x2048], [1920x]
   - Language tags: [English], [EN], [ENG], [Translated]
   - Format tags: [Comicvine], [Anilist], [MAL]

5. Provide a confidence score (0.0-1.0) based on how certain you are about the extraction.

6. Return valid JSON only. No explanations or markdown formatting.`;
}

/**
 * Build user message for comic parsing
 */
function buildComicUserMessage(filesJson: string): string {
  return `Parse the following comic file paths and extract metadata. Return a JSON array with one object per file, in the same order.

Files to parse:
${filesJson}

Return format (JSON array):
[
  {
    "index": 0,
    "filename": "original filename",
    "series": "extracted series name",
    "type": "issue|volume|book|special",
    "number": 1,
    "title": "extracted title",
    "year": 2011,
    "month": 9,
    "day": 21,
    "writer": "author name if present",
    "ignoredTokens": ["noise", "tokens"],
    "confidence": 0.95
  }
]`;
}

/**
 * Build user message for manga parsing
 */
function buildMangaUserMessage(filesJson: string): string {
  return `Parse the following manga file paths and extract metadata. Return a JSON array with one object per file, in the same order.

IMPORTANT: These are MANGA files, not western comics. Use manga-specific terminology and patterns.

Files to parse:
${filesJson}

Return format (JSON array):
[
  {
    "index": 0,
    "filename": "original filename",
    "series": "extracted manga series name",
    "type": "chapter|volume|book|special",
    "number": "12" or "12.5",
    "volume": "5",
    "chapter": "12",
    "title": "chapter title if present",
    "year": 2023,
    "contentType": "chapter|volume|omake|extra|bonus|oneshot",
    "ignoredTokens": ["noise", "tokens"],
    "confidence": 0.95
  }
]

Notes:
- "type" should use "chapter" for individual chapters (not "issue")
- "volume" is separate from "chapter" for patterns like v5c12
- "contentType" identifies special content: omake, extra, bonus, oneshot
- "number" is the primary number for sorting (usually chapter number)
- Preserve decimal numbers like 12.5 for half-chapters`;
}

/**
 * Parse a batch of filenames using Claude
 */
export async function parseFilenamesBatch(
  files: Array<{ filename: string; folderPath?: string }>,
  options: { model?: string; sessionId?: string; libraryType?: LibraryType } = {}
): Promise<BatchParseResult> {
  const { sessionId, libraryType } = options;

  if (!isLLMAvailable()) {
    return {
      success: false,
      results: [],
      error: 'Anthropic API key not configured',
    };
  }

  if (files.length === 0) {
    return {
      success: true,
      results: [],
    };
  }

  const startTime = Date.now();

  // Log API call start
  if (sessionId) {
    MetadataFetchLogger.logAPICallStart(sessionId, 'anthropic' as 'comicvine', '/messages', {
      model: options.model || getLLMModel(),
      files: String(files.length),
    });
    MetadataFetchLogger.log(sessionId, 'info', 'parsing', `Calling Claude API to parse ${files.length} filename(s)`, {
      model: options.model || getLLMModel(),
      fileCount: files.length,
    });
  }

  try {
    const client = getClient();
    const model = options.model || getLLMModel();

    // Build the user message with file list
    const filesJson = JSON.stringify(
      files.map((f, i) => ({
        index: i,
        filename: f.filename,
        folderPath: f.folderPath,
      })),
      null,
      2
    );

    // Build user message based on library type
    const userMessage = libraryType === 'manga'
      ? buildMangaUserMessage(filesJson)
      : buildComicUserMessage(filesJson);

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: buildSystemPrompt(libraryType),
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    const duration = Date.now() - startTime;

    // Extract text content from response
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      if (sessionId) {
        MetadataFetchLogger.logAPICallEnd(sessionId, 'anthropic' as 'comicvine', '/messages', {
          success: false,
          error: 'No text response from Claude',
        });
      }
      return {
        success: false,
        results: [],
        error: 'No text response from Claude',
      };
    }

    // Parse the JSON response
    let parsed: Array<{
      index: number;
      filename: string;
      series?: string;
      type?: string;
      number?: number | string;
      title?: string;
      year?: number;
      month?: number;
      day?: number;
      writer?: string;
      ignoredTokens?: string[];
      confidence?: number;
      // Manga-specific fields
      volume?: string;
      chapter?: string;
      contentType?: string;
    }>;

    try {
      // Try to extract JSON from the response (it might be wrapped in markdown)
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

      parsed = JSON.parse(jsonStr);
    } catch {
      if (sessionId) {
        MetadataFetchLogger.logAPICallEnd(sessionId, 'anthropic' as 'comicvine', '/messages', {
          success: false,
          error: 'Failed to parse JSON response',
        });
      }
      return {
        success: false,
        results: [],
        error: `Failed to parse Claude response as JSON: ${textContent.text.substring(0, 200)}`,
      };
    }

    // Map results back to original files
    const results: ParsedFileMetadata[] = files.map((file, index) => {
      const parsedItem = parsed.find((p) => p.index === index);

      if (!parsedItem) {
        return {
          filename: file.filename,
          folderPath: file.folderPath,
          error: 'No result returned for this file',
        };
      }

      return {
        filename: file.filename,
        folderPath: file.folderPath,
        series: parsedItem.series,
        type: parsedItem.type as ParsedFileMetadata['type'],
        number: parsedItem.number,
        title: parsedItem.title,
        year: parsedItem.year,
        month: parsedItem.month,
        day: parsedItem.day,
        writer: parsedItem.writer,
        ignoredTokens: parsedItem.ignoredTokens,
        confidence: parsedItem.confidence,
        // Manga-specific fields
        volume: parsedItem.volume,
        chapter: parsedItem.chapter,
        contentType: parsedItem.contentType as ParsedFileMetadata['contentType'],
      };
    });

    const totalTokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    // Log successful API call
    if (sessionId) {
      MetadataFetchLogger.logAPICallEnd(sessionId, 'anthropic' as 'comicvine', '/messages', {
        success: true,
        resultCount: results.length,
      });
      MetadataFetchLogger.log(sessionId, 'info', 'parsing', `Claude parsed ${results.length} file(s) in ${duration}ms (${totalTokens} tokens)`, {
        duration,
        totalTokens,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        model,
      });
    }

    return {
      success: true,
      results,
      totalTokens,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (sessionId) {
      MetadataFetchLogger.logAPICallEnd(sessionId, 'anthropic' as 'comicvine', '/messages', {
        success: false,
        error: errorMsg,
      });
      MetadataFetchLogger.log(sessionId, 'error', 'parsing', `Claude API error: ${errorMsg}`, {
        error: errorMsg,
      });
    }
    return {
      success: false,
      results: [],
      error: errorMsg,
    };
  }
}

/**
 * Parse a single filename using Claude
 */
export async function parseFilename(
  filename: string,
  folderPath?: string,
  options: { sessionId?: string; libraryType?: LibraryType } = {}
): Promise<ParsedFileMetadata> {
  const result = await parseFilenamesBatch([{ filename, folderPath }], {
    sessionId: options.sessionId,
    libraryType: options.libraryType,
  });

  if (!result.success) {
    return {
      filename,
      folderPath,
      error: result.error,
    };
  }

  return result.results[0] || { filename, folderPath, error: 'No result' };
}

// =============================================================================
// Rename Suggestion
// =============================================================================

/**
 * Generate a suggested filename based on parsed metadata
 */
export function generateSuggestedFilename(
  metadata: ParsedFileMetadata,
  options: { format?: 'issue' | 'volume' | 'book' | 'special' } = {}
): string | null {
  const conventions = loadConventions();
  const type = options.format || metadata.type || 'issue';

  // Build components
  const number = metadata.number?.toString().padStart(type === 'volume' ? 2 : 3, '0');
  const title = metadata.title;
  const year = metadata.year;
  const date = metadata.year
    ? metadata.month && metadata.day
      ? `${metadata.year}-${String(metadata.month).padStart(2, '0')}-${String(metadata.day).padStart(2, '0')}`
      : String(metadata.year)
    : null;

  // Generate based on type
  switch (type) {
    case 'issue':
      if (number && title && date) {
        return `Issue #${number} - ${title} (${date}).cbz`;
      } else if (number && title) {
        return `Issue #${number} - ${title}.cbz`;
      } else if (number) {
        return `Issue #${number}.cbz`;
      }
      break;

    case 'volume':
      if (number && title && year) {
        return `Volume ${number} - ${title} (${year}).cbz`;
      } else if (number && title) {
        return `Volume ${number} - ${title}.cbz`;
      } else if (number) {
        return `Volume ${number}.cbz`;
      }
      break;

    case 'book':
      if (number && title && year) {
        return `Book ${number} - ${title} (${year}).cbz`;
      } else if (title && year) {
        return `${title} (${year}).cbz`;
      } else if (title) {
        return `${title}.cbz`;
      }
      break;

    case 'special':
      if (title && year) {
        return `Special - ${title} (${year}).cbz`;
      } else if (title) {
        return `Special - ${title}.cbz`;
      }
      break;
  }

  return null;
}

/**
 * Generate a suggested folder name based on parsed metadata
 */
export function generateSuggestedFolderName(
  metadata: ParsedFileMetadata,
  options: { includeAuthor?: boolean; endYear?: number } = {}
): string | null {
  if (!metadata.series) {
    return null;
  }

  const series = metadata.series;
  const startYear = metadata.year;
  const endYear = options.endYear;
  const author = options.includeAuthor ? metadata.writer : null;

  if (author && startYear && endYear) {
    return `${series} by ${author} (${startYear}-${endYear})`;
  } else if (author && startYear) {
    return `${series} by ${author} (${startYear})`;
  } else if (startYear && endYear) {
    return `${series} (${startYear}-${endYear})`;
  } else if (startYear) {
    return `${series} (${startYear})`;
  }

  return series;
}

// =============================================================================
// Batch Processing with Progress
// =============================================================================

export interface BatchProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  currentBatch: number;
  totalBatches: number;
}

/**
 * Parse a large number of files in batches with progress tracking
 */
export async function parseFilesWithProgress(
  files: Array<{ filename: string; folderPath?: string }>,
  options: {
    batchSize?: number;
    onProgress?: (progress: BatchProgress) => void;
    sessionId?: string;
    libraryType?: LibraryType;
  } = {}
): Promise<{
  success: boolean;
  results: ParsedFileMetadata[];
  totalTokens: number;
  errors: string[];
}> {
  const batchSize = options.batchSize || 20; // Process 20 files per API call
  const totalBatches = Math.ceil(files.length / batchSize);

  const allResults: ParsedFileMetadata[] = [];
  const errors: string[] = [];
  let totalTokens = 0;
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < totalBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, files.length);
    const batch = files.slice(start, end);

    // Report progress
    options.onProgress?.({
      total: files.length,
      processed: start,
      successful,
      failed,
      currentBatch: i + 1,
      totalBatches,
    });

    // Process batch
    const result = await parseFilenamesBatch(batch, {
      sessionId: options.sessionId,
      libraryType: options.libraryType,
    });

    if (result.success) {
      allResults.push(...result.results);
      totalTokens += result.totalTokens || 0;

      // Count successes and failures
      for (const r of result.results) {
        if (r.error) {
          failed++;
        } else {
          successful++;
        }
      }
    } else {
      // Mark all files in batch as failed
      for (const file of batch) {
        allResults.push({
          filename: file.filename,
          folderPath: file.folderPath,
          error: result.error,
        });
        failed++;
      }
      errors.push(result.error || 'Unknown error');
    }

    // Small delay between batches to avoid rate limiting
    if (i < totalBatches - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Final progress update
  options.onProgress?.({
    total: files.length,
    processed: files.length,
    successful,
    failed,
    currentBatch: totalBatches,
    totalBatches,
  });

  return {
    success: errors.length === 0,
    results: allResults,
    totalTokens,
    errors,
  };
}

// =============================================================================
// Manga Special Case Classification
// =============================================================================

export interface MangaClassificationInput {
  filename: string;
  pageCount: number;
  seriesName?: string;
}

export interface MangaClassificationOutput {
  filename: string;
  contentType: 'chapter' | 'volume' | 'omake' | 'extra' | 'bonus' | 'oneshot';
  volume?: string;
  chapter?: string;
  displayTitle: string;
  confidence: number;
}

export interface MangaClassificationBatchResult {
  success: boolean;
  results: MangaClassificationOutput[];
  totalTokens?: number;
  error?: string;
}

/**
 * Batch classify manga files using LLM for edge cases
 *
 * This is used when the regex-based classification has low confidence
 * and needs LLM assistance to determine content type (omake, extra, etc.)
 */
export async function classifyMangaFilesWithLLM(
  files: MangaClassificationInput[],
  options: { sessionId?: string; model?: string } = {}
): Promise<MangaClassificationBatchResult> {
  const { sessionId } = options;

  if (!isLLMAvailable()) {
    return {
      success: false,
      results: [],
      error: 'Anthropic API key not configured',
    };
  }

  if (files.length === 0) {
    return {
      success: true,
      results: [],
    };
  }

  const startTime = Date.now();

  // Log API call start
  if (sessionId) {
    MetadataFetchLogger.logAPICallStart(sessionId, 'anthropic' as 'comicvine', '/messages', {
      model: options.model || getLLMModel(),
      files: String(files.length),
      purpose: 'manga-classification',
    });
    MetadataFetchLogger.log(sessionId, 'info', 'parsing', `Calling Claude API to classify ${files.length} manga file(s)`, {
      model: options.model || getLLMModel(),
      fileCount: files.length,
    });
  }

  try {
    const client = getClient();
    const model = options.model || getLLMModel();

    // Build the file list
    const filesJson = JSON.stringify(
      files.map((f, i) => ({
        index: i,
        filename: f.filename,
        pageCount: f.pageCount,
        seriesName: f.seriesName,
      })),
      null,
      2
    );

    const systemPrompt = `You are a manga content classification assistant. Your task is to analyze manga filenames and determine the content type.

# Content Types

1. **chapter** - Regular manga chapters (the most common)
2. **volume** - Collected volumes (typically 60+ pages, compiling multiple chapters)
3. **omake** - Short bonus content included at the end of volumes (Japanese term)
4. **extra** - Extra or bonus content, side stories
5. **bonus** - Bonus chapters or content
6. **oneshot** - Standalone one-shot manga (complete story in one file)

# Classification Guidelines

1. **Filename Keywords**:
   - "Omake", "おまけ" → omake
   - "Extra", "Bonus", "Side Story", "Gaiden", "外伝" → extra/bonus
   - "One-Shot", "Oneshot", "One Shot" → oneshot
   - "v", "Vol", "Volume" (without chapter) → volume
   - "c", "Ch", "Chapter", trailing numbers → chapter

2. **Page Count Hints**:
   - < 30 pages: likely omake, extra, or bonus
   - 30-60 pages: likely chapter
   - 60-200 pages: likely volume
   - > 200 pages: definitely volume

3. **Number Patterns**:
   - ".5" chapters (e.g., 12.5) are often extras or bonus content
   - Numbers in parentheses often indicate alternatives

4. **Display Title Generation**:
   - chapter: "Chapter X"
   - volume: "Volume X"
   - omake: "Omake" or "Omake X"
   - extra: "Extra X"
   - bonus: "Bonus X"
   - oneshot: "One-Shot"

Return valid JSON only. No explanations.`;

    const userMessage = `Classify the following manga files. Determine the content type and generate appropriate display titles.

Files to classify:
${filesJson}

Return format (JSON array):
[
  {
    "index": 0,
    "filename": "original filename",
    "contentType": "chapter|volume|omake|extra|bonus|oneshot",
    "volume": "5",
    "chapter": "12",
    "displayTitle": "Chapter 12",
    "confidence": 0.95
  }
]

Notes:
- Use pageCount to help determine if something is a volume vs chapter
- Detect special content types: omake, extra, bonus, oneshot
- Generate appropriate displayTitle based on contentType and number`;

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    const duration = Date.now() - startTime;

    // Extract text content from response
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      if (sessionId) {
        MetadataFetchLogger.logAPICallEnd(sessionId, 'anthropic' as 'comicvine', '/messages', {
          success: false,
          error: 'No text response from Claude',
        });
      }
      return {
        success: false,
        results: [],
        error: 'No text response from Claude',
      };
    }

    // Parse the JSON response
    let parsed: Array<{
      index: number;
      filename: string;
      contentType?: string;
      volume?: string;
      chapter?: string;
      displayTitle?: string;
      confidence?: number;
    }>;

    try {
      // Try to extract JSON from the response
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

      parsed = JSON.parse(jsonStr);
    } catch {
      if (sessionId) {
        MetadataFetchLogger.logAPICallEnd(sessionId, 'anthropic' as 'comicvine', '/messages', {
          success: false,
          error: 'Failed to parse JSON response',
        });
      }
      return {
        success: false,
        results: [],
        error: `Failed to parse Claude response as JSON: ${textContent.text.substring(0, 200)}`,
      };
    }

    // Map results back to original files
    const results: MangaClassificationOutput[] = files.map((file, index) => {
      const parsedItem = parsed.find((p) => p.index === index);

      if (!parsedItem) {
        // Fallback to chapter if no result
        return {
          filename: file.filename,
          contentType: 'chapter' as const,
          displayTitle: 'Chapter',
          confidence: 0.5,
        };
      }

      return {
        filename: file.filename,
        contentType: (parsedItem.contentType || 'chapter') as MangaClassificationOutput['contentType'],
        volume: parsedItem.volume,
        chapter: parsedItem.chapter,
        displayTitle: parsedItem.displayTitle || 'Chapter',
        confidence: parsedItem.confidence || 0.8,
      };
    });

    const totalTokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    // Log successful API call
    if (sessionId) {
      MetadataFetchLogger.logAPICallEnd(sessionId, 'anthropic' as 'comicvine', '/messages', {
        success: true,
        resultCount: results.length,
      });
      MetadataFetchLogger.log(sessionId, 'info', 'parsing', `Claude classified ${results.length} manga file(s) in ${duration}ms (${totalTokens} tokens)`, {
        duration,
        totalTokens,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        model,
      });
    }

    return {
      success: true,
      results,
      totalTokens,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (sessionId) {
      MetadataFetchLogger.logAPICallEnd(sessionId, 'anthropic' as 'comicvine', '/messages', {
        success: false,
        error: errorMsg,
      });
      MetadataFetchLogger.log(sessionId, 'error', 'parsing', `Claude API error: ${errorMsg}`, {
        error: errorMsg,
      });
    }
    return {
      success: false,
      results: [],
      error: errorMsg,
    };
  }
}
