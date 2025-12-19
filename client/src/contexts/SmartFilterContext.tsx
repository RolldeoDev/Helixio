/**
 * Smart Filter Context
 *
 * Advanced filtering system for the library with AND/OR logic,
 * multiple filter conditions, and saved filter presets.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';

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
  | 'path';

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
  | 'between';

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

export interface SmartFilter {
  id: string;
  name: string;
  rootOperator: FilterOperator;
  groups: FilterGroup[];
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
  } | null;
}

export interface SmartFilterState {
  // Current filter being edited/applied
  activeFilter: SmartFilter | null;
  isFilterActive: boolean;

  // Saved presets
  savedFilters: SmartFilter[];

  // UI state
  isFilterPanelOpen: boolean;
}

export interface SmartFilterContextValue extends SmartFilterState {
  // Filter actions
  setActiveFilter: (filter: SmartFilter | null) => void;
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

  // Preset management
  saveFilter: (name: string) => void;
  loadFilter: (filterId: string) => void;
  deleteFilter: (filterId: string) => void;
  renameFilter: (filterId: string, newName: string) => void;

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

export const FILTER_FIELDS: { value: FilterField; label: string; type: 'string' | 'number' }[] = [
  { value: 'filename', label: 'Filename', type: 'string' },
  { value: 'series', label: 'Series', type: 'string' },
  { value: 'title', label: 'Title', type: 'string' },
  { value: 'number', label: 'Issue Number', type: 'string' },
  { value: 'volume', label: 'Volume', type: 'number' },
  { value: 'year', label: 'Year', type: 'number' },
  { value: 'publisher', label: 'Publisher', type: 'string' },
  { value: 'writer', label: 'Writer', type: 'string' },
  { value: 'penciller', label: 'Artist', type: 'string' },
  { value: 'genre', label: 'Genre', type: 'string' },
  { value: 'characters', label: 'Characters', type: 'string' },
  { value: 'teams', label: 'Teams', type: 'string' },
  { value: 'locations', label: 'Locations', type: 'string' },
  { value: 'storyArc', label: 'Story Arc', type: 'string' },
  { value: 'status', label: 'File Status', type: 'string' },
  { value: 'path', label: 'File Path', type: 'string' },
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

const STORAGE_KEY = 'helixio-smart-filters';

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

function createEmptyFilter(): SmartFilter {
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
    case 'filename':
      return file.filename;
    case 'path':
      return file.relativePath;
    case 'status':
      return file.status;
    case 'series':
      return (file.metadata?.series as string) ?? null;
    case 'title':
      return (file.metadata?.title as string) ?? null;
    case 'number':
      return (file.metadata?.number as string) ?? null;
    case 'volume':
      return (file.metadata?.volume as number) ?? null;
    case 'year':
      return (file.metadata?.year as number) ?? null;
    case 'publisher':
      return (file.metadata?.publisher as string) ?? null;
    case 'writer':
      return (file.metadata?.writer as string) ?? null;
    case 'penciller':
      return (file.metadata?.penciller as string) ?? null;
    case 'genre':
      return (file.metadata?.genre as string) ?? null;
    case 'characters':
      return (file.metadata?.characters as string) ?? null;
    case 'teams':
      return (file.metadata?.teams as string) ?? null;
    case 'locations':
      return (file.metadata?.locations as string) ?? null;
    case 'storyArc':
      return (file.metadata?.storyArc as string) ?? null;
    default:
      return null;
  }
}

function evaluateCondition(
  file: FilterableFile,
  condition: FilterCondition
): boolean {
  const fieldValue = getFieldValue(file, condition.field);
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
  filter: SmartFilter
): boolean {
  if (filter.groups.length === 0) return true;

  if (filter.rootOperator === 'AND') {
    return filter.groups.every(group => evaluateGroup(file, group));
  } else {
    return filter.groups.some(group => evaluateGroup(file, group));
  }
}

// =============================================================================
// Context
// =============================================================================

const SmartFilterContext = createContext<SmartFilterContextValue | null>(null);

export function useSmartFilter(): SmartFilterContextValue {
  const context = useContext(SmartFilterContext);
  if (!context) {
    throw new Error('useSmartFilter must be used within SmartFilterProvider');
  }
  return context;
}

// =============================================================================
// Provider
// =============================================================================

interface SmartFilterProviderProps {
  children: ReactNode;
}

export function SmartFilterProvider({ children }: SmartFilterProviderProps) {
  // Load saved filters from localStorage
  const [savedFilters, setSavedFilters] = useState<SmartFilter[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore parse errors
    }
    return [];
  });

  const [activeFilter, setActiveFilterState] = useState<SmartFilter | null>(null);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Save filters to localStorage when they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedFilters));
  }, [savedFilters]);

  // ---------------------------------------------------------------------------
  // Filter Actions
  // ---------------------------------------------------------------------------

  const setActiveFilter = useCallback((filter: SmartFilter | null) => {
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
  // Preset Management
  // ---------------------------------------------------------------------------

  const saveFilter = useCallback((name: string) => {
    if (!activeFilter) return;

    const savedFilter: SmartFilter = {
      ...activeFilter,
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSavedFilters(prev => [...prev, savedFilter]);
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
    setSavedFilters(prev => prev.filter(f => f.id !== filterId));
  }, []);

  const renameFilter = useCallback((filterId: string, newName: string) => {
    setSavedFilters(prev => prev.map(f =>
      f.id === filterId
        ? { ...f, name: newName, updatedAt: new Date().toISOString() }
        : f
    ));
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

  const value: SmartFilterContextValue = {
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
    <SmartFilterContext.Provider value={value}>
      {children}
    </SmartFilterContext.Provider>
  );
}
