/**
 * JobLogEntry Component
 *
 * Displays a single log entry in the job detail panel.
 */

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { UnifiedJobLog } from '../../../services/api/jobs';
import './JobLogEntry.css';

interface JobLogEntryProps {
  log: UnifiedJobLog;
}

const LOG_ICONS: Record<string, string> = {
  info: 'i',
  success: '\u2713',
  warning: '!',
  error: '\u2715',
};

export function JobLogEntry({ log }: JobLogEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = log.message.length > 200;

  const timeAgo = formatDistanceToNow(new Date(log.timestamp), { addSuffix: true });

  return (
    <div className="job-log-entry">
      <div className={`log-icon ${log.type}`}>
        {LOG_ICONS[log.type]}
      </div>
      <div className="log-content">
        <div className="log-header">
          <span className="log-stage">{log.stage}</span>
          <span className="log-time">{timeAgo}</span>
        </div>
        <div className={`log-message ${isLong && !expanded ? 'log-message-truncated' : ''}`}>
          {log.message}
        </div>
        {isLong && (
          <button className="log-show-more" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
        {log.detail && <div className="log-detail">{log.detail}</div>}
      </div>
    </div>
  );
}

export default JobLogEntry;
