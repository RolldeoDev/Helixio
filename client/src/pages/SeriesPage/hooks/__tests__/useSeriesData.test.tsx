import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSeriesData } from '../useSeriesData';
import { DEFAULT_FILTERS } from '../../utils/filterUtils';
import { ReactNode } from 'react';

// Mock the API
vi.mock('../../../../services/api/series', () => ({
  getUnifiedGridItems: vi.fn().mockResolvedValue({
    items: [
      { itemType: 'series', id: '1', name: 'Batman' },
      { itemType: 'series', id: '2', name: 'Superman' },
    ],
    pagination: { page: 1, limit: 100, total: 2, pages: 1 },
  }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useSeriesData', () => {
  it('should fetch data based on filters', async () => {
    const { result } = renderHook(() => useSeriesData(DEFAULT_FILTERS), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.total).toBe(2);
  });

  it('should provide refetch function', async () => {
    const { result } = renderHook(() => useSeriesData(DEFAULT_FILTERS), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');
  });
});
