import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { useUrlSnapshot } from '../useUrlSnapshot';
import { DEFAULT_FILTERS, SeriesFilterState } from '../../utils/filterUtils';
import { ReactNode } from 'react';

// Wrapper for router context
const wrapper = ({ children }: { children: ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('useUrlSnapshot', () => {
  beforeEach(() => {
    // Reset URL before each test
    window.history.replaceState({}, '', '/series');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return default filters when URL has no params', () => {
    const { result } = renderHook(() => useUrlSnapshot(), { wrapper });
    expect(result.current.initialFilters).toEqual(DEFAULT_FILTERS);
  });

  it('should parse filters from URL on init', () => {
    window.history.replaceState({}, '', '/series?search=batman&publisher=DC');

    const { result } = renderHook(() => useUrlSnapshot(), { wrapper });

    expect(result.current.initialFilters.search).toBe('batman');
    expect(result.current.initialFilters.publisher).toBe('DC');
  });

  it('should update URL when filters change', async () => {
    const { result } = renderHook(() => useUrlSnapshot(), { wrapper });

    const newFilters: SeriesFilterState = {
      ...DEFAULT_FILTERS,
      search: 'spider-man',
    };

    act(() => {
      result.current.syncToUrl(newFilters);
    });

    // Wait for debounce
    await waitFor(
      () => {
        expect(window.location.search).toContain('search=spider-man');
      },
      { timeout: 1000 }
    );
  });

  it('should detect preset in URL', () => {
    window.history.replaceState({}, '', '/series?preset=abc123');

    const { result } = renderHook(() => useUrlSnapshot(), { wrapper });

    expect(result.current.initialFilters.presetId).toBe('abc123');
    expect(result.current.hasPresetInUrl).toBe(true);
  });
});
