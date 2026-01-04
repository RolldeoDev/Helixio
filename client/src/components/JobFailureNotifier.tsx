/**
 * JobFailureNotifier Component
 *
 * Monitors background jobs for failures and shows toast notifications.
 * Uses polling (via useUnifiedJobs) to detect when jobs transition to 'failed' status.
 *
 * This component should be rendered near the root of the app (e.g., in App.tsx).
 */

import { useEffect, useRef } from 'react';
import { useUnifiedJobs } from '../hooks/queries/useUnifiedJobs';
import { useToast } from '../contexts/ToastContext';
import type { UnifiedJob, UnifiedJobType } from '../services/api/jobs';

// How long to keep notified job IDs before allowing re-notification (1 hour)
const NOTIFICATION_TTL_MS = 60 * 60 * 1000;

/**
 * Get a human-readable job type label
 */
function getJobTypeLabel(type: UnifiedJobType): string {
  switch (type) {
    case 'metadata':
      return 'Metadata job';
    case 'library-scan':
      return 'Library scan';
    case 'rating-sync':
      return 'Rating sync';
    case 'review-sync':
      return 'Review sync';
    case 'similarity':
      return 'Similarity analysis';
    case 'download':
      return 'Download';
    case 'batch':
      return 'Batch operation';
    default:
      return 'Job';
  }
}

/**
 * JobFailureNotifier - Renders nothing, just monitors jobs and shows toasts
 */
export function JobFailureNotifier() {
  const { data } = useUnifiedJobs({ status: 'all' });
  const { addToast } = useToast();

  // Track which jobs we've already notified about (job ID -> notification timestamp)
  const notifiedJobsRef = useRef<Map<string, number>>(new Map());

  // Track previous job statuses to detect transitions
  const previousStatusesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!data) return;

    // Combine active and history jobs
    const allJobs: UnifiedJob[] = [...data.active, ...data.history];

    for (const job of allJobs) {
      const previousStatus = previousStatusesRef.current.get(job.id);
      const currentStatus = job.status;

      // Update previous status tracking
      previousStatusesRef.current.set(job.id, currentStatus);

      // Check if job just transitioned to 'failed' status
      const justFailed =
        currentStatus === 'failed' &&
        previousStatus !== undefined &&
        previousStatus !== 'failed';

      // Also catch jobs that appear as failed on first load (e.g., page refresh during failure)
      const isNewlyDiscoveredFailure =
        currentStatus === 'failed' &&
        previousStatus === undefined &&
        !notifiedJobsRef.current.has(job.id);

      if ((justFailed || isNewlyDiscoveredFailure) && !notifiedJobsRef.current.has(job.id)) {
        // Mark as notified with current timestamp
        notifiedJobsRef.current.set(job.id, Date.now());

        // Generate toast message
        const jobLabel = getJobTypeLabel(job.type);
        const message = `${jobLabel} failed`;

        // Show toast with action to view details
        addToast('error', message, {
          label: 'View Details',
          onClick: () => {
            // Dispatch custom event to open job details panel
            // The UnifiedJobsPanel listens for this event
            window.dispatchEvent(
              new CustomEvent('open-job-details', {
                detail: { type: job.type, id: job.id },
              })
            );
          },
        });
      }
    }

    // Cleanup: Remove old entries from tracking maps to prevent memory leaks
    const currentJobIds = new Set(allJobs.map((j) => j.id));
    const now = Date.now();

    // Clean up previousStatusesRef - remove jobs no longer in data
    for (const [id] of previousStatusesRef.current) {
      if (!currentJobIds.has(id)) {
        previousStatusesRef.current.delete(id);
      }
    }

    // Clean up notifiedJobsRef - remove entries older than TTL that are no longer in data
    for (const [id, timestamp] of notifiedJobsRef.current) {
      if (!currentJobIds.has(id) && now - timestamp > NOTIFICATION_TTL_MS) {
        notifiedJobsRef.current.delete(id);
      }
    }
  }, [data, addToast]);

  // This component renders nothing - it only monitors and triggers toasts
  return null;
}

export default JobFailureNotifier;
