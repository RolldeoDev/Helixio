/**
 * JobsPanel Component
 *
 * Lists all metadata jobs and allows viewing/managing each one.
 */

import { useEffect } from 'react';
import { useMetadataJob } from '../../contexts/MetadataJobContext';
import { type MetadataJob } from '../../services/api.service';
import './JobsPanel.css';

export function JobsPanel() {
  const { activeJobs, loadActiveJobs, resumeJob, openModal, abandonJob, jobId } = useMetadataJob();

  // Refresh jobs on mount
  useEffect(() => {
    loadActiveJobs();
  }, [loadActiveJobs]);

  const handleOpenJob = async (job: MetadataJob) => {
    if (jobId === job.id) {
      // Already viewing this job, just open the modal
      openModal();
    } else {
      // Resume this job to load it into context, then open modal
      await resumeJob(job.id);
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'options':
        return 'Pending';
      case 'initializing':
        return 'Initializing';
      case 'series_approval':
        return 'Series Approval';
      case 'fetching_issues':
        return 'Fetching Issues';
      case 'file_review':
        return 'File Review';
      case 'applying':
        return 'Applying';
      case 'complete':
        return 'Complete';
      case 'cancelled':
        return 'Cancelled';
      case 'error':
        return 'Error';
      default:
        return status;
    }
  };

  const getStatusClass = (status: string): string => {
    switch (status) {
      case 'complete':
        return 'status-complete';
      case 'error':
      case 'cancelled':
        return 'status-error';
      case 'options':
        return 'status-pending';
      default:
        return 'status-active';
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getProgressText = (job: MetadataJob): string => {
    if (job.status === 'series_approval' && job.session) {
      const current = (job.session.currentSeriesIndex ?? 0) + 1;
      const total = job.session.seriesGroups?.length ?? 0;
      return `Series ${current}/${total}`;
    }
    if (job.status === 'file_review' && job.session?.fileChangesSummary) {
      const summary = job.session.fileChangesSummary;
      return `${summary.matched} matched, ${summary.unmatched} unmatched`;
    }
    if (job.status === 'complete' && job.applyResult) {
      return `${job.applyResult.successful} updated, ${job.applyResult.failed} failed`;
    }
    return `${job.totalFiles} files`;
  };

  return (
    <div className="jobs-panel">
      <div className="jobs-panel-header">
        <h1>Metadata Jobs</h1>
        <button className="btn-secondary" onClick={() => loadActiveJobs()}>
          Refresh
        </button>
      </div>

      {activeJobs.length === 0 ? (
        <div className="jobs-empty">
          <div className="empty-icon">📥</div>
          <h3>No Active Jobs</h3>
          <p>
            Start a metadata fetch job by selecting files in your library and clicking
            "Fetch Metadata".
          </p>
        </div>
      ) : (
        <div className="jobs-list">
          {activeJobs.map((job) => (
            <div key={job.id} className={`job-card ${getStatusClass(job.status)}`}>
              <div className="job-card-header">
                <div className="job-status">
                  <span className={`status-badge ${getStatusClass(job.status)}`}>
                    {getStatusLabel(job.status)}
                  </span>
                  {jobId === job.id && (
                    <span className="current-badge">Current</span>
                  )}
                </div>
                <div className="job-date">{formatDate(job.createdAt)}</div>
              </div>

              <div className="job-card-body">
                <div className="job-info">
                  <div className="job-files">
                    <span className="label">Files:</span>
                    <span className="value">{job.totalFiles}</span>
                  </div>
                  <div className="job-progress">
                    <span className="label">Progress:</span>
                    <span className="value">{getProgressText(job)}</span>
                  </div>
                  {job.error && (
                    <div className="job-error">
                      <span className="label">Error:</span>
                      <span className="value">{job.error}</span>
                    </div>
                  )}
                </div>

                {job.options.useLLMCleanup && (
                  <div className="job-options">
                    <span className="option-tag">LLM Cleanup</span>
                  </div>
                )}
              </div>

              <div className="job-card-footer">
                <button
                  className="btn-primary"
                  onClick={() => handleOpenJob(job)}
                >
                  {job.status === 'complete' ? 'View Results' : 'Open'}
                </button>
                {job.status !== 'complete' && job.status !== 'cancelled' && (
                  <button
                    className="btn-danger"
                    onClick={async () => {
                      if (confirm('Are you sure you want to abandon this job? This cannot be undone.')) {
                        // Pass the job ID directly to avoid state race conditions
                        await abandonJob(job.id);
                      }
                    }}
                  >
                    Abandon
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default JobsPanel;
