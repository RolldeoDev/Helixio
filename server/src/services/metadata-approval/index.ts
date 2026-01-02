/**
 * Metadata Approval Service
 *
 * Manages the multi-step metadata approval workflow:
 * 1. Parse filenames and group by detected series
 * 2. Series approval (one at a time, wizard-style)
 * 3. File-level review with field diff
 * 4. Apply approved changes
 *
 * This module is split into focused sub-modules:
 * - types.ts: Type definitions
 * - session-store.ts: Session storage and management
 * - session-create.ts: Session creation logic
 * - series-approval.ts: Series search and approval
 * - file-review.ts: File-level review and matching
 * - field-changes.ts: Field change computation
 * - apply-changes.ts: Applying changes to files
 * - helpers.ts: Utility functions
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  ApprovalSessionStatus,
  ParsedFileData,
  SeriesGroup,
  SearchQuery,
  FieldChange,
  FileChange,
  ApprovalSession,
  CreateSessionOptions,
  ProgressCallback,
  ApplyResult,
  ApplyChangesResult,
  SeriesMatch,
  MetadataSource,
} from './types.js';

// =============================================================================
// Constants
// =============================================================================

export { NON_COMICINFO_FIELDS } from './types.js';

// =============================================================================
// Session Management
// =============================================================================

export { getSession, restoreSession, deleteSession } from './session-store.js';
export { createSession, createSessionWithProgress } from './session-create.js';

// =============================================================================
// Series Approval (Phase 1)
// =============================================================================

export {
  searchSeriesCustom,
  loadMoreSeriesResults,
  approveSeries,
  skipSeries,
  navigateToSeriesGroup,
  resetSeriesGroup,
} from './series-approval.js';

// =============================================================================
// File Review (Phase 2)
// =============================================================================

export {
  getAvailableIssuesForFile,
  manualSelectIssue,
  updateFieldApprovals,
  rejectFile,
  acceptAllFiles,
  rejectAllFiles,
  moveFileToSeriesGroup,
  regenerateRenamePreview,
} from './file-review.js';

// =============================================================================
// Apply Changes (Phase 3)
// =============================================================================

export { applyChanges } from './apply-changes.js';

// =============================================================================
// Namespace Export (for backward compatibility)
// =============================================================================

import { createSession, createSessionWithProgress } from './session-create.js';
import { getSession, restoreSession, deleteSession } from './session-store.js';
import {
  searchSeriesCustom,
  loadMoreSeriesResults,
  approveSeries,
  skipSeries,
  navigateToSeriesGroup,
  resetSeriesGroup,
} from './series-approval.js';
import {
  getAvailableIssuesForFile,
  manualSelectIssue,
  updateFieldApprovals,
  rejectFile,
  acceptAllFiles,
  rejectAllFiles,
  moveFileToSeriesGroup,
  regenerateRenamePreview,
} from './file-review.js';
import { applyChanges } from './apply-changes.js';

export const MetadataApproval = {
  createSession,
  createSessionWithProgress,
  getSession,
  restoreSession,
  deleteSession,
  searchSeriesCustom,
  loadMoreSeriesResults,
  approveSeries,
  skipSeries,
  navigateToSeriesGroup,
  resetSeriesGroup,
  getAvailableIssuesForFile,
  manualSelectIssue,
  updateFieldApprovals,
  rejectFile,
  acceptAllFiles,
  rejectAllFiles,
  moveFileToSeriesGroup,
  regenerateRenamePreview,
  applyChanges,
};

export default MetadataApproval;
