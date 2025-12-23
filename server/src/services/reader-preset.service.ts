/**
 * Reader Preset Service
 *
 * Manages named reader settings presets:
 * - System presets (shared, admin-only management)
 * - User presets (private per-user)
 * - Bundled presets (undeletable system presets: Western, Manga, Webtoon)
 */

import { getDatabase } from './database.service.js';
import type {
  ReadingMode,
  ReadingDirection,
  ImageScaling,
  ImageSplitting,
  BackgroundColor,
} from './reader-settings.service.js';

// =============================================================================
// Types
// =============================================================================

export type ColorCorrection = 'none' | 'sepia-correct' | 'contrast-boost' | 'desaturate' | 'invert';

export interface ReaderPreset {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  userId: string | null;
  isSystem: boolean;
  isBundled: boolean;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePresetInput {
  name: string;
  description?: string;
  icon?: string;
  isSystem?: boolean;
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
}

export interface UpdatePresetInput {
  name?: string;
  description?: string;
  icon?: string;
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
}

// =============================================================================
// Bundled Presets Definition
// =============================================================================

const BUNDLED_PRESETS: Array<{
  name: string;
  description: string;
  icon: string;
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
}> = [
  {
    name: 'Western Comics',
    description: 'Optimized for traditional western comic books with left-to-right reading',
    icon: 'book',
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
    webtoonGap: 0,
    webtoonMaxWidth: 800,
  },
  {
    name: 'Manga',
    description: 'Right-to-left reading for Japanese manga',
    icon: 'scroll',
    mode: 'single',
    direction: 'rtl',
    scaling: 'fitHeight',
    customWidth: null,
    splitting: 'none',
    background: 'black',
    brightness: 100,
    colorCorrection: 'none',
    showPageShadow: true,
    autoHideUI: true,
    preloadCount: 3,
    webtoonGap: 0,
    webtoonMaxWidth: 800,
  },
  {
    name: 'Webtoon',
    description: 'Continuous vertical scroll for webtoons and long-strip comics',
    icon: 'smartphone',
    mode: 'continuous',
    direction: 'vertical',
    scaling: 'fitWidth',
    customWidth: null,
    splitting: 'none',
    background: 'black',
    brightness: 100,
    colorCorrection: 'none',
    showPageShadow: false,
    autoHideUI: true,
    preloadCount: 5,
    webtoonGap: 8,
    webtoonMaxWidth: 800,
  },
];

// =============================================================================
// Bundled Preset Seeding
// =============================================================================

/**
 * Ensure bundled presets exist in the database
 * Called on application startup
 */
export async function ensureBundledPresets(): Promise<void> {
  const db = getDatabase();

  for (const preset of BUNDLED_PRESETS) {
    // Find existing bundled preset by name (can't use upsert with null userId in composite key)
    const existing = await db.readerPreset.findFirst({
      where: {
        name: preset.name,
        isBundled: true,
        isSystem: true,
        userId: null,
      },
    });

    if (existing) {
      // Update existing bundled preset (in case we change defaults)
      await db.readerPreset.update({
        where: { id: existing.id },
        data: {
          description: preset.description,
          icon: preset.icon,
        },
      });
    } else {
      // Create new bundled preset
      await db.readerPreset.create({
        data: {
          name: preset.name,
          description: preset.description,
          icon: preset.icon,
          userId: null,
          isSystem: true,
          isBundled: true,
          mode: preset.mode,
          direction: preset.direction,
          scaling: preset.scaling,
          customWidth: preset.customWidth,
          splitting: preset.splitting,
          background: preset.background,
          brightness: preset.brightness,
          colorCorrection: preset.colorCorrection,
          showPageShadow: preset.showPageShadow,
          autoHideUI: preset.autoHideUI,
          preloadCount: preset.preloadCount,
          webtoonGap: preset.webtoonGap,
          webtoonMaxWidth: preset.webtoonMaxWidth,
        },
      });
    }
  }
}

// =============================================================================
// Preset CRUD
// =============================================================================

/**
 * Get all presets visible to a user
 * Returns: bundled presets + system presets + user's own presets
 */
export async function getAllPresets(userId?: string): Promise<ReaderPreset[]> {
  const db = getDatabase();

  const presets = await db.readerPreset.findMany({
    where: {
      OR: [
        { isBundled: true },
        { isSystem: true },
        ...(userId ? [{ userId }] : []),
      ],
    },
    orderBy: [
      { isBundled: 'desc' }, // Bundled first
      { isSystem: 'desc' },  // Then system
      { name: 'asc' },       // Then alphabetical
    ],
  });

  return presets as ReaderPreset[];
}

/**
 * Get a single preset by ID
 */
export async function getPresetById(id: string): Promise<ReaderPreset | null> {
  const db = getDatabase();

  const preset = await db.readerPreset.findUnique({
    where: { id },
  });

  return preset as ReaderPreset | null;
}

/**
 * Create a new preset
 * - If isSystem is true, requires admin (checked at route level)
 * - If userId is provided, creates a user preset
 */
export async function createPreset(
  input: CreatePresetInput,
  userId?: string
): Promise<ReaderPreset> {
  const db = getDatabase();

  // Validate name
  if (!input.name || input.name.trim().length === 0) {
    throw new Error('Preset name is required');
  }

  // Check for duplicate name in same scope
  const existing = await db.readerPreset.findFirst({
    where: {
      name: input.name.trim(),
      userId: input.isSystem ? null : (userId ?? null),
    },
  });

  if (existing) {
    throw new Error(`A preset with name "${input.name}" already exists`);
  }

  const preset = await db.readerPreset.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      icon: input.icon || null,
      userId: input.isSystem ? null : (userId ?? null),
      isSystem: input.isSystem ?? false,
      isBundled: false, // Only system can create bundled presets via seeding
      mode: input.mode ?? 'single',
      direction: input.direction ?? 'ltr',
      scaling: input.scaling ?? 'fitHeight',
      customWidth: input.customWidth ?? null,
      splitting: input.splitting ?? 'none',
      background: input.background ?? 'black',
      brightness: input.brightness ?? 100,
      colorCorrection: input.colorCorrection ?? 'none',
      showPageShadow: input.showPageShadow ?? true,
      autoHideUI: input.autoHideUI ?? true,
      preloadCount: input.preloadCount ?? 3,
      webtoonGap: input.webtoonGap ?? 8,
      webtoonMaxWidth: input.webtoonMaxWidth ?? 800,
    },
  });

  return preset as ReaderPreset;
}

