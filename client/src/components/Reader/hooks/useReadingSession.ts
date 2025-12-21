/**
 * useReadingSession Hook
 *
 * Manages reading session lifecycle and tracks pages that have been
 * viewed for at least 3 seconds. This ensures accurate "pages read"
 * statistics by not counting pages that were quickly skipped.
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  startReadingSession,
  updateReadingSession,
  endReadingSession,
} from '../../../services/api.service';

// Time in milliseconds a page must be viewed to count as "read"
const PAGE_READ_THRESHOLD_MS = 3000;

interface UseReadingSessionOptions {
  fileId: string;
  currentPage: number;
  totalPages: number;
  isLoading: boolean;
}

interface UseReadingSessionReturn {
  confirmedPagesRead: number;
}

export function useReadingSession({
  fileId,
  currentPage,
  totalPages,
  isLoading,
}: UseReadingSessionOptions): UseReadingSessionReturn {
  const sessionIdRef = useRef<string | null>(null);
  const confirmedPagesRef = useRef<Set<number>>(new Set());
  const pageStartTimeRef = useRef<number>(0);
  const currentPageRef = useRef<number>(currentPage);
  const pageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirmPageRead = useCallback((page: number) => {
    if (!confirmedPagesRef.current.has(page)) {
      confirmedPagesRef.current.add(page);

      if (sessionIdRef.current) {
        // Pass the confirmed pages count to the backend
        updateReadingSession(
          sessionIdRef.current,
          page,
          confirmedPagesRef.current.size
        ).catch((err) => {
          console.error('Failed to update reading session:', err);
        });
      }
    }
  }, []);

  const startPageTimer = useCallback((page: number) => {
    if (pageTimerRef.current) {
      clearTimeout(pageTimerRef.current);
      pageTimerRef.current = null;
    }

    pageStartTimeRef.current = Date.now();
    currentPageRef.current = page;

    pageTimerRef.current = setTimeout(() => {
      confirmPageRead(page);
    }, PAGE_READ_THRESHOLD_MS);
  }, [confirmPageRead]);

  // Handle page changes
  useEffect(() => {
    if (isLoading) return;

    const prevPage = currentPageRef.current;
    const timeOnPrevPage = Date.now() - pageStartTimeRef.current;

    if (timeOnPrevPage >= PAGE_READ_THRESHOLD_MS && pageStartTimeRef.current > 0) {
      confirmPageRead(prevPage);
    }

    startPageTimer(currentPage);

    return () => {
      if (pageTimerRef.current) {
        clearTimeout(pageTimerRef.current);
      }
    };
  }, [currentPage, isLoading, confirmPageRead, startPageTimer]);

  // Start session when component mounts
  useEffect(() => {
    if (isLoading || !fileId) return;

    let mounted = true;

    const initSession = async () => {
      try {
        const response = await startReadingSession(fileId, currentPage);
        if (mounted) {
          sessionIdRef.current = response.sessionId;
          startPageTimer(currentPage);
        }
      } catch (err) {
        console.error('Failed to start reading session:', err);
      }
    };

    initSession();

    return () => {
      mounted = false;

      const timeOnCurrentPage = Date.now() - pageStartTimeRef.current;
      if (timeOnCurrentPage >= PAGE_READ_THRESHOLD_MS && pageStartTimeRef.current > 0) {
        confirmedPagesRef.current.add(currentPageRef.current);
      }

      if (pageTimerRef.current) {
        clearTimeout(pageTimerRef.current);
      }

      if (sessionIdRef.current) {
        const sessionId = sessionIdRef.current;
        const endPage = currentPageRef.current;
        const completed = endPage >= totalPages - 1 && confirmedPagesRef.current.has(endPage);
        const confirmedCount = confirmedPagesRef.current.size;

        endReadingSession(sessionId, endPage, completed, confirmedCount).catch((err) => {
          console.error('Failed to end reading session:', err);
        });
      }
    };
  }, [fileId, isLoading, totalPages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const timeOnPage = Date.now() - pageStartTimeRef.current;
        if (timeOnPage >= PAGE_READ_THRESHOLD_MS && pageStartTimeRef.current > 0) {
          confirmPageRead(currentPageRef.current);
        }

        if (pageTimerRef.current) {
          clearTimeout(pageTimerRef.current);
          pageTimerRef.current = null;
        }
      } else {
        startPageTimer(currentPageRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [confirmPageRead, startPageTimer]);

  // Handle beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionIdRef.current) {
        // Check if current page should be counted before closing
        const timeOnPage = Date.now() - pageStartTimeRef.current;
        if (timeOnPage >= PAGE_READ_THRESHOLD_MS && pageStartTimeRef.current > 0) {
          confirmedPagesRef.current.add(currentPageRef.current);
        }

        const data = JSON.stringify({
          endPage: currentPageRef.current,
          completed: false,
          confirmedPagesRead: confirmedPagesRef.current.size,
        });

        navigator.sendBeacon(
          `/api/reading-history/session/${sessionIdRef.current}/end`,
          new Blob([data], { type: 'application/json' })
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return {
    confirmedPagesRead: confirmedPagesRef.current.size,
  };
}
