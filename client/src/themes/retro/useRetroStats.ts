/**
 * useRetroStats Hook
 *
 * Self-contained hook for fetching reading stats for the Retro theme.
 * Keeps the theme independent by handling its own data fetching.
 */

import { useState, useEffect } from 'react';

interface RetroStats {
  score: number;    // Total pages read
  coins: number;    // Comics completed
  isLoading: boolean;
}

const DEFAULT_STATS: RetroStats = {
  score: 0,
  coins: 0,
  isLoading: true,
};

export function useRetroStats(): RetroStats {
  const [stats, setStats] = useState<RetroStats>(DEFAULT_STATS);

  useEffect(() => {
    let isMounted = true;

    async function fetchStats() {
      try {
        const response = await fetch('/api/stats');
        if (!response.ok) throw new Error('Failed to fetch stats');

        const data = await response.json();

        if (isMounted) {
          setStats({
            score: data.pagesRead ?? 0,
            coins: data.filesRead ?? 0,
            isLoading: false,
          });
        }
      } catch (error) {
        // Silently fail - theme will show 0s which is fine
        if (isMounted) {
          setStats({
            score: 0,
            coins: 0,
            isLoading: false,
          });
        }
      }
    }

    fetchStats();

    // Refresh stats periodically (every 5 minutes)
    const interval = setInterval(fetchStats, 5 * 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return stats;
}
