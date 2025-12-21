import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { AllTimeStats } from '../../../services/api.service';
import { AchievementBadge } from './AchievementBadge';
import { StreakDisplay } from './StreakDisplay';
import {
  PAGE_MILESTONE_ACHIEVEMENTS,
  COMIC_COMPLETION_ACHIEVEMENTS,
  READING_STREAK_ACHIEVEMENTS,
  type Achievement,
} from './achievements-config';
import './Achievements.css';

// Helper to get unlocked achievements based on current stats (simplified for widget)
function getUnlockedAchievements(pages: number, comics: number, streak: number): Achievement[] {
  const unlocked: Achievement[] = [];
  PAGE_MILESTONE_ACHIEVEMENTS.forEach(a => {
    if (a.type === 'pages_total' && pages >= a.threshold) unlocked.push(a);
  });
  COMIC_COMPLETION_ACHIEVEMENTS.forEach(a => {
    if (a.type === 'comics_total' && comics >= a.threshold) unlocked.push(a);
  });
  READING_STREAK_ACHIEVEMENTS.forEach(a => {
    if ((a.type === 'streak_longest' || a.type === 'streak_current') && streak >= a.threshold) unlocked.push(a);
  });
  return unlocked;
}

// Helper to get next achievement to unlock
function getNextAchievement(pages: number, comics: number, streak: number): Achievement | null {
  const allAchievements = [
    ...PAGE_MILESTONE_ACHIEVEMENTS.filter(a => a.type === 'pages_total'),
    ...COMIC_COMPLETION_ACHIEVEMENTS.filter(a => a.type === 'comics_total'),
    ...READING_STREAK_ACHIEVEMENTS.filter(a => a.type === 'streak_longest' || a.type === 'streak_current'),
  ];

  for (const a of allAchievements) {
    const current = a.type === 'pages_total' ? pages : a.type === 'comics_total' ? comics : streak;
    if (current < a.threshold) return a;
  }
  return null;
}

// Helper to get progress percentage to next achievement
function getProgressToNext(achievement: Achievement, pages: number, comics: number, streak: number): number {
  const current = achievement.type === 'pages_total' ? pages :
                  achievement.type === 'comics_total' ? comics : streak;
  return Math.min(100, Math.round((current / achievement.threshold) * 100));
}

interface AchievementsProps {
  allTimeStats: AllTimeStats | null;
  isLoading: boolean;
}

export function Achievements({ allTimeStats, isLoading }: AchievementsProps) {
  const stats = allTimeStats ?? {
    totalPagesRead: 0,
    totalComicsRead: 0,
    longestStreak: 0,
    currentStreak: 0,
  };

  const unlockedIds = useMemo(() => {
    const unlocked = getUnlockedAchievements(
      stats.totalPagesRead,
      stats.totalComicsRead,
      stats.longestStreak
    );
    return new Set(unlocked.map((a) => a.id));
  }, [stats.totalPagesRead, stats.totalComicsRead, stats.longestStreak]);

  const nextAchievement = useMemo(
    () =>
      getNextAchievement(
        stats.totalPagesRead,
        stats.totalComicsRead,
        stats.longestStreak
      ),
    [stats.totalPagesRead, stats.totalComicsRead, stats.longestStreak]
  );

  const nextProgress = nextAchievement
    ? getProgressToNext(
        nextAchievement,
        stats.totalPagesRead,
        stats.totalComicsRead,
        stats.longestStreak
      )
    : 0;

  if (isLoading) {
    return (
      <div className="achievements achievements--loading">
        <div className="achievements__header">
          <h3 className="achievements__title">Achievements & Streaks</h3>
        </div>
        <div className="achievements__skeleton" />
      </div>
    );
  }

  return (
    <div className="achievements">
      <div className="achievements__header">
        <div className="achievements__header-left">
          <h3 className="achievements__title">Achievements & Streaks</h3>
          <span className="achievements__subtitle">
            {unlockedIds.size} of {PAGE_MILESTONE_ACHIEVEMENTS.length + COMIC_COMPLETION_ACHIEVEMENTS.length + READING_STREAK_ACHIEVEMENTS.length} unlocked
          </span>
        </div>
        <Link to="/achievements" className="achievements__view-all">
          View All <ChevronRight size={16} />
        </Link>
      </div>

      <div className="achievements__content">
        {/* Streak Display */}
        <StreakDisplay
          currentStreak={stats.currentStreak}
          bestStreak={stats.longestStreak}
        />

        {/* Next Achievement */}
        {nextAchievement && (
          <div className="achievements__next">
            <span className="achievements__next-label">Next Achievement</span>
            <div className="achievements__next-card">
              <AchievementBadge
                achievement={nextAchievement}
                isUnlocked={false}
                progress={nextProgress}
                size="small"
              />
              <div className="achievements__next-progress">
                <div
                  className="achievements__next-progress-fill"
                  style={{ width: `${nextProgress}%` }}
                />
              </div>
              <span className="achievements__next-percent">{nextProgress}%</span>
            </div>
          </div>
        )}

        {/* Reading Volume Achievements (Primary) */}
        <div className="achievements__section">
          <h4 className="achievements__section-title">Reading Volume</h4>
          <div className="achievements__grid achievements__grid--primary">
            {PAGE_MILESTONE_ACHIEVEMENTS.slice(0, 6).map((achievement) => (
              <AchievementBadge
                key={achievement.id}
                achievement={achievement}
                isUnlocked={unlockedIds.has(achievement.id)}
                progress={
                  !unlockedIds.has(achievement.id)
                    ? Math.min(
                        100,
                        Math.round(
                          (stats.totalPagesRead / achievement.threshold) * 100
                        )
                      )
                    : undefined
                }
              />
            ))}
          </div>
        </div>

        {/* Secondary Achievements */}
        <div className="achievements__section achievements__section--secondary">
          <h4 className="achievements__section-title">Milestones</h4>
          <div className="achievements__grid achievements__grid--secondary">
            {[...COMIC_COMPLETION_ACHIEVEMENTS.slice(0, 3), ...READING_STREAK_ACHIEVEMENTS.slice(0, 3)].map((achievement) => (
              <AchievementBadge
                key={achievement.id}
                achievement={achievement}
                isUnlocked={unlockedIds.has(achievement.id)}
                size="small"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
