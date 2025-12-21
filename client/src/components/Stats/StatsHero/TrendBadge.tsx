import './StatsHero.css';

export type TrendDirection = 'up' | 'down' | 'neutral';

interface TrendBadgeProps {
  current: number;
  previous: number;
  suffix?: string;
}

export function TrendBadge({ current, previous, suffix = '' }: TrendBadgeProps) {
  if (previous === 0 && current === 0) {
    return null;
  }

  let direction: TrendDirection;
  let percentage: number;

  if (previous === 0) {
    direction = current > 0 ? 'up' : 'neutral';
    percentage = 100;
  } else {
    const change = ((current - previous) / previous) * 100;
    percentage = Math.abs(Math.round(change));

    if (change > 2) {
      direction = 'up';
    } else if (change < -2) {
      direction = 'down';
    } else {
      direction = 'neutral';
    }
  }

  const icon = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';

  return (
    <span className={`trend-badge trend-badge--${direction}`}>
      <span className="trend-badge__icon">{icon}</span>
      <span className="trend-badge__value">
        {percentage}%{suffix}
      </span>
    </span>
  );
}
