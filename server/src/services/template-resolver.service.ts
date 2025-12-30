/**
 * Template Resolver Service
 *
 * Resolves parsed template tokens to actual values from metadata sources.
 * Applies modifiers (padding, case, truncation) and character replacement rules.
 */

import type { ComicInfo } from './comicinfo.service.js';
import type { ParsedTemplate, TemplateToken } from './template-parser.service.js';
import { parseTemplate, getModifierType } from './template-parser.service.js';
import { detectComicType, type ComicType } from './filename-generator.service.js';

// =============================================================================
// Types
// =============================================================================

export interface ResolverContext {
  /** ComicInfo metadata from the file */
  comicInfo: ComicInfo;
  /** Series entity data (optional, for series-level fields) */
  series?: {
    name?: string;
    publisher?: string;
    startYear?: number;
    endYear?: number;
    volume?: number;
    issueCount?: number;
  };
  /** FileMetadata from database (optional) */
  fileMetadata?: {
    issueNumberSort?: number;
    contentType?: string;
    parsedVolume?: string;
    parsedChapter?: string;
  };
  /** File information */
  file: {
    filename: string;
    extension: string;
    path?: string;
  };
}

export interface CharacterReplacementRules {
  /** : (colon) replacement */
  colon?: 'dash' | 'underscore' | 'space' | 'remove';
  /** | (pipe) replacement */
  pipe?: 'dash' | 'underscore' | 'space' | 'remove';
  /** ? (question mark) replacement */
  question?: 'dash' | 'underscore' | 'space' | 'remove';
  /** * (asterisk) replacement */
  asterisk?: 'dash' | 'underscore' | 'space' | 'remove';
  /** " (quotes) replacement */
  quotes?: 'single' | 'remove';
  /** / and \ (slashes) replacement */
  slash?: 'dash' | 'underscore' | 'space' | 'remove';
  /** < (less than) replacement */
  lt?: 'dash' | 'underscore' | 'space' | 'remove';
  /** > (greater than) replacement */
  gt?: 'dash' | 'underscore' | 'space' | 'remove';
}

export interface ResolverOptions {
  /** Character replacement rules */
  characterRules?: CharacterReplacementRules;
  /** Whether to preserve the extension in output */
  preserveExtension?: boolean;
  /** Maximum filename length (default: 255) */
  maxLength?: number;
}

export interface ResolvedResult {
  /** The resolved filename/path string */
  result: string;
  /** The detected comic type */
  type: ComicType;
  /** Whether any tokens had missing values */
  hadMissingValues: boolean;
  /** Tokens that had missing values */
  missingTokens: string[];
  /** Warnings generated during resolution */
  warnings: string[];
}

// =============================================================================
// Default Character Rules
// =============================================================================

export const DEFAULT_CHARACTER_RULES: CharacterReplacementRules = {
  colon: 'remove',
  pipe: 'remove',
  question: 'remove',
  asterisk: 'remove',
  quotes: 'remove',
  slash: 'remove',
  lt: 'remove',
  gt: 'remove',
};

// =============================================================================
// Token Value Resolution
// =============================================================================

/**
 * Get the raw value for a token from the context.
 */
function getTokenValue(tokenName: string, context: ResolverContext): string | undefined {
  const { comicInfo, series, fileMetadata, file } = context;

  switch (tokenName) {
    // Basic tokens
    case 'Series':
      return comicInfo.Series || series?.name;
    case 'Title':
      return comicInfo.Title;
    case 'Number':
      return comicInfo.Number;
    case 'Volume':
      return comicInfo.Volume?.toString() || fileMetadata?.parsedVolume;
    case 'Chapter':
      return fileMetadata?.parsedChapter;
    case 'Publisher':
      return comicInfo.Publisher || series?.publisher;
    case 'Imprint':
      return comicInfo.Imprint;

    // Date tokens
    case 'Year': {
      // Sanitize year value - extract only numeric 4-digit year
      // Fixes bug where year could contain extension artifact like "1990cbz"
      const rawYear = comicInfo.Year?.toString();
      if (rawYear) {
        const match = rawYear.match(/^(\d{4})/);
        return match ? match[1] : undefined;
      }
      return undefined;
    }
    case 'Month':
      return comicInfo.Month?.toString();
    case 'Day':
      return comicInfo.Day?.toString();

    // Creator tokens
    case 'Writer':
      return comicInfo.Writer;
    case 'Penciller':
      return comicInfo.Penciller;
    case 'Inker':
      return comicInfo.Inker;
    case 'Colorist':
      return comicInfo.Colorist;
    case 'Letterer':
      return comicInfo.Letterer;
    case 'CoverArtist':
      return comicInfo.CoverArtist;
    case 'Editor':
      return comicInfo.Editor;

    // Content tokens
    case 'StoryArc':
      return comicInfo.StoryArc;
    case 'StoryArcNumber':
      return comicInfo.StoryArcNumber?.toString();
    case 'Genre':
      return comicInfo.Genre;
    case 'Format':
      return comicInfo.Format;
    case 'AgeRating':
      return comicInfo.AgeRating;
    case 'PageCount':
      return comicInfo.PageCount?.toString();
    case 'Language':
      return comicInfo.LanguageISO;

    // File tokens
    case 'Extension':
      return file.extension.replace(/^\./, '');
    case 'OriginalFilename':
      // Remove extension from filename
      const ext = file.extension.startsWith('.') ? file.extension : `.${file.extension}`;
      return file.filename.endsWith(ext)
        ? file.filename.slice(0, -ext.length)
        : file.filename;

    // Computed tokens
    case 'Type':
      return getTypeLabel(detectComicType(comicInfo));
    case 'SeriesYear':
      return series?.startYear?.toString() || comicInfo.Year?.toString();
    case 'Count':
      return comicInfo.Count?.toString() || series?.issueCount?.toString();

    default:
      return undefined;
  }
}

