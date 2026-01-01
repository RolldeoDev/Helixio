import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SeriesVirtualGrid } from '../SeriesVirtualGrid';
import { SeriesGridItem, Series } from '../../../../services/api/series';

// Mock the hooks
vi.mock('../../hooks/useStableGridLayout', () => ({
  useStableGridLayout: () => ({
    columns: 5,
    itemWidth: 200,
    itemHeight: 360,
    gap: 16,
    containerWidth: 1200,
    getTotalHeight: (count: number) => Math.ceil(count / 5) * 376,
    getItemPosition: (index: number) => ({
      x: (index % 5) * 216,
      y: Math.floor(index / 5) * 376,
    }),
  }),
}));

vi.mock('../../hooks/useVirtualWindow', () => ({
  useVirtualWindow: (_containerRef: unknown, items: SeriesGridItem[]) => ({
    visibleItems: items.slice(0, 10).map((item, index) => ({
      data: item,
      index,
      style: {
        position: 'absolute' as const,
        width: 200,
        height: 360,
        transform: `translate3d(${(index % 5) * 216}px, ${Math.floor(index / 5) * 376}px, 0)`,
      },
    })),
    totalHeight: Math.ceil(items.length / 5) * 376,
    visibleRange: { start: 0, end: Math.min(10, items.length) },
    renderRange: { start: 0, end: Math.min(10, items.length) },
    scrollToIndex: vi.fn(),
  }),
}));

// Mock the cover image hook
vi.mock('../useCardCoverImage', () => ({
  useCardCoverImage: () => ({
    status: 'loaded',
    coverUrl: '/test-cover.jpg',
    containerRef: { current: null },
    handleLoad: vi.fn(),
    handleError: vi.fn(),
  }),
}));

// Helper to create mock series items
function createMockSeriesItems(count: number): SeriesGridItem[] {
  return Array.from({ length: count }, (_, i) => {
    // Create minimal mock Series with only fields used by the grid
    const mockSeries = {
      id: `series-${i}`,
      name: `Series ${i}`,
      startYear: 2020 + i,
      endYear: null,
      publisher: 'Test Publisher',
      genres: 'Action',
      coverSource: 'api',
      coverHash: `hash-${i}`,
      coverFileId: null,
      resolvedCoverSource: 'api',
      resolvedCoverHash: `hash-${i}`,
      resolvedCoverFileId: null,
      type: 'western',
      isHidden: false,
    } as Series;

    return {
      itemType: 'series' as const,
      id: `series-${i}`,
      name: `Series ${i}`,
      startYear: 2020 + i,
      publisher: 'Test Publisher',
      genres: 'Action',
      issueCount: 10,
      readCount: 5,
      updatedAt: '2024-01-01T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
      series: mockSeries,
    };
  });
}

const defaultProps = {
  items: createMockSeriesItems(20),
  cardSize: 5,
  isFetching: false,
  isLoading: false,
  selectedIds: new Set<string>(),
  onSelect: vi.fn(),
  onContextMenu: vi.fn(),
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('SeriesVirtualGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render series items', () => {
    render(<SeriesVirtualGrid {...defaultProps} />, { wrapper });
    // Should render visible items (mocked to 10)
    expect(screen.getByText('Series 0')).toBeInTheDocument();
    expect(screen.getByText('Series 9')).toBeInTheDocument();
  });

  it('should show loading skeleton when isLoading and no items', () => {
    const { container } = render(
      <SeriesVirtualGrid {...defaultProps} items={[]} isLoading={true} />,
      { wrapper }
    );
    expect(container.querySelector('.series-virtual-grid--loading')).toBeInTheDocument();
    expect(container.querySelectorAll('.series-virtual-grid__skeleton-card').length).toBe(12);
  });

  it('should show empty state when no items and not loading', () => {
    render(
      <SeriesVirtualGrid {...defaultProps} items={[]} isLoading={false} />,
      { wrapper }
    );
    expect(screen.getByText('No series found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters or search terms')).toBeInTheDocument();
  });

  it('should show fetching overlay when isFetching', () => {
    const { container } = render(
      <SeriesVirtualGrid {...defaultProps} isFetching={true} />,
      { wrapper }
    );
    expect(container.querySelector('.series-virtual-grid__fetching-overlay')).toBeInTheDocument();
    expect(container.querySelector('.series-virtual-grid--fetching')).toBeInTheDocument();
  });

  it('should mark selected items', () => {
    const selectedIds = new Set(['series-0', 'series-2']);
    const { container } = render(
      <SeriesVirtualGrid {...defaultProps} selectedIds={selectedIds} />,
      { wrapper }
    );
    const selectedCards = container.querySelectorAll('.series-card--selected');
    expect(selectedCards.length).toBe(2);
  });

  it('should still show items when fetching (dimmed)', () => {
    render(
      <SeriesVirtualGrid {...defaultProps} isFetching={true} />,
      { wrapper }
    );
    // Items should still be visible
    expect(screen.getByText('Series 0')).toBeInTheDocument();
  });
});
