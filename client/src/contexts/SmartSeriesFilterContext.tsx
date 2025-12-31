/**
 * Smart Series Filter Context
 *
 * Advanced filtering system for series with AND/OR logic,
 * multiple filter conditions, and saved filter presets.
 *
 * This is a series-specific version of SmartFilterContext, designed
 * for the SeriesBrowserPage.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';

// =============================================================================
// Types
// =============================================================================

export type SeriesFilterOperator = 'AND' | 'OR';

export type SeriesFilterField =
  // String fields
  | 'name'
  | 'publisher'
  | 'type'
  | 'genres'
  | 'tags'
  | 'status'
  | 'ageRating'
  | 'languageISO'
  | 'characters'
  | 'teams'
  | 'locations'
  | 'storyArcs'
  | 'writer'
  | 'penciller'
  | 'colorist'
  | 'letterer'
  // Number fields
  | 'startYear'
  | 'endYear'
  | 'volume'
  | 'totalIssues'
  | 'readIssues'
  | 'unreadIssues'
  | 'externalRating'
  | 'communityRating'
  // Boolean fields
  | 'isFavorite'
  | 'isWantToRead'
  | 'isHidden'
  // Date fields
  | 'createdAt'
  | 'updatedAt'
  | 'lastReadAt';

export type SeriesFilterComparison =
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
  | 'is_true'
  | 'is_false'
  // Date comparisons
  | 'within_days'
  | 'before'
  | 'after';

export type SeriesSortField =
  | 'name'
  | 'publisher'
  | 'startYear'
  | 'totalIssues'
  | 'readIssues'
  | 'createdAt'
  | 'updatedAt'
  | 'lastReadAt'
  | 'externalRating';

export type SeriesSortOrder = 'asc' | 'desc';

export interface SeriesFilterCondition {
  id: string;
  field: SeriesFilterField;
  comparison: SeriesFilterComparison;
  value: string;
  value2?: string; // For 'between' comparison
}

export interface SeriesFilterGroup {
  id: string;
  operator: SeriesFilterOperator;
  conditions: SeriesFilterCondition[];
}

export interface SmartSeriesFilter {
  id: string;
  name: string;
  rootOperator: SeriesFilterOperator;
  groups: SeriesFilterGroup[];
  sortBy?: SeriesSortField;
  sortOrder?: SeriesSortOrder;
  createdAt: string;
  updatedAt: string;
}

/**
 * Series shape for filtering - compatible with Series from api.service
 */
export interface FilterableSeries {
  id: string;
  name: string;
  publisher: string | null;
  type: 'western' | 'manga';
  startYear: number | null;
  endYear: number | null;
  volume: number | null;
  issueCount: number | null;
  genres: string | null;
  tags: string | null;
  ageRating: string | null;
  languageISO: string | null;
  characters: string | null;
  teams: string | null;
  locations: string | null;
  storyArcs: string | null;
  writer: string | null;
  penciller: string | null;
  colorist: string | null;
  letterer: string | null;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
  // Progress fields (optional, from SeriesProgress)
  progress?: {
    totalOwned: number;
    totalRead: number;
    lastReadAt: string | null;
  } | null;
  // Ratings (optional)
  externalRating?: number | null;
  communityRating?: number | null;
  // User flags (optional, from user data)
  isFavorite?: boolean;
  isWantToRead?: boolean;
}

export interface SmartSeriesFilterState {
  activeFilter: SmartSeriesFilter | null;
  isFilterActive: boolean;
  savedFilters: SmartSeriesFilter[];
  isFilterPanelOpen: boolean;
}

export interface SmartSeriesFilterContextValue extends SmartSeriesFilterState {
  // Filter actions
  setActiveFilter: (filter: SmartSeriesFilter | null) => void;
  clearFilter: () => void;

  // Condition management
  addCondition: (groupId: string) => void;
  updateCondition: (groupId: string, conditionId: string, updates: Partial<SeriesFilterCondition>) => void;
  removeCondition: (groupId: string, conditionId: string) => void;

