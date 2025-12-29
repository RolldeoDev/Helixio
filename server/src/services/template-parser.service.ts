/**
 * Template Parser Service
 *
 * Parses filename templates into structured tokens for processing.
 * Supports syntax: {TokenName}, {Token|fallback}, {Token:modifier}
 *
 * Token Syntax:
 * - {Series} - Basic token
 * - {Year|Unknown} - Token with fallback value if empty
 * - {Number:000} - Token with zero-padding modifier
 * - {Series:upper} - Token with case modifier (upper/lower)
 * - {Title:30} - Token with truncation modifier (max chars)
 * - {Volume|} - Token with empty fallback (omit if empty)
 */

// =============================================================================
// Types
// =============================================================================

export interface TemplateToken {
  /** Token name (e.g., "Series", "Number", "Year") */
  name: string;
  /** Fallback value if token resolves to empty (undefined = no fallback) */
  fallback?: string;
  /** Modifier string (e.g., "000" for padding, "upper", "lower", "30" for truncate) */
  modifier?: string;
  /** Original raw token string including braces */
  raw: string;
  /** Start position in template string */
  start: number;
  /** End position in template string */
  end: number;
}

export interface ParsedTemplate {
  /** Original template string */
  original: string;
  /** Parsed tokens in order */
  tokens: TemplateToken[];
  /** Literal text segments between tokens */
  literals: string[];
  /** Whether the template is syntactically valid */
  isValid: boolean;
  /** Validation errors if any */
  errors: string[];
}

export interface TokenDefinition {
  /** Token name used in templates */
  name: string;
  /** Human-readable description */
  description: string;
  /** Category for grouping in UI */
  category: 'basic' | 'date' | 'creator' | 'content' | 'file' | 'computed';
  /** Example value for preview */
  example: string;
  /** Supported modifiers for this token */
  supportedModifiers: ('padding' | 'case' | 'truncate')[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// Token Definitions
// =============================================================================

/**
 * All available tokens that can be used in templates.
 */
export const AVAILABLE_TOKENS: TokenDefinition[] = [
  // Basic tokens
  { name: 'Series', description: 'Series name', category: 'basic', example: 'Batman', supportedModifiers: ['case', 'truncate'] },
  { name: 'Title', description: 'Issue/volume title', category: 'basic', example: 'Court of Owls', supportedModifiers: ['case', 'truncate'] },
  { name: 'Number', description: 'Issue/volume number', category: 'basic', example: '1', supportedModifiers: ['padding'] },
  { name: 'Volume', description: 'Volume number', category: 'basic', example: '2', supportedModifiers: ['padding'] },
  { name: 'Chapter', description: 'Chapter number (manga)', category: 'basic', example: '45', supportedModifiers: ['padding'] },
  { name: 'Publisher', description: 'Publisher name', category: 'basic', example: 'DC Comics', supportedModifiers: ['case', 'truncate'] },
  { name: 'Imprint', description: 'Publisher imprint', category: 'basic', example: 'Vertigo', supportedModifiers: ['case', 'truncate'] },

  // Date tokens
  { name: 'Year', description: 'Publication year', category: 'date', example: '2011', supportedModifiers: [] },
  { name: 'Month', description: 'Publication month', category: 'date', example: '09', supportedModifiers: ['padding'] },
  { name: 'Day', description: 'Publication day', category: 'date', example: '15', supportedModifiers: ['padding'] },

  // Creator tokens
  { name: 'Writer', description: 'Writer(s)', category: 'creator', example: 'Scott Snyder', supportedModifiers: ['case', 'truncate'] },
  { name: 'Penciller', description: 'Pencil artist(s)', category: 'creator', example: 'Greg Capullo', supportedModifiers: ['case', 'truncate'] },
  { name: 'Inker', description: 'Inker(s)', category: 'creator', example: 'Jonathan Glapion', supportedModifiers: ['case', 'truncate'] },
  { name: 'Colorist', description: 'Colorist(s)', category: 'creator', example: 'FCO Plascencia', supportedModifiers: ['case', 'truncate'] },
  { name: 'Letterer', description: 'Letterer(s)', category: 'creator', example: 'Richard Starkings', supportedModifiers: ['case', 'truncate'] },
  { name: 'CoverArtist', description: 'Cover artist(s)', category: 'creator', example: 'Jim Lee', supportedModifiers: ['case', 'truncate'] },
  { name: 'Editor', description: 'Editor(s)', category: 'creator', example: 'Bob Harras', supportedModifiers: ['case', 'truncate'] },

  // Content tokens
  { name: 'StoryArc', description: 'Story arc name', category: 'content', example: 'Zero Year', supportedModifiers: ['case', 'truncate'] },
  { name: 'StoryArcNumber', description: 'Story arc issue number', category: 'content', example: '3', supportedModifiers: ['padding'] },
  { name: 'Genre', description: 'Genre(s)', category: 'content', example: 'Superhero', supportedModifiers: ['case', 'truncate'] },
  { name: 'Format', description: 'Format from ComicInfo', category: 'content', example: 'Issue', supportedModifiers: ['case'] },
  { name: 'AgeRating', description: 'Age rating', category: 'content', example: 'Teen', supportedModifiers: [] },
  { name: 'PageCount', description: 'Number of pages', category: 'content', example: '32', supportedModifiers: [] },
  { name: 'Language', description: 'Language code', category: 'content', example: 'en', supportedModifiers: ['case'] },

  // File tokens
  { name: 'Extension', description: 'File extension (without dot)', category: 'file', example: 'cbz', supportedModifiers: ['case'] },
  { name: 'OriginalFilename', description: 'Original filename (without extension)', category: 'file', example: 'Batman_001', supportedModifiers: ['truncate'] },

  // Computed tokens
  { name: 'Type', description: 'Detected type (Issue, TPB, etc.)', category: 'computed', example: 'Issue', supportedModifiers: ['case'] },
  { name: 'SeriesYear', description: 'Series start year', category: 'computed', example: '2011', supportedModifiers: [] },
  { name: 'Count', description: 'Total issues in series', category: 'computed', example: '52', supportedModifiers: ['padding'] },
];

/**
 * Set of valid token names for quick lookup.
 */
export const VALID_TOKEN_NAMES = new Set(AVAILABLE_TOKENS.map(t => t.name));

// =============================================================================
// Parser Implementation
// =============================================================================

/**
 * Regex to match tokens in template strings.
 * Matches: {TokenName}, {Token|fallback}, {Token:modifier}, {Token:modifier|fallback}
 */
const TOKEN_REGEX = /\{([A-Za-z]+)(?::([^|}]+))?(?:\|([^}]*))?\}/g;

