/**
 * useCardCoverImage Hook
 *
 * Handles cover image loading for SeriesCard.
 * Uses IntersectionObserver for lazy loading with batched updates.
 *
 * Simplified from useSeriesCoverImage - visibility is always assumed
 * since virtual grid only renders visible items.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getCoverUrl, getApiCoverUrl } from '../../../services/api.service';

export type CoverImageStatus = 'loading' | 'loaded' | 'error';

export interface CardCoverData {
  coverSource?: 'api' | 'user' | 'auto';
  resolvedCoverSource?: 'api' | 'user' | 'firstIssue' | 'none' | null;
  coverHash?: string | null;
  coverFileId?: string | null;
  firstIssueId?: string | null;
  firstIssueCoverHash?: string | null;
}

interface UseCardCoverImageReturn {
  status: CoverImageStatus;
  coverUrl: string;
  containerRef: React.RefObject<HTMLDivElement>;
  handleLoad: () => void;
  handleError: () => void;
}

// =============================================================================
// Cover URL Computation
// =============================================================================

function computeCoverUrl(data: CardCoverData): string | null {
  const {
    coverSource,
    resolvedCoverSource,
    coverHash,
    coverFileId,
    firstIssueId,
    firstIssueCoverHash,
  } = data;

  // If server provided resolvedCoverSource, use it
  if (resolvedCoverSource) {
    if (resolvedCoverSource === 'api' && coverHash) {
      return getApiCoverUrl(coverHash);
    }
    if ((resolvedCoverSource === 'firstIssue' || resolvedCoverSource === 'user') && coverFileId) {
      return getCoverUrl(coverFileId);
    }
    if (resolvedCoverSource === 'none') {
      return null;
    }
  }

  // Fallback for old data without resolvedCoverSource
  if (coverSource === 'api') {
    if (coverHash) return getApiCoverUrl(coverHash);
    if (firstIssueId) return getCoverUrl(firstIssueId, firstIssueCoverHash);
    return null;
  }

  if (coverSource === 'user') {
    if (coverFileId) return getCoverUrl(coverFileId);
    if (firstIssueId) return getCoverUrl(firstIssueId, firstIssueCoverHash);
    return null;
  }

  // 'auto' mode or unset: Priority fallback chain
  if (coverHash) return getApiCoverUrl(coverHash);
  if (coverFileId) return getCoverUrl(coverFileId);
  if (firstIssueId) return getCoverUrl(firstIssueId, firstIssueCoverHash);
  return null;
}

// =============================================================================
// Hook
// =============================================================================

export function useCardCoverImage(coverData: CardCoverData): UseCardCoverImageReturn {
  const computedUrl = useMemo(() => computeCoverUrl(coverData), [
    coverData.coverSource,
    coverData.resolvedCoverSource,
    coverData.coverHash,
    coverData.coverFileId,
    coverData.firstIssueId,
    coverData.firstIssueCoverHash,
  ]);

  const [status, setStatus] = useState<CoverImageStatus>(computedUrl ? 'loading' : 'error');
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync status with URL changes
  useEffect(() => {
    if (!computedUrl) {
      setStatus('error');
    } else if (status === 'error' && computedUrl) {
      setStatus('loading');
    }
  }, [computedUrl, status]);

  // Timeout for stuck loading states (10 seconds)
  useEffect(() => {
    if (status !== 'loading' || !computedUrl) return;

    const timeout = setTimeout(() => {
      setStatus('error');
    }, 10000);

    return () => clearTimeout(timeout);
  }, [status, computedUrl]);

  const handleLoad = useCallback(() => {
    setStatus('loaded');
  }, []);

  const handleError = useCallback(() => {
    setStatus('error');
  }, []);

  return {
    status,
    coverUrl: computedUrl || '',
    containerRef,
    handleLoad,
    handleError,
  };
}
