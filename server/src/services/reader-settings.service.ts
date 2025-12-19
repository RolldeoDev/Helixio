/**
 * Reader Settings Service
 *
 * Manages user preferences for the comic reader:
 * - Reading mode (single, double, continuous)
 * - Image scaling
 * - Reading direction
 * - Visual preferences
 */

import { getDatabase } from './database.service.js';

// =============================================================================
// Types
// =============================================================================

export type ReadingMode = 'single' | 'double' | 'doubleManga' | 'continuous';
export type ReadingDirection = 'ltr' | 'rtl' | 'vertical';
export type ImageScaling = 'fitHeight' | 'fitWidth' | 'fitScreen' | 'original' | 'custom';
export type ImageSplitting = 'none' | 'ltr' | 'rtl';
export type BackgroundColor = 'white' | 'gray' | 'black';

export interface ReaderSettings {
  id: string;
  mode: ReadingMode;
  direction: ReadingDirection;
  scaling: ImageScaling;
  customWidth: number | null;
  splitting: ImageSplitting;
  background: BackgroundColor;
  brightness: number;
  showPageShadow: boolean;
  autoHideUI: boolean;
  preloadCount: number;
  updatedAt: Date;
}

export interface UpdateReaderSettingsInput {
  mode?: ReadingMode;
  direction?: ReadingDirection;
  scaling?: ImageScaling;
  customWidth?: number | null;
  splitting?: ImageSplitting;
  background?: BackgroundColor;
  brightness?: number;
  showPageShadow?: boolean;
  autoHideUI?: boolean;
  preloadCount?: number;
}

// =============================================================================
// Default Settings
// =============================================================================

const DEFAULT_SETTINGS: Omit<ReaderSettings, 'id' | 'updatedAt'> = {
  mode: 'single',
  direction: 'ltr',
  scaling: 'fitHeight',
  customWidth: null,
  splitting: 'none',
  background: 'black',
  brightness: 100,
  showPageShadow: true,
  autoHideUI: true,
  preloadCount: 3,
};

// =============================================================================
// Settings CRUD
// =============================================================================

/**
 * Get current reader settings (creates defaults if none exist)
 */
export async function getSettings(): Promise<ReaderSettings> {
  const db = getDatabase();

  let settings = await db.readerSettings.findUnique({
    where: { id: 'default' },
  });

  if (!settings) {
    // Create default settings
    settings = await db.readerSettings.create({
      data: {
        id: 'default',
        ...DEFAULT_SETTINGS,
      },
    });
  }

  return settings as ReaderSettings;
}

/**
 * Update reader settings
 */
export async function updateSettings(
  input: UpdateReaderSettingsInput
): Promise<ReaderSettings> {
  const db = getDatabase();

  // Validate values
  if (input.mode && !['single', 'double', 'doubleManga', 'continuous'].includes(input.mode)) {
    throw new Error(`Invalid mode: ${input.mode}`);
  }
  if (input.direction && !['ltr', 'rtl', 'vertical'].includes(input.direction)) {
    throw new Error(`Invalid direction: ${input.direction}`);
  }
  if (input.scaling && !['fitHeight', 'fitWidth', 'fitScreen', 'original', 'custom'].includes(input.scaling)) {
    throw new Error(`Invalid scaling: ${input.scaling}`);
  }
  if (input.splitting && !['none', 'ltr', 'rtl'].includes(input.splitting)) {
    throw new Error(`Invalid splitting: ${input.splitting}`);
  }
  if (input.background && !['white', 'gray', 'black'].includes(input.background)) {
    throw new Error(`Invalid background: ${input.background}`);
  }
  if (input.brightness !== undefined && (input.brightness < 0 || input.brightness > 200)) {
    throw new Error(`Brightness must be between 0 and 200`);
  }
  if (input.preloadCount !== undefined && (input.preloadCount < 0 || input.preloadCount > 10)) {
    throw new Error(`Preload count must be between 0 and 10`);
  }
  if (input.customWidth !== undefined && input.customWidth !== null && input.customWidth < 100) {
    throw new Error(`Custom width must be at least 100 pixels`);
  }

  const settings = await db.readerSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      ...DEFAULT_SETTINGS,
      ...input,
    },
    update: input,
  });

  return settings as ReaderSettings;
}

/**
 * Reset settings to defaults
 */
export async function resetSettings(): Promise<ReaderSettings> {
  const db = getDatabase();

  const settings = await db.readerSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      ...DEFAULT_SETTINGS,
    },
    update: DEFAULT_SETTINGS,
  });

  return settings as ReaderSettings;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get suggested settings based on library type
 */
