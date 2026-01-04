/**
 * Advanced Filter Context
 *
 * Advanced filtering system for the library with AND/OR logic,
 * multiple filter conditions, and saved filter presets.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { useFilterPresets, type FilterPreset } from './FilterPresetContext';

// =============================================================================
// Types
// =============================================================================

export type FilterOperator = 'AND' | 'OR';
export type FilterField =
  | 'filename'
  | 'series'
  | 'title'
  | 'number'
  | 'volume'
  | 'year'
  | 'publisher'
  | 'writer'
  | 'penciller'
  | 'genre'
  | 'characters'
  | 'teams'
  | 'locations'
  | 'storyArc'
  | 'status'
  | 'path'
  | 'rating'
  // Advanced filter fields
  | 'readStatus'
  | 'dateAdded'
  | 'lastReadAt'
  | 'pageCount'
  | 'fileSize'
  | 'libraryId'
  // External rating fields
  | 'externalRating'
  | 'communityRating'
  | 'criticRating'
  // Additional metadata fields
  | 'imprint'
  | 'ageRating'
  | 'format'
  | 'language'
  | 'inker'
  | 'colorist'
  | 'letterer'
  | 'editor'
  | 'count';

export type FilterComparison =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'between'
  // Date comparisons
  | 'within_days'
  | 'before'
  | 'after';

// Sorting types
export type SortField =
  | 'name'
  | 'title'
  | 'year'
  | 'dateAdded'
  | 'lastReadAt'
  | 'number'
  | 'publisher'
  | 'rating'
  | 'externalRating';

export type SortOrder = 'asc' | 'desc';

export interface FilterCondition {
  id: string;
  field: FilterField;
  comparison: FilterComparison;
  value: string;
  value2?: string; // For 'between' comparison
}

export interface FilterGroup {
  id: string;
  operator: FilterOperator;
  conditions: FilterCondition[];
}

export interface AdvancedFilter {
  id: string;
  name: string;
  rootOperator: FilterOperator;
  groups: FilterGroup[];
  // Sorting options
  sortBy?: SortField;
  sortOrder?: SortOrder;
  createdAt: string;
  updatedAt: string;
}

/**
 * Minimum file shape required for filtering
 * This is compatible with ComicFile from api.service
 */
export interface FilterableFile {
  id: string;
  filename: string;
  relativePath: string;
  status: string;
  rating?: number | null;
  // File-level fields
  libraryId?: string | null;
  size?: number | string | null; // BigInt serialized as string for files > 2GB
  createdAt?: string | null;
  // Reading progress fields (augmented from progress)
  readStatus?: 'unread' | 'reading' | 'completed' | null;
  lastReadAt?: string | null;
  // External ratings (aggregated)
  externalRating?: number | null;
  communityRating?: number | null;
  criticRating?: number | null;
  metadata?: {
    series?: string | null;
    title?: string | null;
    number?: string | null;
    volume?: number | null;
    year?: number | null;
    publisher?: string | null;
    writer?: string | null;
    penciller?: string | null;
    genre?: string | null;
    characters?: string | null;
    teams?: string | null;
    locations?: string | null;
    storyArc?: string | null;
    // Additional metadata fields
    pageCount?: number | null;
    imprint?: string | null;
    ageRating?: string | null;
    format?: string | null;
    languageISO?: string | null;
    inker?: string | null;
    colorist?: string | null;
    letterer?: string | null;
    editor?: string | null;
    count?: number | null;
  } | null;
}

export interface AdvancedFilterState {
  // Current filter being edited/applied
  activeFilter: AdvancedFilter | null;
  isFilterActive: boolean;

  // Saved presets
  savedFilters: AdvancedFilter[];

  // UI state
  isFilterPanelOpen: boolean;
}

export interface AdvancedFilterContextValue extends AdvancedFilterState {
  // Filter actions
  setActiveFilter: (filter: AdvancedFilter | null) => void;
  clearFilter: () => void;

  // Condition management
  addCondition: (groupId: string) => void;
  updateCondition: (groupId: string, conditionId: string, updates: Partial<FilterCondition>) => void;
  removeCondition: (groupId: string, conditionId: string) => void;

  // Group management
  addGroup: () => void;
  updateGroupOperator: (groupId: string, operator: FilterOperator) => void;
  removeGroup: (groupId: string) => void;
  setRootOperator: (operator: FilterOperator) => void;

  // Sorting actions
  setSortBy: (sortBy: SortField | undefined) => void;
  setSortOrder: (sortOrder: SortOrder) => void;

