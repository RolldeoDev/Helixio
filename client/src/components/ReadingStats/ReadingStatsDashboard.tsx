/**
 * Reading Statistics Dashboard
 *
 * Displays comprehensive reading statistics including:
 * - Daily/weekly/monthly reading stats
 * - Pages read, time spent, comics completed
 * - Visual charts and graphs
 * - Reading streaks/achievements
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getAllTimeReadingStats,
  getReadingStats,
  DailyStats,
  AllTimeStats,
} from '../../services/api.service';
import './ReadingStats.css';

// =============================================================================
// Types
// =============================================================================

type TimeRange = '7days' | '30days' | '90days' | 'year' | 'all';

interface ChartData {
  label: string;
  value: number;
  secondary?: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (hours < 24) return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function getDateRange(range: TimeRange): { start: string; end: string } {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case '7days':
      start.setDate(end.getDate() - 7);
      break;
    case '30days':
      start.setDate(end.getDate() - 30);
      break;
    case '90days':
      start.setDate(end.getDate() - 90);
      break;
    case 'year':
      start.setFullYear(end.getFullYear() - 1);
      break;
    case 'all':
      start.setFullYear(end.getFullYear() - 10);
      break;
  }

  return {
    start: start.toISOString().split('T')[0]!,
    end: end.toISOString().split('T')[0]!,
  };
}

function formatDateLabel(dateStr: string, range: TimeRange): string {
  const date = new Date(dateStr);
  if (range === '7days') {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }
  if (range === '30days' || range === '90days') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// =============================================================================
// Chart Components
// =============================================================================

interface BarChartProps {
  data: ChartData[];
  maxValue?: number;
  height?: number;
  color?: string;
  secondaryColor?: string;
  showLabels?: boolean;
}

function BarChart({
  data,
  maxValue,
  height = 120,
  color = 'var(--accent-color)',
  secondaryColor = 'var(--success-color)',
  showLabels = true,
}: BarChartProps) {
  const max = maxValue ?? Math.max(...data.map(d => Math.max(d.value, d.secondary ?? 0)), 1);

  return (
    <div className="stats-bar-chart" style={{ height }}>
      <div className="bar-chart-bars">
        {data.map((item, index) => (
          <div key={index} className="bar-chart-column">
            <div className="bar-chart-bar-group">
              <div
                className="bar-chart-bar primary"
                style={{
                  height: `${(item.value / max) * 100}%`,
                  backgroundColor: color,
                }}
                title={`${item.label}: ${item.value}`}
              />
              {item.secondary !== undefined && (
                <div
                  className="bar-chart-bar secondary"
                  style={{
                    height: `${(item.secondary / max) * 100}%`,
                    backgroundColor: secondaryColor,
                  }}
                  title={`${item.label}: ${item.secondary}`}
                />
              )}
            </div>
            {showLabels && (
              <span className="bar-chart-label">{item.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
}

function StatCard({ icon, label, value, subValue, color }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-icon" style={{ color }}>
        {icon}
      </div>
      <div className="stat-card-content">
        <span className="stat-card-value">{value}</span>
        <span className="stat-card-label">{label}</span>
        {subValue && <span className="stat-card-sub">{subValue}</span>}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ReadingStatsDashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [allTime, daily] = await Promise.all([
        getAllTimeReadingStats(),
        getReadingStats(
          getDateRange(timeRange).start,
          getDateRange(timeRange).end
        ),
      ]);

      setAllTimeStats(allTime);
      setDailyStats(daily.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setIsLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Calculate period totals
  const periodStats = useMemo(() => {
    if (dailyStats.length === 0) {
      return { comicsStarted: 0, comicsCompleted: 0, pagesRead: 0, totalDuration: 0 };
    }

    return dailyStats.reduce(
      (acc, day) => ({
        comicsStarted: acc.comicsStarted + day.comicsStarted,
        comicsCompleted: acc.comicsCompleted + day.comicsCompleted,
        pagesRead: acc.pagesRead + day.pagesRead,
        totalDuration: acc.totalDuration + day.totalDuration,
      }),
      { comicsStarted: 0, comicsCompleted: 0, pagesRead: 0, totalDuration: 0 }
    );
  }, [dailyStats]);

  // Prepare chart data
  const chartData = useMemo((): ChartData[] => {
    // Sample data if we have too many points
    let sampled = [...dailyStats];
    if (timeRange === '90days' && sampled.length > 30) {
      // Group by week
      const grouped: Record<string, DailyStats> = {};
      sampled.forEach(day => {
        const weekStart = new Date(day.date);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const key = weekStart.toISOString().split('T')[0]!;
        if (!grouped[key]) {
          grouped[key] = { ...day };
        } else {
          grouped[key]!.pagesRead += day.pagesRead;
          grouped[key]!.comicsCompleted += day.comicsCompleted;
          grouped[key]!.totalDuration += day.totalDuration;
        }
      });
      sampled = Object.values(grouped);
    } else if (timeRange === 'year' && sampled.length > 30) {
      // Group by month
      const grouped: Record<string, DailyStats> = {};
      sampled.forEach(day => {
        const key = day.date.substring(0, 7);
        if (!grouped[key]) {
          grouped[key] = { ...day };
        } else {
          grouped[key]!.pagesRead += day.pagesRead;
          grouped[key]!.comicsCompleted += day.comicsCompleted;
          grouped[key]!.totalDuration += day.totalDuration;
        }
      });
      sampled = Object.values(grouped);
    }

    return sampled.map(day => ({
      label: formatDateLabel(day.date, timeRange),
      value: day.pagesRead,
      secondary: day.comicsCompleted * 20, // Scale for visibility
    }));
  }, [dailyStats, timeRange]);

  if (isLoading) {
    return (
      <div className="stats-dashboard loading">
        <div className="stats-loading">
          <div className="stats-spinner" />
          <p>Loading reading statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stats-dashboard error">
        <div className="stats-error">
          <h3>Failed to load statistics</h3>
          <p>{error}</p>
          <button onClick={fetchStats}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stats-dashboard">
      {/* Header */}
      <div className="stats-header">
        <h2>Reading Statistics</h2>
        <div className="stats-time-range">
          <button
            className={timeRange === '7days' ? 'active' : ''}
            onClick={() => setTimeRange('7days')}
          >
            7 Days
          </button>
          <button
            className={timeRange === '30days' ? 'active' : ''}
            onClick={() => setTimeRange('30days')}
          >
            30 Days
          </button>
          <button
            className={timeRange === '90days' ? 'active' : ''}
            onClick={() => setTimeRange('90days')}
          >
            90 Days
          </button>
          <button
            className={timeRange === 'year' ? 'active' : ''}
            onClick={() => setTimeRange('year')}
          >
            Year
          </button>
        </div>
      </div>

      {/* Period Summary Cards */}
      <div className="stats-summary">
        <StatCard
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          }
          label="Pages Read"
          value={formatNumber(periodStats.pagesRead)}
          subValue={`${(periodStats.pagesRead / (timeRange === '7days' ? 7 : timeRange === '30days' ? 30 : timeRange === '90days' ? 90 : 365)).toFixed(1)} per day avg`}
          color="var(--accent-color)"
        />
        <StatCard
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          label="Time Reading"
          value={formatDuration(periodStats.totalDuration)}
          subValue={`${formatDuration(Math.round(periodStats.totalDuration / Math.max(1, periodStats.comicsStarted)))} per comic avg`}
          color="var(--warning-color)"
        />
        <StatCard
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
          label="Comics Completed"
          value={periodStats.comicsCompleted}
          subValue={`${periodStats.comicsStarted} started`}
          color="var(--success-color)"
        />
      </div>

      {/* Chart */}
      <div className="stats-chart-section">
        <h3>Reading Activity</h3>
        <div className="stats-chart-legend">
          <span className="legend-item">
            <span className="legend-color" style={{ backgroundColor: 'var(--accent-color)' }} />
            Pages Read
          </span>
          <span className="legend-item">
            <span className="legend-color" style={{ backgroundColor: 'var(--success-color)' }} />
            Comics Completed
          </span>
        </div>
        {chartData.length > 0 ? (
          <BarChart data={chartData} height={160} />
        ) : (
          <div className="stats-chart-empty">
            <p>No reading activity in this period</p>
          </div>
        )}
      </div>

      {/* All-Time Stats */}
      {allTimeStats && (
        <div className="stats-all-time">
          <h3>All-Time Statistics</h3>
          <div className="stats-all-time-grid">
            <div className="all-time-stat">
              <span className="all-time-value">{formatNumber(allTimeStats.totalComicsRead)}</span>
              <span className="all-time-label">Comics Read</span>
            </div>
            <div className="all-time-stat">
              <span className="all-time-value">{formatNumber(allTimeStats.totalPagesRead)}</span>
              <span className="all-time-label">Total Pages</span>
            </div>
            <div className="all-time-stat">
              <span className="all-time-value">{formatDuration(allTimeStats.totalReadingTime)}</span>
              <span className="all-time-label">Total Time</span>
            </div>
            <div className="all-time-stat">
              <span className="all-time-value">{formatDuration(allTimeStats.averageSessionDuration)}</span>
              <span className="all-time-label">Avg Session</span>
            </div>
          </div>

          {/* Streaks */}
          <div className="stats-streaks">
            <div className="streak-card">
              <div className="streak-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <div className="streak-info">
                <span className="streak-value">{allTimeStats.currentStreak} days</span>
                <span className="streak-label">Current Streak</span>
              </div>
            </div>
            <div className="streak-card best">
              <div className="streak-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <div className="streak-info">
                <span className="streak-value">{allTimeStats.longestStreak} days</span>
                <span className="streak-label">Best Streak</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
