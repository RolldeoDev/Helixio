import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SeriesCard } from '../SeriesCard';
import { SeriesGridItem, Series } from '../../../../services/api/series';

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

// Helper to create mock series item
function createMockSeriesItem(overrides: Partial<SeriesGridItem> = {}): SeriesGridItem {
  // Create minimal mock Series with only fields used by SeriesCard
  const mockSeries = {
    id: 'series-1',
    name: 'Batman',
    startYear: 2020,
    endYear: null,
    publisher: 'DC Comics',
    genres: 'Action',
    coverSource: 'api',
    coverHash: 'abc123',
    coverFileId: null,
    resolvedCoverSource: 'api',
    resolvedCoverHash: 'abc123',
    resolvedCoverFileId: null,
    type: 'western',
    isHidden: false,
  } as Series;

  return {
    itemType: 'series',
    id: 'series-1',
    name: 'Batman',
    startYear: 2020,
    publisher: 'DC Comics',
    genres: 'Action',
    issueCount: 10,
    readCount: 5,
    updatedAt: '2024-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    series: mockSeries,
    ...overrides,
  };
}

const defaultProps = {
  item: createMockSeriesItem(),
  isSelected: false,
  cardSize: 5,
  onSelect: vi.fn(),
  onContextMenu: vi.fn(),
  style: { transform: 'translate3d(0px, 0px, 0)' },
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('SeriesCard', () => {
  it('should render series name', () => {
    render(<SeriesCard {...defaultProps} />, { wrapper });
    expect(screen.getByText('Batman')).toBeInTheDocument();
  });

  it('should render issue count badge', () => {
    render(<SeriesCard {...defaultProps} />, { wrapper });
    expect(screen.getByText('5/10')).toBeInTheDocument();
  });

  it('should render year and publisher in full mode', () => {
    render(<SeriesCard {...defaultProps} />, { wrapper });
    expect(screen.getByText('2020')).toBeInTheDocument();
    expect(screen.getByText('DC Comics')).toBeInTheDocument();
  });

  it('should apply selected class when isSelected is true', () => {
    const { container } = render(
      <SeriesCard {...defaultProps} isSelected={true} />,
      { wrapper }
    );
    expect(container.querySelector('.series-card--selected')).toBeInTheDocument();
  });

  it('should apply compact class when cardSize >= 7', () => {
    const { container } = render(
      <SeriesCard {...defaultProps} cardSize={8} />,
      { wrapper }
    );
    expect(container.querySelector('.series-card--compact')).toBeInTheDocument();
  });

  it('should call onContextMenu on right-click', () => {
    const onContextMenu = vi.fn();
    render(
      <SeriesCard {...defaultProps} onContextMenu={onContextMenu} />,
      { wrapper }
    );

    // Get the card button by its aria-label which includes the series name
    const card = screen.getByRole('button', { name: /batman \(2020\)/i });
    fireEvent.contextMenu(card);

    expect(onContextMenu).toHaveBeenCalledWith('series-1', expect.any(Object));
  });

  it('should call onSelect when Ctrl+click', () => {
    const onSelect = vi.fn();
    render(
      <SeriesCard {...defaultProps} onSelect={onSelect} />,
      { wrapper }
    );

    // Get the card button by its aria-label which includes the series name
    const card = screen.getByRole('button', { name: /batman \(2020\)/i });
    fireEvent.click(card, { ctrlKey: true });

    expect(onSelect).toHaveBeenCalledWith('series-1', expect.any(Object));
  });

  it('should show complete badge when all issues read', () => {
    const item = createMockSeriesItem({ readCount: 10, issueCount: 10 });
    const { container } = render(
      <SeriesCard {...defaultProps} item={item} />,
      { wrapper }
    );

    expect(container.querySelector('.series-card__badge--complete')).toBeInTheDocument();
  });
});