  // Preset management
  saveFilter: (name: string) => Promise<void>;
  loadFilter: (filterId: string) => void;
  deleteFilter: (filterId: string) => Promise<void>;
  renameFilter: (filterId: string, newName: string) => Promise<void>;

  // UI actions
  toggleFilterPanel: () => void;
  openFilterPanel: () => void;
  closeFilterPanel: () => void;

  // Filter application
  applyFilterToFiles: <T extends FilterableFile>(files: T[]) => T[];
}

// =============================================================================
// Constants
// =============================================================================

export const FILTER_FIELDS: { value: FilterField; label: string; type: 'string' | 'number' | 'date' }[] = [
  // String fields
  { value: 'filename', label: 'Filename', type: 'string' },
  { value: 'series', label: 'Series', type: 'string' },
  { value: 'title', label: 'Title', type: 'string' },
  { value: 'publisher', label: 'Publisher', type: 'string' },
  { value: 'imprint', label: 'Imprint', type: 'string' },
  { value: 'writer', label: 'Writer', type: 'string' },
  { value: 'penciller', label: 'Artist', type: 'string' },
  { value: 'inker', label: 'Inker', type: 'string' },
  { value: 'colorist', label: 'Colorist', type: 'string' },
  { value: 'letterer', label: 'Letterer', type: 'string' },
  { value: 'editor', label: 'Editor', type: 'string' },
  { value: 'genre', label: 'Genre', type: 'string' },
  { value: 'characters', label: 'Characters', type: 'string' },
  { value: 'teams', label: 'Teams', type: 'string' },
  { value: 'locations', label: 'Locations', type: 'string' },
  { value: 'storyArc', label: 'Story Arc', type: 'string' },
  { value: 'ageRating', label: 'Age Rating', type: 'string' },
  { value: 'format', label: 'Format', type: 'string' },
  { value: 'language', label: 'Language', type: 'string' },
  { value: 'status', label: 'File Status', type: 'string' },
  { value: 'readStatus', label: 'Read Status', type: 'string' },
  { value: 'path', label: 'File Path', type: 'string' },
  { value: 'libraryId', label: 'Library', type: 'string' },
  // Number fields
  { value: 'number', label: 'Issue Number', type: 'number' },
  { value: 'volume', label: 'Volume', type: 'number' },
  { value: 'year', label: 'Year', type: 'number' },
  { value: 'pageCount', label: 'Page Count', type: 'number' },
  { value: 'fileSize', label: 'File Size (MB)', type: 'number' },
  { value: 'count', label: 'Total Issues', type: 'number' },
  { value: 'rating', label: 'Your Rating', type: 'number' },
  { value: 'externalRating', label: 'External Rating', type: 'number' },
  { value: 'communityRating', label: 'Community Rating', type: 'number' },
  { value: 'criticRating', label: 'Critic Rating', type: 'number' },
  // Date fields
  { value: 'dateAdded', label: 'Date Added', type: 'date' },
  { value: 'lastReadAt', label: 'Last Read', type: 'date' },
];

