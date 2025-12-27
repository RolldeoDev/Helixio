/**
 * IssueDetailPage Component
 *
 * Detailed view of a single comic issue with full metadata, reading progress,
 * and actions. Redesigned to match SeriesDetailPage patterns with cinematic hero,
 * 75/25 grid layout, and component reuse.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  getFile,
  getComicInfo,
  getArchiveInfo,
  getReadingProgress,
  getFileReadingHistory,
  getCoverUrl,
  getFileCoverInfo,
  getApiCoverUrl,
  markAsCompleted,
  markAsIncomplete,
  ComicFile,
  ComicInfo,
  ArchiveInfo,
  ReadingProgress,
  ReadingSession,
  FileCoverInfo,
} from '../services/api.service';
import { useMetadataJob } from '../contexts/MetadataJobContext';
import { useDownloads } from '../contexts/DownloadContext';
import { useBreadcrumbs, NavigationOrigin, BreadcrumbSegment } from '../contexts/BreadcrumbContext';
import { MetadataEditor } from '../components/MetadataEditor';
import { IssueMetadataGrabber } from '../components/IssueMetadataGrabber';
import { MarkdownContent } from '../components/MarkdownContent';
import { DetailHeroSection } from '../components/DetailHeroSection';
import { IssueHero } from '../components/IssueHero';
import { ExpandablePillSection } from '../components/ExpandablePillSection';
import { CreatorCredits, type CreatorsByRole } from '../components/CreatorCredits';
import { type ActionMenuItem } from '../components/ActionMenu';
import { formatFileSize } from '../utils/format';
import './IssueDetailPage.css';

// =============================================================================
// Constants
// =============================================================================

const ISSUE_ACTION_ITEMS: ActionMenuItem[] = [
  { id: 'editMetadata', label: 'Edit Metadata' },
  { id: 'grabMetadata', label: 'Grab Metadata', dividerBefore: true },
  { id: 'batchFetch', label: 'Batch Fetch Metadata' },
  { id: 'markRead', label: 'Mark as Read', dividerBefore: true },
  { id: 'markUnread', label: 'Mark as Unread' },
  { id: 'download', label: 'Download', dividerBefore: true },
];

// =============================================================================
// Helper Functions
// =============================================================================

function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatPublicationDate(
  year?: number | null,
  month?: number | null,
  day?: number | null
): string {
  if (!year) return '';
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  if (month && day) {
    return `${months[month - 1]} ${day}, ${year}`;
  }
  if (month) {
    return `${months[month - 1]} ${year}`;
  }
  return String(year);
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return 'In progress';
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const minutes = Math.round((end - start) / (1000 * 60));
  if (minutes < 1) return 'Less than a minute';
  if (minutes === 1) return '1 minute';
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return `${hours}h ${remainingMinutes}m`;
}

// =============================================================================
// Main Component
// =============================================================================

export function IssueDetailPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { startJob } = useMetadataJob();
  const { downloadSingleFile } = useDownloads();
  const { setBreadcrumbs } = useBreadcrumbs();

  // Get navigation origin from location state (if navigated from another page)
  const navOrigin = location.state as NavigationOrigin | undefined;

  // Data state
  const [file, setFile] = useState<ComicFile | null>(null);
  const [comicInfo, setComicInfo] = useState<ComicInfo | null>(null);
  const [archiveInfo, setArchiveInfo] = useState<ArchiveInfo | null>(null);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [history, setHistory] = useState<ReadingSession[]>([]);
  const [coverInfo, setCoverInfo] = useState<FileCoverInfo | null>(null);
  const [coverKey, setCoverKey] = useState(0);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [isGrabbingMetadata, setIsGrabbingMetadata] = useState(false);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [isFileInfoExpanded, setIsFileInfoExpanded] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [summaryNeedsTruncation, setSummaryNeedsTruncation] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!fileId) return;

    setLoading(true);
    setError(null);

    try {
      const [fileResult, comicInfoResult, archiveResult, progressResult, historyResult, coverInfoResult] =
        await Promise.allSettled([
          getFile(fileId),
          getComicInfo(fileId),
          getArchiveInfo(fileId),
          getReadingProgress(fileId),
          getFileReadingHistory(fileId),
          getFileCoverInfo(fileId),
        ]);

      if (fileResult.status === 'fulfilled') {
        setFile(fileResult.value);
      } else {
        throw new Error('Failed to load file');
      }

      if (comicInfoResult.status === 'fulfilled') {
        setComicInfo(comicInfoResult.value.comicInfo || null);
      }

      if (archiveResult.status === 'fulfilled') {
        setArchiveInfo(archiveResult.value);
      }

      if (progressResult.status === 'fulfilled') {
        setProgress(progressResult.value);
      }

      if (historyResult.status === 'fulfilled') {
        setHistory(historyResult.value.sessions || []);
      }

      if (coverInfoResult.status === 'fulfilled') {
        setCoverInfo(coverInfoResult.value);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issue');
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set breadcrumbs when file data loads - respects navigation origin
  useEffect(() => {
    if (file && fileId) {
      const seriesName = comicInfo?.Series || file.metadata?.series || '';
      const seriesId = (file as unknown as { seriesId?: string }).seriesId;
      const number = comicInfo?.Number || file.metadata?.number;
      const title = comicInfo?.Title || file.metadata?.title;

      // Build issue label: prefer "Series #Number", then title, then filename
      let issueLabel = file.filename;
      if (seriesName && number) {
        issueLabel = `${seriesName} #${number}`;
      } else if (title) {
        issueLabel = title;
      }

      // Build breadcrumb segments based on navigation origin
      const segments: BreadcrumbSegment[] = [];

      if (navOrigin?.from === 'library') {
        // Came from Library page
        segments.push({ label: 'Library', path: '/library' });
        if (navOrigin.libraryId && navOrigin.libraryName) {
          segments.push({ label: navOrigin.libraryName, path: `/library/${navOrigin.libraryId}` });
        }
      } else if (navOrigin?.from === 'series' && navOrigin.seriesId && navOrigin.seriesName) {
        // Came from Series page with series info
        segments.push({ label: 'Series', path: '/series' });
        segments.push({ label: navOrigin.seriesName, path: `/series/${navOrigin.seriesId}` });
      } else if (navOrigin?.from === 'folders') {
        // Came from Folders page
        segments.push({ label: 'Folders', path: '/folders' });
      } else if (navOrigin?.from === 'collections') {
        // Came from Collections page
        segments.push({ label: 'Collections', path: '/collections' });
        if (navOrigin.collectionId && navOrigin.collectionName) {
          segments.push({ label: navOrigin.collectionName, path: `/lists/${navOrigin.collectionId}` });
        }
      } else if (navOrigin?.from === 'search') {
        // Came from Search
        segments.push({ label: 'Search', path: '/search' });
      } else if (navOrigin?.from === 'home') {
        // Came from Home page
        segments.push({ label: 'Home', path: '/' });
      } else {
        // Default: show logical hierarchy (Series > [Series Name])
        segments.push({ label: 'Series', path: '/series' });
        if (seriesId && seriesName) {
          segments.push({ label: seriesName, path: `/series/${seriesId}` });
        }
      }

      // Add issue segment (current page)
      segments.push({ label: issueLabel, path: `/issue/${fileId}` });

      setBreadcrumbs(segments);
    }
  }, [file, comicInfo, fileId, setBreadcrumbs, navOrigin]);

  // Check if summary needs truncation
  useEffect(() => {
    if (summaryRef.current) {
      const lineHeight = parseFloat(getComputedStyle(summaryRef.current).lineHeight) || 24;
      const maxHeight = lineHeight * 6; // 6 lines
      setSummaryNeedsTruncation(summaryRef.current.scrollHeight > maxHeight + 2);
    }
  }, [comicInfo, file]);

  // Action handlers
  const handleStartReading = useCallback(() => {
    if (!file) return;
    const page = progress?.currentPage || 0;
    navigate(`/read/${fileId}?filename=${encodeURIComponent(file.filename)}&page=${page}`);
  }, [file, fileId, navigate, progress]);

  const handleMarkRead = useCallback(async () => {
    if (!fileId) return;
    try {
      setOperationMessage('Marking as read...');
      const result = await markAsCompleted(fileId);
      setProgress(result);
      setOperationMessage('Marked as read');
      setTimeout(() => setOperationMessage(null), 2000);
    } catch (err) {
      setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as read'}`);
      setTimeout(() => setOperationMessage(null), 3000);
    }
  }, [fileId]);

  const handleMarkUnread = useCallback(async () => {
    if (!fileId) return;
    try {
      setOperationMessage('Marking as unread...');
      const result = await markAsIncomplete(fileId);
      setProgress(result);
      setOperationMessage('Marked as unread');
      setTimeout(() => setOperationMessage(null), 2000);
    } catch (err) {
      setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as unread'}`);
      setTimeout(() => setOperationMessage(null), 3000);
    }
  }, [fileId]);

  const handleFetchMetadata = useCallback(() => {
    if (!fileId) return;
    startJob([fileId]);
  }, [fileId, startJob]);

  const handleDownload = useCallback(() => {
    if (!file) return;
    downloadSingleFile(file.id, file.filename);
  }, [file, downloadSingleFile]);

  const handleCoverChange = useCallback((result: { source: 'auto' | 'page' | 'custom'; pageIndex?: number; coverHash?: string }) => {
    setCoverInfo((prev) => ({
      id: prev?.id || '',
      coverSource: result.source,
      coverPageIndex: result.pageIndex ?? null,
      coverHash: result.coverHash ?? null,
      coverUrl: null,
    }));
    setCoverKey((k) => k + 1);
    setOperationMessage('Cover updated');
    setTimeout(() => setOperationMessage(null), 2000);
  }, []);

  // Issue action handler for ActionMenu
  const handleIssueAction = useCallback((actionId: string) => {
    switch (actionId) {
      case 'editMetadata':
        setIsEditingMetadata(true);
        break;
      case 'grabMetadata':
        setIsGrabbingMetadata(true);
        break;
      case 'batchFetch':
        handleFetchMetadata();
        break;
      case 'markRead':
        handleMarkRead();
        break;
      case 'markUnread':
        handleMarkUnread();
        break;
      case 'download':
        handleDownload();
        break;
    }
  }, [handleFetchMetadata, handleMarkRead, handleMarkUnread, handleDownload]);

  const handleGrabMetadataSuccess = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // CreatorsByRole for CreatorCredits component - must be before early returns
  const creatorsWithRoles: CreatorsByRole = useMemo(() => {
    const parse = (s?: string) => s?.split(',').map((n) => n.trim()).filter(Boolean) || [];
    const metadata = file?.metadata;
    const writer = comicInfo?.Writer || metadata?.writer || '';
    const penciller = comicInfo?.Penciller || metadata?.penciller || '';
    const inker = comicInfo?.Inker || '';
    const colorist = comicInfo?.Colorist || '';
    const letterer = comicInfo?.Letterer || '';
    const coverArtist = comicInfo?.CoverArtist || '';
    const editor = (comicInfo as Record<string, unknown> | null)?.Editor as string || '';
    return {
      writer: parse(writer),
      penciller: parse(penciller),
      inker: parse(inker),
      colorist: parse(colorist),
      letterer: parse(letterer),
      coverArtist: parse(coverArtist),
      editor: parse(editor),
    };
  }, [file, comicInfo]);

  // Loading state
  if (loading) {
    return (
      <div className="issue-detail-loading">
        <div className="spinner" />
        Loading issue...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="issue-detail-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  // File not found
  if (!file) {
    return (
      <div className="issue-detail-error">
        <h2>Issue Not Found</h2>
        <button onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  // Extract metadata
  const metadata = file.metadata;
  const series = comicInfo?.Series || metadata?.series || '';
  const summary = comicInfo?.Summary || metadata?.summary || '';
  const genre = comicInfo?.Genre || metadata?.genre || '';
  const tags = comicInfo?.Tags || '';
  const characters = comicInfo?.Characters || metadata?.characters || '';
  const teams = comicInfo?.Teams || metadata?.teams || '';
  const locations = comicInfo?.Locations || metadata?.locations || '';
  const storyArc = comicInfo?.StoryArc || metadata?.storyArc || '';
  const pageCount = comicInfo?.PageCount || archiveInfo?.archive.fileCount || 0;
  const notes = comicInfo?.Notes || '';
  const year = comicInfo?.Year || metadata?.year;
  const month = comicInfo?.Month || metadata?.month;
  const day = comicInfo?.Day;

  // Parse comma-separated lists
  const parseList = (value: string | null | undefined): string[] =>
    value?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  const genreList = parseList(genre);
  const tagList = parseList(tags);
  const characterList = parseList(characters);
  const teamList = parseList(teams);
  const locationList = parseList(locations);
  const storyArcList = parseList(storyArc);

  // Check if we have creators
  const hasCreators = Object.values(creatorsWithRoles).some((arr) => arr && arr.length > 0);

  // Progress calculations
  const totalPages = progress?.totalPages ?? pageCount ?? 0;

  // Cover URL
  const coverUrl = coverInfo?.coverSource === 'custom' && coverInfo?.coverHash
    ? getApiCoverUrl(coverInfo.coverHash)
    : `${getCoverUrl(fileId!)}?v=${coverKey}`;

  // Get seriesId from file
  const fileSeriesId = (file as unknown as { seriesId?: string }).seriesId;

  // File extension
  const fileExtension = file.filename.split('.').pop()?.toUpperCase() || '';

  // Check what content we have
  const hasSummary = Boolean(summary);
  const hasFullDate = year && (month || day);
  const hasNotes = Boolean(notes);
  const _hasMainContent = hasSummary || hasCreators || hasNotes;
  const _hasSidebar = hasFullDate || genreList.length > 0 || tagList.length > 0 ||
    characterList.length > 0 || teamList.length > 0 || locationList.length > 0 || storyArcList.length > 0;
  void _hasMainContent; // Reserved for future layout logic
  void _hasSidebar; // Reserved for future layout logic

  return (
    <div className="issue-detail-page">
      {/* Operation message */}
      {operationMessage && (
        <div className="issue-operation-message">{operationMessage}</div>
      )}

      {/* Hero Section with Two-Column Layout */}
      <DetailHeroSection coverUrl={coverUrl}>
        <div className="issue-hero-grid">
          {/* Main column (75%): Hero + Summary + Notes + Credits */}
          <div className="issue-hero-main">
            {/* Hero Content */}
            <IssueHero
              file={file}
              comicInfo={comicInfo}
              progress={progress}
              coverUrl={coverUrl}
              historyCount={history.length}
              totalPages={totalPages}
              actionItems={ISSUE_ACTION_ITEMS}
              onStartReading={handleStartReading}
              onIssueAction={handleIssueAction}
              seriesId={fileSeriesId}
              seriesName={series}
            />

            {/* Summary/Description & Creators - Combined Section */}
            {(hasSummary || hasCreators) && (
              <div className="issue-description-section">
                {hasSummary && (
                  <>
                    <h3 className="issue-section-title">About</h3>
                    <div
                      ref={summaryRef}
                      className={`issue-description-content ${isSummaryExpanded ? 'expanded' : summaryNeedsTruncation ? 'clamped' : ''}`}
                    >
                      <MarkdownContent content={summary} />
                    </div>
                    {summaryNeedsTruncation && (
                      <button
                        className="issue-description-toggle"
                        onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                        aria-expanded={isSummaryExpanded}
                      >
                        {isSummaryExpanded ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </>
                )}

                {/* Creators */}
                {hasCreators && (
                  <div className="issue-creators-section">
                    <CreatorCredits
                      creatorsWithRoles={creatorsWithRoles}
                      creators={null}
                      expandable={true}
                      maxPrimary={6}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Notes - separate section */}
            {hasNotes && (
              <div className="issue-notes-section">
                <p className="issue-notes-content">{notes}</p>
              </div>
            )}
          </div>

          {/* Sidebar column (25%): Metadata */}
          <aside className="issue-hero-sidebar">
            {/* Release Date */}
            {hasFullDate && (
              <div className="issue-release-date">
                <span className="release-date-value">{formatPublicationDate(year, month, day)}</span>
                <span className="release-date-label">Release Date</span>
              </div>
            )}

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
          </aside>
        </div>
      </DetailHeroSection>

      {/* Collapsible Reading History */}
      {history.length > 0 && (
        <div className="issue-collapsible-section">
          <button
            className="issue-collapsible-toggle"
            onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
            aria-expanded={isHistoryExpanded}
          >
            <span>Reading History</span>
            <span className="toggle-icon">{isHistoryExpanded ? '−' : '+'}</span>
          </button>
          {isHistoryExpanded && (
            <div className="issue-collapsible-content">
              <div className="history-compact">
                {history.slice(0, 5).map((session) => (
                  <div key={session.id} className="history-row">
                    <span className="history-date">{formatDate(session.startedAt)}</span>
                    <span className="history-info">
                      {formatDuration(session.startedAt, session.endedAt)}
                      {session.endPage !== null && ` · pp. ${session.startPage + 1}-${session.endPage + 1}`}
                    </span>
                    {session.completed && <span className="history-badge">Done</span>}
                  </div>
                ))}
                {history.length > 5 && (
                  <div className="history-more">+{history.length - 5} more sessions</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsible File Information */}
      <div className="issue-collapsible-section">
        <button
          className="issue-collapsible-toggle"
          onClick={() => setIsFileInfoExpanded(!isFileInfoExpanded)}
          aria-expanded={isFileInfoExpanded}
        >
          <span>File Information</span>
          <span className="toggle-icon">{isFileInfoExpanded ? '−' : '+'}</span>
        </button>
        {isFileInfoExpanded && (
          <div className="issue-collapsible-content">
            <div className="file-info-grid">
              <div className="file-info-item">
                <span className="file-info-label">Filename</span>
                <span className="file-info-value">{file.filename}</span>
              </div>
              <div className="file-info-item">
                <span className="file-info-label">Size</span>
                <span className="file-info-value">{formatFileSize(file.size)}</span>
              </div>
              <div className="file-info-item">
                <span className="file-info-label">Format</span>
                <span className="file-info-value">{fileExtension}</span>
              </div>
              {archiveInfo?.archive.fileCount && (
                <div className="file-info-item">
                  <span className="file-info-label">Pages</span>
                  <span className="file-info-value">{archiveInfo.archive.fileCount}</span>
                </div>
              )}
              <div className="file-info-item">
                <span className="file-info-label">Modified</span>
                <span className="file-info-value">{formatDate(file.modifiedAt)}</span>
              </div>
            </div>
            <div className="file-path">
              <span className="file-info-label">Path</span>
              <span className="file-info-value path-value">{file.relativePath}</span>
            </div>

            {/* External IDs */}
            {(() => {
              const extendedMetadata = metadata as Record<string, unknown> | null | undefined;
              const comicVineId = extendedMetadata?.comicVineId as string | undefined;
              const metronId = extendedMetadata?.metronId as string | undefined;
              if (!comicVineId && !metronId) return null;
              return (
                <div className="external-ids">
                  {comicVineId && (
                    <a
                      href={`https://comicvine.gamespot.com/issue/4000-${comicVineId}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="external-link"
                    >
                      ComicVine
                    </a>
                  )}
                  {metronId && (
                    <a
                      href={`https://metron.cloud/issue/${metronId}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="external-link"
                    >
                      Metron
                    </a>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Metadata Editor Modal */}
      {isEditingMetadata && fileId && (
        <div className="modal-overlay" onClick={() => setIsEditingMetadata(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <MetadataEditor
              fileIds={[fileId]}
              onClose={() => setIsEditingMetadata(false)}
              onSave={() => {
                setIsEditingMetadata(false);
                fetchData();
              }}
              onCoverChange={handleCoverChange}
              onGrabMetadata={() => {
                setIsEditingMetadata(false);
                setIsGrabbingMetadata(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Issue Metadata Grabber Modal */}
      {isGrabbingMetadata && fileId && (
        <IssueMetadataGrabber
          fileId={fileId}
          onClose={() => setIsGrabbingMetadata(false)}
          onSuccess={handleGrabMetadataSuccess}
        />
      )}
    </div>
  );
}
