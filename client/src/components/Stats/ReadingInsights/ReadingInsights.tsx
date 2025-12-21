import type { AllTimeStats, AggregatedStats } from '../../../services/api.service';
import './ReadingInsights.css';

interface ReadingInsightsProps {
  allTimeStats: AllTimeStats | null;
  aggregatedStats: AggregatedStats | null;
  isLoading: boolean;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

export function ReadingInsights({
  allTimeStats,
  aggregatedStats,
  isLoading,
}: ReadingInsightsProps) {
  if (isLoading) {
    return (
      <div className="reading-insights reading-insights--loading">
        <div className="reading-insights__header">
          <h3 className="reading-insights__title">Reading Insights</h3>
        </div>
        <div className="reading-insights__skeleton" />
      </div>
    );
  }

  const stats = allTimeStats ?? {
    totalComicsRead: 0,
    totalPagesRead: 0,
    totalReadingTime: 0,
    averageSessionDuration: 0,
    longestSession: 0,
    currentStreak: 0,
    longestStreak: 0,
  };

  const agg = aggregatedStats ?? {
    totalFiles: 0,
    filesRead: 0,
    filesInProgress: 0,
    filesUnread: 0,
    totalPages: 0,
    pagesRead: 0,
  };

  // Calculate derived stats
  const avgPagesPerSession =
    stats.totalComicsRead > 0
      ? Math.round(stats.totalPagesRead / stats.totalComicsRead)
      : 0;

  const completionRate =
    agg.totalFiles > 0
      ? Math.round((agg.filesRead / agg.totalFiles) * 100)
      : 0;

  const avgReadingSpeed =
    stats.totalReadingTime > 0 && stats.totalPagesRead > 0
      ? Math.round(stats.totalReadingTime / 60 / stats.totalPagesRead * 10) / 10
      : 0;

  const insights = [
    {
      id: 'avg-session',
      label: 'Avg. Session',
      value: formatDuration(stats.averageSessionDuration),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      description: 'Average time per reading session',
    },
    {
      id: 'pages-per-comic',
      label: 'Pages/Comic',
      value: avgPagesPerSession.toString(),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
      description: 'Average pages per completed comic',
    },
    {
      id: 'completion-rate',
      label: 'Completion',
      value: `${completionRate}%`,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      description: 'Percentage of collection completed',
    },
    {
      id: 'longest-session',
      label: 'Longest Session',
      value: formatDuration(stats.longestSession),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m3.044-1.35a6.726 6.726 0 01-2.749 1.35m0 0v2.672m3.044-4.022c1.513-1.238 2.48-3.12 2.48-5.228V4.236m0 0a50.23 50.23 0 012.916.52 6.003 6.003 0 01-5.395 4.972" />
        </svg>
      ),
      description: 'Your longest single reading session',
    },
    {
      id: 'reading-pace',
      label: 'Reading Pace',
      value: avgReadingSpeed > 0 ? `${avgReadingSpeed}m/page` : '-',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      ),
      description: 'Average minutes per page',
    },
    {
      id: 'total-series',
      label: 'Series',
      value: (agg as AggregatedStats & { totalSeries?: number }).totalSeries?.toString() ?? '-',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122" />
        </svg>
      ),
      description: 'Total series in your collection',
    },
  ];

  return (
    <div className="reading-insights">
      <div className="reading-insights__header">
        <h3 className="reading-insights__title">Reading Insights</h3>
        <span className="reading-insights__subtitle">Your reading habits at a glance</span>
      </div>

      <div className="reading-insights__grid">
        {insights.map((insight, index) => (
          <div
            key={insight.id}
            className="reading-insight-card"
            style={{ animationDelay: `${300 + index * 50}ms` }}
            title={insight.description}
          >
            <div className="reading-insight-card__icon">{insight.icon}</div>
            <div className="reading-insight-card__content">
              <span className="reading-insight-card__value">{insight.value}</span>
              <span className="reading-insight-card__label">{insight.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
