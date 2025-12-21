import { useState, useEffect, useMemo } from 'react';
import {
  getAllTimeReadingStats,
  getReadingStats,
  getStatsSummary,
  triggerStatsRebuild,
  type AllTimeStats,
  type DailyStats,
  type StatsSummary,
} from '../../services/api.service';
import { StatsHero } from './StatsHero';
import { ActivityHeatmap } from './ActivityHeatmap';
import { CollectionDonut } from './CollectionDonut';
import { EntityInsights } from './EntityInsights';
import { Achievements } from './Achievements';
import { ReadingInsights } from './ReadingInsights';
import './StatsPage.css';

// Helper to get date strings
function getDateRange(daysAgo: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);

  return {
    start: start.toISOString().split('T')[0] ?? '',
    end: end.toISOString().split('T')[0] ?? '',
  };
}

export function StatsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats | null>(null);
  const [yearlyStats, setYearlyStats] = useState<DailyStats[]>([]);
  const [summary, setSummary] = useState<StatsSummary | null>(null);

  // For trend calculation (last 30 days vs previous 30 days)
  const [currentPeriodStats, setCurrentPeriodStats] = useState<DailyStats[]>([]);
  const [previousPeriodStats, setPreviousPeriodStats] = useState<DailyStats[]>([]);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Parallel fetch all data
      const [allTime, summaryData] = await Promise.all([
        getAllTimeReadingStats(),
        getStatsSummary(),
      ]);

      setAllTimeStats(allTime);
      setSummary(summaryData);

      // Fetch yearly stats for heatmap
      const yearRange = getDateRange(365);
      const yearlyData = await getReadingStats(yearRange.start, yearRange.end);
      setYearlyStats(yearlyData.stats);

      // Fetch current and previous 30-day periods for trend calculation
      const currentRange = getDateRange(30);
      const previousStart = new Date();
      previousStart.setDate(previousStart.getDate() - 60);
      const previousEnd = new Date();
      previousEnd.setDate(previousEnd.getDate() - 31);

      const [currentData, previousData] = await Promise.all([
        getReadingStats(currentRange.start, currentRange.end),
        getReadingStats(
          previousStart.toISOString().split('T')[0],
          previousEnd.toISOString().split('T')[0]
        ),
      ]);

      setCurrentPeriodStats(currentData.stats);
      setPreviousPeriodStats(previousData.stats);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setError('Failed to load statistics. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      await triggerStatsRebuild('full');
      // Refetch data after recalculation
      await fetchData();
    } catch (err) {
      console.error('Failed to recalculate stats:', err);
      setError('Failed to recalculate statistics. Please try again.');
    } finally {
      setIsRecalculating(false);
    }
  };

  const aggregatedStats = useMemo(() => {
    if (!summary) return null;
    return {
      totalFiles: summary.totalFiles,
      totalSeries: summary.totalSeries,
      totalPages: summary.totalPages,
      filesRead: summary.filesRead,
      filesInProgress: summary.filesInProgress,
      filesUnread: summary.filesUnread,
      pagesRead: summary.pagesRead,
      readingTime: summary.readingTime,
    };
  }, [summary]);

  if (error) {
    return (
      <div className="stats-page stats-page--error">
        <div className="stats-page__error">
          <h2>Unable to Load Statistics</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stats-page">
      {/* Header with Recalculate Button */}
      <div className="stats-page__header">
        <h1 className="stats-page__title">Statistics</h1>
        <button
          className="stats-page__recalculate-btn"
          onClick={handleRecalculate}
          disabled={isRecalculating || isLoading}
        >
          {isRecalculating ? 'Recalculating...' : 'Recalculate Stats'}
        </button>
      </div>

      {/* Hero Stats */}
      <StatsHero
        allTimeStats={allTimeStats}
        currentPeriodStats={currentPeriodStats}
        previousPeriodStats={previousPeriodStats}
        isLoading={isLoading}
      />

      {/* Activity & Collection Row */}
      <div className="stats-page__row stats-page__row--two-col">
        <ActivityHeatmap dailyStats={yearlyStats} isLoading={isLoading} />
        <CollectionDonut stats={aggregatedStats} isLoading={isLoading} />
      </div>

      {/* Entity Insights */}
      <EntityInsights summary={summary} isLoading={isLoading} />

      {/* Achievements & Reading Insights Row */}
      <div className="stats-page__row stats-page__row--two-col">
        <Achievements allTimeStats={allTimeStats} isLoading={isLoading} />
        <ReadingInsights
          allTimeStats={allTimeStats}
          aggregatedStats={aggregatedStats}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
