import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSeriesPresets } from '../useSeriesPresets';
import { GridItem, Series } from '../../../../services/api/series';

// Mock AdvancedSeriesFilterContext
interface MockFilter {
  id: string;
  name: string;
  groups: Array<{
    id: string;
    operator: 'AND' | 'OR';
    conditions: Array<{ id: string; field: string; operator: string; value: string | number }>;
  }>;
  operator: 'AND' | 'OR';
}

const mockSavedFilters: MockFilter[] = [
  {
    id: 'preset-1',
    name: 'Action Comics',
    groups: [
      {
        id: 'group-1',
        operator: 'AND',
        conditions: [{ id: 'cond-1', field: 'genres', operator: 'contains', value: 'Action' }],
      },
    ],
    operator: 'AND',
  },
  {
    id: 'preset-2',
    name: 'Unread Series',
    groups: [
      {
        id: 'group-2',
        operator: 'AND',
        conditions: [{ id: 'cond-2', field: 'readCount', operator: 'equals', value: 0 }],
      },
    ],
    operator: 'AND',
  },
];

let mockActiveFilter: MockFilter | null = null;
const mockLoadFilter = vi.fn();
const mockClearFilter = vi.fn();
const mockSaveFilter = vi.fn();
const mockDeleteFilter = vi.fn();
// Mock returns the input array unchanged by default (filters nothing)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockApplyFilterToSeries = vi.fn((series: any[]) => series);

vi.mock('../../../../contexts/AdvancedSeriesFilterContext', () => ({
  useAdvancedSeriesFilter: () => ({
    savedFilters: mockSavedFilters,
    activeFilter: mockActiveFilter,
    loadFilter: mockLoadFilter,
    clearFilter: mockClearFilter,
    saveFilter: mockSaveFilter,
    deleteFilter: mockDeleteFilter,
    applyFilterToSeries: mockApplyFilterToSeries,
  }),
}));

// Helper to create mock grid items
function createMockItems(count: number): GridItem[] {
  return Array.from({ length: count }, (_, i) => ({
    itemType: 'series' as const,
    id: `series-${i}`,
    name: `Series ${i}`,
    startYear: 2020,
    publisher: 'Test Publisher',
    genres: i % 2 === 0 ? 'Action' : 'Drama',
    issueCount: 10,
    readCount: i,
    updatedAt: '2024-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    series: {
      id: `series-${i}`,
      genres: i % 2 === 0 ? 'Action' : 'Drama',
    } as Series,
  }));
}

describe('useSeriesPresets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveFilter = null;
  });

  it('should return list of presets', () => {
    const { result } = renderHook(() => useSeriesPresets());

    expect(result.current.presets).toHaveLength(2);
    expect(result.current.presets[0]!.id).toBe('preset-1');
    expect(result.current.presets[0]!.name).toBe('Action Comics');
    expect(result.current.presets[1]!.id).toBe('preset-2');
    expect(result.current.presets[1]!.name).toBe('Unread Series');
  });

  it('should indicate no active preset initially', () => {
    const { result } = renderHook(() => useSeriesPresets());

    expect(result.current.activePresetId).toBeNull();
    expect(result.current.hasActivePreset).toBe(false);
  });

  it('should indicate active preset when one is loaded', () => {
    mockActiveFilter = mockSavedFilters[0]!;

    const { result } = renderHook(() => useSeriesPresets());

    expect(result.current.activePresetId).toBe('preset-1');
    expect(result.current.hasActivePreset).toBe(true);
    expect(result.current.presets[0]!.isActive).toBe(true);
    expect(result.current.presets[1]!.isActive).toBe(false);
  });

  it('should call loadFilter when loadPreset is called', () => {
    const { result } = renderHook(() => useSeriesPresets());

    act(() => {
      result.current.loadPreset('preset-2');
    });

    expect(mockLoadFilter).toHaveBeenCalledWith('preset-2');
  });

  it('should call clearFilter when clearPreset is called', () => {
    mockActiveFilter = mockSavedFilters[0]!;

    const { result } = renderHook(() => useSeriesPresets());

    act(() => {
      result.current.clearPreset();
    });

    expect(mockClearFilter).toHaveBeenCalled();
  });

  it('should call saveFilter when saveAsPreset is called', () => {
    const { result } = renderHook(() => useSeriesPresets());

    act(() => {
      result.current.saveAsPreset('My New Preset');
    });

    expect(mockSaveFilter).toHaveBeenCalledWith('My New Preset');
  });

  it('should call deleteFilter when deletePreset is called', () => {
    const { result } = renderHook(() => useSeriesPresets());

    act(() => {
      result.current.deletePreset('preset-1');
    });

    expect(mockDeleteFilter).toHaveBeenCalledWith('preset-1');
  });

  it('should return isAdvancedFilterActive false when no filter is active', () => {
    const { result } = renderHook(() => useSeriesPresets());

    expect(result.current.isAdvancedFilterActive).toBe(false);
  });

  it('should return isAdvancedFilterActive true when filter has conditions', () => {
    mockActiveFilter = mockSavedFilters[0]!;

    const { result } = renderHook(() => useSeriesPresets());

    expect(result.current.isAdvancedFilterActive).toBe(true);
  });

  it('should return isAdvancedFilterActive false when filter has no conditions', () => {
    mockActiveFilter = {
      id: 'empty-preset',
      name: 'Empty',
      groups: [{ id: 'group', operator: 'AND' as const, conditions: [] }],
      operator: 'AND' as const,
    };

    const { result } = renderHook(() => useSeriesPresets());

    expect(result.current.isAdvancedFilterActive).toBe(false);
  });

  it('should pass items through when no preset is active', () => {
    const items = createMockItems(5);
    const { result } = renderHook(() => useSeriesPresets());

    const filtered = result.current.applyPresetFilter(items);

    expect(filtered).toHaveLength(5);
    expect(mockApplyFilterToSeries).not.toHaveBeenCalled();
  });

  it('should apply filter to series items when preset is active', () => {
    mockActiveFilter = mockSavedFilters[0]!;
    // Mock filter that only keeps series with 'Action' in genres
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockApplyFilterToSeries.mockImplementation((series: any[]) => {
      return series.filter((s) => s.genres?.includes('Action') ?? false);
    });

    const items = createMockItems(5);
    const { result } = renderHook(() => useSeriesPresets());

    const filtered = result.current.applyPresetFilter(items);

    // Items 0, 2, 4 have 'Action' genre
    expect(filtered).toHaveLength(3);
    expect(filtered[0]?.id).toBe('series-0');
    expect(filtered[1]?.id).toBe('series-2');
    expect(filtered[2]?.id).toBe('series-4');
  });

  it('should keep non-series items when filtering', () => {
    mockActiveFilter = mockSavedFilters[0]!;
    // Filter out all series
    mockApplyFilterToSeries.mockReturnValue([]);

    const items: GridItem[] = [
      ...createMockItems(2),
      {
        itemType: 'collection',
        id: 'collection-1',
        name: 'My Collection',
        startYear: null,
        publisher: null,
        genres: null,
        issueCount: 10,
        readCount: 5,
        updatedAt: '2024-01-01',
        createdAt: '2024-01-01',
        collection: {} as any,
      },
    ];

    const { result } = renderHook(() => useSeriesPresets());

    const filtered = result.current.applyPresetFilter(items);

    // Series items filtered out, collection kept
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('collection-1');
  });
});
