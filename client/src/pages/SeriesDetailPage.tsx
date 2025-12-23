/**
 * SeriesDetailPage Component
 *
 * Detailed view of a single series with issues, metadata, and actions.
 * Part of the Series-Centric Architecture UI.
 *
 * Features:
 * - Cinematic hero section with gradient backdrop
 * - Two-column content layout (description + entities)
 * - Expandable pill sections for characters, teams, locations
 * - Movie-credits style creator display
 * - Virtualized issues grid
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getSeries,
  getSeriesIssues,
  getNextSeriesIssue,
  getCoverUrl,
  getApiCoverUrl,
  markAsCompleted,
  markAsIncomplete,
  rebuildCache,
  fetchSeriesMetadata,
  Series,
  SeriesIssue,
  SeriesForMerge,
} from '../services/api.service';
import { useMetadataJob } from '../contexts/MetadataJobContext';
import {
  CoverCard,
  SERIES_ISSUE_MENU_ITEMS,
  type MenuItemPreset,
} from '../components/CoverCard';
import { MetadataEditor } from '../components/MetadataEditor';
import { EditSeriesModal } from '../components/EditSeriesModal';
import { SeriesSelectModal } from '../components/SeriesSelectModal';
import { MergeSeriesModal } from '../components/MergeSeriesModal';
import { ActionMenu, type ActionMenuItem } from '../components/ActionMenu';
import { MarkdownContent } from '../components/MarkdownContent';
import { CollectionPickerModal } from '../components/CollectionPickerModal';
import { SeriesHero } from '../components/SeriesHero';
import { ExpandablePillSection } from '../components/ExpandablePillSection';
import { CreatorCredits, type CreatorsByRole } from '../components/CreatorCredits';
import './SeriesDetailPage.css';

// =============================================================================
// Menu Configurations
// =============================================================================

/** Series-level actions */
const SERIES_ACTION_ITEMS: ActionMenuItem[] = [
  { id: 'editSeries', label: 'Edit Series' },
  { id: 'fetchSeriesMetadata', label: 'Fetch Metadata (Series)', dividerBefore: true },
  { id: 'fetchAllIssuesMetadata', label: 'Fetch Metadata (All Issues)' },
  { id: 'markAllRead', label: 'Mark All as Read', dividerBefore: true },
  { id: 'markAllUnread', label: 'Mark All as Unread' },
  { id: 'mergeWith', label: 'Merge with...', dividerBefore: true },
  { id: 'rebuildCache', label: 'Rebuild All Covers', dividerBefore: true },
];

/** Issue-level actions (for selected issues) */
const ISSUE_BULK_ACTION_ITEMS: ActionMenuItem[] = [
  { id: 'markRead', label: 'Mark as Read' },
  { id: 'markUnread', label: 'Mark as Unread' },
  { id: 'fetchMetadata', label: 'Fetch Metadata', dividerBefore: true },
  { id: 'rebuildCache', label: 'Rebuild Cover Cache', dividerBefore: true },
];

// =============================================================================
// IssuesGrid - CSS grid layout for issues (no nested scrolling)
// =============================================================================

interface IssuesGridProps {
  issues: SeriesIssue[];
  selectedFiles: Set<string>;
  onIssueClick: (fileId: string, event: React.MouseEvent) => void;
  onReadIssue: (fileId: string) => void;
  onSelectionChange: (fileId: string, selected: boolean) => void;
  onMenuAction: (action: MenuItemPreset | string, fileId: string) => void;
}

