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

export type ColorCorrection = 'none' | 'sepia-correct' | 'contrast-boost' | 'desaturate' | 'invert';

export interface ReaderSettings {
  id: string;
  mode: ReadingMode;
  direction: ReadingDirection;
  scaling: ImageScaling;
  customWidth: number | null;
  splitting: ImageSplitting;
  background: BackgroundColor;
  brightness: number;
  colorCorrection: ColorCorrection;
  showPageShadow: boolean;
  autoHideUI: boolean;
  preloadCount: number;
  webtoonGap: number;
  webtoonMaxWidth: number;
  usePhysicalNavigation: boolean | null; // null = auto (RTL uses logical), true = always physical, false = always logical
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
  colorCorrection?: ColorCorrection;
  showPageShadow?: boolean;
  autoHideUI?: boolean;
  preloadCount?: number;
  webtoonGap?: number;
  webtoonMaxWidth?: number;
  usePhysicalNavigation?: boolean | null;
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
  colorCorrection: 'none',
  showPageShadow: true,
  autoHideUI: true,
  preloadCount: 3,
  webtoonGap: 8,
  webtoonMaxWidth: 800,
  usePhysicalNavigation: null,
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
  colorCorrection?: ColorCorrection | null;
  showPageShadow?: boolean | null;
  autoHideUI?: boolean | null;
  preloadCount?: number | null;
  webtoonGap?: number | null;
  webtoonMaxWidth?: number | null;
  usePhysicalNavigation?: boolean | null;
  basedOnPresetId?: string | null;
  basedOnPresetName?: string | null;
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
    colorCorrection: settings.colorCorrection as ColorCorrection | null,
    showPageShadow: settings.showPageShadow,
    autoHideUI: settings.autoHideUI,
    preloadCount: settings.preloadCount,
    webtoonGap: settings.webtoonGap,
    webtoonMaxWidth: settings.webtoonMaxWidth,
    usePhysicalNavigation: settings.usePhysicalNavigation,
    basedOnPresetId: settings.basedOnPresetId,
    basedOnPresetName: settings.basedOnPresetName,
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
      colorCorrection: input.colorCorrection,
      showPageShadow: input.showPageShadow,
      autoHideUI: input.autoHideUI,
      preloadCount: input.preloadCount,
      webtoonGap: input.webtoonGap,
      webtoonMaxWidth: input.webtoonMaxWidth,
      usePhysicalNavigation: input.usePhysicalNavigation,
      basedOnPresetId: input.basedOnPresetId,
      basedOnPresetName: input.basedOnPresetName,
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
    colorCorrection: settings.colorCorrection as ColorCorrection | null,
    showPageShadow: settings.showPageShadow,
    autoHideUI: settings.autoHideUI,
    preloadCount: settings.preloadCount,
    webtoonGap: settings.webtoonGap,
    webtoonMaxWidth: settings.webtoonMaxWidth,
    usePhysicalNavigation: settings.usePhysicalNavigation,
    basedOnPresetId: settings.basedOnPresetId,
    basedOnPresetName: settings.basedOnPresetName,
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
 * Get series-level reader settings overrides (by series ID)
 */
export async function getSeriesSettingsById(seriesId: string): Promise<PartialReaderSettings | null> {
  const db = getDatabase();

  const settings = await db.seriesReaderSettingsNew.findUnique({
    where: { seriesId },
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
    colorCorrection: settings.colorCorrection as ColorCorrection | null,
    showPageShadow: settings.showPageShadow,
    autoHideUI: settings.autoHideUI,
    preloadCount: settings.preloadCount,
    webtoonGap: settings.webtoonGap,
    webtoonMaxWidth: settings.webtoonMaxWidth,
    usePhysicalNavigation: settings.usePhysicalNavigation,
    basedOnPresetId: settings.basedOnPresetId,
    basedOnPresetName: settings.basedOnPresetName,
  };
}

/**
 * Get series-level reader settings overrides (legacy - by series name)
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
    colorCorrection: settings.colorCorrection as ColorCorrection | null,
    showPageShadow: settings.showPageShadow,
    autoHideUI: settings.autoHideUI,
    preloadCount: settings.preloadCount,
  };
}

/**
 * Update series-level reader settings overrides (by series ID)
 */
export async function updateSeriesSettingsById(
  seriesId: string,
  input: PartialReaderSettings
): Promise<PartialReaderSettings> {
  const db = getDatabase();

  // Verify series exists
  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }

  const settings = await db.seriesReaderSettingsNew.upsert({
    where: { seriesId },
    create: {
      seriesId,
      mode: input.mode,
      direction: input.direction,
      scaling: input.scaling,
      customWidth: input.customWidth,
      splitting: input.splitting,
      background: input.background,
      brightness: input.brightness,
      colorCorrection: input.colorCorrection,
      showPageShadow: input.showPageShadow,
      autoHideUI: input.autoHideUI,
      preloadCount: input.preloadCount,
      webtoonGap: input.webtoonGap,
      webtoonMaxWidth: input.webtoonMaxWidth,
      usePhysicalNavigation: input.usePhysicalNavigation,
      basedOnPresetId: input.basedOnPresetId,
      basedOnPresetName: input.basedOnPresetName,
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
    colorCorrection: settings.colorCorrection as ColorCorrection | null,
    showPageShadow: settings.showPageShadow,
    autoHideUI: settings.autoHideUI,
    preloadCount: settings.preloadCount,
    webtoonGap: settings.webtoonGap,
    webtoonMaxWidth: settings.webtoonMaxWidth,
    usePhysicalNavigation: settings.usePhysicalNavigation,
    basedOnPresetId: settings.basedOnPresetId,
    basedOnPresetName: settings.basedOnPresetName,
  };
}

/**
 * Update series-level reader settings overrides (legacy - by series name)
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
      colorCorrection: input.colorCorrection,
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
    colorCorrection: settings.colorCorrection as ColorCorrection | null,
    showPageShadow: settings.showPageShadow,
    autoHideUI: settings.autoHideUI,
    preloadCount: settings.preloadCount,
  };
}

/**
 * Delete series-level settings by ID (revert to library/global defaults)
 */
export async function deleteSeriesSettingsById(seriesId: string): Promise<void> {
  const db = getDatabase();

  await db.seriesReaderSettingsNew.delete({
    where: { seriesId },
  }).catch(() => {
    // Ignore if not found
  });
}

/**
 * Delete series-level settings (legacy - by series name)
 */
export async function deleteSeriesSettings(series: string): Promise<void> {
  const db = getDatabase();

  await db.seriesReaderSettings.delete({
    where: { series },
  }).catch(() => {
    // Ignore if not found
  });
}

// =============================================================================
// Issue-Level Reader Settings
// =============================================================================

/**
 * Get issue-level reader settings overrides
 */
export async function getIssueSettings(fileId: string): Promise<PartialReaderSettings | null> {
  const db = getDatabase();

  const settings = await db.issueReaderSettings.findUnique({
    where: { fileId },
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
    colorCorrection: settings.colorCorrection as ColorCorrection | null,
    showPageShadow: settings.showPageShadow,
    autoHideUI: settings.autoHideUI,
    preloadCount: settings.preloadCount,
    webtoonGap: settings.webtoonGap,
    webtoonMaxWidth: settings.webtoonMaxWidth,
    usePhysicalNavigation: settings.usePhysicalNavigation,
    basedOnPresetId: settings.basedOnPresetId,
    basedOnPresetName: settings.basedOnPresetName,
  };
}

/**
 * Update issue-level reader settings overrides
 */
export async function updateIssueSettings(
  fileId: string,
  input: PartialReaderSettings
): Promise<PartialReaderSettings> {
  const db = getDatabase();

  // Verify file exists
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }

  const settings = await db.issueReaderSettings.upsert({
    where: { fileId },
    create: {
      fileId,
      mode: input.mode,
      direction: input.direction,
      scaling: input.scaling,
      customWidth: input.customWidth,
      splitting: input.splitting,
      background: input.background,
      brightness: input.brightness,
      colorCorrection: input.colorCorrection,
      showPageShadow: input.showPageShadow,
      autoHideUI: input.autoHideUI,
      preloadCount: input.preloadCount,
      webtoonGap: input.webtoonGap,
      webtoonMaxWidth: input.webtoonMaxWidth,
      usePhysicalNavigation: input.usePhysicalNavigation,
      basedOnPresetId: input.basedOnPresetId,
      basedOnPresetName: input.basedOnPresetName,
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
    colorCorrection: settings.colorCorrection as ColorCorrection | null,
    showPageShadow: settings.showPageShadow,
    autoHideUI: settings.autoHideUI,
    preloadCount: settings.preloadCount,
    webtoonGap: settings.webtoonGap,
    webtoonMaxWidth: settings.webtoonMaxWidth,
    usePhysicalNavigation: settings.usePhysicalNavigation,
    basedOnPresetId: settings.basedOnPresetId,
    basedOnPresetName: settings.basedOnPresetName,
  };
}

/**
 * Delete issue-level settings (revert to series/library/global defaults)
 */
export async function deleteIssueSettings(fileId: string): Promise<void> {
  const db = getDatabase();

  await db.issueReaderSettings.delete({
    where: { fileId },
  }).catch(() => {
    // Ignore if not found
  });
}

// =============================================================================
// Settings Resolution (5-Level Hierarchy with FULL OVERRIDE)
// =============================================================================

export type SettingsSource = 'global' | 'library' | 'collection' | 'series' | 'issue';

export interface SettingsWithOrigin {
  settings: ReaderSettings;
  source: SettingsSource;
  basedOnPreset?: { id: string; name: string } | null;
}

/**
 * Convert PartialReaderSettings to full ReaderSettings using defaults
 */
function partialToFull(partial: PartialReaderSettings, defaults: ReaderSettings): ReaderSettings {
  return {
    id: defaults.id,
    mode: partial.mode ?? defaults.mode,
    direction: partial.direction ?? defaults.direction,
    scaling: partial.scaling ?? defaults.scaling,
    customWidth: partial.customWidth ?? defaults.customWidth,
    splitting: partial.splitting ?? defaults.splitting,
    background: partial.background ?? defaults.background,
    brightness: partial.brightness ?? defaults.brightness,
    colorCorrection: partial.colorCorrection ?? defaults.colorCorrection,
    showPageShadow: partial.showPageShadow ?? defaults.showPageShadow,
    autoHideUI: partial.autoHideUI ?? defaults.autoHideUI,
    preloadCount: partial.preloadCount ?? defaults.preloadCount,
    webtoonGap: partial.webtoonGap ?? defaults.webtoonGap,
    webtoonMaxWidth: partial.webtoonMaxWidth ?? defaults.webtoonMaxWidth,
    usePhysicalNavigation: partial.usePhysicalNavigation ?? defaults.usePhysicalNavigation,
    updatedAt: defaults.updatedAt,
  };
}

/**
 * Check if partial settings has any non-null values
 */
function hasAnySettings(partial: PartialReaderSettings | null): boolean {
  if (!partial) return false;
  return Object.entries(partial).some(([key, value]) => {
    if (key === 'basedOnPresetId' || key === 'basedOnPresetName') return false;
    return value !== null && value !== undefined;
  });
}

/**
 * Get resolved settings for a specific file
 * Applies FULL OVERRIDE hierarchy: Global -> Library -> Series -> Issue
 * When a more specific level has settings, it COMPLETELY REPLACES the parent settings
 */
export async function getResolvedSettings(fileId: string): Promise<ReaderSettings> {
  const result = await getResolvedSettingsWithOrigin(fileId);
  return result.settings;
}

/**
 * Get resolved settings with origin information
 * Returns settings + which level they came from + preset origin if applicable
 *
 * Hierarchy (most specific wins): Issue > Series > Collection > Library > Global
 */
export async function getResolvedSettingsWithOrigin(fileId: string): Promise<SettingsWithOrigin> {
  const db = getDatabase();

  // Get global settings (always exists)
  const globalSettings = await getSettings();

  // Get file info
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      libraryId: true,
      seriesId: true,
    },
  });

  if (!file) {
    return {
      settings: globalSettings,
      source: 'global',
      basedOnPreset: null,
    };
  }

  // Check issue-level settings first (most specific)
  const issueSettings = await getIssueSettings(fileId);
  if (hasAnySettings(issueSettings)) {
    return {
      settings: partialToFull(issueSettings!, globalSettings),
      source: 'issue',
      basedOnPreset: issueSettings?.basedOnPresetId && issueSettings?.basedOnPresetName
        ? { id: issueSettings.basedOnPresetId, name: issueSettings.basedOnPresetName }
        : null,
    };
  }

  // Check series-level settings (use new ID-based if file has seriesId)
  if (file.seriesId) {
    const seriesSettings = await getSeriesSettingsById(file.seriesId);
    if (hasAnySettings(seriesSettings)) {
      return {
        settings: partialToFull(seriesSettings!, globalSettings),
        source: 'series',
        basedOnPreset: seriesSettings?.basedOnPresetId && seriesSettings?.basedOnPresetName
          ? { id: seriesSettings.basedOnPresetId, name: seriesSettings.basedOnPresetName }
          : null,
      };
    }
  }

  // Check collection-level settings
  // Find collections containing this file that have a reader preset, ordered by most recently updated
  const collectionWithPreset = await db.collection.findFirst({
    where: {
      readerPresetId: { not: null },
      items: {
        some: {
          OR: [
            { fileId: fileId },
            { seriesId: file.seriesId },
          ],
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      readerPreset: true,
    },
  });

  if (collectionWithPreset?.readerPreset) {
    const preset = collectionWithPreset.readerPreset;
    const presetSettings: PartialReaderSettings = {
      mode: preset.mode as ReadingMode,
      direction: preset.direction as ReadingDirection,
      scaling: preset.scaling as ImageScaling,
      customWidth: preset.customWidth,
      splitting: preset.splitting as ImageSplitting,
      background: preset.background as BackgroundColor,
      brightness: preset.brightness,
      colorCorrection: preset.colorCorrection as ColorCorrection,
      showPageShadow: preset.showPageShadow,
      autoHideUI: preset.autoHideUI,
      preloadCount: preset.preloadCount,
      webtoonGap: preset.webtoonGap,
      webtoonMaxWidth: preset.webtoonMaxWidth,
      usePhysicalNavigation: preset.usePhysicalNavigation,
    };
    return {
      settings: partialToFull(presetSettings, globalSettings),
      source: 'collection',
      basedOnPreset: { id: preset.id, name: preset.name },
    };
  }

  // Check library-level settings
  const librarySettings = await getLibrarySettings(file.libraryId);
  if (hasAnySettings(librarySettings)) {
    return {
      settings: partialToFull(librarySettings!, globalSettings),
      source: 'library',
      basedOnPreset: librarySettings?.basedOnPresetId && librarySettings?.basedOnPresetName
        ? { id: librarySettings.basedOnPresetId, name: librarySettings.basedOnPresetName }
        : null,
    };
  }

  // Fall back to global settings
  return {
    settings: globalSettings,
    source: 'global',
    basedOnPreset: null,
  };
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

// =============================================================================
// Preset Application
// =============================================================================

/**
 * Apply a preset to a library (copies values, tracks origin)
 */
export async function applyPresetToLibrary(
  libraryId: string,
  presetId: string,
  presetName: string,
  presetSettings: PartialReaderSettings
): Promise<void> {
  await updateLibrarySettings(libraryId, {
    ...presetSettings,
    basedOnPresetId: presetId,
    basedOnPresetName: presetName,
  });
}

/**
 * Apply a preset to a series (copies values, tracks origin)
 */
export async function applyPresetToSeries(
  seriesId: string,
  presetId: string,
  presetName: string,
  presetSettings: PartialReaderSettings
): Promise<void> {
  await updateSeriesSettingsById(seriesId, {
    ...presetSettings,
    basedOnPresetId: presetId,
    basedOnPresetName: presetName,
  });
}

/**
 * Apply a preset to an issue (copies values, tracks origin)
 */
export async function applyPresetToIssue(
  fileId: string,
  presetId: string,
  presetName: string,
  presetSettings: PartialReaderSettings
): Promise<void> {
  await updateIssueSettings(fileId, {
    ...presetSettings,
    basedOnPresetId: presetId,
    basedOnPresetName: presetName,
  });
}

/**
 * Apply a preset to a collection (links to preset, does not copy values)
 * Unlike library/series/issue which copy settings, collections link directly to the preset
 */
export async function applyPresetToCollection(
  collectionId: string,
  presetId: string | null
): Promise<void> {
  const db = getDatabase();
  await db.collection.update({
    where: { id: collectionId },
    data: { readerPresetId: presetId },
  });
}
