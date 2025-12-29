import type { StatsTimeframe } from '../../../services/api/series';
import './AdminStats.css';

interface TimeframeSelectorProps {
  value: StatsTimeframe;
  onChange: (value: StatsTimeframe) => void;
  showLabel?: boolean;
}

const TIMEFRAME_OPTIONS: { value: StatsTimeframe; label: string }[] = [
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all_time', label: 'All Time' },
];

export function TimeframeSelector({
  value,
  onChange,
  showLabel = true,
}: TimeframeSelectorProps) {
  return (
    <div className="timeframe-selector">
      {showLabel && <span className="timeframe-selector__label">Timeframe:</span>}
      <select
        className="timeframe-selector__select"
        value={value}
        onChange={(e) => onChange(e.target.value as StatsTimeframe)}
      >
        {TIMEFRAME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
