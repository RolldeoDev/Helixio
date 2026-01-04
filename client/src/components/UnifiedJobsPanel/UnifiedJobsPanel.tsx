/**
 * UnifiedJobsPanel Component
 *
 * Main panel showing all jobs from all sources.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnifiedJobs, useInvalidateUnifiedJobs } from '../../hooks/queries/useUnifiedJobs';
import type { UnifiedJobType, UnifiedJob } from '../../services/api/jobs';
import { UnifiedJobCard } from './UnifiedJobCard';
import { SchedulerCard } from './SchedulerCard';
import { JobDetailPanel } from './JobDetailPanel';
import { JobTypeFilter, type FilterCategory } from './JobTypeFilter';
import './UnifiedJobsPanel.css';

export function UnifiedJobsPanel() {
  const { data, isLoading, error, isFetching } = useUnifiedJobs();
  const invalidate = useInvalidateUnifiedJobs();

  const [selectedJob, setSelectedJob] = useState<{
    type: UnifiedJobType;
    id: string;
  } | null>(null);

  const [visibleCategories, setVisibleCategories] = useState<Set<FilterCategory>>(() => {
    const saved = localStorage.getItem('helixio:jobFilters');
    if (saved) {
      try {
        return new Set(JSON.parse(saved) as FilterCategory[]);
      } catch {
        return new Set(['scans', 'metadata', 'ratings', 'reviews', 'batches']);
      }
    }
    return new Set(['scans', 'metadata', 'ratings', 'reviews', 'batches']);
  });

  // Persist filter state
  useEffect(() => {
    localStorage.setItem('helixio:jobFilters', JSON.stringify([...visibleCategories]));
  }, [visibleCategories]);

  // Listen for external events to open job details (e.g., from toast notifications)
  useEffect(() => {
    const handleOpenJobDetails = (event: CustomEvent<{ type: UnifiedJobType; id: string }>) => {
      setSelectedJob({ type: event.detail.type, id: event.detail.id });
    };

    window.addEventListener('open-job-details', handleOpenJobDetails as EventListener);
    return () => {
      window.removeEventListener('open-job-details', handleOpenJobDetails as EventListener);
    };
  }, []);

  // Map job types to filter categories
  const getJobCategory = useCallback((type: string): FilterCategory | null => {
    switch (type) {
      case 'library-scan': return 'scans';
      case 'metadata': return 'metadata';
      case 'rating-sync': return 'ratings';
      case 'review-sync': return 'reviews';
      case 'batch': return 'batches';
      default: return null;
    }
  }, []);

  // Filter jobs by visible categories
  const filterJobs = useCallback((jobs: UnifiedJob[]) => {
    return jobs.filter((job) => {
      const category = getJobCategory(job.type);
      return category === null || visibleCategories.has(category);
    });
  }, [getJobCategory, visibleCategories]);

  // Calculate counts per category
  const getCategoryCounts = useCallback((allJobs: UnifiedJob[]): Record<FilterCategory, number> => {
    const counts: Record<FilterCategory, number> = {
      scans: 0,
      metadata: 0,
      ratings: 0,
      reviews: 0,
      batches: 0,
    };

    for (const job of allJobs) {
      const category = getJobCategory(job.type);
      if (category) {
        counts[category]++;
      }
    }

    return counts;
  }, [getJobCategory]);

  const handleToggleCategory = useCallback((category: FilterCategory) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const handleJobClick = useCallback((type: UnifiedJobType, id: string) => {
    setSelectedJob({ type, id });
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedJob(null);
  }, []);

  // Extract data with defaults - must be before useMemo hooks
  const { active = [], history = [], schedulers = [] } = data || {};

  // Compute filtered jobs and counts - all hooks must be before any early returns
  const allJobs = useMemo(() => [...active, ...history], [active, history]);
  const categoryCounts = useMemo(() => getCategoryCounts(allJobs), [getCategoryCounts, allJobs]);
  const filteredActive = useMemo(() => filterJobs(active), [filterJobs, active]);
  const filteredHistory = useMemo(() => filterJobs(history), [filterJobs, history]);

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

      <JobTypeFilter
        visibleCategories={visibleCategories}
        counts={categoryCounts}
        onToggle={handleToggleCategory}
      />

      {/* Active Jobs */}
      <section className="jobs-section">
        <div className="jobs-section-header">
          <h2 className="jobs-section-title">Active</h2>
          {filteredActive.length > 0 && (
            <span className="jobs-section-count">{filteredActive.length}</span>
          )}
        </div>
        {filteredActive.length > 0 ? (
          <div className="jobs-list">
            {filteredActive.map((job) => (
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
          {filteredHistory.length > 0 && (
            <span className="jobs-section-count">{filteredHistory.length}</span>
          )}
        </div>
        {filteredHistory.length > 0 ? (
          <div className="jobs-list">
            {filteredHistory.map((job) => (
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
