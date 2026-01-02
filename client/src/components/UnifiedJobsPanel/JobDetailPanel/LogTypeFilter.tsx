/**
 * LogTypeFilter Component
 *
 * Filter toggle buttons for log types.
 */

import type { UnifiedLogType } from '../../../services/api/jobs';
import './LogTypeFilter.css';

interface LogTypeFilterProps {
  counts: Record<UnifiedLogType, number>;
  visibleTypes: Set<UnifiedLogType>;
  onToggle: (type: UnifiedLogType) => void;
}

const TYPE_LABELS: Record<UnifiedLogType, string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
};

export function LogTypeFilter({ counts, visibleTypes, onToggle }: LogTypeFilterProps) {
  const types: UnifiedLogType[] = ['info', 'success', 'warning', 'error'];

  return (
    <div className="log-type-filter">
      {types.map((type) => (
        <button
          key={type}
          className={`filter-btn ${visibleTypes.has(type) ? 'active' : ''} ${type}`}
          onClick={() => onToggle(type)}
        >
          {TYPE_LABELS[type]}
          <span className="filter-count">{counts[type]}</span>
        </button>
      ))}
    </div>
  );
}

export default LogTypeFilter;
