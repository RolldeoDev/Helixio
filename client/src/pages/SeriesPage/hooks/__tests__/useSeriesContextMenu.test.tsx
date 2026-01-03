import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { useSeriesContextMenu } from '../useSeriesContextMenu';
import { GridItem, Series } from '../../../../services/api/series';

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock useBulkActions
const mockBulkActions = {
  isLoading: false,
  markAsRead: vi.fn(),
  markAsUnread: vi.fn(),
  addToFavorites: vi.fn(),
  removeFromFavorites: vi.fn(),
  addToWantToRead: vi.fn(),
  removeFromWantToRead: vi.fn(),
  hideSeries: vi.fn(),
  unhideSeries: vi.fn(),
  fetchMetadata: vi.fn(),
};

vi.mock('../useBulkActions', () => ({
  useBulkActions: () => mockBulkActions,
}));

// Mock ToastContext
vi.mock('../../../../contexts/ToastContext', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

// Mock CollectionsContext
vi.mock('../../../../contexts/CollectionsContext', () => ({
  useCollections: () => ({
    toggleFavorite: vi.fn(),
    toggleWantToRead: vi.fn(),
    isFavorite: () => false,
    isWantToRead: () => false,
  }),
}));

// Mock MetadataJobContext
vi.mock('../../../../contexts/MetadataJobContext', () => ({
  useMetadataJob: () => ({
    startJob: vi.fn(),
  }),
}));

// Mock AuthContext
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: 'test-user', name: 'Test User' },
  }),
}));

// Mock AchievementContext
vi.mock('../../../../contexts/AchievementContext', () => ({
  useAchievement: () => ({
    achievements: [],
    checkAchievements: vi.fn(),
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
    series: {
      id: `series-${i}`,
      isHidden: i === 1, // series-1 is hidden
    } as Series,
  }));
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('useSeriesContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with closed menu', () => {
    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5) }),
      { wrapper }
    );

    expect(result.current.menuState.isOpen).toBe(false);
    expect(result.current.menuState.context).toBeNull();
  });

  it('should open menu on context menu event', () => {
    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5) }),
      { wrapper }
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(
        mockEvent,
        'series-0',
        new Set(['series-0']),
        undefined
      );
    });

    expect(result.current.menuState.isOpen).toBe(true);
    expect(result.current.menuState.context?.entityId).toBe('series-0');
    expect(result.current.menuState.context?.selectedIds).toContain('series-0');
  });

  it('should close menu', () => {
    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5) }),
      { wrapper }
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(
        mockEvent,
        'series-0',
        new Set(['series-0']),
        undefined
      );
    });

    expect(result.current.menuState.isOpen).toBe(true);

    act(() => {
      result.current.closeMenu();
    });

    expect(result.current.menuState.isOpen).toBe(false);
  });

  it('should navigate to series on viewSeries action', async () => {
    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5) }),
      { wrapper }
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(
        mockEvent,
        'series-0',
        new Set(['series-0']),
        undefined
      );
    });

    await act(async () => {
      result.current.handleAction('viewSeries');
    });

    expect(mockNavigate).toHaveBeenCalledWith('/series/series-0');
  });

  it('should call markAsRead on markAllRead action', async () => {
    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5) }),
      { wrapper }
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(
        mockEvent,
        'series-0',
        new Set(['series-0', 'series-2']),
        undefined
      );
    });

    await act(async () => {
      result.current.handleAction('markAllRead');
    });

    expect(mockBulkActions.markAsRead).toHaveBeenCalledWith(['series-0', 'series-2']);
  });

  it('should call markAsUnread on markAllUnread action', async () => {
    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5) }),
      { wrapper }
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(
        mockEvent,
        'series-0',
        new Set(['series-0']),
        undefined
      );
    });

    await act(async () => {
      result.current.handleAction('markAllUnread');
    });

    expect(mockBulkActions.markAsUnread).toHaveBeenCalledWith(['series-0']);
  });

  it('should call hideSeries on hideSeries action', async () => {
    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5) }),
      { wrapper }
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(
        mockEvent,
        'series-0',
        new Set(['series-0']),
        undefined
      );
    });

    await act(async () => {
      result.current.handleAction('hideSeries');
    });

    expect(mockBulkActions.hideSeries).toHaveBeenCalledWith(['series-0']);
  });

  it('should call unhideSeries on unhideSeries action', async () => {
    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5) }),
      { wrapper }
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(
        mockEvent,
        'series-1', // This one is hidden
        new Set(['series-1']),
        undefined
      );
    });

    await act(async () => {
      result.current.handleAction('unhideSeries');
    });

    expect(mockBulkActions.unhideSeries).toHaveBeenCalledWith(['series-1']);
  });

  it('should call fetchMetadata on fetchSeriesMetadata action', async () => {
    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5) }),
      { wrapper }
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(
        mockEvent,
        'series-0',
        new Set(['series-0', 'series-2', 'series-3']),
        undefined
      );
    });

    await act(async () => {
      result.current.handleAction('fetchSeriesMetadata');
    });

    expect(mockBulkActions.fetchMetadata).toHaveBeenCalledWith([
      'series-0',
      'series-2',
      'series-3',
    ]);
  });

  it('should call onMerge callback on mergeWith action with multiple selected', async () => {
    const mockOnMerge = vi.fn();
    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5), onMerge: mockOnMerge }),
      { wrapper }
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    // With multiple series selected
    act(() => {
      result.current.handleContextMenu(
        mockEvent,
        'series-0',
        new Set(['series-0', 'series-1']),
        undefined
      );
    });

    await act(async () => {
      result.current.handleAction('mergeWith');
    });

    expect(mockOnMerge).toHaveBeenCalledWith(['series-0', 'series-1']);
  });

  it('should call onMerge callback with single entity when only one selected', async () => {
    const mockOnMerge = vi.fn();
    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5), onMerge: mockOnMerge }),
      { wrapper }
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(
        mockEvent,
        'series-0',
        new Set(['series-0']),
        undefined
      );
    });

    await act(async () => {
      result.current.handleAction('mergeWith');
    });

    expect(mockOnMerge).toHaveBeenCalledWith(['series-0']);
  });

  it('should not throw when onMerge is not provided', async () => {
    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5) }),
      { wrapper }
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(
        mockEvent,
        'series-0',
        new Set(['series-0', 'series-1']),
        undefined
      );
    });

    // Should not throw when onMerge is not provided
    await act(async () => {
      result.current.handleAction('mergeWith');
    });

    // Verify no navigation happened since we're not using navigate anymore for merge
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should return menu items via getMenuItems', () => {
    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5) }),
      { wrapper }
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(
        mockEvent,
        'series-0',
        new Set(['series-0']),
        undefined
      );
    });

    const items = result.current.getMenuItems();
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => item.id === 'viewSeries')).toBe(true);
    expect(items.some((item) => item.id === 'markAllRead')).toBe(true);
  });

  it('should expose isLoading from bulk actions', () => {
    mockBulkActions.isLoading = true;

    const { result } = renderHook(
      () => useSeriesContextMenu({ items: createMockItems(5) }),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(true);

    mockBulkActions.isLoading = false;
  });
});
