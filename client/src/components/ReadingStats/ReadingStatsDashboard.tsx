/**
 * Reading Statistics Dashboard
 *
 * Displays comprehensive reading statistics including:
 * - Daily/weekly/monthly reading stats
 * - Pages read, time spent, comics completed
 * - Visual charts and graphs
 * - Reading streaks/achievements
 * - Entity stats (creators, genres, characters, publishers)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAllTimeReadingStats,
  getReadingStats,
  getStatsSummary,
  getEntityStats,
  DailyStats,
  AllTimeStats,
  StatsSummary,
  EntityStatResult,
  EntityType,
} from '../../services/api.service';
import './ReadingStats.css';

// =============================================================================
// Types
// =============================================================================

type TimeRange = '7days' | '30days' | '90days' | 'year' | 'all';
type StatsTab = 'overview' | 'creators' | 'genres' | 'characters' | 'publishers';

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
// Entity Stats Components
// =============================================================================

interface EntityListProps {
  entities: EntityStatResult[];
  title: string;
  sortBy: 'owned' | 'read' | 'time';
  onSortChange: (sort: 'owned' | 'read' | 'time') => void;
  isLoading: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onEntityClick?: (entity: EntityStatResult) => void;
}

function EntityList({
  entities,
  title,
  sortBy,
  onSortChange,
  isLoading,
  onLoadMore,
  hasMore,
  onEntityClick,
}: EntityListProps) {
  return (
    <div className="entity-list-section">
      <div className="entity-list-header">
        <h3>{title}</h3>
        <div className="entity-sort-buttons">
          <button
            className={sortBy === 'owned' ? 'active' : ''}
            onClick={() => onSortChange('owned')}
          >
            Owned
          </button>
          <button
            className={sortBy === 'read' ? 'active' : ''}
            onClick={() => onSortChange('read')}
          >
            Read
          </button>
          <button
            className={sortBy === 'time' ? 'active' : ''}
            onClick={() => onSortChange('time')}
          >
            Time
          </button>
        </div>
      </div>

      {isLoading && entities.length === 0 ? (
        <div className="entity-list-loading">
          <div className="stats-spinner" />
        </div>
      ) : entities.length === 0 ? (
        <div className="entity-list-empty">
          <p>No data available yet</p>
        </div>
      ) : (
        <>
          <div className="entity-list">
            {entities.map((entity, index) => (
              <div
                key={`${entity.entityName}-${entity.entityRole || 'none'}-${index}`}
                className="entity-item"
                onClick={() => onEntityClick?.(entity)}
              >
                <div className="entity-rank">{index + 1}</div>
                <div className="entity-info">
                  <span className="entity-name">
                    {entity.entityName}
                    {entity.entityRole && (
                      <span className="entity-role">({entity.entityRole})</span>
                    )}
                  </span>
                  <div className="entity-stats">
                    <span className="entity-stat">
                      {entity.ownedComics} owned
                    </span>
                    <span className="entity-stat">
                      {entity.readComics} read ({entity.readPercentage}%)
                    </span>
                    {entity.readTime > 0 && (
                      <span className="entity-stat">
                        {formatDuration(entity.readTime)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="entity-progress-bar">
                  <div
                    className="entity-progress-fill"
                    style={{ width: `${entity.readPercentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <button
              className="entity-load-more"
              onClick={onLoadMore}
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : 'Load More'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

interface TopEntitiesGridProps {
  summary: StatsSummary | null;
  onEntityClick?: (type: EntityType, entity: EntityStatResult) => void;
}

function TopEntitiesGrid({ summary, onEntityClick }: TopEntitiesGridProps) {
  if (!summary) return null;

  const sections: { title: string; type: EntityType; items: EntityStatResult[] }[] = [
    { title: 'Top Creators', type: 'creator', items: summary.topCreators },
    { title: 'Top Genres', type: 'genre', items: summary.topGenres },
    { title: 'Top Characters', type: 'character', items: summary.topCharacters },
    { title: 'Top Publishers', type: 'publisher', items: summary.topPublishers },
  ];

  return (
    <div className="top-entities-grid">
      {sections.map(({ title, type, items }) => (
        <div key={type} className="top-entities-section">
          <h4>{title}</h4>
          {items.length === 0 ? (
            <p className="no-data">No data yet</p>
          ) : (
            <ul className="top-entities-list">
              {items.slice(0, 5).map((entity, index) => (
                <li
                  key={`${entity.entityName}-${entity.entityRole || ''}-${index}`}
                  onClick={() => onEntityClick?.(type, entity)}
                >
                  <span className="rank">{index + 1}</span>
                  <span className="name">
                    {entity.entityName}
                    {entity.entityRole && <small> ({entity.entityRole})</small>}
                  </span>
                  <span className="count">{entity.readComics} read</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ReadingStatsDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<StatsTab>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [statsSummary, setStatsSummary] = useState<StatsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Entity tab state
  const [entitySort, setEntitySort] = useState<'owned' | 'read' | 'time'>('read');
  const [entityData, setEntityData] = useState<EntityStatResult[]>([]);
  const [entityTotal, setEntityTotal] = useState(0);
  const [entityLoading, setEntityLoading] = useState(false);
  const [entityOffset, setEntityOffset] = useState(0);
  const ENTITY_PAGE_SIZE = 20;

  const fetchOverviewStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [allTime, daily, summary] = await Promise.all([
        getAllTimeReadingStats(),
        getReadingStats(
          getDateRange(timeRange).start,
          getDateRange(timeRange).end
        ),
        getStatsSummary(),
      ]);

      setAllTimeStats(allTime);
      setDailyStats(daily.stats);
      setStatsSummary(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setIsLoading(false);
    }
  }, [timeRange]);

  const fetchEntityStats = useCallback(async (reset = true) => {
    if (activeTab === 'overview') return;

    const entityType = activeTab as EntityType;
    setEntityLoading(true);

    try {
      const offset = reset ? 0 : entityOffset;
      const result = await getEntityStats({
        entityType,
        sortBy: entitySort,
        limit: ENTITY_PAGE_SIZE,
        offset,
      });

      if (reset) {
        setEntityData(result.items);
        setEntityOffset(ENTITY_PAGE_SIZE);
      } else {
        setEntityData(prev => [...prev, ...result.items]);
        setEntityOffset(prev => prev + ENTITY_PAGE_SIZE);
      }
      setEntityTotal(result.total);
    } catch (err) {
      console.error('Failed to load entity stats:', err);
    } finally {
      setEntityLoading(false);
    }
  }, [activeTab, entitySort, entityOffset]);

  useEffect(() => {
    fetchOverviewStats();
  }, [fetchOverviewStats]);

  useEffect(() => {
    if (activeTab !== 'overview') {
      setEntityData([]);
      setEntityOffset(0);
      fetchEntityStats(true);
    }
  }, [activeTab, entitySort]);

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

  const handleLoadMore = () => {
    fetchEntityStats(false);
  };

  const handleEntityClick = (entity: EntityStatResult) => {
    // Map tab to entity type
    const entityType = activeTab === 'creators' ? 'creator'
      : activeTab === 'genres' ? 'genre'
      : activeTab === 'characters' ? 'character'
      : 'publisher';

    // Build query params
    const params = new URLSearchParams();
    if (entity.entityRole) params.set('role', entity.entityRole);
    const query = params.toString();

    // Navigate to entity detail page
    navigate(`/stats/${entityType}/${encodeURIComponent(entity.entityName)}${query ? `?${query}` : ''}`);
  };

  const handleTopEntityClick = (type: EntityType, entity: EntityStatResult) => {
    const params = new URLSearchParams();
    if (entity.entityRole) params.set('role', entity.entityRole);
    const query = params.toString();
    navigate(`/stats/${type}/${encodeURIComponent(entity.entityName)}${query ? `?${query}` : ''}`);
  };

  if (isLoading && activeTab === 'overview') {
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
          <button onClick={fetchOverviewStats}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stats-dashboard">
      {/* Header with Tabs */}
      <div className="stats-header">
        <h2>Reading Statistics</h2>
        <div className="stats-tabs">
          <button
            className={activeTab === 'overview' ? 'active' : ''}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={activeTab === 'creators' ? 'active' : ''}
            onClick={() => setActiveTab('creators')}
          >
            Creators
          </button>
          <button
            className={activeTab === 'genres' ? 'active' : ''}
            onClick={() => setActiveTab('genres')}
          >
            Genres
          </button>
          <button
            className={activeTab === 'characters' ? 'active' : ''}
            onClick={() => setActiveTab('characters')}
          >
            Characters
          </button>
          <button
            className={activeTab === 'publishers' ? 'active' : ''}
            onClick={() => setActiveTab('publishers')}
          >
            Publishers
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* Time Range Selector */}
          <div className="stats-time-range-row">
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

          {/* Top Entities Grid */}
          <TopEntitiesGrid
            summary={statsSummary}
            onEntityClick={handleTopEntityClick}
          />

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
        </>
      ) : (
        /* Entity Tab Content */
        <EntityList
          entities={entityData}
          title={
            activeTab === 'creators' ? 'Creators' :
            activeTab === 'genres' ? 'Genres' :
            activeTab === 'characters' ? 'Characters' :
            'Publishers'
          }
          sortBy={entitySort}
          onSortChange={setEntitySort}
          isLoading={entityLoading}
          onLoadMore={handleLoadMore}
          hasMore={entityData.length < entityTotal}
          onEntityClick={handleEntityClick}
        />
      )}
    </div>
  );
}
