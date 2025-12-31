/**
 * useSeriesData Hook
 *
 * Manages series data fetching and state for SeriesDetailPage.
 * Handles series info, issues, relationships, and similar series.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getSeries,
  getSeriesIssues,
  getNextSeriesIssue,
  getSeriesRelationships,
  getSimilarSeries,
  type Series,
  type SeriesIssue,
  type RelatedSeriesInfo,
  type SimilarSeriesEntry,
} from '../services/api.service';
import { useMetadataJob } from '../contexts/MetadataJobContext';

export interface UseSeriesDataOptions {
  /** The series ID to fetch data for */
  seriesId: string | undefined;
}

export interface RelatedSeriesWithParentFlag extends RelatedSeriesInfo {
  isParent: boolean;
}

export interface UseSeriesDataResult {
  /** The series data */
  series: Series | null;
  /** The list of issues in the series */
  issues: SeriesIssue[];
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Next issue to read */
  nextIssue: { id: string; filename: string } | null;
  /** Parent series relationships */
  parentSeries: RelatedSeriesInfo[];
  /** Child series relationships */
  childSeries: RelatedSeriesInfo[];
  /** Combined related series with parent flag */
  allRelatedSeries: RelatedSeriesWithParentFlag[];
  /** Similar series from recommendation engine */
  similarSeries: SimilarSeriesEntry[];
  /** Loading state for similar series */
  similarSeriesLoading: boolean;
  /** Error state for similar series */
  similarSeriesError: boolean;
  /** Description expansion state */
  isDescriptionExpanded: boolean;
  /** Whether description needs truncation */
  descriptionNeedsTruncation: boolean;
  /** Ref for description element */
  descriptionRef: React.RefObject<HTMLDivElement>;
  /** Toggle description expansion */
  toggleDescriptionExpanded: () => void;
  /** Refetch series data */
  refetch: () => Promise<void>;
  /** Fetch similar series (lazy loading) */
  fetchSimilarSeries: () => Promise<void>;
  /** Force refetch similar series (resets fetched flag) */
  refetchSimilarSeries: () => Promise<void>;
  /** Set parent series (for optimistic updates) */
  setParentSeries: React.Dispatch<React.SetStateAction<RelatedSeriesInfo[]>>;
  /** Set child series (for optimistic updates) */
  setChildSeries: React.Dispatch<React.SetStateAction<RelatedSeriesInfo[]>>;
}

/**
 * Hook for fetching and managing series data.
 *
 * Features:
 * - Fetches series, issues, relationships in parallel
 * - Lazy loads similar series on demand
 * - Auto-refreshes on metadata job completion
 * - Handles description truncation detection
 */
export function useSeriesData({
  seriesId,
}: UseSeriesDataOptions): UseSeriesDataResult {
  const { lastCompletedJobAt } = useMetadataJob();

  // Core data state
  const [series, setSeries] = useState<Series | null>(null);
  const [issues, setIssues] = useState<SeriesIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextIssue, setNextIssue] = useState<{ id: string; filename: string } | null>(null);

  // Related series state
  const [parentSeries, setParentSeries] = useState<RelatedSeriesInfo[]>([]);
  const [childSeries, setChildSeries] = useState<RelatedSeriesInfo[]>([]);

  // Similar series state (lazy loaded)
  const [similarSeries, setSimilarSeries] = useState<SimilarSeriesEntry[]>([]);
  const [similarSeriesLoading, setSimilarSeriesLoading] = useState(false);
  const [similarSeriesError, setSimilarSeriesError] = useState(false);
  const similarFetchedRef = useRef(false);

  // Description state
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [descriptionNeedsTruncation, setDescriptionNeedsTruncation] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  // Combined related series with parent flag
  const allRelatedSeries = useMemo(() => {
    const parentsWithFlag = parentSeries.map(p => ({ ...p, isParent: true as const }));
    const childrenWithFlag = childSeries.map(c => ({ ...c, isParent: false as const }));
    return [...parentsWithFlag, ...childrenWithFlag];
  }, [parentSeries, childSeries]);

  // Toggle description expansion
  const toggleDescriptionExpanded = useCallback(() => {
    setIsDescriptionExpanded(prev => !prev);
  }, []);

  // Fetch series data
  const fetchSeriesData = useCallback(async () => {
    if (!seriesId) return;

    setLoading(true);
    setError(null);

    try {
      const [seriesResult, issuesResult, nextResult, relationshipsResult] = await Promise.all([
        getSeries(seriesId),
        getSeriesIssues(seriesId, { all: true, sortBy: 'number', sortOrder: 'asc' }),
        getNextSeriesIssue(seriesId),
        getSeriesRelationships(seriesId),
      ]);

      setSeries(seriesResult.series);
      setIssues(issuesResult.issues);
      setParentSeries(relationshipsResult.parents);
      setChildSeries(relationshipsResult.children);

      if (nextResult.nextIssue) {
        setNextIssue({
          id: nextResult.nextIssue.id,
          filename: nextResult.nextIssue.filename,
        });
      } else {
        setNextIssue(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load series');
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  // Fetch similar series (lazy loading)
  const fetchSimilarSeries = useCallback(async () => {
    if (!seriesId || similarFetchedRef.current) return;

    similarFetchedRef.current = true;
    setSimilarSeriesLoading(true);
    setSimilarSeriesError(false);

    try {
      const result = await getSimilarSeries(seriesId, 12);
      setSimilarSeries(result.similar);
    } catch (err) {
      console.error('Failed to fetch similar series:', err);
      setSimilarSeriesError(true);
    } finally {
      setSimilarSeriesLoading(false);
    }
  }, [seriesId]);

  // Force refetch similar series (resets fetched flag)
  const refetchSimilarSeries = useCallback(async () => {
    if (!seriesId) return;

    similarFetchedRef.current = false;
    await fetchSimilarSeries();
  }, [seriesId, fetchSimilarSeries]);

  // Fetch series data on mount and when seriesId changes
  useEffect(() => {
    fetchSeriesData();
  }, [fetchSeriesData]);

  // Reset similar series state when seriesId changes
  useEffect(() => {
    similarFetchedRef.current = false;
    setSimilarSeries([]);
    setSimilarSeriesError(false);
  }, [seriesId]);

  // Refresh series data when a metadata job completes
  useEffect(() => {
    if (lastCompletedJobAt) {
      fetchSeriesData();
    }
  }, [lastCompletedJobAt, fetchSeriesData]);

  // Check if description needs truncation
  useEffect(() => {
    if (descriptionRef.current) {
      const lineHeight = parseFloat(getComputedStyle(descriptionRef.current).lineHeight);
      const maxHeight = lineHeight * 6; // 6 lines for compact view
      setDescriptionNeedsTruncation(descriptionRef.current.scrollHeight > maxHeight + 2);
    }
  }, [series?.summary, series?.deck]);

  return {
    series,
    issues,
    loading,
    error,
    nextIssue,
    parentSeries,
    childSeries,
    allRelatedSeries,
    similarSeries,
    similarSeriesLoading,
    similarSeriesError,
    isDescriptionExpanded,
    descriptionNeedsTruncation,
    descriptionRef,
    toggleDescriptionExpanded,
    refetch: fetchSeriesData,
    fetchSimilarSeries,
    refetchSimilarSeries,
    setParentSeries,
    setChildSeries,
  };
}
