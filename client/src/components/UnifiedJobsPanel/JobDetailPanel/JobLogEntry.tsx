/**
 * JobLogEntry Component
 *
 * Displays a single log entry in the job detail panel.
 * Supports compact mode for virtualized lists with many entries.
 */

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { UnifiedJobLog } from '../../../services/api/jobs';
import './JobLogEntry.css';

interface JobLogEntryProps {
  log: UnifiedJobLog;
  compact?: boolean;
}

const LOG_ICONS: Record<string, string> = {
  info: 'i',
  success: '\u2713',
  warning: '!',
  error: '\u2715',
};

export function JobLogEntry({ log, compact = false }: JobLogEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = log.message.length > 200;

  const timeAgo = formatDistanceToNow(new Date(log.timestamp), { addSuffix: true });

  if (compact) {
    return (
      <div className="job-log-entry compact">
        <div className={`log-icon ${log.type}`}>
          {LOG_ICONS[log.type]}
        </div>
        <div className="log-content">
          <div className="log-message-compact">
            <span className="log-stage-inline">{log.stage}</span>
            <span className="log-text">{log.message}</span>
          </div>
        </div>
      </div>
    );
  }

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
