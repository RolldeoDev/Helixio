import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSeriesFilters } from '../useSeriesFilters';
import { DEFAULT_FILTERS } from '../../utils/filterUtils';

describe('useSeriesFilters', () => {
  it('should initialize with default filters when no initial provided', () => {
    const { result } = renderHook(() => useSeriesFilters());
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
  });

  it('should initialize with provided initial filters', () => {
    const initial = { ...DEFAULT_FILTERS, search: 'batman' };
    const { result } = renderHook(() => useSeriesFilters(initial));
    expect(result.current.filters.search).toBe('batman');
  });

  it('should update single filter with setFilter', () => {
    const { result } = renderHook(() => useSeriesFilters());

    act(() => {
      result.current.setFilter('search', 'spider');
    });

    expect(result.current.filters.search).toBe('spider');
  });

  it('should update multiple filters with setFilters', () => {
    const { result } = renderHook(() => useSeriesFilters());

    act(() => {
      result.current.setFilters({ search: 'batman', publisher: 'DC' });
    });

    expect(result.current.filters.search).toBe('batman');
    expect(result.current.filters.publisher).toBe('DC');
  });

  it('should clear all filters with clearFilters', () => {
    const initial = { ...DEFAULT_FILTERS, search: 'batman', publisher: 'DC' };
    const { result } = renderHook(() => useSeriesFilters(initial));

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
  });

  it('should clear presetId when setting a core filter', () => {
    const initial = { ...DEFAULT_FILTERS, presetId: 'abc123' };
    const { result } = renderHook(() => useSeriesFilters(initial));

    act(() => {
      result.current.setFilter('publisher', 'Marvel');
    });

    expect(result.current.filters.presetId).toBeNull();
    expect(result.current.filters.publisher).toBe('Marvel');
  });

  it('should not clear presetId when changing cardSize', () => {
    const initial = { ...DEFAULT_FILTERS, presetId: 'abc123' };
    const { result } = renderHook(() => useSeriesFilters(initial));

    act(() => {
      result.current.setFilter('cardSize', 8);
    });

    expect(result.current.filters.presetId).toBe('abc123');
    expect(result.current.filters.cardSize).toBe(8);
  });

  it('should set presetId with setPreset', () => {
    const { result } = renderHook(() => useSeriesFilters());

    act(() => {
      result.current.setPreset('xyz789');
    });

    expect(result.current.filters.presetId).toBe('xyz789');
  });

  it('should clear presetId with clearPreset', () => {
    const initial = { ...DEFAULT_FILTERS, presetId: 'abc123' };
    const { result } = renderHook(() => useSeriesFilters(initial));

    act(() => {
      result.current.clearPreset();
    });

    expect(result.current.filters.presetId).toBeNull();
  });

  it('should report hasActiveFilters correctly', () => {
    const { result } = renderHook(() => useSeriesFilters());

    expect(result.current.hasActiveFilters).toBe(false);

    act(() => {
      result.current.setFilter('search', 'batman');
    });

    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('should report isUsingPreset correctly', () => {
    const { result } = renderHook(() => useSeriesFilters());

    expect(result.current.isUsingPreset).toBe(false);

    act(() => {
      result.current.setPreset('abc123');
    });

    expect(result.current.isUsingPreset).toBe(true);
  });
});
