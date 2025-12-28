/**
 * Template Test Fixtures
 *
 * Shared test data and mock factories for template service tests.
 */

import type { ResolverContext, CharacterReplacementRules } from '../template-resolver.service.js';
import type { FilenameTemplate } from '@prisma/client';

// =============================================================================
// Sample Template Strings
// =============================================================================

export const SAMPLE_TEMPLATES = {
  /** Basic template with just series and number */
  basic: '{Series} - {Number}.{Extension}',

  /** Template with fallback value */
  withFallback: '{Series} - {Year|Unknown}.{Extension}',

  /** Template with empty fallback (omit if empty) */
  withEmptyFallback: '{Series} - {Title|} ({Year|}).{Extension}',

  /** Template with modifiers */
  withModifiers: '{Series:upper} - {Number:000}.{Extension}',

  /** Complex template matching default */
  complex: '{Series} - {Type} {Number:000} - {Title} ({Year|}).{Extension}',

  /** Template with multiple modifiers */
  multipleModifiers: '{Series:upper:30} - {Number:00} - {Title:lower}.{Extension}',

  /** Template with folder segments */
  withFolders: '{Publisher}/{Series}/{Series} - {Number}.{Extension}',

  /** Only literals (no tokens) */
  literalsOnly: 'static-filename.cbz',

  /** All tokens */
  allTokens: '{Series} {Title} {Number} {Volume} {Year} {Month} {Publisher} {Writer}.{Extension}',

  /** Invalid - unmatched braces */
  invalidUnmatched: '{Series - {Number}.{Extension}',

  /** Invalid - unknown token */
  invalidUnknownToken: '{Series} - {UnknownToken}.{Extension}',

  /** Empty template */
  empty: '',

  /** Whitespace only */
  whitespaceOnly: '   ',
} as const;

// =============================================================================
// Sample Resolver Contexts
// =============================================================================

export const SAMPLE_CONTEXTS = {
  /** Complete context with all common fields */
  complete: {
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
  },

  /** Minimal context with only required fields */
  minimal: {
    comicInfo: {
      Series: 'Batman',
      Number: '1',
    },
    file: {
      filename: 'batman.cbz',
      extension: '.cbz',
    },
  },

  /** Context with empty/missing values */
  withEmpty: {
    comicInfo: {
      Series: 'Batman',
      Title: '',
      Number: '1',
      Year: undefined,
    },
    file: {
      filename: 'batman.cbz',
      extension: '.cbz',
    },
  },

  /** Context with special characters */
  withSpecialChars: {
    comicInfo: {
      Series: 'Batman: Year One',
      Title: 'Who is Batman?',
      Number: '1',
      Year: 1987,
      Publisher: 'DC Comics | Vertigo',
    },
    file: {
      filename: 'batman.cbz',
      extension: '.cbz',
    },
  },

  /** Context with fractional issue number */
  withFractionalNumber: {
    comicInfo: {
      Series: 'Spider-Man',
      Number: '1.5',
      Year: 2023,
    },
    file: {
      filename: 'spiderman.cbz',
      extension: '.cbz',
    },
  },

  /** Context for TPB/Volume */
  volumeContext: {
    comicInfo: {
      Series: 'Saga',
      Title: 'Volume 1',
      Volume: 1,
      Year: 2012,
      Publisher: 'Image Comics',
      Format: 'TPB',
      PageCount: 160,
    },
    series: {
      name: 'Saga',
      publisher: 'Image Comics',
      startYear: 2012,
    },
    file: {
      filename: 'Saga_v01.cbz',
      extension: '.cbz',
    },
  },

  /** Context with manga/chapter */
  mangaContext: {
    comicInfo: {
      Series: 'One Piece',
      Title: 'Romance Dawn',
      Number: '1',
      Year: 1997,
      Publisher: 'Shueisha',
    },
    fileMetadata: {
      parsedChapter: '1',
      contentType: 'manga',
    },
    file: {
      filename: 'one_piece_ch001.cbz',
      extension: '.cbz',
    },
  },

  /** Context with Unicode characters */
  unicodeContext: {
    comicInfo: {
      Series: 'ワンピース',
      Title: 'ロマンス・ドーン',
      Number: '1',
    },
    file: {
      filename: 'ワンピース_001.cbz',
      extension: '.cbz',
    },
  },
} satisfies Record<string, ResolverContext>;

// =============================================================================
// Sample Character Rules
// =============================================================================

export const SAMPLE_CHAR_RULES = {
  /** Remove all illegal characters */
  removeAll: {
    colon: 'remove',
    pipe: 'remove',
    question: 'remove',
    asterisk: 'remove',
    quotes: 'remove',
    slash: 'remove',
    lt: 'remove',
    gt: 'remove',
  },

  /** Replace all with dashes */
  replaceWithDash: {
    colon: 'dash',
    pipe: 'dash',
    question: 'dash',
    asterisk: 'dash',
    quotes: 'remove',
    slash: 'dash',
    lt: 'dash',
    gt: 'dash',
  },

  /** Replace all with underscores */
  replaceWithUnderscore: {
    colon: 'underscore',
    pipe: 'underscore',
    question: 'underscore',
    asterisk: 'underscore',
    quotes: 'remove',
    slash: 'underscore',
    lt: 'underscore',
    gt: 'underscore',
  },

  /** Replace with spaces */
  replaceWithSpace: {
    colon: 'space',
    pipe: 'space',
    question: 'remove',
    asterisk: 'remove',
    quotes: 'remove',
    slash: 'space',
  },

  /** Empty rules (no replacements) */
  none: {},

  /** Partial rules */
  partial: {
    colon: 'dash',
    question: 'remove',
  },
} satisfies Record<string, CharacterReplacementRules>;

