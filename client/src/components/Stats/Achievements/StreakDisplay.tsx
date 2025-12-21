import './Achievements.css';

interface StreakDisplayProps {
  currentStreak: number;
  bestStreak: number;
}

export function StreakDisplay({ currentStreak, bestStreak }: StreakDisplayProps) {
  const currentPercent = bestStreak > 0 ? Math.min(100, (currentStreak / bestStreak) * 100) : 0;
  const isOnFire = currentStreak >= 3;

  return (
    <div className="streak-display">
      <div className="streak-display__current">
        <div className={`streak-display__flame ${isOnFire ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.356 2.104c-.226-.123-.502-.123-.728 0-1.378.751-2.422 1.846-3.173 3.086C7.705 6.428 7.25 7.936 7.25 9.5c0 1.318.313 2.5.827 3.5-1.027-.748-1.827-1.944-1.827-3.5 0-.665.151-1.303.418-1.879a.75.75 0 00-1.072-.952c-1.234.987-2.096 2.467-2.096 4.331 0 3.866 3.134 7 7 7s7-3.134 7-7c0-3.5-2.086-6.313-4.144-8.396z" />
          </svg>
          {isOnFire && <div className="streak-display__flame-glow" />}
        </div>
        <div className="streak-display__value-group">
          <span className="streak-display__value">{currentStreak}</span>
          <span className="streak-display__unit">day streak</span>
        </div>
      </div>

      <div className="streak-display__comparison">
        <div className="streak-display__bar">
          <div
            className="streak-display__bar-fill"
            style={{ width: `${currentPercent}%` }}
          />
          <div
            className="streak-display__bar-best"
            style={{ left: '100%' }}
            title={`Best: ${bestStreak} days`}
          />
        </div>
        <div className="streak-display__labels">
          <span className="streak-display__label">Current</span>
          <span className="streak-display__label streak-display__label--best">
            Best: {bestStreak} days
          </span>
        </div>
      </div>

      {currentStreak > 0 && currentStreak < bestStreak && (
        <p className="streak-display__encouragement">
          {bestStreak - currentStreak} more days to beat your record!
        </p>
      )}

      {currentStreak >= bestStreak && currentStreak > 0 && (
        <p className="streak-display__encouragement streak-display__encouragement--success">
          You're on your best streak ever!
        </p>
      )}
    </div>
  );
}