/**
 * Update an existing preset
 */
export async function updatePreset(
  id: string,
  input: UpdatePresetInput,
  userId?: string,
  isAdmin?: boolean
): Promise<ReaderPreset> {
  const db = getDatabase();

  const existing = await db.readerPreset.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Preset not found');
  }

  // Check permissions
  if (existing.isBundled) {
    throw new Error('Bundled presets cannot be modified');
  }

  if (existing.isSystem && !isAdmin) {
    throw new Error('Only admins can modify system presets');
  }

  if (!existing.isSystem && existing.userId !== userId) {
    throw new Error('You can only modify your own presets');
  }

  // Check for name collision if name is being changed
  if (input.name && input.name !== existing.name) {
    const duplicate = await db.readerPreset.findFirst({
      where: {
        name: input.name.trim(),
        userId: existing.userId,
        id: { not: id },
      },
    });

    if (duplicate) {
      throw new Error(`A preset with name "${input.name}" already exists`);
    }
  }

  const preset = await db.readerPreset.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      description: input.description !== undefined ? (input.description?.trim() || null) : undefined,
      icon: input.icon !== undefined ? (input.icon || null) : undefined,
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
    },
  });

  return preset as ReaderPreset;
}

/**
 * Delete a preset
 */
export async function deletePreset(
  id: string,
  userId?: string,
  isAdmin?: boolean
): Promise<void> {
  const db = getDatabase();

  const existing = await db.readerPreset.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Preset not found');
  }

  // Check permissions
  if (existing.isBundled) {
    throw new Error('Bundled presets cannot be deleted');
  }

  if (existing.isSystem && !isAdmin) {
    throw new Error('Only admins can delete system presets');
  }

  if (!existing.isSystem && existing.userId !== userId) {
    throw new Error('You can only delete your own presets');
  }

  await db.readerPreset.delete({
    where: { id },
  });
}

/**
 * Check if a user can manage (edit/delete) a preset
 */
export async function canUserManagePreset(
  presetId: string,
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  const db = getDatabase();

  const preset = await db.readerPreset.findUnique({
    where: { id: presetId },
  });

  if (!preset) {
    return false;
  }

  // Bundled presets cannot be managed
  if (preset.isBundled) {
    return false;
  }

  // System presets require admin
  if (preset.isSystem) {
    return isAdmin;
  }

  // User presets can only be managed by owner
  return preset.userId === userId;
}

/**
 * Get presets grouped by type for UI display
 */
export async function getPresetsGrouped(userId?: string): Promise<{
  bundled: ReaderPreset[];
  system: ReaderPreset[];
  user: ReaderPreset[];
}> {
  const allPresets = await getAllPresets(userId);

  return {
    bundled: allPresets.filter((p) => p.isBundled),
    system: allPresets.filter((p) => p.isSystem && !p.isBundled),
    user: allPresets.filter((p) => !p.isSystem && !p.isBundled),
  };
}

/**
 * Extract settings from a preset (for applying to library/series/issue)
 */
export function extractSettingsFromPreset(preset: ReaderPreset): {
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
} {
  return {
    mode: preset.mode,
    direction: preset.direction,
    scaling: preset.scaling,
    customWidth: preset.customWidth,
    splitting: preset.splitting,
    background: preset.background,
    brightness: preset.brightness,
    colorCorrection: preset.colorCorrection,
    showPageShadow: preset.showPageShadow,
    autoHideUI: preset.autoHideUI,
    preloadCount: preset.preloadCount,
    webtoonGap: preset.webtoonGap,
    webtoonMaxWidth: preset.webtoonMaxWidth,
  };
}