export function getSuggestedSettings(libraryType: 'western' | 'manga'): Partial<ReaderSettings> {
  if (libraryType === 'manga') {
    return {
      direction: 'rtl',
      mode: 'single',
    };
  }
  return {
    direction: 'ltr',
    mode: 'single',
  };
}

// =============================================================================
// Settings Hierarchy
// =============================================================================

export interface PartialReaderSettings {
  mode?: ReadingMode | null;
  direction?: ReadingDirection | null;
  scaling?: ImageScaling | null;
  customWidth?: number | null;
  splitting?: ImageSplitting | null;
  background?: BackgroundColor | null;
  brightness?: number | null;
  showPageShadow?: boolean | null;
  autoHideUI?: boolean | null;
  preloadCount?: number | null;
}

/**
 * Get library-level reader settings overrides
 */
export async function getLibrarySettings(libraryId: string): Promise<PartialReaderSettings | null> {
  const db = getDatabase();

  const settings = await db.libraryReaderSettings.findUnique({
    where: { libraryId },
  });

  if (!settings) return null;

  return {
    mode: settings.mode as ReadingMode | null,
    direction: settings.direction as ReadingDirection | null,
    scaling: settings.scaling as ImageScaling | null,
    customWidth: settings.customWidth,
    splitting: settings.splitting as ImageSplitting | null,
    background: settings.background as BackgroundColor | null,
    brightness: settings.brightness,
    showPageShadow: settings.showPageShadow,
    autoHideUI: settings.autoHideUI,
    preloadCount: settings.preloadCount,
  };
}

/**
 * Update library-level reader settings overrides
 */
export async function updateLibrarySettings(
  libraryId: string,
  input: PartialReaderSettings
): Promise<PartialReaderSettings> {
  const db = getDatabase();

  // Verify library exists
  const library = await db.library.findUnique({
    where: { id: libraryId },
  });

  if (!library) {
    throw new Error(`Library not found: ${libraryId}`);
  }

  const settings = await db.libraryReaderSettings.upsert({
    where: { libraryId },
    create: {
      libraryId,
      mode: input.mode,
      direction: input.direction,
      scaling: input.scaling,
      customWidth: input.customWidth,
      splitting: input.splitting,
      background: input.background,
      brightness: input.brightness,
      showPageShadow: input.showPageShadow,
      autoHideUI: input.autoHideUI,
      preloadCount: input.preloadCount,
    },
    update: input,
  });

  return {
    mode: settings.mode as ReadingMode | null,
    direction: settings.direction as ReadingDirection | null,
    scaling: settings.scaling as ImageScaling | null,
    customWidth: settings.customWidth,
    splitting: settings.splitting as ImageSplitting | null,
    background: settings.background as BackgroundColor | null,
    brightness: settings.brightness,
    showPageShadow: settings.showPageShadow,
    autoHideUI: settings.autoHideUI,
    preloadCount: settings.preloadCount,
  };
}

/**
 * Delete library-level settings (revert to global defaults)
 */
export async function deleteLibrarySettings(libraryId: string): Promise<void> {
  const db = getDatabase();

  await db.libraryReaderSettings.delete({
    where: { libraryId },
  }).catch(() => {
    // Ignore if not found
  });
}

/**
 * Get series-level reader settings overrides
 */
export async function getSeriesSettings(series: string): Promise<PartialReaderSettings | null> {
  const db = getDatabase();

  const settings = await db.seriesReaderSettings.findUnique({
    where: { series },
  });

  if (!settings) return null;

  return {
    mode: settings.mode as ReadingMode | null,
    direction: settings.direction as ReadingDirection | null,
    scaling: settings.scaling as ImageScaling | null,
    customWidth: settings.customWidth,
    splitting: settings.splitting as ImageSplitting | null,
    background: settings.background as BackgroundColor | null,
    brightness: settings.brightness,
    showPageShadow: settings.showPageShadow,
    autoHideUI: settings.autoHideUI,
    preloadCount: settings.preloadCount,
  };
}

/**
 * Update series-level reader settings overrides
 */
export async function updateSeriesSettings(
  series: string,
  input: PartialReaderSettings
): Promise<PartialReaderSettings> {
  const db = getDatabase();

  const settings = await db.seriesReaderSettings.upsert({
    where: { series },
    create: {
      series,
      mode: input.mode,
      direction: input.direction,
      scaling: input.scaling,
      customWidth: input.customWidth,
      splitting: input.splitting,
      background: input.background,
      brightness: input.brightness,
      showPageShadow: input.showPageShadow,
      autoHideUI: input.autoHideUI,
      preloadCount: input.preloadCount,
    },
    update: input,
  });

  return {
    mode: settings.mode as ReadingMode | null,
    direction: settings.direction as ReadingDirection | null,
    scaling: settings.scaling as ImageScaling | null,
    customWidth: settings.customWidth,
    splitting: settings.splitting as ImageSplitting | null,
    background: settings.background as BackgroundColor | null,
    brightness: settings.brightness,
    showPageShadow: settings.showPageShadow,
    autoHideUI: settings.autoHideUI,
    preloadCount: settings.preloadCount,
  };
}