function IssuesGrid({
  issues,
  selectedFiles,
  onIssueClick,
  onReadIssue,
  onSelectionChange,
  onMenuAction,
}: IssuesGridProps) {
  if (issues.length === 0) {
    return (
      <div className="series-issues-empty">
        <p>No issues found in this series.</p>
      </div>
    );
  }

  return (
    <div className="series-issues-grid">
      {issues.map((issue) => (
        <div key={issue.id} className="series-issue-item">
          <CoverCard
            file={issue}
            progress={issue.readingProgress ? {
              currentPage: issue.readingProgress.currentPage,
              totalPages: issue.readingProgress.totalPages,
              completed: issue.readingProgress.completed,
            } : undefined}
            variant="grid"
            size="medium"
            selectable={true}
            isSelected={selectedFiles.has(issue.id)}
            checkboxVisibility="hover"
            contextMenuEnabled={true}
            menuItems={SERIES_ISSUE_MENU_ITEMS}
            selectedCount={selectedFiles.size || 1}
            showInfo={true}
            showSeries={false}
            showIssueNumber={true}
            onClick={onIssueClick}
            onDoubleClick={onReadIssue}
            onRead={onReadIssue}
            onSelectionChange={onSelectionChange}
            onMenuAction={onMenuAction}
          />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Main SeriesDetailPage Component
// =============================================================================

export function SeriesDetailPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const navigate = useNavigate();
  const { startJob, lastCompletedJobAt } = useMetadataJob();

  const [series, setSeries] = useState<Series | null>(null);
  const [issues, setIssues] = useState<SeriesIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextIssue, setNextIssue] = useState<{ id: string; filename: string } | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [editingMetadataFileIds, setEditingMetadataFileIds] = useState<string[] | null>(null);
  const [isEditSeriesModalOpen, setIsEditSeriesModalOpen] = useState(false);

  // Merge modal state
  const [showSeriesSelectModal, setShowSeriesSelectModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedMergeSeries, setSelectedMergeSeries] = useState<SeriesForMerge[]>([]);

  // Description expand/collapse state
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [descriptionNeedsTruncation, setDescriptionNeedsTruncation] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  // Collection picker modal state
  const [collectionPickerFileIds, setCollectionPickerFileIds] = useState<string[]>([]);

  // Fetch series data (all issues at once for infinite scroll)
  const fetchSeries = useCallback(async () => {
    if (!seriesId) return;

    setLoading(true);
    setError(null);

    try {
      const [seriesResult, issuesResult, nextResult] = await Promise.all([
        getSeries(seriesId),
        getSeriesIssues(seriesId, { all: true, sortBy: 'number', sortOrder: 'asc' }),
        getNextSeriesIssue(seriesId),
      ]);

      setSeries(seriesResult.series);
      setIssues(issuesResult.issues);

      if (nextResult.nextIssue) {
        setNextIssue({
          id: nextResult.nextIssue.id,
          filename: nextResult.nextIssue.filename,
        });
      } else {
        setNextIssue(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load series');
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => {
    fetchSeries();
  }, [fetchSeries]);

  // Refresh series data when a metadata job completes
  useEffect(() => {
    if (lastCompletedJobAt) {
      fetchSeries();
    }
  }, [lastCompletedJobAt, fetchSeries]);

  // Check if description needs truncation (now 6-8 lines)
  useEffect(() => {
    if (descriptionRef.current) {
      const lineHeight = parseFloat(getComputedStyle(descriptionRef.current).lineHeight);
      const maxHeight = lineHeight * 6; // 6 lines for compact view
      setDescriptionNeedsTruncation(descriptionRef.current.scrollHeight > maxHeight + 2);
    }
  }, [series?.summary, series?.deck]);

  const handleContinueReading = useCallback(() => {
    if (nextIssue) {
      navigate(`/read/${nextIssue.id}?filename=${encodeURIComponent(nextIssue.filename)}`);
    } else {
      // Start from the first issue if no next issue
      const firstIssue = issues[0];
      if (firstIssue) {
        navigate(`/read/${firstIssue.id}?filename=${encodeURIComponent(firstIssue.filename)}`);
      }
    }
  }, [nextIssue, issues, navigate]);

  const handleReadIssue = useCallback((fileId: string) => {
    const issue = issues.find((i) => i.id === fileId);
    if (issue) {
      navigate(`/read/${issue.id}?filename=${encodeURIComponent(issue.filename)}`);
    }
  }, [issues, navigate]);

  // Handle click on issue card
  const handleIssueClick = useCallback((fileId: string, e: React.MouseEvent) => {
    // Handle shift-click for range selection (toggle selection)
    if (e.shiftKey) {
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(fileId)) {
          next.delete(fileId);
        } else {
          next.add(fileId);
        }
        return next;
      });
      return;
    }

    // Handle ctrl/cmd-click for multi-select (toggle selection)
    if (e.ctrlKey || e.metaKey) {
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(fileId)) {
          next.delete(fileId);
        } else {
          next.add(fileId);
        }
        return next;
      });
      return;
    }

    // Plain click (no modifiers) - navigate to issue detail
    navigate(`/issue/${fileId}`);
  }, [navigate]);

  // Handle selection change from checkbox
  const handleSelectionChange = useCallback((fileId: string, selected: boolean) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(fileId);
      } else {
        next.delete(fileId);
      }
      return next;
    });
  }, []);

  // Handle context menu action
  const handleMenuAction = useCallback(async (action: MenuItemPreset | string, fileId: string) => {
    // Get all selected file IDs (include the right-clicked one)
    const targetIds = selectedFiles.has(fileId)
      ? Array.from(selectedFiles)
      : [fileId];

    switch (action) {
      case 'read':
        handleReadIssue(fileId);
        break;

      case 'markRead':
        try {
          setOperationMessage(`Marking ${targetIds.length} issue(s) as read...`);
          await Promise.all(targetIds.map((id) => markAsCompleted(id)));
          setOperationMessage('Marked as read');
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as read'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'markUnread':
        try {
          setOperationMessage(`Marking ${targetIds.length} issue(s) as unread...`);
          await Promise.all(targetIds.map((id) => markAsIncomplete(id)));
          setOperationMessage('Marked as unread');
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as unread'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'addToCollection':
        setCollectionPickerFileIds(targetIds);
        break;

      case 'fetchMetadata':
        startJob(targetIds);
        break;

      case 'editMetadata':
        setEditingMetadataFileIds(targetIds);
        break;

      case 'rebuildCache':
        try {
          setOperationMessage(`Rebuilding cache for ${targetIds.length} file(s)...`);
          await rebuildCache({ fileIds: targetIds, type: 'full' });
          setOperationMessage('Cache rebuild started');
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to rebuild cache'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;
    }
  }, [selectedFiles, handleReadIssue, fetchSeries, startJob]);

  // Helper to convert Series to SeriesForMerge
  const seriesToMergeFormat = (s: Series): SeriesForMerge => ({
    id: s.id,
    name: s.name,
    publisher: s.publisher,
    startYear: s.startYear,
    endYear: s.endYear,
    issueCount: s.issueCount,
    ownedIssueCount: s._count?.issues ?? 0,
    comicVineId: s.comicVineId,
    metronId: s.metronId,
    coverUrl: s.coverUrl,
    coverHash: s.coverHash,
    coverFileId: s.coverFileId,
    aliases: s.aliases,
    summary: s.summary,
    type: s.type,
    createdAt: String(s.createdAt ?? new Date().toISOString()),
    updatedAt: String(s.updatedAt ?? new Date().toISOString()),
  });

  // Handle series selection for merge
  const handleSeriesSelectedForMerge = (selectedSeries: Series[]) => {
    if (!series) return;

    const currentSeriesForMerge = seriesToMergeFormat(series);
    const selectedSeriesForMerge = selectedSeries.map(seriesToMergeFormat);

    setSelectedMergeSeries([currentSeriesForMerge, ...selectedSeriesForMerge]);
    setShowSeriesSelectModal(false);
    setShowMergeModal(true);
  };

  // Handle merge complete
  const handleMergeComplete = () => {
    setShowMergeModal(false);
    setSelectedMergeSeries([]);
    fetchSeries();
  };

  // Handle series-level actions from ActionMenu
  const handleSeriesAction = useCallback(async (actionId: string) => {
    if (!series) return;

    switch (actionId) {
      case 'editSeries':
        setIsEditSeriesModalOpen(true);
        break;

      case 'fetchSeriesMetadata':
        try {
          setOperationMessage('Fetching series metadata...');
          const result = await fetchSeriesMetadata(series.id);
          if (result.needsSearch) {
            setOperationMessage('No linked metadata source. Use Edit Series to search and link.');
          } else if (result.metadata) {
            setOperationMessage('Series metadata updated');
            fetchSeries();
          } else {
            setOperationMessage(result.message || 'No metadata found');
          }
          setTimeout(() => setOperationMessage(null), 3000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to fetch metadata'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'fetchAllIssuesMetadata':
        const allIssueIds = issues.map((i) => i.id);
        if (allIssueIds.length > 0) {
          startJob(allIssueIds);
        }
        break;

      case 'markAllRead':
        try {
          setOperationMessage('Marking all issues as read...');
          await Promise.all(issues.map((i) => markAsCompleted(i.id)));
          setOperationMessage('All issues marked as read');
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as read'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'markAllUnread':
        try {
          setOperationMessage('Marking all issues as unread...');
          await Promise.all(issues.map((i) => markAsIncomplete(i.id)));
          setOperationMessage('All issues marked as unread');
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as unread'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'mergeWith':
        setShowSeriesSelectModal(true);
        break;

      case 'rebuildCache':
        try {
          const allFileIds = issues.map((i) => i.id);
          setOperationMessage(`Rebuilding cache for ${allFileIds.length} file(s)...`);
          await rebuildCache({ fileIds: allFileIds, type: 'full' });
          setOperationMessage('Cache rebuild started');
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to rebuild cache'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;
    }
  }, [series, issues, startJob, fetchSeries]);

  // Handle bulk issue actions from ActionMenu
  const handleBulkIssueAction = useCallback(async (actionId: string) => {
    if (selectedFiles.size === 0) return;

    const targetIds = Array.from(selectedFiles);

    switch (actionId) {
      case 'markRead':
        try {
          setOperationMessage(`Marking ${targetIds.length} issue(s) as read...`);
          await Promise.all(targetIds.map((id) => markAsCompleted(id)));
          setOperationMessage('Marked as read');
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as read'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'markUnread':
        try {
          setOperationMessage(`Marking ${targetIds.length} issue(s) as unread...`);
          await Promise.all(targetIds.map((id) => markAsIncomplete(id)));
          setOperationMessage('Marked as unread');
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as unread'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'fetchMetadata':
        startJob(targetIds);
        break;

      case 'rebuildCache':
        try {
          setOperationMessage(`Rebuilding cache for ${targetIds.length} file(s)...`);
          await rebuildCache({ fileIds: targetIds, type: 'full' });
          setOperationMessage('Cache rebuild started');
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to rebuild cache'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;
    }
  }, [selectedFiles, startJob, fetchSeries]);

  // Parse creatorsJson if available for structured creator data
  // NOTE: This must be before early returns to satisfy React's rules of hooks
  const creatorsWithRoles: CreatorsByRole | undefined = useMemo(() => {
    if (!series?.creatorsJson) return undefined;
    try {
      return JSON.parse(series.creatorsJson) as CreatorsByRole;
    } catch {
      return undefined;
    }
  }, [series?.creatorsJson]);

  if (loading) {
    return (
      <div className="series-detail-loading">
        <div className="spinner" />
        Loading series...
      </div>
    );
  }

  if (error) {
    return (
      <div className="series-detail-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/series')}>Back to Series</button>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="series-detail-error">
        <h2>Series Not Found</h2>
        <button onClick={() => navigate('/series')}>Back to Series</button>
      </div>
    );
  }

  // Progress calculations
  const progress = series.progress;
  const totalOwned = progress?.totalOwned ?? series._count?.issues ?? issues.length;

  // Cover URL with fallback priority: User-set file > API cover (local cache) > First Issue
  const firstIssueId = issues[0]?.id;
  const coverUrl = series.coverFileId
    ? getCoverUrl(series.coverFileId)
    : series.coverHash
      ? getApiCoverUrl(series.coverHash)
      : firstIssueId
        ? getCoverUrl(firstIssueId)
        : null;

  // Parse entity lists
  const genreList = series.genres?.split(',').map((g) => g.trim()).filter(Boolean) ?? [];
  const tagList = series.tags?.split(',').map((t) => t.trim()).filter(Boolean) ?? [];
  const characterList = series.characters?.split(',').map((c) => c.trim()).filter(Boolean) ?? [];
  const teamList = series.teams?.split(',').map((t) => t.trim()).filter(Boolean) ?? [];
  const locationList = series.locations?.split(',').map((l) => l.trim()).filter(Boolean) ?? [];
  const storyArcList = series.storyArcs?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  // Check if series has content to show
  const hasDescription = series.summary;
  const hasTags = genreList.length > 0 || tagList.length > 0;
  const hasEntities = characterList.length > 0 || teamList.length > 0 || locationList.length > 0 || storyArcList.length > 0;

  // Check if we have any creators (either structured or legacy format)
  const hasCreatorsJson = creatorsWithRoles && Object.values(creatorsWithRoles).some((arr: string[] | undefined) => arr && arr.length > 0);
  const hasCreatorsLegacy = series.creators && series.creators.trim().length > 0;
  const hasCreators = hasCreatorsJson || hasCreatorsLegacy;
  const hasSidebar = hasTags || hasEntities;
  const hasMainContent = hasDescription || hasCreators;

  return (
    <div className="series-detail-page">
      {/* Hero Section */}
      <SeriesHero
        series={series}
        coverUrl={coverUrl}
        issues={issues}
        nextIssue={nextIssue}
        actionItems={SERIES_ACTION_ITEMS}
        onContinueReading={handleContinueReading}
        onSeriesAction={handleSeriesAction}
        onBackClick={() => navigate('/series')}
      />

      {/* 75/25 Content Layout: Description + Sidebar */}
      {(hasMainContent || hasSidebar) && (
        <div className="series-content-grid">
          {/* Left column (75%): Description + Creators */}
          <div className="series-content-main">
            {/* Description */}
            {hasDescription && (
              <div className="series-description-section">
                <h3 className="series-section-title">About</h3>
                <div
                  ref={descriptionRef}
                  className={`series-description-content ${isDescriptionExpanded ? 'series-description-content--expanded' : descriptionNeedsTruncation ? 'series-description-content--clamped' : ''}`}
                >
                  <MarkdownContent content={series.summary!} className="series-summary-text" />
                </div>
                {descriptionNeedsTruncation && (
                  <button
                    className="series-description-toggle"
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    aria-expanded={isDescriptionExpanded}
                  >
                    {isDescriptionExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}

            {/* Creators */}
            {hasCreators && (
              <div className="series-creators-section">
                <CreatorCredits
                  creatorsWithRoles={creatorsWithRoles}
                  creators={series.creators}
                  expandable={true}
                  maxPrimary={6}
                />
              </div>
            )}
          </div>

          {/* Right column (25%): All metadata */}
          {hasSidebar && (
            <div className="series-content-sidebar">
              {/* Genres */}
              {genreList.length > 0 && (
                <ExpandablePillSection
                  title="Genres"
                  items={genreList}
                  variant="genre"
                  maxVisible={8}
                />
              )}

              {/* Tags */}
              {tagList.length > 0 && (
                <ExpandablePillSection
                  title="Tags"
                  items={tagList}
                  variant="tag"
                  maxVisible={8}
                />
              )}

              {/* Characters */}
              {characterList.length > 0 && (
                <ExpandablePillSection
                  title="Characters"
                  items={characterList}
                  variant="character"
                  maxVisible={8}
                />
              )}

              {/* Teams */}
              {teamList.length > 0 && (
                <ExpandablePillSection
                  title="Teams"
                  items={teamList}
                  variant="team"
                  maxVisible={6}
                />
              )}

              {/* Locations */}
              {locationList.length > 0 && (
                <ExpandablePillSection
                  title="Locations"
                  items={locationList}
                  variant="location"
                  maxVisible={6}
                />
              )}

              {/* Story Arcs */}
              {storyArcList.length > 0 && (
                <ExpandablePillSection
                  title="Story Arcs"
                  items={storyArcList}
                  variant="arc"
                  maxVisible={6}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* User notes - separate if exists */}
      {series.userNotes && (
        <div className="series-user-notes">
          <p className="user-notes">{series.userNotes}</p>
        </div>
      )}

      {/* Issues section */}
      <div className="series-issues-section">
        <div className="series-issues-header">
          <h2>Issues <span className="issue-count-pill">{totalOwned}</span></h2>
          <div className="series-issues-header-actions">
            {selectedFiles.size > 0 && (
              <div className="series-issues-selection-info">
                <span>{selectedFiles.size} selected</span>
                <button
                  className="btn-ghost"
                  onClick={() => setSelectedFiles(new Set())}
                >
                  Clear
                </button>
                <ActionMenu
                  items={ISSUE_BULK_ACTION_ITEMS.map(item => ({
                    ...item,
                    label: item.label + ` (${selectedFiles.size})`,
                  }))}
                  onAction={handleBulkIssueAction}
                  ariaLabel="Bulk issue actions"
                  size="small"
                />
              </div>
            )}
          </div>
        </div>

        {/* Operation message */}
        {operationMessage && (
          <div className="series-operation-message">
            {operationMessage}
          </div>
        )}

        {/* Issues Grid */}
        <IssuesGrid
          issues={issues}
          selectedFiles={selectedFiles}
          onIssueClick={handleIssueClick}
          onReadIssue={handleReadIssue}
          onSelectionChange={handleSelectionChange}
          onMenuAction={handleMenuAction}
        />
      </div>

      {/* Metadata Editor Modal */}
      {editingMetadataFileIds && (
        <div className="modal-overlay" onClick={() => setEditingMetadataFileIds(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <MetadataEditor
              fileIds={editingMetadataFileIds}
              onClose={() => setEditingMetadataFileIds(null)}
              onSave={() => {
                setEditingMetadataFileIds(null);
                fetchSeries();
              }}
            />
          </div>
        </div>
      )}

      {/* Edit Series Modal */}
      {seriesId && (
        <EditSeriesModal
          seriesId={seriesId}
          isOpen={isEditSeriesModalOpen}
          onClose={() => setIsEditSeriesModalOpen(false)}
          onSave={() => {
            fetchSeries();
          }}
        />
      )}

      {/* Series Select Modal for Merge */}
      <SeriesSelectModal
        isOpen={showSeriesSelectModal}
        onClose={() => setShowSeriesSelectModal(false)}
        onSelect={handleSeriesSelectedForMerge}
        excludeIds={seriesId ? [seriesId] : []}
        title="Select Series to Merge"
        multiSelect={true}
      />

      {/* Merge Series Modal */}
      {showMergeModal && selectedMergeSeries.length > 0 && (
        <MergeSeriesModal
          isOpen={showMergeModal}
          onClose={() => {
            setShowMergeModal(false);
            setSelectedMergeSeries([]);
          }}
          onMergeComplete={handleMergeComplete}
          initialSeries={selectedMergeSeries}
          initialTargetId={seriesId}
        />
      )}

      {/* Collection Picker Modal */}
      <CollectionPickerModal
        isOpen={collectionPickerFileIds.length > 0}
        onClose={() => setCollectionPickerFileIds([])}
        fileIds={collectionPickerFileIds}
      />
    </div>
  );
}