export const STRING_COMPARISONS: { value: FilterComparison; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

export const NUMBER_COMPARISONS: { value: FilterComparison; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'between', label: 'between' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

export const DATE_COMPARISONS: { value: FilterComparison; label: string }[] = [
  { value: 'within_days', label: 'within last N days' },
  { value: 'before', label: 'before date' },
  { value: 'after', label: 'after date' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

export const SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'title', label: 'Title' },
  { value: 'year', label: 'Year' },
  { value: 'dateAdded', label: 'Date Added' },
  { value: 'lastReadAt', label: 'Last Read' },
  { value: 'number', label: 'Issue Number' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'rating', label: 'Your Rating' },
  { value: 'externalRating', label: 'External Rating' },
];

// =============================================================================
// Helper Functions
// =============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function createEmptyCondition(): FilterCondition {
  return {
    id: generateId(),
    field: 'series',
    comparison: 'contains',
    value: '',
  };
}

function createEmptyGroup(): FilterGroup {
  return {
    id: generateId(),
    operator: 'AND',
    conditions: [createEmptyCondition()],
  };
}

function createEmptyFilter(): AdvancedFilter {
  return {
    id: generateId(),
    name: 'New Filter',
    rootOperator: 'AND',
    groups: [createEmptyGroup()],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function getFieldValue(file: FilterableFile, field: FilterField): string | number | null {
  switch (field) {
    // File-level fields
    case 'filename':
      return file.filename;
    case 'path':
      return file.relativePath;
    case 'status':
      return file.status;
    case 'rating':
      return file.rating ?? null;
    case 'libraryId':
      return file.libraryId ?? null;
    case 'fileSize':
      return file.size ?? null;
    case 'dateAdded':
      return file.createdAt ?? null;
    // Reading progress fields
    case 'readStatus':
      return file.readStatus ?? null;
    case 'lastReadAt':
      return file.lastReadAt ?? null;
    // External rating fields
    case 'externalRating':
      return file.externalRating ?? null;
    case 'communityRating':
      return file.communityRating ?? null;
    case 'criticRating':
      return file.criticRating ?? null;
    // Metadata fields
    case 'series':
      return file.metadata?.series ?? null;
    case 'title':
      return file.metadata?.title ?? null;
    case 'number':
      return file.metadata?.number ?? null;
    case 'volume':
      return file.metadata?.volume ?? null;
    case 'year':
      return file.metadata?.year ?? null;
    case 'publisher':
      return file.metadata?.publisher ?? null;
    case 'writer':
      return file.metadata?.writer ?? null;
    case 'penciller':
      return file.metadata?.penciller ?? null;
    case 'genre':
      return file.metadata?.genre ?? null;
    case 'characters':
      return file.metadata?.characters ?? null;
    case 'teams':
      return file.metadata?.teams ?? null;
    case 'locations':
      return file.metadata?.locations ?? null;
    case 'storyArc':
      return file.metadata?.storyArc ?? null;
    // Additional metadata fields
    case 'pageCount':
      return file.metadata?.pageCount ?? null;
    case 'imprint':
      return file.metadata?.imprint ?? null;
    case 'ageRating':
      return file.metadata?.ageRating ?? null;
    case 'format':
      return file.metadata?.format ?? null;
    case 'language':
      return file.metadata?.languageISO ?? null;
    case 'inker':
      return file.metadata?.inker ?? null;
    case 'colorist':
      return file.metadata?.colorist ?? null;
    case 'letterer':
      return file.metadata?.letterer ?? null;
    case 'editor':
      return file.metadata?.editor ?? null;
    case 'count':
      return file.metadata?.count ?? null;
    default:
      return null;
  }
}

function evaluateCondition(
  file: FilterableFile,
  condition: FilterCondition
): boolean {
  const fieldValue = getFieldValue(file, condition.field);
  const fieldConfig = FILTER_FIELDS.find(f => f.value === condition.field);
  const searchValue = condition.value.toLowerCase();

  // Handle is_empty and is_not_empty
  if (condition.comparison === 'is_empty') {
    return fieldValue === null || fieldValue === '' || fieldValue === undefined;
  }
  if (condition.comparison === 'is_not_empty') {
    return fieldValue !== null && fieldValue !== '' && fieldValue !== undefined;
  }

  // If field is empty, it doesn't match most conditions
  if (fieldValue === null || fieldValue === undefined) {
    return false;
  }

  // Handle date fields
  if (fieldConfig?.type === 'date') {
    const dateValue = new Date(fieldValue as string);
    if (isNaN(dateValue.getTime())) return false;

    switch (condition.comparison) {
      case 'within_days': {
        const daysAgo = parseInt(condition.value);
        if (isNaN(daysAgo)) return false;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysAgo);
        return dateValue >= cutoff;
      }
      case 'before': {
        const compareDate = new Date(condition.value);
        if (isNaN(compareDate.getTime())) return false;
        return dateValue < compareDate;
      }
      case 'after': {
        const compareDate = new Date(condition.value);
        if (isNaN(compareDate.getTime())) return false;
        return dateValue > compareDate;
      }
      default:
        return false;
    }
  }

  const stringValue = String(fieldValue).toLowerCase();

  switch (condition.comparison) {
    case 'contains':
      return stringValue.includes(searchValue);
    case 'not_contains':
      return !stringValue.includes(searchValue);
    case 'equals':
      return stringValue === searchValue;
    case 'not_equals':
      return stringValue !== searchValue;
    case 'starts_with':
      return stringValue.startsWith(searchValue);
    case 'ends_with':
      return stringValue.endsWith(searchValue);
    case 'greater_than': {
      const numValue = parseFloat(stringValue);
      const compareValue = parseFloat(condition.value);
      return !isNaN(numValue) && !isNaN(compareValue) && numValue > compareValue;
    }
    case 'less_than': {
      const numValue = parseFloat(stringValue);
      const compareValue = parseFloat(condition.value);
      return !isNaN(numValue) && !isNaN(compareValue) && numValue < compareValue;
    }
    case 'between': {
      const numValue = parseFloat(stringValue);
      const minValue = parseFloat(condition.value);
      const maxValue = parseFloat(condition.value2 || '0');
      return !isNaN(numValue) && !isNaN(minValue) && !isNaN(maxValue) &&
             numValue >= minValue && numValue <= maxValue;
    }
    default:
      return false;
  }
}

function evaluateGroup(
  file: FilterableFile,
  group: FilterGroup
): boolean {
  if (group.conditions.length === 0) return true;

  if (group.operator === 'AND') {
    return group.conditions.every(condition => evaluateCondition(file, condition));
  } else {
    return group.conditions.some(condition => evaluateCondition(file, condition));
  }
}

function evaluateFilter(
  file: FilterableFile,
  filter: AdvancedFilter
): boolean {
  if (filter.groups.length === 0) return true;

  if (filter.rootOperator === 'AND') {
    return filter.groups.every(group => evaluateGroup(file, group));
  } else {
    return filter.groups.some(group => evaluateGroup(file, group));
  }
}

/**
 * Convert a FilterPreset (from API) to AdvancedFilter (for internal use)
 */
function presetToAdvancedFilter(preset: FilterPreset): AdvancedFilter {
  return {
    ...preset.filterDefinition,
    id: preset.id,
    name: preset.name,
    sortBy: preset.sortBy ?? undefined,
    sortOrder: preset.sortOrder ?? undefined,
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt,
  };
}

// =============================================================================
// Context
// =============================================================================

const AdvancedFilterContext = createContext<AdvancedFilterContextValue | null>(null);

export function useAdvancedFilter(): AdvancedFilterContextValue {
  const context = useContext(AdvancedFilterContext);
  if (!context) {
    throw new Error('useAdvancedFilter must be used within AdvancedFilterProvider');
  }
  return context;
}

// =============================================================================
// Provider
// =============================================================================

interface AdvancedFilterProviderProps {
  children: ReactNode;
}

export function AdvancedFilterProvider({ children }: AdvancedFilterProviderProps) {
  const {
    presets,
    createPreset,
    updatePreset,
    deletePreset: deletePresetApi,
  } = useFilterPresets();

  const [activeFilter, setActiveFilterState] = useState<AdvancedFilter | null>(null);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Convert presets to AdvancedFilter format
  const savedFilters = useMemo(() => {
    return presets.map(presetToAdvancedFilter);
  }, [presets]);

  // ---------------------------------------------------------------------------
  // Filter Actions
  // ---------------------------------------------------------------------------

  const setActiveFilter = useCallback((filter: AdvancedFilter | null) => {
    setActiveFilterState(filter);
  }, []);

  const clearFilter = useCallback(() => {
    setActiveFilterState(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Condition Management
  // ---------------------------------------------------------------------------

  const addCondition = useCallback((groupId: string) => {
    setActiveFilterState(prev => {
      if (!prev) {
        const newFilter = createEmptyFilter();
        return newFilter;
      }

      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        groups: prev.groups.map(group =>
          group.id === groupId
            ? { ...group, conditions: [...group.conditions, createEmptyCondition()] }
            : group
        ),
      };
    });
  }, []);

  const updateCondition = useCallback((groupId: string, conditionId: string, updates: Partial<FilterCondition>) => {
    setActiveFilterState(prev => {
      if (!prev) return prev;

      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        groups: prev.groups.map(group =>
          group.id === groupId
            ? {
                ...group,
                conditions: group.conditions.map(condition =>
                  condition.id === conditionId
                    ? { ...condition, ...updates }
                    : condition
                ),
              }
            : group
        ),
      };
    });
  }, []);

  const removeCondition = useCallback((groupId: string, conditionId: string) => {
    setActiveFilterState(prev => {
      if (!prev) return prev;

      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        groups: prev.groups.map(group =>
          group.id === groupId
            ? { ...group, conditions: group.conditions.filter(c => c.id !== conditionId) }
            : group
        ),
      };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Group Management
  // ---------------------------------------------------------------------------

  const addGroup = useCallback(() => {
    setActiveFilterState(prev => {
      if (!prev) {
        return createEmptyFilter();
      }

      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        groups: [...prev.groups, createEmptyGroup()],
      };
    });
  }, []);

  const updateGroupOperator = useCallback((groupId: string, operator: FilterOperator) => {
    setActiveFilterState(prev => {
      if (!prev) return prev;

      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        groups: prev.groups.map(group =>
          group.id === groupId ? { ...group, operator } : group
        ),
      };
    });
  }, []);

  const removeGroup = useCallback((groupId: string) => {
    setActiveFilterState(prev => {
      if (!prev) return prev;

      const newGroups = prev.groups.filter(g => g.id !== groupId);

      // Always keep at least one group
      if (newGroups.length === 0) {
        return {
          ...prev,
          updatedAt: new Date().toISOString(),
          groups: [createEmptyGroup()],
        };
      }

      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        groups: newGroups,
      };
    });
  }, []);

  const setRootOperator = useCallback((operator: FilterOperator) => {
    setActiveFilterState(prev => {
      if (!prev) return prev;

      return {
        ...prev,
        rootOperator: operator,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Sorting Actions
  // ---------------------------------------------------------------------------

  const setSortBy = useCallback((sortBy: SortField | undefined) => {
    setActiveFilterState(prev => {
      if (!prev) return prev;

      return {
        ...prev,
        sortBy,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const setSortOrder = useCallback((sortOrder: SortOrder) => {
    setActiveFilterState(prev => {
      if (!prev) return prev;

      return {
        ...prev,
        sortOrder,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Preset Management
  // ---------------------------------------------------------------------------

  const saveFilter = useCallback(async (name: string) => {
    if (!activeFilter) return;

    // Create filter definition without the id, name, timestamps (those are stored separately)
    const filterDefinition = {
      id: activeFilter.id,
      name: activeFilter.name,
      rootOperator: activeFilter.rootOperator,
      groups: activeFilter.groups,
      createdAt: activeFilter.createdAt,
      updatedAt: activeFilter.updatedAt,
    };

    try {
      await createPreset({
        name,
        type: 'file',
        filterDefinition,
        sortBy: activeFilter.sortBy,
        sortOrder: activeFilter.sortOrder,
      });
    } catch (error) {
      console.error('Failed to save filter:', error);
      throw error;
    }
  }, [activeFilter, createPreset]);

  const loadFilter = useCallback((filterId: string) => {
    const filter = savedFilters.find(f => f.id === filterId);
    if (filter) {
      // Create a copy so edits don't affect the saved version
      setActiveFilterState({
        ...filter,
        id: generateId(),
      });
    }
  }, [savedFilters]);

  const deleteFilter = useCallback(async (filterId: string) => {
    try {
      await deletePresetApi(filterId);
    } catch (error) {
      console.error('Failed to delete filter:', error);
      throw error;
    }
  }, [deletePresetApi]);

  const renameFilter = useCallback(async (filterId: string, newName: string) => {
    try {
      await updatePreset(filterId, { name: newName });
    } catch (error) {
      console.error('Failed to rename filter:', error);
      throw error;
    }
  }, [updatePreset]);

  // ---------------------------------------------------------------------------
  // UI Actions
  // ---------------------------------------------------------------------------

  const toggleFilterPanel = useCallback(() => {
    setIsFilterPanelOpen(prev => !prev);
  }, []);

  const openFilterPanel = useCallback(() => {
    setIsFilterPanelOpen(true);
    if (!activeFilter) {
      setActiveFilterState(createEmptyFilter());
    }
  }, [activeFilter]);

  const closeFilterPanel = useCallback(() => {
    setIsFilterPanelOpen(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Filter Application
  // ---------------------------------------------------------------------------

  const applyFilterToFiles = useCallback(<T extends FilterableFile>(files: T[]): T[] => {
    if (!activeFilter) return files;

    // Check if filter has any non-empty conditions
    const hasConditions = activeFilter.groups.some(group =>
      group.conditions.some(condition =>
        condition.comparison === 'is_empty' ||
        condition.comparison === 'is_not_empty' ||
        condition.value.trim() !== ''
      )
    );

    if (!hasConditions) return files;

    return files.filter(file => evaluateFilter(file, activeFilter));
  }, [activeFilter]);

  // ---------------------------------------------------------------------------
  // Computed state
  // ---------------------------------------------------------------------------

  const isFilterActive = activeFilter !== null && activeFilter.groups.some(group =>
    group.conditions.some(condition =>
      condition.comparison === 'is_empty' ||
      condition.comparison === 'is_not_empty' ||
      condition.value.trim() !== ''
    )
  );

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value: AdvancedFilterContextValue = {
    // State
    activeFilter,
    isFilterActive,
    savedFilters,
    isFilterPanelOpen,

    // Filter actions
    setActiveFilter,
    clearFilter,

    // Condition management
    addCondition,
    updateCondition,
    removeCondition,

    // Group management
    addGroup,
    updateGroupOperator,
    removeGroup,
    setRootOperator,

    // Sorting actions
    setSortBy,
    setSortOrder,

    // Preset management
    saveFilter,
    loadFilter,
    deleteFilter,
    renameFilter,

    // UI actions
    toggleFilterPanel,
    openFilterPanel,
    closeFilterPanel,

    // Filter application
    applyFilterToFiles,
  };

  return (
    <AdvancedFilterContext.Provider value={value}>
      {children}
    </AdvancedFilterContext.Provider>
  );
}
