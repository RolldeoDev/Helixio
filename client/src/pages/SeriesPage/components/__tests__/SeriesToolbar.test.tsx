import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../../contexts/AuthContext';
import { SmartSeriesFilterProvider } from '../../../../contexts/SmartSeriesFilterContext';
import { SeriesToolbar } from '../SeriesToolbar';
import { SeriesFilterState } from '../../utils/filterUtils';

// Mock the API
vi.mock('../../../../services/api/series', () => ({
  getSeriesPublishers: vi.fn().mockResolvedValue({
    publishers: ['DC Comics', 'Marvel', 'Image'],
  }),
}));

// Helper to create default filters
function createDefaultFilters(overrides: Partial<SeriesFilterState> = {}): SeriesFilterState {
  return {
    search: '',
    publisher: null,
    type: null,
    hasUnread: null,
    showHidden: false,
    libraryId: null,
    sortBy: 'name',
    sortOrder: 'asc',
    presetId: null,
    cardSize: 5,
    ...overrides,
  };
}

const defaultProps = {
  filters: createDefaultFilters(),
  onFilterChange: vi.fn(),
  onClearFilters: vi.fn(),
  onClearPreset: vi.fn(),
  hasActiveFilters: false,
  isUsingPreset: false,
  totalCount: 100,
  isLoading: false,
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    <AuthProvider>
      <SmartSeriesFilterProvider>
        {children}
      </SmartSeriesFilterProvider>
    </AuthProvider>
  </QueryClientProvider>
);

describe('SeriesToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render search input', () => {
    render(<SeriesToolbar {...defaultProps} />, { wrapper });
    expect(screen.getByPlaceholderText('Search series...')).toBeInTheDocument();
  });

  it('should render filter dropdowns', () => {
    render(<SeriesToolbar {...defaultProps} />, { wrapper });
    expect(screen.getByLabelText('Filter by publisher')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by type')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by read status')).toBeInTheDocument();
  });

  it('should render sort controls', () => {
    render(<SeriesToolbar {...defaultProps} />, { wrapper });
    expect(screen.getByLabelText('Sort by')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort ascending')).toBeInTheDocument();
  });

  it('should render card size slider', () => {
    render(<SeriesToolbar {...defaultProps} />, { wrapper });
    expect(screen.getByLabelText('Card size')).toBeInTheDocument();
  });

  it('should render result count', () => {
    render(<SeriesToolbar {...defaultProps} />, { wrapper });
    expect(screen.getByText('100 series')).toBeInTheDocument();
  });

  it('should show loading text when loading', () => {
    render(<SeriesToolbar {...defaultProps} isLoading={true} />, { wrapper });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should debounce search input', async () => {
    const onFilterChange = vi.fn();
    render(
      <SeriesToolbar {...defaultProps} onFilterChange={onFilterChange} />,
      { wrapper }
    );

    const searchInput = screen.getByPlaceholderText('Search series...');
    fireEvent.change(searchInput, { target: { value: 'batman' } });

    // Should not call immediately
    expect(onFilterChange).not.toHaveBeenCalled();

    // Advance timers by debounce delay (300ms)
    vi.advanceTimersByTime(300);

    expect(onFilterChange).toHaveBeenCalledWith('search', 'batman');
  });

  it('should clear search on Escape key', () => {
    const onFilterChange = vi.fn();
    const filters = createDefaultFilters({ search: 'batman' });
    render(
      <SeriesToolbar {...defaultProps} filters={filters} onFilterChange={onFilterChange} />,
      { wrapper }
    );

    const searchInput = screen.getByPlaceholderText('Search series...');
    fireEvent.keyDown(searchInput, { key: 'Escape' });

    expect(onFilterChange).toHaveBeenCalledWith('search', '');
  });

  it('should show active filter chips', () => {
    const filters = createDefaultFilters({
      search: 'batman',
      publisher: 'DC Comics',
      type: 'western',
    });
    const { container } = render(
      <SeriesToolbar {...defaultProps} filters={filters} hasActiveFilters={true} />,
      { wrapper }
    );

    expect(screen.getByText('"batman"')).toBeInTheDocument();
    // Check for chips specifically (not dropdown options)
    const chips = container.querySelectorAll('.series-toolbar__chip');
    expect(chips.length).toBe(3); // search, publisher, type
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('should remove filter chip when clicking remove button', () => {
    const onFilterChange = vi.fn();
    const filters = createDefaultFilters({ publisher: 'DC Comics' });
    render(
      <SeriesToolbar
        {...defaultProps}
        filters={filters}
        onFilterChange={onFilterChange}
        hasActiveFilters={true}
      />,
      { wrapper }
    );

    const removeButton = screen.getByLabelText('Remove DC Comics filter');
    fireEvent.click(removeButton);

    expect(onFilterChange).toHaveBeenCalledWith('publisher', null);
  });

  it('should call onClearFilters when clicking Clear all', () => {
    const onClearFilters = vi.fn();
    const filters = createDefaultFilters({ search: 'batman' });
    render(
      <SeriesToolbar
        {...defaultProps}
        filters={filters}
        onClearFilters={onClearFilters}
        hasActiveFilters={true}
      />,
      { wrapper }
    );

    fireEvent.click(screen.getByText('Clear all'));
    expect(onClearFilters).toHaveBeenCalled();
  });

  it('should show preset bar when using preset', () => {
    render(
      <SeriesToolbar {...defaultProps} isUsingPreset={true} />,
      { wrapper }
    );

    expect(screen.getByText('Using preset')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('should hide filter dropdowns when using preset', () => {
    render(
      <SeriesToolbar {...defaultProps} isUsingPreset={true} />,
      { wrapper }
    );

    expect(screen.queryByLabelText('Filter by publisher')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filter by type')).not.toBeInTheDocument();
  });

  it('should call onClearPreset when clicking Clear button in preset bar', () => {
    const onClearPreset = vi.fn();
    render(
      <SeriesToolbar {...defaultProps} isUsingPreset={true} onClearPreset={onClearPreset} />,
      { wrapper }
    );

    fireEvent.click(screen.getByText('Clear'));
    expect(onClearPreset).toHaveBeenCalled();
  });

  it('should toggle sort order when clicking sort button', () => {
    const onFilterChange = vi.fn();
    render(
      <SeriesToolbar {...defaultProps} onFilterChange={onFilterChange} />,
      { wrapper }
    );

    const sortButton = screen.getByLabelText('Sort ascending');
    fireEvent.click(sortButton);

    expect(onFilterChange).toHaveBeenCalledWith('sortOrder', 'desc');
  });

  it('should update card size when moving slider', () => {
    const onFilterChange = vi.fn();
    render(
      <SeriesToolbar {...defaultProps} onFilterChange={onFilterChange} />,
      { wrapper }
    );

    const slider = screen.getByLabelText('Card size');
    fireEvent.change(slider, { target: { value: '8' } });

    expect(onFilterChange).toHaveBeenCalledWith('cardSize', 8);
  });

  it('should change sort by option', () => {
    const onFilterChange = vi.fn();
    render(
      <SeriesToolbar {...defaultProps} onFilterChange={onFilterChange} />,
      { wrapper }
    );

    const sortSelect = screen.getByLabelText('Sort by');
    fireEvent.change(sortSelect, { target: { value: 'startYear' } });

    expect(onFilterChange).toHaveBeenCalledWith('sortBy', 'startYear');
  });
});