  // Group management
  addGroup: () => void;
  updateGroupOperator: (groupId: string, operator: SeriesFilterOperator) => void;
  removeGroup: (groupId: string) => void;
  setRootOperator: (operator: SeriesFilterOperator) => void;

  // Sorting actions
  setSortBy: (sortBy: SeriesSortField | undefined) => void;
  setSortOrder: (sortOrder: SeriesSortOrder) => void;

  // Preset management (localStorage only for now)
  saveFilter: (name: string) => void;
  loadFilter: (filterId: string) => void;
  deleteFilter: (filterId: string) => void;

  // UI actions
  toggleFilterPanel: () => void;
  openFilterPanel: () => void;
  closeFilterPanel: () => void;

  // Filter application
  applyFilterToSeries: <T extends FilterableSeries>(series: T[]) => T[];
}

// =============================================================================
// Constants
// =============================================================================

export const SERIES_FILTER_FIELDS: { value: SeriesFilterField; label: string; type: 'string' | 'number' | 'date' | 'boolean' }[] = [
  // String fields
  { value: 'name', label: 'Series Name', type: 'string' },
  { value: 'publisher', label: 'Publisher', type: 'string' },
  { value: 'type', label: 'Type (Western/Manga)', type: 'string' },
  { value: 'genres', label: 'Genres', type: 'string' },
  { value: 'tags', label: 'Tags', type: 'string' },
  { value: 'status', label: 'Status', type: 'string' },
  { value: 'ageRating', label: 'Age Rating', type: 'string' },
  { value: 'languageISO', label: 'Language', type: 'string' },
  { value: 'characters', label: 'Characters', type: 'string' },
  { value: 'teams', label: 'Teams', type: 'string' },
  { value: 'locations', label: 'Locations', type: 'string' },
  { value: 'storyArcs', label: 'Story Arcs', type: 'string' },
  { value: 'writer', label: 'Writer', type: 'string' },
  { value: 'penciller', label: 'Artist', type: 'string' },
  { value: 'colorist', label: 'Colorist', type: 'string' },
  { value: 'letterer', label: 'Letterer', type: 'string' },
  // Number fields
  { value: 'startYear', label: 'Start Year', type: 'number' },
  { value: 'endYear', label: 'End Year', type: 'number' },
  { value: 'volume', label: 'Volume', type: 'number' },
  { value: 'totalIssues', label: 'Total Issues', type: 'number' },
  { value: 'readIssues', label: 'Read Issues', type: 'number' },
  { value: 'unreadIssues', label: 'Unread Issues', type: 'number' },
  { value: 'externalRating', label: 'External Rating', type: 'number' },
  { value: 'communityRating', label: 'Community Rating', type: 'number' },
  // Boolean fields
  { value: 'isFavorite', label: 'Is Favorite', type: 'boolean' },
  { value: 'isWantToRead', label: 'Is Want to Read', type: 'boolean' },
  { value: 'isHidden', label: 'Is Hidden', type: 'boolean' },
  // Date fields
  { value: 'createdAt', label: 'Date Added', type: 'date' },
  { value: 'updatedAt', label: 'Last Updated', type: 'date' },
  { value: 'lastReadAt', label: 'Last Read', type: 'date' },
];