/**
 * Delete series-level settings (revert to library/global defaults)
 */
export async function deleteSeriesSettings(series: string): Promise<void> {
  const db = getDatabase();

  await db.seriesReaderSettings.delete({
    where: { series },
  }).catch(() => {
    // Ignore if not found
  });
}

/**
 * Get resolved settings for a specific file
 * Applies hierarchy: Global -> Library -> Series
 */
export async function getResolvedSettings(fileId: string): Promise<ReaderSettings> {
  const db = getDatabase();

  // Get global settings
  const globalSettings = await getSettings();

  // Get file info
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: {
      metadata: {
        select: { series: true },
      },
    },
  });

  if (!file) {
    return globalSettings;
  }

  // Get library settings
  const librarySettings = await getLibrarySettings(file.libraryId);

  // Get series settings (if file has series metadata)
  const seriesName = file.metadata?.series;
  const seriesSettings = seriesName ? await getSeriesSettings(seriesName) : null;

  // Merge settings (later values override earlier)
  const resolved: ReaderSettings = { ...globalSettings };

  // Apply library overrides
  if (librarySettings) {
    if (librarySettings.mode !== null && librarySettings.mode !== undefined) {
      resolved.mode = librarySettings.mode;
    }
    if (librarySettings.direction !== null && librarySettings.direction !== undefined) {
      resolved.direction = librarySettings.direction;
    }
    if (librarySettings.scaling !== null && librarySettings.scaling !== undefined) {
      resolved.scaling = librarySettings.scaling;
    }
    if (librarySettings.customWidth !== undefined) {
      resolved.customWidth = librarySettings.customWidth;
    }
    if (librarySettings.splitting !== null && librarySettings.splitting !== undefined) {
      resolved.splitting = librarySettings.splitting;
    }
    if (librarySettings.background !== null && librarySettings.background !== undefined) {
      resolved.background = librarySettings.background;
    }
    if (librarySettings.brightness !== null && librarySettings.brightness !== undefined) {
      resolved.brightness = librarySettings.brightness;
    }
    if (librarySettings.showPageShadow !== null && librarySettings.showPageShadow !== undefined) {
      resolved.showPageShadow = librarySettings.showPageShadow;
    }
    if (librarySettings.autoHideUI !== null && librarySettings.autoHideUI !== undefined) {
      resolved.autoHideUI = librarySettings.autoHideUI;
    }
    if (librarySettings.preloadCount !== null && librarySettings.preloadCount !== undefined) {
      resolved.preloadCount = librarySettings.preloadCount;
    }
  }

  // Apply series overrides
  if (seriesSettings) {
    if (seriesSettings.mode !== null && seriesSettings.mode !== undefined) {
      resolved.mode = seriesSettings.mode;
    }
    if (seriesSettings.direction !== null && seriesSettings.direction !== undefined) {
      resolved.direction = seriesSettings.direction;
    }
    if (seriesSettings.scaling !== null && seriesSettings.scaling !== undefined) {
      resolved.scaling = seriesSettings.scaling;
    }
    if (seriesSettings.customWidth !== undefined) {
      resolved.customWidth = seriesSettings.customWidth;
    }
    if (seriesSettings.splitting !== null && seriesSettings.splitting !== undefined) {
      resolved.splitting = seriesSettings.splitting;
    }
    if (seriesSettings.background !== null && seriesSettings.background !== undefined) {
      resolved.background = seriesSettings.background;
    }
    if (seriesSettings.brightness !== null && seriesSettings.brightness !== undefined) {
      resolved.brightness = seriesSettings.brightness;
    }
    if (seriesSettings.showPageShadow !== null && seriesSettings.showPageShadow !== undefined) {
      resolved.showPageShadow = seriesSettings.showPageShadow;
    }
    if (seriesSettings.autoHideUI !== null && seriesSettings.autoHideUI !== undefined) {
      resolved.autoHideUI = seriesSettings.autoHideUI;
    }
    if (seriesSettings.preloadCount !== null && seriesSettings.preloadCount !== undefined) {
      resolved.preloadCount = seriesSettings.preloadCount;
    }
  }

  return resolved;
}

/**
 * Get all series that have custom settings
 */
export async function getSeriesWithSettings(): Promise<string[]> {
  const db = getDatabase();

  const settings = await db.seriesReaderSettings.findMany({
    select: { series: true },
    orderBy: { series: 'asc' },
  });

  return settings.map((s) => s.series);
}
