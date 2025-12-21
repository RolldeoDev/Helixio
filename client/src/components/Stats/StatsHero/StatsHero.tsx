import { useMemo } from 'react';
import { CountUpNumber } from './CountUpNumber';
import { TrendBadge } from './TrendBadge';
import type { AllTimeStats, DailyStats } from '../../../services/api.service';
import './StatsHero.css';

interface StatsHeroProps {
  allTimeStats: AllTimeStats | null;
  currentPeriodStats: DailyStats[];
  previousPeriodStats: DailyStats[];
  isLoading: boolean;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

function sumStats(stats: DailyStats[]) {
  return stats.reduce(
    (acc, day) => ({
      pagesRead: acc.pagesRead + day.pagesRead,
      totalDuration: acc.totalDuration + day.totalDuration,
      comicsCompleted: acc.comicsCompleted + day.comicsCompleted,
      comicsStarted: acc.comicsStarted + day.comicsStarted,
    }),
    { pagesRead: 0, totalDuration: 0, comicsCompleted: 0, comicsStarted: 0 }
  );
}

export function StatsHero({
  allTimeStats,
  currentPeriodStats,
  previousPeriodStats,
  isLoading,
}: StatsHeroProps) {
  const currentSums = useMemo(() => sumStats(currentPeriodStats), [currentPeriodStats]);
  const previousSums = useMemo(() => sumStats(previousPeriodStats), [previousPeriodStats]);

  const dailyAverage = useMemo(() => {
    if (currentPeriodStats.length === 0) return 0;
    return Math.round(currentSums.pagesRead / currentPeriodStats.length);
  }, [currentSums.pagesRead, currentPeriodStats.length]);

  if (isLoading) {
    return (
      <section className="stats-hero stats-hero--loading">
        <div className="stats-hero__grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stats-hero-card stats-hero-card--skeleton">
              <div className="skeleton-value" />
              <div className="skeleton-label" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="stats-hero">
      <div className="stats-hero__grid">
        {/* Pages Read */}
        <div className="stats-hero-card" style={{ animationDelay: '0ms' }}>
          <div className="stats-hero-card__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <div className="stats-hero-card__content">
            <span className="stats-hero-card__value">
              <CountUpNumber value={allTimeStats?.totalPagesRead ?? 0} />
            </span>
            <span className="stats-hero-card__label">Pages Read</span>
            <span className="stats-hero-card__sub">
              ~{dailyAverage} per day
            </span>
          </div>
          <div className="stats-hero-card__trend">
            <TrendBadge
              current={currentSums.pagesRead}
              previous={previousSums.pagesRead}
            />
          </div>
        </div>

        {/* Time Reading */}
        <div className="stats-hero-card" style={{ animationDelay: '50ms' }}>
          <div className="stats-hero-card__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="stats-hero-card__content">
            <span className="stats-hero-card__value stats-hero-card__value--time">
              {formatDuration(allTimeStats?.totalReadingTime ?? 0)}
            </span>
            <span className="stats-hero-card__label">Time Reading</span>
            <span className="stats-hero-card__sub">
              ~{Math.round((allTimeStats?.averageSessionDuration ?? 0) / 60)}m per session
            </span>
          </div>
          <div className="stats-hero-card__trend">
            <TrendBadge
              current={currentSums.totalDuration}
              previous={previousSums.totalDuration}
            />
          </div>
        </div>

        {/* Comics Completed */}
        <div className="stats-hero-card" style={{ animationDelay: '100ms' }}>
          <div className="stats-hero-card__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="stats-hero-card__content">
            <span className="stats-hero-card__value">
              <CountUpNumber value={allTimeStats?.totalComicsRead ?? 0} />
            </span>
            <span className="stats-hero-card__label">Comics Done</span>
            <span className="stats-hero-card__sub">
              {currentSums.comicsStarted} started this period
            </span>
          </div>
          <div className="stats-hero-card__trend">
            <TrendBadge
              current={currentSums.comicsCompleted}
              previous={previousSums.comicsCompleted}
            />
          </div>
        </div>

        {/* Current Streak */}
        <div className="stats-hero-card stats-hero-card--streak" style={{ animationDelay: '150ms' }}>
          <div className="stats-hero-card__icon stats-hero-card__icon--flame">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.356 2.104c-.226-.123-.502-.123-.728 0-1.378.751-2.422 1.846-3.173 3.086C7.705 6.428 7.25 7.936 7.25 9.5c0 1.318.313 2.5.827 3.5-1.027-.748-1.827-1.944-1.827-3.5 0-.665.151-1.303.418-1.879a.75.75 0 00-1.072-.952c-1.234.987-2.096 2.467-2.096 4.331 0 3.866 3.134 7 7 7s7-3.134 7-7c0-3.5-2.086-6.313-4.144-8.396l.144.104z" />
            </svg>
          </div>
          <div className="stats-hero-card__content">
            <span className="stats-hero-card__value">
              <CountUpNumber value={allTimeStats?.currentStreak ?? 0} />
              <span className="stats-hero-card__value-suffix">days</span>
            </span>
            <span className="stats-hero-card__label">Current Streak</span>
            <span className="stats-hero-card__sub">
              Best: {allTimeStats?.longestStreak ?? 0} days
            </span>
          </div>
          {(allTimeStats?.currentStreak ?? 0) > 0 && (
            <div className="stats-hero-card__flame-glow" />
          )}
        </div>
      </div>
    </section>
  );
}
