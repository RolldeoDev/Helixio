/**
 * IssueUserDataPanel Component
 *
 * Specialized user data panel for issue detail pages.
 * Simpler than series panel (no computed average).
 */

import { UserDataPanel } from './UserDataPanel';
import { useIssueUserData, useUpdateIssueUserData } from '../../hooks/queries';

export interface IssueUserDataPanelProps {
  /** File ID */
  fileId: string;
  /** Whether to start expanded */
  defaultExpanded?: boolean;
  /** Additional class name */
  className?: string;
}

export function IssueUserDataPanel({
  fileId,
  defaultExpanded = false,
  className = '',
}: IssueUserDataPanelProps) {
  const { data, isLoading } = useIssueUserData(fileId);
  const updateMutation = useUpdateIssueUserData();

  const userData = data?.data;

  const handleRatingChange = (rating: number | null) => {
    updateMutation.mutate({ fileId, input: { rating } });
  };

  const handlePrivateNotesChange = (privateNotes: string | null) => {
    updateMutation.mutate({ fileId, input: { privateNotes } });
  };

  const handlePublicReviewChange = (publicReview: string | null) => {
    updateMutation.mutate({ fileId, input: { publicReview } });
  };

  const handleVisibilityChange = (reviewVisibility: 'private' | 'public') => {
    updateMutation.mutate({ fileId, input: { reviewVisibility } });
  };

  return (
    <UserDataPanel
      rating={userData?.rating ?? null}
      privateNotes={userData?.privateNotes ?? null}
      publicReview={userData?.publicReview ?? null}
      reviewVisibility={userData?.reviewVisibility ?? 'private'}
      isLoading={isLoading}
      isSaving={updateMutation.isPending}
      onRatingChange={handleRatingChange}
      onPrivateNotesChange={handlePrivateNotesChange}
      onPublicReviewChange={handlePublicReviewChange}
      onVisibilityChange={handleVisibilityChange}
      title="Your Rating & Notes"
      defaultExpanded={defaultExpanded}
      className={`issue-user-data-panel ${className}`}
    />
  );
}

export default IssueUserDataPanel;