/**
 * Get the display label for a comic type.
 */
function getTypeLabel(type: ComicType): string {
  switch (type) {
    case 'issue': return 'Issue';
    case 'volume': return 'Volume';
    case 'tpb': return 'TPB';
    case 'hardcover': return 'Hardcover';
    case 'omnibus': return 'Omnibus';
    case 'annual': return 'Annual';
    case 'one-shot': return 'One-Shot';
    case 'special': return 'Special';
  }
}

// =============================================================================
// Modifier Application
// =============================================================================

/**
 * Apply a modifier to a value.
 */
export function applyModifier(value: string, modifier: string): string {
  if (!modifier) return value;

  const modifierType = getModifierType(modifier);

  switch (modifierType) {
    case 'case':
      return modifier === 'upper' ? value.toUpperCase() : value.toLowerCase();

    case 'padding':
      // Zero-padding: modifier is like "000" or "00"
      const paddingLength = modifier.length;
      // Handle fractional numbers like "1.5"
      if (value.includes('.')) {
        const [whole, frac] = value.split('.');
        const paddedWhole = whole!.padStart(paddingLength, '0');
        return `${paddedWhole}.${frac}`;
      }
      // Try to parse as number
      const num = parseInt(value, 10);
      if (!isNaN(num)) {
        return num.toString().padStart(paddingLength, '0');
      }
      return value;

    case 'truncate':
      // Truncation: modifier is like "30" (max chars)
      const maxLength = parseInt(modifier, 10);
      if (!isNaN(maxLength) && value.length > maxLength) {
        return value.slice(0, maxLength);
      }
      return value;

    default:
      return value;
  }
}

// =============================================================================
// Character Replacement
// =============================================================================

/**
 * Get the replacement string for a character type.
 */
function getReplacementString(type: 'dash' | 'underscore' | 'space' | 'remove' | 'single'): string {
  switch (type) {
    case 'dash': return '-';
    case 'underscore': return '_';
    case 'space': return ' ';
    case 'single': return "'";
    case 'remove': return '';
  }
}

/**
 * Apply character replacement rules to a string.
 */
