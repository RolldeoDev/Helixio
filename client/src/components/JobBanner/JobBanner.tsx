/**
 * JobBanner Component
 *
 * Shows a banner at the top of the page when a metadata job is running in the background.
 * Clicking the banner reopens the modal to view the job progress.
 */

import { useMetadataJob } from '../../contexts/MetadataJobContext';
import './JobBanner.css';

export function JobBanner() {
  const { hasActiveJob, isModalOpen, step, session, openModal } = useMetadataJob();

  // Don't show banner if no active job or modal is already open
  if (!hasActiveJob || isModalOpen) {
    return null;
  }

  const getStatusText = (): string => {
    switch (step) {
      case 'options':
        return 'Metadata job pending';
      case 'initializing':
        return 'Preparing metadata job...';
      case 'series_approval':
        const current = (session?.currentSeriesIndex ?? 0) + 1;
        const total = session?.seriesGroups?.length ?? 0;
        return `Series approval (${current}/${total})`;
      case 'fetching_issues':
        return 'Fetching issue details...';
      case 'file_review':
        return 'Reviewing changes...';
      case 'applying':
        return 'Applying metadata...';
      case 'complete':
        return 'Job complete';
      case 'error':
        return 'Job encountered an error';
      default:
        return 'Job in progress';
    }
  };

  const getStatusIcon = (): string => {
    switch (step) {
      case 'complete':
        return '✓';
      case 'error':
        return '!';
      default:
        return '⟳';
    }
  };

  return (
    <div className={`job-banner ${step === 'error' ? 'error' : ''} ${step === 'complete' ? 'complete' : ''}`} onClick={openModal}>
      <div className="job-banner-content">
        <span className={`job-banner-icon ${step !== 'complete' && step !== 'error' ? 'spinning' : ''}`}>
          {getStatusIcon()}
        </span>
        <span className="job-banner-text">
          {getStatusText()} — <strong>Click here to view</strong>
        </span>
      </div>
    </div>
  );
}

export default JobBanner;
