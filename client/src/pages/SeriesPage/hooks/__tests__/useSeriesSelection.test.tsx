import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSeriesSelection } from '../useSeriesSelection';
import { GridItem, Series } from '../../../../services/api/series';

// Mock AppContext
const mockSelectSeries = vi.fn();
const mockSelectSeriesRange = vi.fn();
const mockSelectAllSeries = vi.fn();
const mockClearSeriesSelection = vi.fn();
let mockSelectedSeries = new Set<string>();

vi.mock('../../../../contexts/AppContext', () => ({
  useApp: () => ({
    selectedSeries: mockSelectedSeries,
    selectSeries: mockSelectSeries,
    selectSeriesRange: mockSelectSeriesRange,
    selectAllSeries: mockSelectAllSeries,
    clearSeriesSelection: mockClearSeriesSelection,
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
    genres: 'Action',
    issueCount: 10,
    readCount: 5,
    updatedAt: '2024-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    series: { id: `series-${i}` } as Series,
  }));
}

describe('useSeriesSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedSeries = new Set<string>();
  });

  it('should return selection state from context', () => {
    mockSelectedSeries = new Set(['series-1', 'series-2']);

    const { result } = renderHook(() =>
      useSeriesSelection({ items: createMockItems(5) })
    );

    expect(result.current.selectedIds).toBe(mockSelectedSeries);
    expect(result.current.selectedCount).toBe(2);
    expect(result.current.hasSelection).toBe(true);
  });

  it('should return hasSelection false when nothing selected', () => {
    const { result } = renderHook(() =>
      useSeriesSelection({ items: createMockItems(5) })
    );

    expect(result.current.hasSelection).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });

  it('should handle regular click - clear others and select one', () => {
    const items = createMockItems(5);
    const { result } = renderHook(() => useSeriesSelection({ items }));

    const mockEvent = {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    } as React.MouseEvent;

    act(() => {
      result.current.handleSelect('series-2', mockEvent);
    });

    expect(mockClearSeriesSelection).toHaveBeenCalled();
    expect(mockSelectSeries).toHaveBeenCalledWith('series-2', true);
  });

  it('should handle Ctrl+click - toggle selection', () => {
    mockSelectedSeries = new Set(['series-1']);
    const items = createMockItems(5);
    const { result } = renderHook(() => useSeriesSelection({ items }));

    const mockEvent = {
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    } as React.MouseEvent;

    // Click on unselected item - should add
    act(() => {
      result.current.handleSelect('series-2', mockEvent);
    });

    expect(mockClearSeriesSelection).not.toHaveBeenCalled();
    expect(mockSelectSeries).toHaveBeenCalledWith('series-2', true);
  });

  it('should handle Cmd+click (Mac) - toggle selection', () => {
    const items = createMockItems(5);
    const { result } = renderHook(() => useSeriesSelection({ items }));

    const mockEvent = {
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
    } as React.MouseEvent;

    act(() => {
      result.current.handleSelect('series-3', mockEvent);
    });

    expect(mockClearSeriesSelection).not.toHaveBeenCalled();
    expect(mockSelectSeries).toHaveBeenCalledWith('series-3', true);
  });

  it('should handle Shift+click - range selection', () => {
    const items = createMockItems(5);
    const { result } = renderHook(() => useSeriesSelection({ items }));

    // First click to set last selected
    const regularClick = {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    } as React.MouseEvent;

    act(() => {
      result.current.handleSelect('series-1', regularClick);
    });

    // Shift+click to select range
    const shiftClick = {
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
    } as React.MouseEvent;

    act(() => {
      result.current.handleSelect('series-4', shiftClick);
    });

    expect(mockSelectSeriesRange).toHaveBeenCalledWith(
      ['series-0', 'series-1', 'series-2', 'series-3', 'series-4'],
      'series-1',
      'series-4'
    );
  });

  it('should select all series in current list', () => {
    const items = createMockItems(5);
    const { result } = renderHook(() => useSeriesSelection({ items }));

    act(() => {
      result.current.selectAll();
    });

    expect(mockSelectAllSeries).toHaveBeenCalledWith([
      'series-0',
      'series-1',
      'series-2',
      'series-3',
      'series-4',
    ]);
  });

  it('should clear selection', () => {
    mockSelectedSeries = new Set(['series-1', 'series-2']);
    const items = createMockItems(5);
    const { result } = renderHook(() => useSeriesSelection({ items }));

    act(() => {
      result.current.clearSelection();
    });

    expect(mockClearSeriesSelection).toHaveBeenCalled();
  });

  it('should toggle selection for a single item', () => {
    mockSelectedSeries = new Set(['series-1']);
    const items = createMockItems(5);
    const { result } = renderHook(() => useSeriesSelection({ items }));

    // Toggle off (already selected)
    act(() => {
      result.current.toggleSelection('series-1');
    });

    expect(mockSelectSeries).toHaveBeenCalledWith('series-1', false);

    // Toggle on (not selected)
    vi.clearAllMocks();
    act(() => {
      result.current.toggleSelection('series-2');
    });

    expect(mockSelectSeries).toHaveBeenCalledWith('series-2', true);
  });

  it('should return array of selected IDs', () => {
    mockSelectedSeries = new Set(['series-1', 'series-3']);
    const items = createMockItems(5);
    const { result } = renderHook(() => useSeriesSelection({ items }));

    const ids = result.current.getSelectedIds();

    expect(ids).toContain('series-1');
    expect(ids).toContain('series-3');
    expect(ids.length).toBe(2);
  });

  it('should only include series items (not collections) in range selection', () => {
    // Mix of series and collection items
    const items: GridItem[] = [
      {
        itemType: 'series',
        id: 'series-0',
        name: 'Series 0',
        startYear: 2020,
        publisher: 'Test',
        genres: null,
        issueCount: 10,
        readCount: 5,
        updatedAt: '2024-01-01',
        createdAt: '2024-01-01',
        series: { id: 'series-0' } as Series,
      },
      {
        itemType: 'collection',
        id: 'collection-1',
        name: 'Collection 1',
        startYear: 2020,
        publisher: null,
        genres: null,
        issueCount: 20,
        readCount: 10,
        updatedAt: '2024-01-01',
        createdAt: '2024-01-01',
        collection: {} as any,
      },
      {
        itemType: 'series',
        id: 'series-2',
        name: 'Series 2',
        startYear: 2021,
        publisher: 'Test',
        genres: null,
        issueCount: 15,
        readCount: 8,
        updatedAt: '2024-01-01',
        createdAt: '2024-01-01',
        series: { id: 'series-2' } as Series,
      },
    ];

    const { result } = renderHook(() => useSeriesSelection({ items }));

    act(() => {
      result.current.selectAll();
    });

    // Should only include series IDs, not collection
    expect(mockSelectAllSeries).toHaveBeenCalledWith(['series-0', 'series-2']);
  });
});