export function applyCharacterRules(value: string, rules: CharacterReplacementRules): string {
  let result = value;

  if (rules.colon) {
    result = result.replace(/:/g, getReplacementString(rules.colon));
  }
  if (rules.pipe) {
    result = result.replace(/\|/g, getReplacementString(rules.pipe));
  }
  if (rules.question) {
    result = result.replace(/\?/g, getReplacementString(rules.question));
  }
  if (rules.asterisk) {
    result = result.replace(/\*/g, getReplacementString(rules.asterisk));
  }
  if (rules.quotes) {
    result = result.replace(/"/g, getReplacementString(rules.quotes));
  }
  if (rules.slash) {
    result = result.replace(/[/\\]/g, getReplacementString(rules.slash));
  }
  if (rules.lt) {
    result = result.replace(/</g, getReplacementString(rules.lt));
  }
  if (rules.gt) {
    result = result.replace(/>/g, getReplacementString(rules.gt));
  }

  // Clean up multiple spaces
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Sanitize a string for use in filenames.
 * Removes all illegal characters without replacement options.
 */
export function sanitizeForFilename(value: string): string {
  return value
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// =============================================================================
// Main Resolution
// =============================================================================

/**
 * Resolve a parsed template to a final string.
 */
export function resolveTemplate(
  template: ParsedTemplate,
  context: ResolverContext,
  options: ResolverOptions = {}
): ResolvedResult {
  const { characterRules = DEFAULT_CHARACTER_RULES } = options;
  const warnings: string[] = [];
  const missingTokens: string[] = [];
  let hadMissingValues = false;

  // Track the comic type
  const type = detectComicType(context.comicInfo);

  // Build the result string
  let result = '';
  let literalIndex = 0;

  for (let i = 0; i < template.tokens.length; i++) {
    // Add literal before this token
    if (literalIndex < template.literals.length) {
      result += template.literals[literalIndex]!;
      literalIndex++;
    }

    const token = template.tokens[i]!;
    let value = getTokenValue(token.name, context);

    if (value === undefined || value === null || value === '') {
      // Value is missing - use fallback or mark as missing
      if (token.fallback !== undefined) {
        value = token.fallback;
        if (token.fallback === '') {
          // Empty fallback means omit the token entirely
          // Also try to clean up surrounding literals (e.g., " - " before empty token)
          continue;
        }
      } else {
        hadMissingValues = true;
        missingTokens.push(token.name);
        warnings.push(`Missing value for {${token.name}}`);
        continue;
      }
    }

    // Apply modifier if present
    if (token.modifier) {
      value = applyModifier(value, token.modifier);
    }

    // Apply character replacement rules
    value = applyCharacterRules(value, characterRules);

    result += value;
  }

  // Add remaining literal after last token
  if (literalIndex < template.literals.length) {
    result += template.literals[literalIndex]!;
  }

  // Clean up dangling separators from empty tokens
  result = cleanupDanglingSeparators(result);

  // Apply final sanitization
  result = result.replace(/\s+/g, ' ').trim();

  // Enforce max length if specified
  if (options.maxLength && result.length > options.maxLength) {
    result = result.slice(0, options.maxLength);
    warnings.push(`Filename truncated to ${options.maxLength} characters`);
  }

  return {
    result,
    type,
    hadMissingValues,
    missingTokens,
    warnings,
  };
}

/**
 * Clean up dangling separators left behind by empty tokens.
 * For example: "Title -  - (2011)" should become "Title (2011)"
 */
function cleanupDanglingSeparators(value: string): string {
  return value
    // Remove multiple dashes with spaces
    .replace(/\s*-\s*-\s*/g, ' - ')
    // Remove leading/trailing dashes
    .replace(/^\s*-\s*/, '')
    .replace(/\s*-\s*$/, '')
    // Remove empty parentheses
    .replace(/\(\s*\)/g, '')
    // Remove empty brackets
    .replace(/\[\s*\]/g, '')
    // Remove multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a template string directly (parses and resolves in one step).
 */
export function resolveTemplateString(
  templateString: string,
  context: ResolverContext,
  options: ResolverOptions = {}
): ResolvedResult {
  const parsed = parseTemplate(templateString);

  if (!parsed.isValid) {
    return {
      result: '',
      type: 'issue',
      hadMissingValues: true,
      missingTokens: [],
      warnings: parsed.errors,
    };
  }

  return resolveTemplate(parsed, context, options);
}

/**
 * Resolve an array of folder segment templates.
 */
export function resolvePathSegments(
  segments: string[],
  context: ResolverContext,
  options: ResolverOptions = {}
): string[] {
  const results: string[] = [];

  for (const segment of segments) {
    const resolved = resolveTemplateString(segment, context, options);
    // Only include non-empty segments
    if (resolved.result && resolved.result.trim()) {
      results.push(resolved.result);
    }
  }

  return results;
}

/**
 * Build a full path from resolved folder segments.
 */
export function buildFolderPath(segments: string[]): string {
  return segments.filter(s => s && s.trim()).join('/');
}

// =============================================================================
// Preview Helpers
// =============================================================================

/**
 * Create a sample context for template preview.
 */
export function createSampleContext(): ResolverContext {
  return {
    comicInfo: {
      Series: 'Batman',
      Title: 'Court of Owls',
      Number: '1',
      Volume: 1,
      Year: 2011,
      Month: 9,
      Publisher: 'DC Comics',
      Writer: 'Scott Snyder',
      Penciller: 'Greg Capullo',
      Format: 'Issue',
      PageCount: 32,
      Genre: 'Superhero',
    },
    series: {
      name: 'Batman',
      publisher: 'DC Comics',
      startYear: 2011,
      issueCount: 52,
    },
    file: {
      filename: 'Batman_001.cbz',
      extension: '.cbz',
    },
  };
}

/**
 * Preview a template with sample data.
 */
export function previewTemplate(
  templateString: string,
  context?: ResolverContext
): ResolvedResult {
  return resolveTemplateString(
    templateString,
    context || createSampleContext()
  );
}
