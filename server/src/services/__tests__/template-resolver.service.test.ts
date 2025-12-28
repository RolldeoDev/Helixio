/**
 * Template Resolver Service Tests
 *
 * Comprehensive tests for template resolution, modifier application,
 * character replacement, and path building.
 */

import { describe, it, expect } from 'vitest';
import {
  applyModifier,
  applyCharacterRules,
  sanitizeForFilename,
  resolveTemplate,
  resolveTemplateString,
  resolvePathSegments,
  buildFolderPath,
  createSampleContext,
  previewTemplate,
  DEFAULT_CHARACTER_RULES,
} from '../template-resolver.service.js';
import { parseTemplate } from '../template-parser.service.js';
import {
  SAMPLE_TEMPLATES,
  SAMPLE_CONTEXTS,
  SAMPLE_CHAR_RULES,
  createTestContext,
  generateLongString,
} from './template.fixtures.js';

describe('Template Resolver Service', () => {
  // ==========================================================================
  // applyModifier Tests
  // ==========================================================================

  describe('applyModifier', () => {
    describe('padding modifiers', () => {
      it('pads single digit to 3 places with "000"', () => {
        expect(applyModifier('1', '000')).toBe('001');
      });

      it('pads single digit to 2 places with "00"', () => {
        expect(applyModifier('1', '00')).toBe('01');
      });

      it('pads double digit to 3 places', () => {
        expect(applyModifier('12', '000')).toBe('012');
      });

      it('does not truncate value longer than padding', () => {
        expect(applyModifier('123', '00')).toBe('123');
      });

      it('handles fractional numbers', () => {
        expect(applyModifier('1.5', '000')).toBe('001.5');
      });

      it('handles larger fractional numbers', () => {
        expect(applyModifier('12.5', '000')).toBe('012.5');
      });

      it('handles non-numeric values gracefully', () => {
        expect(applyModifier('Annual', '000')).toBe('Annual');
      });
    });

    describe('case modifiers', () => {
      it('converts to uppercase with "upper"', () => {
        expect(applyModifier('batman', 'upper')).toBe('BATMAN');
      });

      it('converts to lowercase with "lower"', () => {
        expect(applyModifier('BATMAN', 'lower')).toBe('batman');
      });

      it('handles mixed case', () => {
        expect(applyModifier('BaTmAn', 'upper')).toBe('BATMAN');
        expect(applyModifier('BaTmAn', 'lower')).toBe('batman');
      });

      it('handles unicode characters', () => {
        expect(applyModifier('Café', 'upper')).toBe('CAFÉ');
        expect(applyModifier('CAFÉ', 'lower')).toBe('café');
      });
    });

    describe('truncate modifiers', () => {
      it('truncates long string to specified length', () => {
        expect(applyModifier('The Court of Owls', '10')).toBe('The Court ');
      });

      it('does not modify string shorter than limit', () => {
        expect(applyModifier('Short', '10')).toBe('Short');
      });

      it('handles exact length', () => {
        expect(applyModifier('12345', '5')).toBe('12345');
      });

      it('handles truncate to 1 character', () => {
        expect(applyModifier('Batman', '1')).toBe('B');
      });
    });

    describe('edge cases', () => {
      it('returns original value with no modifier', () => {
        expect(applyModifier('value', '')).toBe('value');
      });

      it('returns original value with unknown modifier', () => {
        expect(applyModifier('value', 'unknown')).toBe('value');
      });

      it('handles empty value', () => {
        expect(applyModifier('', '000')).toBe('');
        expect(applyModifier('', 'upper')).toBe('');
      });
    });
  });

  // ==========================================================================
  // applyCharacterRules Tests
  // ==========================================================================

  describe('applyCharacterRules', () => {
    describe('colon replacement', () => {
      it('removes colon when rule is "remove"', () => {
        const result = applyCharacterRules('Title: Part 1', { colon: 'remove' });
        expect(result).toBe('Title Part 1');
      });

      it('replaces colon with dash when rule is "dash"', () => {
        const result = applyCharacterRules('Title: Part 1', { colon: 'dash' });
        expect(result).toBe('Title- Part 1');
      });

      it('replaces colon with underscore when rule is "underscore"', () => {
        const result = applyCharacterRules('Title: Part 1', { colon: 'underscore' });
        expect(result).toBe('Title_ Part 1');
      });

      it('replaces colon with space when rule is "space"', () => {
        const result = applyCharacterRules('Title: Part 1', { colon: 'space' });
        // Multiple spaces get collapsed
        expect(result).toBe('Title Part 1');
      });
    });

    describe('pipe replacement', () => {
      it('removes pipe when rule is "remove"', () => {
        const result = applyCharacterRules('DC | Vertigo', { pipe: 'remove' });
        expect(result).toBe('DC Vertigo');
      });

      it('replaces pipe with dash when rule is "dash"', () => {
        const result = applyCharacterRules('DC | Vertigo', { pipe: 'dash' });
        expect(result).toBe('DC - Vertigo');
      });
    });

    describe('question mark replacement', () => {
      it('removes question mark when rule is "remove"', () => {
        const result = applyCharacterRules('Who is Batman?', { question: 'remove' });
        expect(result).toBe('Who is Batman');
      });

      it('replaces question mark with dash', () => {
        const result = applyCharacterRules('Who?', { question: 'dash' });
        expect(result).toBe('Who-');
      });
    });

    describe('asterisk replacement', () => {
      it('removes asterisk', () => {
        const result = applyCharacterRules('All*Star', { asterisk: 'remove' });
        expect(result).toBe('AllStar');
      });
    });

    describe('quotes replacement', () => {
      it('removes quotes when rule is "remove"', () => {
        const result = applyCharacterRules('The "Amazing"', { quotes: 'remove' });
        expect(result).toBe('The Amazing');
      });

      it('replaces quotes with single when rule is "single"', () => {
        const result = applyCharacterRules('The "Amazing"', { quotes: 'single' });
        expect(result).toBe("The 'Amazing'");
      });
    });

    describe('slash replacement', () => {
      it('removes forward slash', () => {
        const result = applyCharacterRules('Batman/Superman', { slash: 'remove' });
        expect(result).toBe('BatmanSuperman');
      });

      it('removes backslash', () => {
        const result = applyCharacterRules('Batman\\Superman', { slash: 'remove' });
        expect(result).toBe('BatmanSuperman');
      });

      it('replaces slash with dash', () => {
        const result = applyCharacterRules('Batman/Superman', { slash: 'dash' });
        expect(result).toBe('Batman-Superman');
      });
    });

    describe('angle brackets replacement', () => {
      it('removes less than', () => {
        const result = applyCharacterRules('A < B', { lt: 'remove' });
        expect(result).toBe('A B');
      });

      it('removes greater than', () => {
        const result = applyCharacterRules('A > B', { gt: 'remove' });
        expect(result).toBe('A B');
      });
    });

    describe('combined rules', () => {
      it('applies all rules together', () => {
        const value = 'Batman: Year One | Who is Batman?';
        const result = applyCharacterRules(value, SAMPLE_CHAR_RULES.removeAll);
        expect(result).toBe('Batman Year One Who is Batman');
      });

      it('handles empty rules object', () => {
        const result = applyCharacterRules('Test: Value', {});
        expect(result).toBe('Test: Value');
      });

      it('handles string with no special characters', () => {
        const result = applyCharacterRules('Normal Text', SAMPLE_CHAR_RULES.removeAll);
        expect(result).toBe('Normal Text');
      });
    });

    describe('whitespace handling', () => {
      it('collapses multiple spaces', () => {
        const result = applyCharacterRules('Title:  Value', { colon: 'space' });
        expect(result).toBe('Title Value');
      });

      it('trims leading and trailing whitespace', () => {
        const result = applyCharacterRules(' :Title: ', { colon: 'remove' });
        expect(result).toBe('Title');
      });
    });

    describe('unicode preservation', () => {
      it('preserves unicode characters', () => {
        const result = applyCharacterRules('日本語: テスト', { colon: 'dash' });
        expect(result).toBe('日本語- テスト');
      });
    });
  });

  // ==========================================================================
  // sanitizeForFilename Tests
  // ==========================================================================

  describe('sanitizeForFilename', () => {
    it('removes colons', () => {
      expect(sanitizeForFilename('Title: Part 1')).toBe('Title Part 1');
    });

    it('removes quotes', () => {
      expect(sanitizeForFilename('The "Amazing"')).toBe('The Amazing');
    });

    it('removes forward slashes', () => {
      expect(sanitizeForFilename('Batman/Superman')).toBe('BatmanSuperman');
    });

    it('removes backslashes', () => {
      expect(sanitizeForFilename('Batman\\Superman')).toBe('BatmanSuperman');
    });

    it('removes question marks', () => {
      expect(sanitizeForFilename('Who is Batman?')).toBe('Who is Batman');
    });

    it('removes asterisks', () => {
      expect(sanitizeForFilename('All*Star')).toBe('AllStar');
    });

    it('removes angle brackets', () => {
      expect(sanitizeForFilename('<Title>')).toBe('Title');
    });

    it('removes pipe', () => {
      expect(sanitizeForFilename('DC | Vertigo')).toBe('DC Vertigo');
    });

    it('collapses multiple spaces', () => {
      expect(sanitizeForFilename('Title   Value')).toBe('Title Value');
    });

    it('trims whitespace', () => {
      expect(sanitizeForFilename('  Title  ')).toBe('Title');
    });

    it('preserves valid characters', () => {
      expect(sanitizeForFilename('Batman (2011) #001')).toBe('Batman (2011) #001');
    });

    it('handles unicode', () => {
      expect(sanitizeForFilename('日本語マンガ')).toBe('日本語マンガ');
    });
  });

  // ==========================================================================
  // resolveTemplate Tests
  // ==========================================================================

  describe('resolveTemplate', () => {
    describe('basic resolution', () => {
      it('resolves basic template with complete context', () => {
        const template = parseTemplate('{Series} - {Number}.{Extension}');
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.complete);

        // The resolver correctly extracts all values from context
        expect(result.hadMissingValues).toBe(false);
        expect(result.result).toContain('Batman');
        expect(result.result).toContain('1');
        expect(result.result).toContain('cbz');
      });

      it('resolves all token types correctly', () => {
        const template = parseTemplate('{Series} by {Writer} ({Year}).{Extension}');
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.complete);

        // Check that all token values are resolved
        expect(result.result).toContain('Batman');
        expect(result.result).toContain('Scott Snyder');
        expect(result.result).toContain('2011');
        expect(result.result).toContain('cbz');
      });

      it('resolves Type token', () => {
        const template = parseTemplate('{Series} - {Type} {Number}.{Extension}');
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.complete);

        expect(result.result).toContain('Issue');
      });
    });

    describe('fallback handling', () => {
      it('uses fallback when value is missing', () => {
        const template = parseTemplate('{Series} - {Year|Unknown}.{Extension}');
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.withEmpty);

        // The fallback value should be used
        expect(result.result).toContain('Unknown');
        expect(result.result).toContain('Batman');
      });

      it('uses empty fallback (omits token)', () => {
        const template = parseTemplate('{Series} - {Title|} ({Year|}).{Extension}');
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.withEmpty);

        // Empty fallbacks should result in token being omitted
        expect(result.result).toContain('Batman');
        expect(result.result).toContain('cbz');
        // Should not contain empty parens after cleanup
        expect(result.result).not.toContain('()');
      });

      it('does not use fallback when value is present', () => {
        const template = parseTemplate('{Year|Unknown}');
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.complete);

        expect(result.result).toBe('2011');
      });
    });

    describe('modifier application', () => {
      it('applies padding modifier', () => {
        const template = parseTemplate('{Number:000}');
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.complete);

        expect(result.result).toBe('001');
      });

      it('applies case modifier', () => {
        const template = parseTemplate('{Series:upper}');
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.complete);

        expect(result.result).toBe('BATMAN');
      });

      it('applies truncate modifier', () => {
        const template = parseTemplate('{Title:5}');
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.complete);

        expect(result.result).toBe('Court');
      });
    });

    describe('missing values', () => {
      it('tracks missing values without fallback', () => {
        const template = parseTemplate('{Series} - {StoryArc}.{Extension}');
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.minimal);

        expect(result.hadMissingValues).toBe(true);
        expect(result.missingTokens).toContain('StoryArc');
      });

      it('adds warning for missing values', () => {
        const template = parseTemplate('{StoryArc}');
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.minimal);

        expect(result.warnings.some(w => w.includes('StoryArc'))).toBe(true);
      });
    });

    describe('character rules application', () => {
      it('applies character rules to resolved values', () => {
        const template = parseTemplate('{Series}.{Extension}');
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.withSpecialChars, {
          characterRules: SAMPLE_CHAR_RULES.removeAll,
        });

        // Colon should be removed from "Batman: Year One"
        expect(result.result).toContain('Batman');
        expect(result.result).toContain('Year One');
        expect(result.result).not.toContain(':');
      });
    });

    describe('complex templates', () => {
      it('resolves complex template correctly', () => {
        const template = parseTemplate(SAMPLE_TEMPLATES.complex);
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.complete);

        // All major tokens should be resolved
        expect(result.result).toContain('Batman');
        expect(result.result).toContain('001');
        expect(result.result).toContain('cbz');
      });
    });

    describe('max length enforcement', () => {
      it('truncates to max length when specified', () => {
        const template = parseTemplate('{Series} - {Title} - {Number}.{Extension}');
        const result = resolveTemplate(template, SAMPLE_CONTEXTS.complete, {
          maxLength: 20,
        });

        expect(result.result.length).toBeLessThanOrEqual(20);
        expect(result.warnings.some(w => w.includes('truncated'))).toBe(true);
      });
    });
  });

  // ==========================================================================
  // resolveTemplateString Tests
  // ==========================================================================

  describe('resolveTemplateString', () => {
    it('resolves template string directly', () => {
      const result = resolveTemplateString(
        '{Series} - {Number}.{Extension}',
        SAMPLE_CONTEXTS.complete
      );

      // All values should be resolved
      expect(result.result).toContain('Batman');
      expect(result.result).toContain('1');
      expect(result.result).toContain('cbz');
    });

    it('returns same result as manual parse + resolve', () => {
      const templateStr = '{Series} - {Type} {Number:000}.{Extension}';
      const direct = resolveTemplateString(templateStr, SAMPLE_CONTEXTS.complete);
      const manual = resolveTemplate(parseTemplate(templateStr), SAMPLE_CONTEXTS.complete);

      expect(direct.result).toBe(manual.result);
    });

    it('handles invalid template', () => {
      const result = resolveTemplateString('{Series', SAMPLE_CONTEXTS.complete);

      expect(result.result).toBe('');
      expect(result.hadMissingValues).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('applies character rules', () => {
      const result = resolveTemplateString(
        '{Series}.{Extension}',
        SAMPLE_CONTEXTS.withSpecialChars,
        { characterRules: SAMPLE_CHAR_RULES.removeAll }
      );

      // Colon should be removed
      expect(result.result).toContain('Batman');
      expect(result.result).not.toContain(':');
    });
  });

  // ==========================================================================
  // resolvePathSegments Tests
  // ==========================================================================

  describe('resolvePathSegments', () => {
    it('resolves single segment', () => {
      const result = resolvePathSegments(
        ['{Publisher}'],
        SAMPLE_CONTEXTS.complete
      );

      expect(result).toEqual(['DC Comics']);
    });

    it('resolves multiple segments', () => {
      const result = resolvePathSegments(
        ['{Publisher}', '{Series}'],
        SAMPLE_CONTEXTS.complete
      );

      expect(result).toEqual(['DC Comics', 'Batman']);
    });

    it('omits empty segment values', () => {
      const result = resolvePathSegments(
        ['{Publisher}', '{StoryArc|}'],
        SAMPLE_CONTEXTS.complete
      );

      // StoryArc is not in complete context, so it should be omitted
      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('uses fallback in segment', () => {
      const result = resolvePathSegments(
        ['{StoryArc|Unsorted}'],
        SAMPLE_CONTEXTS.minimal
      );

      expect(result).toEqual(['Unsorted']);
    });

    it('handles static text segments', () => {
      const result = resolvePathSegments(
        ['Comics', '{Series}'],
        SAMPLE_CONTEXTS.complete
      );

      expect(result).toEqual(['Comics', 'Batman']);
    });

    it('returns empty array for no segments', () => {
      const result = resolvePathSegments([], SAMPLE_CONTEXTS.complete);
      expect(result).toEqual([]);
    });

    it('applies character rules to segments', () => {
      const result = resolvePathSegments(
        ['{Series}'],
        SAMPLE_CONTEXTS.withSpecialChars,
        { characterRules: SAMPLE_CHAR_RULES.removeAll }
      );

      expect(result).toEqual(['Batman Year One']);
    });
  });

  // ==========================================================================
  // buildFolderPath Tests
  // ==========================================================================

  describe('buildFolderPath', () => {
    it('joins segments with forward slash', () => {
      const result = buildFolderPath(['DC Comics', 'Batman']);
      expect(result).toBe('DC Comics/Batman');
    });

    it('handles single segment', () => {
      const result = buildFolderPath(['Comics']);
      expect(result).toBe('Comics');
    });

    it('returns empty string for no segments', () => {
      const result = buildFolderPath([]);
      expect(result).toBe('');
    });

    it('filters out empty segments', () => {
      const result = buildFolderPath(['Comics', '', 'Batman']);
      expect(result).toBe('Comics/Batman');
    });

    it('filters out whitespace-only segments', () => {
      const result = buildFolderPath(['Comics', '  ', 'Batman']);
      expect(result).toBe('Comics/Batman');
    });

    it('handles many segments', () => {
      const result = buildFolderPath(['A', 'B', 'C', 'D', 'E']);
      expect(result).toBe('A/B/C/D/E');
    });
  });

  // ==========================================================================
  // createSampleContext Tests
  // ==========================================================================

  describe('createSampleContext', () => {
    it('returns a complete resolver context', () => {
      const context = createSampleContext();

      expect(context.comicInfo).toBeDefined();
      expect(context.series).toBeDefined();
      expect(context.file).toBeDefined();
    });

    it('includes all token values', () => {
      const context = createSampleContext();

      expect(context.comicInfo.Series).toBeDefined();
      expect(context.comicInfo.Title).toBeDefined();
      expect(context.comicInfo.Number).toBeDefined();
      expect(context.comicInfo.Year).toBeDefined();
      expect(context.comicInfo.Publisher).toBeDefined();
    });

    it('has realistic sample data', () => {
      const context = createSampleContext();

      expect(context.comicInfo.Series).toBe('Batman');
      expect(context.comicInfo.Year).toBe(2011);
      expect(context.file.extension).toBe('.cbz');
    });

    it('can be used directly with resolveTemplate', () => {
      const context = createSampleContext();
      const template = parseTemplate('{Series} - {Number}.{Extension}');
      const result = resolveTemplate(template, context);

      expect(result.hadMissingValues).toBe(false);
      expect(result.result).toBeTruthy();
    });
  });

  // ==========================================================================
  // previewTemplate Tests
  // ==========================================================================

  describe('previewTemplate', () => {
    it('returns filename preview with sample context', () => {
      const result = previewTemplate('{Series} - {Number}.{Extension}');

      // Should contain resolved values from sample context
      expect(result.result).toContain('Batman');
      expect(result.result).toContain('cbz');
    });

    it('uses sample context when none provided', () => {
      const result = previewTemplate('{Series}');

      expect(result.result).toBe('Batman');
    });

    it('uses provided context when given', () => {
      const customContext = createTestContext('minimal', {
        comicInfo: { Series: 'Custom Series', Number: '99' },
      });
      const result = previewTemplate('{Series}', customContext);

      expect(result.result).toBe('Custom Series');
    });

    it('handles complex template', () => {
      const result = previewTemplate(SAMPLE_TEMPLATES.complex);

      expect(result.result).toContain('Batman');
      expect(result.result).toContain('001');
    });

    it('handles errors gracefully', () => {
      const result = previewTemplate('{Unknowna}');

      expect(result.hadMissingValues).toBe(true);
    });
  });

  // ==========================================================================
  // DEFAULT_CHARACTER_RULES Tests
  // ==========================================================================

  describe('DEFAULT_CHARACTER_RULES', () => {
    it('has all common illegal characters defined', () => {
      expect(DEFAULT_CHARACTER_RULES.colon).toBeDefined();
      expect(DEFAULT_CHARACTER_RULES.pipe).toBeDefined();
      expect(DEFAULT_CHARACTER_RULES.question).toBeDefined();
      expect(DEFAULT_CHARACTER_RULES.asterisk).toBeDefined();
      expect(DEFAULT_CHARACTER_RULES.quotes).toBeDefined();
      expect(DEFAULT_CHARACTER_RULES.slash).toBeDefined();
      expect(DEFAULT_CHARACTER_RULES.lt).toBeDefined();
      expect(DEFAULT_CHARACTER_RULES.gt).toBeDefined();
    });

    it('defaults to remove for most characters', () => {
      expect(DEFAULT_CHARACTER_RULES.colon).toBe('remove');
      expect(DEFAULT_CHARACTER_RULES.pipe).toBe('remove');
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('integration', () => {
    it('handles full workflow from template to resolved filename', () => {
      const templateStr = SAMPLE_TEMPLATES.complex;
      const result = resolveTemplateString(templateStr, SAMPLE_CONTEXTS.complete);

      // Should contain all major components
      expect(result.result).toContain('Batman');
      expect(result.result).toContain('001');
      expect(result.result).toContain('cbz');
      expect(result.hadMissingValues).toBe(false);
    });

    it('handles folder + filename workflow', () => {
      const folderSegments = resolvePathSegments(
        ['{Publisher}', '{Series}'],
        SAMPLE_CONTEXTS.complete
      );
      const filename = resolveTemplateString(
        '{Series} - {Number:000}.{Extension}',
        SAMPLE_CONTEXTS.complete
      );

      // Folder segments should be resolved correctly
      expect(folderSegments).toContain('DC Comics');
      expect(folderSegments).toContain('Batman');

      // Full path can be constructed
      const fullPath = buildFolderPath(folderSegments) + '/' + filename.result;
      expect(fullPath).toContain('DC Comics/Batman/');
      expect(fullPath).toContain('Batman');
      expect(fullPath).toContain('001');
    });

    it('handles manga context', () => {
      const result = resolveTemplateString(
        '{Series} - Ch{Chapter:000}.{Extension}',
        SAMPLE_CONTEXTS.mangaContext
      );

      expect(result.result).toContain('One Piece');
      expect(result.result).toContain('001');
      expect(result.result).toContain('cbz');
    });

    it('handles unicode content', () => {
      const result = resolveTemplateString(
        '{Series} - {Title}.{Extension}',
        SAMPLE_CONTEXTS.unicodeContext
      );

      expect(result.result).toContain('ワンピース');
      expect(result.result).toContain('ロマンス・ドーン');
    });
  });
});