/**
 * Parse a template string into structured tokens.
 */
export function parseTemplate(template: string): ParsedTemplate {
  const tokens: TemplateToken[] = [];
  const literals: string[] = [];
  const errors: string[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  TOKEN_REGEX.lastIndex = 0;

  while ((match = TOKEN_REGEX.exec(template)) !== null) {
    // Always add literal text before this token (empty string if token is at position 0)
    // This ensures literals[i] corresponds to text BEFORE tokens[i]
    literals.push(template.slice(lastIndex, match.index));

    const [raw, name, modifier, fallback] = match;

    // Validate token name
    if (!VALID_TOKEN_NAMES.has(name!)) {
      errors.push(`Unknown token: {${name}}`);
    }

    tokens.push({
      name: name!,
      modifier: modifier || undefined,
      fallback: fallback !== undefined ? fallback : undefined,
      raw: raw!,
      start: match.index,
      end: match.index + raw!.length,
    });

    lastIndex = match.index + raw!.length;
  }

  // Always add trailing literal after last token (empty if no trailing text)
  // This ensures literals.length === tokens.length + 1
  literals.push(template.slice(lastIndex));

  // Check for unmatched braces
  const openBraces = (template.match(/\{/g) || []).length;
  const closeBraces = (template.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push('Unmatched braces in template');
  }

  // Check for empty template
  if (tokens.length === 0 && template.trim().length === 0) {
    errors.push('Template cannot be empty');
  }

  return {
    original: template,
    tokens,
    literals,
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a template string without fully parsing it.
 */
export function validateTemplate(template: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!template || template.trim().length === 0) {
    errors.push('Template cannot be empty');
    return { valid: false, errors, warnings };
  }

  // Parse and collect errors
  const parsed = parseTemplate(template);
  errors.push(...parsed.errors);

  // Check for modifier validity
  for (const token of parsed.tokens) {
    if (token.modifier) {
      const tokenDef = AVAILABLE_TOKENS.find(t => t.name === token.name);
      if (tokenDef) {
        const modifierType = getModifierType(token.modifier);
        if (modifierType && !tokenDef.supportedModifiers.includes(modifierType)) {
          warnings.push(`Token {${token.name}} does not support ${modifierType} modifier`);
        }
      }
    }
  }

  // Check for potentially problematic patterns
  if (!parsed.tokens.some(t => t.name === 'Series' || t.name === 'Title')) {
    warnings.push('Template should include {Series} or {Title} for meaningful filenames');
  }

  // Check for extension token
  if (!template.includes('.{Extension}') && !template.endsWith('.cbz') && !template.endsWith('.cbr')) {
    warnings.push('Template should include file extension (.{Extension} or hardcoded)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Determine the type of a modifier string.
 */
export function getModifierType(modifier: string): 'padding' | 'case' | 'truncate' | null {
  if (modifier === 'upper' || modifier === 'lower') {
    return 'case';
  }
  if (/^0+$/.test(modifier)) {
    return 'padding';
  }
  if (/^\d+$/.test(modifier)) {
    return 'truncate';
  }
  return null;
}

/**
 * Get all available tokens for autocomplete/UI.
 */
export function getAvailableTokens(): TokenDefinition[] {
  return AVAILABLE_TOKENS;
}

/**
 * Get tokens grouped by category.
 */
export function getTokensByCategory(): Record<string, TokenDefinition[]> {
  const categories: Record<string, TokenDefinition[]> = {};

  for (const token of AVAILABLE_TOKENS) {
    if (!categories[token.category]) {
      categories[token.category] = [];
    }
    categories[token.category]!.push(token);
  }

  return categories;
}

/**
 * Build a template string from tokens and literals.
 * Useful for reconstructing modified templates.
 */
export function buildTemplateString(tokens: TemplateToken[], literals: string[]): string {
  let result = '';

  for (let i = 0; i < tokens.length; i++) {
    if (i < literals.length) {
      result += literals[i];
    }
    result += tokens[i]!.raw;
  }

  // Add final literal if exists
  if (literals.length > tokens.length) {
    result += literals[literals.length - 1];
  }

  return result;
}

/**
 * Create a token string from components.
 */
export function createTokenString(name: string, modifier?: string, fallback?: string): string {
  let token = `{${name}`;
  if (modifier) {
    token += `:${modifier}`;
  }
  if (fallback !== undefined) {
    token += `|${fallback}`;
  }
  token += '}';
  return token;
}