// =============================================================================
// Mock FilenameTemplate Records
// =============================================================================

export function createMockFilenameTemplate(overrides: Partial<FilenameTemplate> = {}): FilenameTemplate {
  return {
    id: 'template-1',
    libraryId: null,
    name: 'Test Template',
    description: 'A test template',
    filePattern: '{Series} - {Number}.{Extension}',
    folderSegments: '[]',
    characterRules: JSON.stringify(SAMPLE_CHAR_RULES.removeAll),
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockGlobalTemplate(overrides: Partial<FilenameTemplate> = {}): FilenameTemplate {
  return createMockFilenameTemplate({
    id: 'global-template-1',
    libraryId: null,
    name: 'Global Template',
    description: 'Global default template',
    filePattern: '{Series} - {Type} {Number:000} - {Title} ({Year|}).{Extension}',
    folderSegments: '[]',
    characterRules: JSON.stringify(SAMPLE_CHAR_RULES.removeAll),
    isActive: true,
    sortOrder: 0,
    ...overrides,
  });
}

export function createMockLibraryTemplate(
  libraryId: string,
  overrides: Partial<FilenameTemplate> = {}
): FilenameTemplate {
  return createMockFilenameTemplate({
    id: `lib-template-${libraryId}`,
    libraryId,
    name: 'Library Template',
    description: 'Library-specific template',
    filePattern: '{Series}/{Series} - {Number}.{Extension}',
    folderSegments: JSON.stringify(['{Publisher}']),
    characterRules: JSON.stringify(SAMPLE_CHAR_RULES.removeAll),
    isActive: true,
    sortOrder: 0,
    ...overrides,
  });
}

// =============================================================================
// Mock OriginalFilename Records
// =============================================================================

export interface MockOriginalFilename {
  id: string;
  fileId: string;
  originalFilename: string;
  originalPath: string;
  renameHistory: string;
  firstRenamedAt: Date;
  lastRenamedAt: Date;
}

export function createMockOriginalFilename(overrides: Partial<MockOriginalFilename> = {}): MockOriginalFilename {
  return {
    id: 'orig-1',
    fileId: 'file-1',
    originalFilename: 'original_file.cbz',
    originalPath: '/comics/original_file.cbz',
    renameHistory: '[]',
    firstRenamedAt: new Date('2024-01-01'),
    lastRenamedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockOriginalFilenameWithHistory(
  fileId: string,
  history: Array<{ timestamp: string; oldPath: string; newPath: string }>
): MockOriginalFilename {
  return createMockOriginalFilename({
    fileId,
    renameHistory: JSON.stringify(history),
    lastRenamedAt: history.length > 0
      ? new Date(history[history.length - 1]!.timestamp)
      : new Date('2024-01-01'),
  });
}

// =============================================================================
// Expected Results
// =============================================================================

/**
 * Expected results for template parsing tests.
 */
export const EXPECTED_PARSE_RESULTS = {
  basic: {
    tokenCount: 3,
    tokenNames: ['Series', 'Number', 'Extension'],
    literalCount: 3,
    isValid: true,
  },
  withFallback: {
    tokenCount: 3,
    tokenNames: ['Series', 'Year', 'Extension'],
    hasFallback: true,
    fallbackValue: 'Unknown',
  },
  withModifiers: {
    tokenCount: 3,
    modifiers: ['upper', '000', undefined],
  },
  complex: {
    tokenCount: 5,
    tokenNames: ['Series', 'Type', 'Number', 'Title', 'Year', 'Extension'],
  },
};

/**
 * Expected results for template resolution tests.
 */
export const EXPECTED_RESOLVE_RESULTS = {
  basic: {
    complete: 'Batman - 1.cbz',
    minimal: 'Batman - 1.cbz',
  },
  withFallback: {
    complete: 'Batman - 2011.cbz',
    withEmpty: 'Batman - Unknown.cbz',
  },
  withModifiers: {
    complete: 'BATMAN - 001.cbz',
  },
  complex: {
    complete: 'Batman - Issue 001 - Court of Owls (2011).cbz',
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a context with specific overrides for testing edge cases.
 */
export function createTestContext(base: keyof typeof SAMPLE_CONTEXTS, overrides: Partial<ResolverContext> = {}): ResolverContext {
  const baseContext = SAMPLE_CONTEXTS[base];
  return {
    ...baseContext,
    comicInfo: {
      ...baseContext.comicInfo,
      ...overrides.comicInfo,
    },
    series: overrides.series !== undefined
      ? overrides.series
      : ('series' in baseContext ? baseContext.series : undefined),
    fileMetadata: overrides.fileMetadata !== undefined
      ? overrides.fileMetadata
      : ('fileMetadata' in baseContext ? baseContext.fileMetadata : undefined),
    file: {
      ...baseContext.file,
      ...overrides.file,
    },
  };
}

/**
 * Generate a long string for testing truncation.
 */
export function generateLongString(length: number, char = 'a'): string {
  return char.repeat(length);
}

/**
 * Generate a template with many tokens for stress testing.
 */
export function generateLargeTemplate(tokenCount: number): string {
  const tokens = [
    '{Series}', '{Title}', '{Number}', '{Volume}', '{Year}',
    '{Month}', '{Publisher}', '{Writer}', '{Format}', '{Type}',
  ];

  const parts: string[] = [];
  for (let i = 0; i < tokenCount; i++) {
    parts.push(tokens[i % tokens.length]!);
  }
  parts.push('.{Extension}');

  return parts.join(' - ');
}
