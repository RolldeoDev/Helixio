/**
 * Template Parser Service Tests
 *
 * Comprehensive tests for template string parsing, validation, and token handling.
 */

import { describe, it, expect } from 'vitest';
import {
  parseTemplate,
  validateTemplate,
  getModifierType,
  getAvailableTokens,
  getTokensByCategory,
  buildTemplateString,
  createTokenString,
  AVAILABLE_TOKENS,
  VALID_TOKEN_NAMES,
} from '../template-parser.service.js';
import { SAMPLE_TEMPLATES, generateLongString, generateLargeTemplate } from './template.fixtures.js';

describe('Template Parser Service', () => {
  // ==========================================================================
  // parseTemplate Tests
  // ==========================================================================

  describe('parseTemplate', () => {
    describe('basic token parsing', () => {
      it('parses a basic token', () => {
        const result = parseTemplate('{Series}');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]!.name).toBe('Series');
        expect(result.tokens[0]!.raw).toBe('{Series}');
        expect(result.tokens[0]!.modifier).toBeUndefined();
        expect(result.tokens[0]!.fallback).toBeUndefined();
      });

      it('parses token with fallback value', () => {
        const result = parseTemplate('{Year|Unknown}');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]!.name).toBe('Year');
        expect(result.tokens[0]!.fallback).toBe('Unknown');
      });

      it('parses token with empty fallback', () => {
        const result = parseTemplate('{Year|}');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]!.name).toBe('Year');
        expect(result.tokens[0]!.fallback).toBe('');
      });

      it('parses token with modifier', () => {
        const result = parseTemplate('{Number:000}');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]!.name).toBe('Number');
        expect(result.tokens[0]!.modifier).toBe('000');
      });

      it('parses token with modifier and fallback', () => {
        const result = parseTemplate('{Number:000|0}');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]!.name).toBe('Number');
        expect(result.tokens[0]!.modifier).toBe('000');
        expect(result.tokens[0]!.fallback).toBe('0');
      });
    });

    describe('mixed literal and token parsing', () => {
      it('parses template with prefix literal', () => {
        const result = parseTemplate('prefix_{Series}');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(1);
        expect(result.literals).toContain('prefix_');
      });

      it('parses template with suffix literal', () => {
        const result = parseTemplate('{Series}_suffix');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(1);
        expect(result.literals[result.literals.length - 1]).toBe('_suffix');
      });

      it('parses multiple tokens with literals between', () => {
        const result = parseTemplate('{Series} - {Number}.{Extension}');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(3);
        expect(result.tokens[0]!.name).toBe('Series');
        expect(result.tokens[1]!.name).toBe('Number');
        expect(result.tokens[2]!.name).toBe('Extension');
        expect(result.literals).toContain(' - ');
        expect(result.literals).toContain('.');
      });

      it('parses complex template correctly', () => {
        const result = parseTemplate(SAMPLE_TEMPLATES.complex);

        expect(result.isValid).toBe(true);
        expect(result.tokens.length).toBeGreaterThanOrEqual(5);
        expect(result.tokens.map(t => t.name)).toContain('Series');
        expect(result.tokens.map(t => t.name)).toContain('Type');
        expect(result.tokens.map(t => t.name)).toContain('Number');
      });
    });

    describe('validation during parsing', () => {
      it('marks unknown token as error', () => {
        const result = parseTemplate('{UnknownToken}');

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Unknown token: {UnknownToken}');
      });

      it('detects unmatched opening brace', () => {
        const result = parseTemplate('{Series');

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('Unmatched braces'))).toBe(true);
      });

      it('detects unmatched closing brace', () => {
        const result = parseTemplate('Series}');

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('Unmatched braces'))).toBe(true);
      });

      it('handles empty template', () => {
        const result = parseTemplate('');

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('empty'))).toBe(true);
      });

      it('handles whitespace-only template', () => {
        const result = parseTemplate('   ');

        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('empty'))).toBe(true);
      });
    });

    describe('literals array structure', () => {
      it('includes leading empty literal when first token is at position 0', () => {
        const result = parseTemplate('{Series} - {Number}');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(2);
        // Key invariant: literals[0] should be empty (before first token)
        // literals[1] should be " - " (between tokens)
        // literals[2] should be "" (after last token)
        expect(result.literals).toHaveLength(3);
        expect(result.literals[0]).toBe('');
        expect(result.literals[1]).toBe(' - ');
        expect(result.literals[2]).toBe('');
      });

      it('includes non-empty leading literal when template starts with text', () => {
        const result = parseTemplate('prefix_{Series} - {Number}');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(2);
        expect(result.literals).toHaveLength(3);
        expect(result.literals[0]).toBe('prefix_');
        expect(result.literals[1]).toBe(' - ');
        expect(result.literals[2]).toBe('');
      });

      it('maintains correct literal count: tokens.length + 1', () => {
        const result = parseTemplate('{A} - {B} - {C} - {D}');

        expect(result.isValid).toBe(false); // Unknown tokens, but structure is correct
        expect(result.tokens).toHaveLength(4);
        expect(result.literals).toHaveLength(5);
        expect(result.literals[0]).toBe(''); // before A
        expect(result.literals[1]).toBe(' - '); // between A and B
        expect(result.literals[2]).toBe(' - '); // between B and C
        expect(result.literals[3]).toBe(' - '); // between C and D
        expect(result.literals[4]).toBe(''); // after D
      });

      it('handles trailing literal correctly', () => {
        const result = parseTemplate('{Series}.cbz');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(1);
        expect(result.literals).toHaveLength(2);
        expect(result.literals[0]).toBe('');
        expect(result.literals[1]).toBe('.cbz');
      });

      it('handles default template literal structure', () => {
        const result = parseTemplate('{Series} - {Type} {Number:000} - {Title} ({Year|}).{Extension}');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(6);
        expect(result.literals).toHaveLength(7);
        expect(result.literals[0]).toBe(''); // before Series
        expect(result.literals[1]).toBe(' - '); // between Series and Type
        expect(result.literals[2]).toBe(' '); // between Type and Number
        expect(result.literals[3]).toBe(' - '); // between Number and Title
        expect(result.literals[4]).toBe(' ('); // between Title and Year
        expect(result.literals[5]).toBe(').'); // between Year and Extension
        expect(result.literals[6]).toBe(''); // after Extension
      });
    });

    describe('edge cases', () => {
      it('handles template with only literals', () => {
        const result = parseTemplate('static-filename.cbz');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(0);
        expect(result.literals).toContain('static-filename.cbz');
      });

      it('handles adjacent tokens without literals', () => {
        const result = parseTemplate('{Series}{Number}');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(2);
      });

      it('handles multiple tokens in sequence', () => {
        const result = parseTemplate('{Series}{Title}{Number}{Extension}');

        expect(result.isValid).toBe(true);
        expect(result.tokens).toHaveLength(4);
      });

      it('preserves token start and end positions', () => {
        const template = 'prefix{Series}suffix';
        const result = parseTemplate(template);

        expect(result.tokens[0]!.start).toBe(6);
        expect(result.tokens[0]!.end).toBe(14);
      });

      it('handles very long template strings', () => {
        const longTemplate = generateLargeTemplate(50);
        const result = parseTemplate(longTemplate);

        expect(result.isValid).toBe(true);
        expect(result.tokens.length).toBeGreaterThan(10);
      });

      it('handles unicode in literals', () => {
        const result = parseTemplate('{Series} - 日本語.{Extension}');

        expect(result.isValid).toBe(true);
        expect(result.original).toContain('日本語');
      });
    });
  });

  // ==========================================================================
  // validateTemplate Tests
  // ==========================================================================

  describe('validateTemplate', () => {
    describe('valid templates', () => {
      it('validates basic template as valid', () => {
        const result = validateTemplate(SAMPLE_TEMPLATES.basic);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('validates complex template as valid', () => {
        const result = validateTemplate(SAMPLE_TEMPLATES.complex);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('validates template with modifiers as valid', () => {
        const result = validateTemplate(SAMPLE_TEMPLATES.withModifiers);

        expect(result.valid).toBe(true);
      });

      it('validates template with fallback as valid', () => {
        const result = validateTemplate(SAMPLE_TEMPLATES.withFallback);

        expect(result.valid).toBe(true);
      });
    });

    describe('invalid templates', () => {
      it('invalidates empty template', () => {
        const result = validateTemplate('');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Template cannot be empty');
      });

      it('invalidates whitespace-only template', () => {
        const result = validateTemplate('   ');

        expect(result.valid).toBe(false);
      });

      it('invalidates template with unknown token', () => {
        const result = validateTemplate(SAMPLE_TEMPLATES.invalidUnknownToken);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Unknown token'))).toBe(true);
      });

      it('invalidates template with unmatched braces', () => {
        const result = validateTemplate(SAMPLE_TEMPLATES.invalidUnmatched);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Unmatched braces'))).toBe(true);
      });
    });

    describe('warnings', () => {
      it('warns when template lacks Series or Title', () => {
        const result = validateTemplate('{Number}.{Extension}');

        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.includes('Series') || w.includes('Title'))).toBe(true);
      });

      it('warns when template lacks extension', () => {
        const result = validateTemplate('{Series} - {Number}');

        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.includes('extension'))).toBe(true);
      });

      it('warns about unsupported modifier on token', () => {
        // Year doesn't support padding modifier
        const result = validateTemplate('{Year:000}.{Extension}');

        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.includes('Year') && w.includes('padding'))).toBe(true);
      });

      it('no warning for supported modifier', () => {
        const result = validateTemplate('{Number:000}.{Extension}');

        expect(result.valid).toBe(true);
        expect(result.warnings.filter(w => w.includes('Number'))).toHaveLength(0);
      });
    });

    describe('accumulates multiple errors', () => {
      it('reports multiple unknown tokens', () => {
        // Note: Token names must be all letters (no numbers) to be parsed as tokens
        const result = validateTemplate('{Unknowna} - {Unknownb}');

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ==========================================================================
  // getModifierType Tests
  // ==========================================================================

  describe('getModifierType', () => {
    describe('padding modifiers', () => {
      it('identifies "000" as padding', () => {
        expect(getModifierType('000')).toBe('padding');
      });

      it('identifies "00" as padding', () => {
        expect(getModifierType('00')).toBe('padding');
      });

      it('identifies "0000" as padding', () => {
        expect(getModifierType('0000')).toBe('padding');
      });

      it('identifies single "0" as padding', () => {
        expect(getModifierType('0')).toBe('padding');
      });
    });

    describe('case modifiers', () => {
      it('identifies "upper" as case', () => {
        expect(getModifierType('upper')).toBe('case');
      });

      it('identifies "lower" as case', () => {
        expect(getModifierType('lower')).toBe('case');
      });
    });

    describe('truncate modifiers', () => {
      it('identifies "30" as truncate', () => {
        expect(getModifierType('30')).toBe('truncate');
      });

      it('identifies "100" as truncate', () => {
        expect(getModifierType('100')).toBe('truncate');
      });

      it('identifies "5" as truncate', () => {
        expect(getModifierType('5')).toBe('truncate');
      });
    });

    describe('unknown modifiers', () => {
      it('returns null for unknown modifier', () => {
        expect(getModifierType('unknown')).toBeNull();
      });

      it('returns null for empty modifier', () => {
        expect(getModifierType('')).toBeNull();
      });

      it('returns null for mixed format', () => {
        expect(getModifierType('00upper')).toBeNull();
      });
    });
  });

  // ==========================================================================
  // getAvailableTokens Tests
  // ==========================================================================

  describe('getAvailableTokens', () => {
    it('returns all defined tokens', () => {
      const tokens = getAvailableTokens();

      expect(tokens).toBe(AVAILABLE_TOKENS);
      expect(tokens.length).toBeGreaterThan(10);
    });

    it('each token has required properties', () => {
      const tokens = getAvailableTokens();

      for (const token of tokens) {
        expect(token.name).toBeDefined();
        expect(typeof token.name).toBe('string');
        expect(token.description).toBeDefined();
        expect(typeof token.description).toBe('string');
        expect(token.category).toBeDefined();
        expect(['basic', 'date', 'creator', 'content', 'file', 'computed']).toContain(token.category);
        expect(token.example).toBeDefined();
        expect(Array.isArray(token.supportedModifiers)).toBe(true);
      }
    });

    it('includes essential tokens', () => {
      const tokens = getAvailableTokens();
      const names = tokens.map(t => t.name);

      expect(names).toContain('Series');
      expect(names).toContain('Title');
      expect(names).toContain('Number');
      expect(names).toContain('Year');
      expect(names).toContain('Extension');
    });

    it('all token names are in VALID_TOKEN_NAMES', () => {
      const tokens = getAvailableTokens();

      for (const token of tokens) {
        expect(VALID_TOKEN_NAMES.has(token.name)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // getTokensByCategory Tests
  // ==========================================================================

  describe('getTokensByCategory', () => {
    it('returns tokens grouped by category', () => {
      const grouped = getTokensByCategory();

      expect(typeof grouped).toBe('object');
      expect(Object.keys(grouped).length).toBeGreaterThan(0);
    });

    it('includes basic category', () => {
      const grouped = getTokensByCategory();

      expect(grouped['basic']).toBeDefined();
      expect(Array.isArray(grouped['basic'])).toBe(true);
      expect(grouped['basic']!.some(t => t.name === 'Series')).toBe(true);
    });

    it('includes date category', () => {
      const grouped = getTokensByCategory();

      expect(grouped['date']).toBeDefined();
      expect(grouped['date']!.some(t => t.name === 'Year')).toBe(true);
    });

    it('includes file category', () => {
      const grouped = getTokensByCategory();

      expect(grouped['file']).toBeDefined();
      expect(grouped['file']!.some(t => t.name === 'Extension')).toBe(true);
    });

    it('all tokens are accounted for', () => {
      const grouped = getTokensByCategory();
      const allTokens = getAvailableTokens();
      const groupedCount = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);

      expect(groupedCount).toBe(allTokens.length);
    });
  });

  // ==========================================================================
  // buildTemplateString Tests
  // ==========================================================================

  describe('buildTemplateString', () => {
    it('handles template with only literals', () => {
      const parsed = parseTemplate('static.cbz');
      const rebuilt = buildTemplateString(parsed.tokens, parsed.literals);

      expect(rebuilt).toBe('static.cbz');
    });

    it('handles template with only tokens', () => {
      const parsed = parseTemplate('{Series}{Number}');
      const rebuilt = buildTemplateString(parsed.tokens, parsed.literals);

      expect(rebuilt).toBe('{Series}{Number}');
    });

    it('builds string containing all tokens', () => {
      const parsed = parseTemplate('{Series} - {Number}.{Extension}');
      const rebuilt = buildTemplateString(parsed.tokens, parsed.literals);

      // The function concatenates tokens with their associated literals
      expect(rebuilt).toContain('{Series}');
      expect(rebuilt).toContain('{Number}');
      expect(rebuilt).toContain('{Extension}');
    });

    it('preserves token raw strings', () => {
      const parsed = parseTemplate('{Number:000|001}');
      const rebuilt = buildTemplateString(parsed.tokens, parsed.literals);

      expect(rebuilt).toContain('{Number:000|001}');
    });

    it('handles prefix literal correctly', () => {
      const original = 'prefix{Series}';
      const parsed = parseTemplate(original);
      const rebuilt = buildTemplateString(parsed.tokens, parsed.literals);

      expect(rebuilt).toBe(original);
    });
  });

  // ==========================================================================
  // createTokenString Tests
  // ==========================================================================

  describe('createTokenString', () => {
    it('creates token string with name only', () => {
      const result = createTokenString('Series');
      expect(result).toBe('{Series}');
    });

    it('creates token string with modifier', () => {
      const result = createTokenString('Number', '000');
      expect(result).toBe('{Number:000}');
    });

    it('creates token string with fallback', () => {
      const result = createTokenString('Year', undefined, 'Unknown');
      expect(result).toBe('{Year|Unknown}');
    });

    it('creates token string with empty fallback', () => {
      const result = createTokenString('Year', undefined, '');
      expect(result).toBe('{Year|}');
    });

    it('creates token string with modifier and fallback', () => {
      const result = createTokenString('Number', '000', '001');
      expect(result).toBe('{Number:000|001}');
    });

    it('handles case modifier', () => {
      const result = createTokenString('Series', 'upper');
      expect(result).toBe('{Series:upper}');
    });

    it('handles truncate modifier', () => {
      const result = createTokenString('Title', '30');
      expect(result).toBe('{Title:30}');
    });
  });

  // ==========================================================================
  // VALID_TOKEN_NAMES Tests
  // ==========================================================================

  describe('VALID_TOKEN_NAMES', () => {
    it('is a Set', () => {
      expect(VALID_TOKEN_NAMES instanceof Set).toBe(true);
    });

    it('contains expected token names', () => {
      expect(VALID_TOKEN_NAMES.has('Series')).toBe(true);
      expect(VALID_TOKEN_NAMES.has('Number')).toBe(true);
      expect(VALID_TOKEN_NAMES.has('Extension')).toBe(true);
    });

    it('does not contain invalid names', () => {
      expect(VALID_TOKEN_NAMES.has('invalid')).toBe(false);
      expect(VALID_TOKEN_NAMES.has('')).toBe(false);
      expect(VALID_TOKEN_NAMES.has('series')).toBe(false); // Case sensitive
    });
  });
});
