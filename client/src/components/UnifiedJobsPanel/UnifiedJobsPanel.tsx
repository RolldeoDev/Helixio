/**
 * UnifiedJobsPanel Component
 *
 * Main panel showing all jobs from all sources.
 */

import { useState } from 'react';
import { useUnifiedJobs, useInvalidateUnifiedJobs } from '../../hooks/queries/useUnifiedJobs';
import type { UnifiedJobType } from '../../services/api/jobs';
import { UnifiedJobCard } from './UnifiedJobCard';
import { SchedulerCard } from './SchedulerCard';
import { JobDetailPanel } from './JobDetailPanel';
import './UnifiedJobsPanel.css';

export function UnifiedJobsPanel() {
  const { data, isLoading, error, isFetching } = useUnifiedJobs();
  const invalidate = useInvalidateUnifiedJobs();

  const [selectedJob, setSelectedJob] = useState<{
    type: UnifiedJobType;
    id: string;
  } | null>(null);

  const handleJobClick = (type: UnifiedJobType, id: string) => {
    setSelectedJob({ type, id });
  };

  const handleClosePanel = () => {
    setSelectedJob(null);
  };

  if (isLoading) {
    return (
      <div className="unified-jobs-panel">
        <div className="jobs-loading">Loading jobs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="unified-jobs-panel">
        <div className="jobs-error">
          Failed to load jobs: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  const { active, history, schedulers } = data || { active: [], history: [], schedulers: [] };

  return (
    <div className="unified-jobs-panel">
      <div className="jobs-panel-header">
        <h1>Jobs</h1>
        <button
          className="jobs-panel-refresh"
          onClick={() => invalidate()}
          disabled={isFetching}
        >
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Active Jobs */}
      <section className="jobs-section">
        <div className="jobs-section-header">
          <h2 className="jobs-section-title">Active</h2>
          {active.length > 0 && (
            <span className="jobs-section-count">{active.length}</span>
          )}
        </div>
        {active.length > 0 ? (
          <div className="jobs-list">
            {active.map((job) => (
              <UnifiedJobCard
                key={`${job.type}-${job.id}`}
                job={job}
                onClick={() => handleJobClick(job.type, job.id)}
              />
            ))}
          </div>
        ) : (
          <div className="jobs-empty">
            <div className="jobs-empty-icon">✓</div>
            <h3>No Active Jobs</h3>
            <p>All background tasks have completed.</p>
          </div>
        )}
      </section>

      {/* Schedulers */}
      {schedulers.length > 0 && (
        <section className="jobs-section">
          <div className="jobs-section-header">
            <h2 className="jobs-section-title">Schedulers</h2>
          </div>
          <div className="jobs-list">
            {schedulers.map((scheduler) => (
              <SchedulerCard key={scheduler.id} scheduler={scheduler} />
            ))}
          </div>
        </section>
      )}

      {/* History */}
      <section className="jobs-section">
        <div className="jobs-section-header">
          <h2 className="jobs-section-title">History</h2>
        </div>
        {history.length > 0 ? (
          <div className="jobs-list">
            {history.map((job) => (
              <UnifiedJobCard
                key={`${job.type}-${job.id}`}
                job={job}
                onClick={() => handleJobClick(job.type, job.id)}
              />
            ))}
          </div>
        ) : (
          <div className="jobs-empty">
            <p>No recent job history.</p>
          </div>
        )}
      </section>

      {selectedJob && (
        <JobDetailPanel
          jobType={selectedJob.type}
          jobId={selectedJob.id}
          onClose={handleClosePanel}
        />
      )}
    </div>
  );
}

export default UnifiedJobsPanel;