export const SERIES_STRING_COMPARISONS: { value: SeriesFilterComparison; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

export const SERIES_NUMBER_COMPARISONS: { value: SeriesFilterComparison; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'between', label: 'between' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

export const SERIES_BOOLEAN_COMPARISONS: { value: SeriesFilterComparison; label: string }[] = [
  { value: 'is_true', label: 'is true' },
  { value: 'is_false', label: 'is false' },
];

export const SERIES_DATE_COMPARISONS: { value: SeriesFilterComparison; label: string }[] = [
  { value: 'within_days', label: 'within last N days' },
  { value: 'before', label: 'before date' },
  { value: 'after', label: 'after date' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

export const SERIES_SORT_FIELDS: { value: SeriesSortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'startYear', label: 'Start Year' },
  { value: 'totalIssues', label: 'Total Issues' },
  { value: 'readIssues', label: 'Read Issues' },
  { value: 'createdAt', label: 'Date Added' },
  { value: 'updatedAt', label: 'Last Updated' },
  { value: 'lastReadAt', label: 'Last Read' },
  { value: 'externalRating', label: 'External Rating' },
];

// =============================================================================
// Helper Functions
// =============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function createEmptyCondition(): SeriesFilterCondition {
  return {
    id: generateId(),
    field: 'name',
    comparison: 'contains',
    value: '',
  };
}

function createEmptyGroup(): SeriesFilterGroup {
  return {
    id: generateId(),
    operator: 'AND',
    conditions: [createEmptyCondition()],
  };
}

function createEmptyFilter(): SmartSeriesFilter {
  return {
    id: generateId(),
    name: 'New Filter',
    rootOperator: 'AND',
    groups: [createEmptyGroup()],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function getFieldValue(series: FilterableSeries, field: SeriesFilterField): string | number | boolean | null {
  switch (field) {
    // Direct string fields
    case 'name':
      return series.name;
    case 'publisher':
      return series.publisher;
    case 'type':
      return series.type;
    case 'genres':
      return series.genres;
    case 'tags':
      return series.tags;
    case 'status':
      return series.tags; // If there's a status field, use it
    case 'ageRating':
      return series.ageRating;
    case 'languageISO':
      return series.languageISO;
    case 'characters':
      return series.characters;
    case 'teams':
      return series.teams;
    case 'locations':
      return series.locations;
    case 'storyArcs':
      return series.storyArcs;
    case 'writer':
      return series.writer;
    case 'penciller':
      return series.penciller;
    case 'colorist':
      return series.colorist;
    case 'letterer':
      return series.letterer;
    // Number fields
    case 'startYear':
      return series.startYear;
    case 'endYear':
      return series.endYear;
    case 'volume':
      return series.volume;
    case 'totalIssues':
      return series.progress?.totalOwned ?? series.issueCount ?? null;
    case 'readIssues':
      return series.progress?.totalRead ?? null;
    case 'unreadIssues': {
      const total = series.progress?.totalOwned ?? series.issueCount ?? 0;
      const read = series.progress?.totalRead ?? 0;
      return total - read;
    }
    case 'externalRating':
      return series.externalRating ?? null;
    case 'communityRating':
      return series.communityRating ?? null;
    // Boolean fields
    case 'isFavorite':
      return series.isFavorite ?? false;
    case 'isWantToRead':
      return series.isWantToRead ?? false;
    case 'isHidden':
      return series.isHidden;
    // Date fields
    case 'createdAt':
      return series.createdAt;
    case 'updatedAt':
      return series.updatedAt;
    case 'lastReadAt':
      return series.progress?.lastReadAt ?? null;
    default:
      return null;
  }
}

function evaluateCondition(
  series: FilterableSeries,
  condition: SeriesFilterCondition
): boolean {
  const fieldValue = getFieldValue(series, condition.field);
  const fieldConfig = SERIES_FILTER_FIELDS.find(f => f.value === condition.field);
  const searchValue = condition.value.toLowerCase();

  // Handle is_empty and is_not_empty
  if (condition.comparison === 'is_empty') {
    return fieldValue === null || fieldValue === '' || fieldValue === undefined;
  }
  if (condition.comparison === 'is_not_empty') {
    return fieldValue !== null && fieldValue !== '' && fieldValue !== undefined;
  }

  // Handle boolean comparisons
  if (fieldConfig?.type === 'boolean') {
    if (condition.comparison === 'is_true') {
      return fieldValue === true;
    }
    if (condition.comparison === 'is_false') {
      return fieldValue === false;
    }
    return false;
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
  series: FilterableSeries,
  group: SeriesFilterGroup
): boolean {
  if (group.conditions.length === 0) return true;

  if (group.operator === 'AND') {
    return group.conditions.every(condition => evaluateCondition(series, condition));
  } else {
    return group.conditions.some(condition => evaluateCondition(series, condition));
  }
}

function evaluateFilter(
  series: FilterableSeries,
  filter: SmartSeriesFilter
): boolean {
  if (filter.groups.length === 0) return true;

  if (filter.rootOperator === 'AND') {
    return filter.groups.every(group => evaluateGroup(series, group));
  } else {
    return filter.groups.some(group => evaluateGroup(series, group));
  }
}

// =============================================================================
// LocalStorage helpers
// =============================================================================

const STORAGE_KEY = 'helixio-series-smart-filters';

function loadSavedFilters(): SmartSeriesFilter[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveSavedFilters(filters: SmartSeriesFilter[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    console.error('Failed to save series filters to localStorage');
  }
}

// =============================================================================
// Context
// =============================================================================

const SmartSeriesFilterContext = createContext<SmartSeriesFilterContextValue | null>(null);

export function useSmartSeriesFilter(): SmartSeriesFilterContextValue {
  const context = useContext(SmartSeriesFilterContext);
  if (!context) {
    throw new Error('useSmartSeriesFilter must be used within SmartSeriesFilterProvider');
  }
  return context;
}

// =============================================================================
// Provider
// =============================================================================

interface SmartSeriesFilterProviderProps {
  children: ReactNode;
}

export function SmartSeriesFilterProvider({ children }: SmartSeriesFilterProviderProps) {
  const [activeFilter, setActiveFilterState] = useState<SmartSeriesFilter | null>(null);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SmartSeriesFilter[]>(() => loadSavedFilters());

  // ---------------------------------------------------------------------------
  // Filter Actions
  // ---------------------------------------------------------------------------

  const setActiveFilter = useCallback((filter: SmartSeriesFilter | null) => {
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

  const updateCondition = useCallback((groupId: string, conditionId: string, updates: Partial<SeriesFilterCondition>) => {
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

  const updateGroupOperator = useCallback((groupId: string, operator: SeriesFilterOperator) => {
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

  const setRootOperator = useCallback((operator: SeriesFilterOperator) => {
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

  const setSortBy = useCallback((sortBy: SeriesSortField | undefined) => {
    setActiveFilterState(prev => {
      if (!prev) return prev;

      return {
        ...prev,
        sortBy,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const setSortOrder = useCallback((sortOrder: SeriesSortOrder) => {
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

  const saveFilter = useCallback((name: string) => {
    if (!activeFilter) return;

    const filterToSave: SmartSeriesFilter = {
      ...activeFilter,
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSavedFilters(prev => {
      const updated = [...prev, filterToSave];
      saveSavedFilters(updated);
      return updated;
    });
  }, [activeFilter]);

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

  const deleteFilter = useCallback((filterId: string) => {
    setSavedFilters(prev => {
      const updated = prev.filter(f => f.id !== filterId);
      saveSavedFilters(updated);
      return updated;
    });
  }, []);

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

  const applyFilterToSeries = useCallback(<T extends FilterableSeries>(series: T[]): T[] => {
    if (!activeFilter) return series;

    // Check if filter has any non-empty conditions
    const hasConditions = activeFilter.groups.some(group =>
      group.conditions.some(condition =>
        condition.comparison === 'is_empty' ||
        condition.comparison === 'is_not_empty' ||
        condition.comparison === 'is_true' ||
        condition.comparison === 'is_false' ||
        condition.value.trim() !== ''
      )
    );

    if (!hasConditions) return series;

    return series.filter(s => evaluateFilter(s, activeFilter));
  }, [activeFilter]);

  // ---------------------------------------------------------------------------
  // Computed state
  // ---------------------------------------------------------------------------

  const isFilterActive = useMemo(() => {
    return activeFilter !== null && activeFilter.groups.some(group =>
      group.conditions.some(condition =>
        condition.comparison === 'is_empty' ||
        condition.comparison === 'is_not_empty' ||
        condition.comparison === 'is_true' ||
        condition.comparison === 'is_false' ||
        condition.value.trim() !== ''
      )
    );
  }, [activeFilter]);

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value: SmartSeriesFilterContextValue = {
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

    // UI actions
    toggleFilterPanel,
    openFilterPanel,
    closeFilterPanel,

    // Filter application
    applyFilterToSeries,
  };

  return (
    <SmartSeriesFilterContext.Provider value={value}>
      {children}
    </SmartSeriesFilterContext.Provider>
  );
}
