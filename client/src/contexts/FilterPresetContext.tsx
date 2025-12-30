/**
 * Filter Preset Context
 *
 * Provides state management for filter presets across the application.
 * Handles loading, creating, updating, and deleting filter presets from the API.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  type FilterPreset,
  type CreatePresetInput,
  type UpdatePresetInput,
  type PresetUsageInfo,
  type CanDeleteResult,
  type MigrateResult,
  getFilterPresets,
  getFilterPreset,
  createFilterPreset as apiCreatePreset,
  updateFilterPreset as apiUpdatePreset,
  deleteFilterPreset as apiDeletePreset,
  getPresetUsage as apiGetPresetUsage,
  canDeletePreset as apiCanDeletePreset,
  duplicatePreset as apiDuplicatePreset,
  migrateLocalPresets as apiMigrateLocalPresets,
  linkCollectionToPreset as apiLinkCollection,
  unlinkCollectionFromPreset as apiUnlinkCollection,
} from '../services/api/filter-presets';
import type { SmartFilter } from './SmartFilterContext';
import { useAuth } from './AuthContext';

// =============================================================================
// Types
// =============================================================================

interface FilterPresetContextValue {
  // State
  presets: FilterPreset[];
  isLoading: boolean;
  error: string | null;

  // CRUD Operations
  createPreset: (input: CreatePresetInput) => Promise<FilterPreset>;
  updatePreset: (id: string, input: UpdatePresetInput) => Promise<{ preset: FilterPreset; affectedCollections: number }>;
  deletePreset: (id: string) => Promise<void>;
  duplicatePreset: (id: string, newName: string) => Promise<FilterPreset>;

  // Fetching
  getPreset: (id: string) => Promise<FilterPreset>;
  refetch: () => Promise<void>;

  // Usage Information
  getPresetUsage: (id: string) => Promise<PresetUsageInfo>;
  canDelete: (id: string) => Promise<CanDeleteResult>;

  // Migration
  migrateLocalPresets: (localPresets: SmartFilter[]) => Promise<MigrateResult>;
  hasPendingMigration: boolean;
  dismissMigration: () => void;

  // Collection Linking
  linkCollectionToPreset: (collectionId: string, presetId: string) => Promise<void>;
  unlinkCollectionFromPreset: (collectionId: string) => Promise<void>;

  // Helpers
  getPresetById: (id: string) => FilterPreset | undefined;
  getUserPresets: () => FilterPreset[];
  getGlobalPresets: () => FilterPreset[];
}

const FilterPresetContext = createContext<FilterPresetContextValue | null>(null);

// =============================================================================
// Local Storage Keys
// =============================================================================

const LOCAL_STORAGE_KEY = 'helixio-smart-filters';
const MIGRATION_COMPLETED_KEY = 'helixio-filter-presets-migrated';

// =============================================================================
// Provider Component
// =============================================================================

interface FilterPresetProviderProps {
  children: ReactNode;
}

export function FilterPresetProvider({ children }: FilterPresetProviderProps) {
  const { user } = useAuth();
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPendingMigration, setHasPendingMigration] = useState(false);

  // Check for pending migration on mount
  useEffect(() => {
    if (!user) return;

    const migrationCompleted = localStorage.getItem(MIGRATION_COMPLETED_KEY);
    const localFilters = localStorage.getItem(LOCAL_STORAGE_KEY);

    if (!migrationCompleted && localFilters) {
      try {
        const parsed = JSON.parse(localFilters);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHasPendingMigration(true);
        }
      } catch {
        // Invalid JSON, no migration needed
      }
    }
  }, [user]);

  // Fetch presets when user changes
  const fetchPresets = useCallback(async () => {
    if (!user) {
      setPresets([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const fetchedPresets = await getFilterPresets({ includeGlobal: true });
      setPresets(fetchedPresets);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load presets';
      setError(message);
      console.error('Failed to fetch filter presets:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  // =============================================================================
  // CRUD Operations
  // =============================================================================

  const createPreset = useCallback(async (input: CreatePresetInput): Promise<FilterPreset> => {
    const newPreset = await apiCreatePreset(input);
    setPresets(prev => [...prev, newPreset]);
    return newPreset;
  }, []);

  const updatePreset = useCallback(async (
    id: string,
    input: UpdatePresetInput
  ): Promise<{ preset: FilterPreset; affectedCollections: number }> => {
    const result = await apiUpdatePreset(id, input);
    setPresets(prev => prev.map(p => p.id === id ? result.preset : p));
    return result;
  }, []);

  const deletePreset = useCallback(async (id: string): Promise<void> => {
    await apiDeletePreset(id);
    setPresets(prev => prev.filter(p => p.id !== id));
  }, []);

  const duplicatePresetFn = useCallback(async (id: string, newName: string): Promise<FilterPreset> => {
    const newPreset = await apiDuplicatePreset(id, newName);
    setPresets(prev => [...prev, newPreset]);
    return newPreset;
  }, []);

  // =============================================================================
  // Fetching
  // =============================================================================

  const getPreset = useCallback(async (id: string): Promise<FilterPreset> => {
    return getFilterPreset(id);
  }, []);

  const refetch = useCallback(async () => {
    await fetchPresets();
  }, [fetchPresets]);

  // =============================================================================
  // Usage Information
  // =============================================================================

  const getPresetUsageFn = useCallback(async (id: string): Promise<PresetUsageInfo> => {
    return apiGetPresetUsage(id);
  }, []);

  const canDelete = useCallback(async (id: string): Promise<CanDeleteResult> => {
    return apiCanDeletePreset(id);
  }, []);

  // =============================================================================
  // Migration
  // =============================================================================

  const migrateLocalPresets = useCallback(async (localPresets: SmartFilter[]): Promise<MigrateResult> => {
    const result = await apiMigrateLocalPresets(localPresets);

    // Mark migration as completed
    localStorage.setItem(MIGRATION_COMPLETED_KEY, 'true');

    // Clear local storage if migration was successful
    if (result.migrated > 0) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }

    setHasPendingMigration(false);

    // Refresh presets to include migrated ones
    await fetchPresets();

    return result;
  }, [fetchPresets]);

  const dismissMigration = useCallback(() => {
    localStorage.setItem(MIGRATION_COMPLETED_KEY, 'true');
    setHasPendingMigration(false);
  }, []);

  // =============================================================================
  // Collection Linking
  // =============================================================================

  const linkCollectionToPresetFn = useCallback(async (
    collectionId: string,
    presetId: string
  ): Promise<void> => {
    await apiLinkCollection(collectionId, presetId);
  }, []);

  const unlinkCollectionFromPresetFn = useCallback(async (
    collectionId: string
  ): Promise<void> => {
    await apiUnlinkCollection(collectionId);
  }, []);

  // =============================================================================
  // Helpers
  // =============================================================================

  const getPresetById = useCallback((id: string): FilterPreset | undefined => {
    return presets.find(p => p.id === id);
  }, [presets]);

  const getUserPresets = useCallback((): FilterPreset[] => {
    return presets.filter(p => !p.isGlobal);
  }, [presets]);

  const getGlobalPresets = useCallback((): FilterPreset[] => {
    return presets.filter(p => p.isGlobal);
  }, [presets]);

  // =============================================================================
  // Context Value
  // =============================================================================

  const value = useMemo<FilterPresetContextValue>(() => ({
    presets,
    isLoading,
    error,
    createPreset,
    updatePreset,
    deletePreset,
    duplicatePreset: duplicatePresetFn,
    getPreset,
    refetch,
    getPresetUsage: getPresetUsageFn,
    canDelete,
    migrateLocalPresets,
    hasPendingMigration,
    dismissMigration,
    linkCollectionToPreset: linkCollectionToPresetFn,
    unlinkCollectionFromPreset: unlinkCollectionFromPresetFn,
    getPresetById,
    getUserPresets,
    getGlobalPresets,
  }), [
    presets,
    isLoading,
    error,
    createPreset,
    updatePreset,
    deletePreset,
    duplicatePresetFn,
    getPreset,
    refetch,
    getPresetUsageFn,
    canDelete,
    migrateLocalPresets,
    hasPendingMigration,
    dismissMigration,
    linkCollectionToPresetFn,
    unlinkCollectionFromPresetFn,
    getPresetById,
    getUserPresets,
    getGlobalPresets,
  ]);

  return (
    <FilterPresetContext.Provider value={value}>
      {children}
    </FilterPresetContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useFilterPresets(): FilterPresetContextValue {
  const context = useContext(FilterPresetContext);
  if (!context) {
    throw new Error('useFilterPresets must be used within a FilterPresetProvider');
  }
  return context;
}

// =============================================================================
// Re-exports
// =============================================================================

export type { FilterPreset, CreatePresetInput, UpdatePresetInput, PresetUsageInfo };
