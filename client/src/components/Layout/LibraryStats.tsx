/**
 * LibraryStats Component
 *
 * Displays library statistics in the sidebar dashboard.
 * Shows total series, comics, and reading progress.
 */

import { useState, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { getSeriesList } from '../../services/api.service';

interface Stats {
  totalSeries: number;
  totalComics: number;
  readPercentage: number;
  recentAdditions: number;
}

export function LibraryStats() {
  const { selectedLibrary } = useApp();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!selectedLibrary) {
        setStats(null);
        return;
      }

      setLoading(true);
      try {
        // Fetch series count
        const seriesResult = await getSeriesList({ limit: 1 });

        setStats({
          totalSeries: seriesResult.pagination?.total || 0,
          totalComics: selectedLibrary.stats?.total || 0,
          readPercentage: 0, // Can be extended when stats endpoint is available
          recentAdditions: 0,
        });
      } catch (err) {
        console.error('Failed to load stats:', err);
        // Set basic stats from library info
        setStats({
          totalSeries: 0,
          totalComics: selectedLibrary.stats?.total || 0,
          readPercentage: 0,
          recentAdditions: 0,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [selectedLibrary]);

  if (!selectedLibrary) {
    return null;
  }

  return (
    <div className="library-stats">
      <button
        className="library-stats-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="library-stats-title">Library Stats</span>
        <span className={`library-stats-chevron ${isExpanded ? '' : 'collapsed'}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className="library-stats-content">
          {loading ? (
            <div className="library-stats-loading">Loading...</div>
          ) : stats ? (
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-value">{stats.totalSeries}</span>
                <span className="stat-label">Series</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats.totalComics}</span>
                <span className="stat-label">Comics</span>
              </div>
              {stats.readPercentage > 0 && (
                <div className="stat-item progress">
                  <span className="stat-value">{stats.readPercentage}%</span>
                  <span className="stat-label">Read</span>
                </div>
              )}
            </div>
          ) : (
            <div className="library-stats-empty">No stats available</div>
          )}
        </div>
      )}
    </div>
  );
}
