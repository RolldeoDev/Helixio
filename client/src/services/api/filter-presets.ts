/**
 * Filter Presets API Module
 *
 * API functions for managing filter presets that can be reused
 * across smart collections and library filtering.
 */

import { get, post, put, del } from './shared';
import type {
  SmartFilter,
  SortField,
  SortOrder,
} from '../../contexts/SmartFilterContext';

// =============================================================================
// Types
// =============================================================================

export interface FilterPreset {
  id: string;
  userId: string | null;
  isGlobal: boolean;
  name: string;
  description: string | null;
  icon: string | null;
  filterDefinition: SmartFilter;
  schemaVersion: number;
  sortBy: SortField | null;
  sortOrder: SortOrder | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePresetInput {
  name: string;
  description?: string;
  icon?: string;
  filterDefinition: SmartFilter;
  sortBy?: SortField;
  sortOrder?: SortOrder;
  isGlobal?: boolean;
}

export interface UpdatePresetInput {
  name?: string;
  description?: string;
  icon?: string;
  filterDefinition?: SmartFilter;
  sortBy?: SortField;
  sortOrder?: SortOrder;
}

export interface UpdatePresetResponse {
  preset: FilterPreset;
  affectedCollections: number;
}

export interface PresetUsageInfo {
  collections: Array<{
    id: string;
    name: string;
    userId: string;
    itemCount: number;
  }>;
  totalCollections: number;
}

export interface CanDeleteResult {
  canDelete: boolean;
  blockedBy: string[];
}

export interface MigrateResult {
  migrated: number;
  skipped: number;
  errors: string[];
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Get all filter presets accessible to the current user
 */
export async function getFilterPresets(options?: {
  includeGlobal?: boolean;
}): Promise<FilterPreset[]> {
  const params = new URLSearchParams();
  if (options?.includeGlobal === false) {
    params.set('includeGlobal', 'false');
  }
  const query = params.toString();
  const response = await get<{ presets: FilterPreset[] }>(
    `/filter-presets${query ? `?${query}` : ''}`
  );
  return response.presets;
}

/**
 * Get a single filter preset by ID
 */
export async function getFilterPreset(id: string): Promise<FilterPreset> {
  const response = await get<{ preset: FilterPreset }>(`/filter-presets/${id}`);
  return response.preset;
}

/**
 * Create a new filter preset
 */
export async function createFilterPreset(
  input: CreatePresetInput
): Promise<FilterPreset> {
  const response = await post<{ preset: FilterPreset }>('/filter-presets', input);
  return response.preset;
}

/**
 * Update an existing filter preset
 * Returns the updated preset and count of affected collections
 */
export async function updateFilterPreset(
  id: string,
  input: UpdatePresetInput
): Promise<UpdatePresetResponse> {
  return put<UpdatePresetResponse>(`/filter-presets/${id}`, input);
}

/**
 * Delete a filter preset
 * Throws if preset is in use by any collections
 */
export async function deleteFilterPreset(id: string): Promise<void> {
  await del<void>(`/filter-presets/${id}`);
}

/**
 * Get usage information for a preset (which collections use it)
 */
export async function getPresetUsage(id: string): Promise<PresetUsageInfo> {
  return get<PresetUsageInfo>(`/filter-presets/${id}/usage`);
}

/**
 * Check if a preset can be deleted
 */
export async function canDeletePreset(id: string): Promise<CanDeleteResult> {
  return get<CanDeleteResult>(`/filter-presets/${id}/can-delete`);
}

/**
 * Duplicate a preset with a new name
 */
export async function duplicatePreset(
  id: string,
  newName: string
): Promise<FilterPreset> {
  const response = await post<{ preset: FilterPreset }>(
    `/filter-presets/${id}/duplicate`,
    { name: newName }
  );
  return response.preset;
}

/**
 * Migrate local storage presets to database
 */
export async function migrateLocalPresets(
  presets: SmartFilter[]
): Promise<MigrateResult> {
  return post<MigrateResult>('/filter-presets/migrate-local', { presets });
}

// =============================================================================
// Collection Linking
// =============================================================================

/**
 * Link a collection to a filter preset
 */
export async function linkCollectionToPreset(
  collectionId: string,
  presetId: string
): Promise<void> {
  await post(`/collections/${collectionId}/smart/link-preset`, { presetId });
}

/**
 * Unlink a collection from its filter preset
 * Copies the preset's filter to the collection as an embedded filter
 */
export async function unlinkCollectionFromPreset(
  collectionId: string
): Promise<void> {
  await post(`/collections/${collectionId}/smart/unlink-preset`);
}
