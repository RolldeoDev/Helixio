/**
 * SchedulerCard Component
 *
 * Displays status of a background scheduler.
 */

import { formatDistanceToNow } from 'date-fns';
import type { JobSchedulerStatus } from '../../services/api/jobs';
import './SchedulerCard.css';

interface SchedulerCardProps {
  scheduler: JobSchedulerStatus;
}

export function SchedulerCard({ scheduler }: SchedulerCardProps) {
  const indicatorClass = scheduler.isRunning
    ? 'running'
    : scheduler.enabled
      ? 'enabled'
      : '';

  return (
    <div className="scheduler-card">
      <div className="scheduler-info">
        <div className={`scheduler-indicator ${indicatorClass}`} />
        <span className="scheduler-name">{scheduler.name}</span>
      </div>
      <div className="scheduler-times">
        {scheduler.lastRun && (
          <div className="scheduler-time">
            <span className="scheduler-time-label">Last:</span>
            <span>
              {formatDistanceToNow(new Date(scheduler.lastRun), { addSuffix: true })}
            </span>
          </div>
        )}
        {scheduler.nextRun && (
          <div className="scheduler-time">
            <span className="scheduler-time-label">Next:</span>
            <span>
              {formatDistanceToNow(new Date(scheduler.nextRun), { addSuffix: true })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default SchedulerCard;
