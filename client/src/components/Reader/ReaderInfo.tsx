/**
 * Reader Info Panel
 *
 * Side panel displaying issue metadata, creators, and reading statistics.
 * Follows the ReaderSettings drawer pattern with overlay backdrop.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useReader } from './ReaderContext';
import {
  getComicInfo,
  getArchiveInfo,
  getReadingProgress,
  getFileReadingHistory,
  getFile,
  ComicInfo,
  ArchiveInfo,
  ReadingProgress,
  ReadingSession,
  ComicFile,
} from '../../services/api.service';
import { ExpandablePillSection } from '../ExpandablePillSection';
import { CreatorCredits, type CreatorsByRole } from '../CreatorCredits';
import { MarkdownContent } from '../MarkdownContent';
import { RatingStars } from '../RatingStars';
import { useIssueUserData, useUpdateIssueUserData } from '../../hooks/queries';
import { formatFileSize } from '../../utils/format';
import './ReaderInfo.css';

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
// Types
// =============================================================================

interface InfoData {
  file: ComicFile | null;
  comicInfo: ComicInfo | null;
  archiveInfo: ArchiveInfo | null;
  progress: ReadingProgress | null;
  history: ReadingSession[];
}

// =============================================================================
// Component
// =============================================================================

export function ReaderInfo() {
  const { state, closeInfo } = useReader();
  const [data, setData] = useState<InfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  // User data state
  const [localNotes, setLocalNotes] = useState('');
  const [localReview, setLocalReview] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isEditingReview, setIsEditingReview] = useState(false);

  // User data hooks
  const { data: userDataResponse } = useIssueUserData(state.fileId);
  const updateUserData = useUpdateIssueUserData();
  const userData = userDataResponse?.data;

  // Fetch data when panel opens
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const [fileResult, comicInfoResult, archiveResult, progressResult, historyResult] =
          await Promise.allSettled([
            getFile(state.fileId),
            getComicInfo(state.fileId),
            getArchiveInfo(state.fileId),
            getReadingProgress(state.fileId),
            getFileReadingHistory(state.fileId),
          ]);

        setData({
          file: fileResult.status === 'fulfilled' ? fileResult.value : null,
          comicInfo: comicInfoResult.status === 'fulfilled' ? comicInfoResult.value.comicInfo || null : null,
          archiveInfo: archiveResult.status === 'fulfilled' ? archiveResult.value : null,
          progress: progressResult.status === 'fulfilled' ? progressResult.value : null,
          history: historyResult.status === 'fulfilled' ? historyResult.value.sessions || [] : [],
        });
      } catch (err) {
        setError('Failed to load issue information');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [state.fileId]);

  // Sync local notes state with server data
  useEffect(() => {
    if (!isEditingNotes) {
      setLocalNotes(userData?.privateNotes || '');
    }
  }, [userData?.privateNotes, isEditingNotes]);

  // Sync local review state with server data
  useEffect(() => {
    if (!isEditingReview) {
      setLocalReview(userData?.publicReview || '');
    }
  }, [userData?.publicReview, isEditingReview]);

  // Handle rating change
  const handleRatingChange = useCallback((rating: number | null) => {
    updateUserData.mutate({
      fileId: state.fileId,
      input: { rating },
    });
  }, [state.fileId, updateUserData]);

  // Handle notes save on blur
  const handleNotesSave = useCallback(() => {
    setIsEditingNotes(false);
    const trimmed = localNotes.trim() || null;
    if (trimmed !== (userData?.privateNotes || null)) {
      updateUserData.mutate({
        fileId: state.fileId,
        input: { privateNotes: trimmed },
      });
    }
  }, [localNotes, userData?.privateNotes, state.fileId, updateUserData]);

  // Handle review save on blur
  const handleReviewSave = useCallback(() => {
    setIsEditingReview(false);
    const trimmed = localReview.trim() || null;
    if (trimmed !== (userData?.publicReview || null)) {
      updateUserData.mutate({
        fileId: state.fileId,
        input: { publicReview: trimmed },
      });
    }
  }, [localReview, userData?.publicReview, state.fileId, updateUserData]);

  // Toggle review visibility
  const handleToggleVisibility = useCallback(() => {
    updateUserData.mutate({
      fileId: state.fileId,
      input: {
        reviewVisibility: userData?.reviewVisibility === 'public' ? 'private' : 'public',
      },
    });
  }, [state.fileId, userData?.reviewVisibility, updateUserData]);

  // Handle overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeInfo();
    }
  };

  // Parse comma-separated list
  const parseList = (value: string | null | undefined): string[] =>
    value?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  // Memoized derived data
  const { comicInfo, file, archiveInfo, progress, history } = data || {};
  const metadata = file?.metadata;

  // Extract metadata fields
  const series = comicInfo?.Series || metadata?.series || '';
  const issueNumber = comicInfo?.Number || metadata?.number || '';
  const title = comicInfo?.Title || metadata?.title || '';
  const volume = comicInfo?.Volume || metadata?.volume;
  const summary = comicInfo?.Summary || metadata?.summary || '';
  const genre = comicInfo?.Genre || metadata?.genre || '';
  const tags = comicInfo?.Tags || '';
  const characters = comicInfo?.Characters || metadata?.characters || '';
  const teams = comicInfo?.Teams || metadata?.teams || '';
  const locations = comicInfo?.Locations || metadata?.locations || '';
  const storyArc = comicInfo?.StoryArc || metadata?.storyArc || '';
  const publisher = comicInfo?.Publisher || metadata?.publisher || '';
  const year = comicInfo?.Year || metadata?.year;
  const month = comicInfo?.Month || metadata?.month;
  const day = comicInfo?.Day;
  const pageCount = comicInfo?.PageCount || archiveInfo?.archive.fileCount || state.totalPages || 0;

  // Parse lists
  const genreList = parseList(genre);
  const tagList = parseList(tags);
  const characterList = parseList(characters);
  const teamList = parseList(teams);
  const locationList = parseList(locations);
  const storyArcList = parseList(storyArc);

  // Build creators data
  const creatorsWithRoles: CreatorsByRole = useMemo(() => {
    if (!data) return {};
    const parse = (s?: string) => s?.split(',').map((n) => n.trim()).filter(Boolean) || [];
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
  }, [data, comicInfo, metadata]);

  const hasCreators = Object.values(creatorsWithRoles).some((arr) => arr && arr.length > 0);

  // Progress info
  const currentPage = state.currentPage + 1;
  const totalPages = state.totalPages;
  const progressPercent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const isCompleted = progress?.completed ?? false;

  // File info
  const fileExtension = file?.filename.split('.').pop()?.toUpperCase() || '';
  const fileSize = file?.size ? formatFileSize(file.size) : '';

  // Build display title
  let displayTitle = series;
  if (volume) displayTitle += ` Vol. ${volume}`;
  if (issueNumber) displayTitle += ` #${issueNumber}`;
  if (title) displayTitle += ` - ${title}`;
  if (!displayTitle) displayTitle = file?.filename || 'Issue';

  // Check what content we have
  const hasSummary = Boolean(summary);
  const hasReleaseDate = Boolean(year);
  const hasMetadata = genreList.length > 0 || tagList.length > 0 || characterList.length > 0 ||
    teamList.length > 0 || locationList.length > 0 || storyArcList.length > 0;

  return (
    <div className="reader-info-overlay" onClick={handleOverlayClick}>
      <div className="reader-info-panel">
        {/* Header */}
        <div className="reader-info-header">
          <h3>Issue Info</h3>
          <button className="reader-info-close" onClick={closeInfo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="reader-info-content">
          {loading && (
            <div className="reader-info-loading">
              <div className="spinner" />
              <span>Loading...</span>
            </div>
          )}

          {error && (
            <div className="reader-info-error">
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Title Section */}
              <div className="reader-info-section reader-info-title-section">
                <h4 className="reader-info-display-title">{displayTitle}</h4>
                {publisher && <p className="reader-info-publisher">{publisher}</p>}
              </div>

              {/* Reading Progress */}
              <div className="reader-info-section">
                <div className="reader-info-section-title">Reading Progress</div>
                <div className="reader-info-progress">
                  <div className="reader-info-progress-bar">
                    <div
                      className="reader-info-progress-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="reader-info-progress-text">
                    <span>Page {currentPage} of {totalPages}</span>
                    <span>{progressPercent}%</span>
                  </div>
                  {isCompleted && (
                    <span className="reader-info-completed-badge">Completed</span>
                  )}
                </div>
              </div>

              {/* Release Date */}
              {hasReleaseDate && (
                <div className="reader-info-section">
                  <div className="reader-info-section-title">Release Date</div>
                  <div className="reader-info-value">
                    {formatPublicationDate(year, month, day)}
                  </div>
                </div>
              )}

              {/* Summary */}
              {hasSummary && (
                <div className="reader-info-section">
                  <div className="reader-info-section-title">Summary</div>
                  <div className={`reader-info-summary ${!isSummaryExpanded ? 'clamped' : ''}`}>
                    <MarkdownContent content={summary} />
                  </div>
                  {summary.length > 200 && (
                    <button
                      className="reader-info-expand-btn"
                      onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                    >
                      {isSummaryExpanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </div>
              )}

              {/* Creators */}
              {hasCreators && (
                <div className="reader-info-section">
                  <div className="reader-info-section-title">Credits</div>
                  <CreatorCredits creators={null} creatorsWithRoles={creatorsWithRoles} />
                </div>
              )}

              {/* Metadata Tags */}
              {hasMetadata && (
                <div className="reader-info-section reader-info-metadata">
                  {genreList.length > 0 && (
                    <ExpandablePillSection
                      title="Genres"
                      items={genreList}
                      variant="genre"
                      maxVisible={6}
                    />
                  )}
                  {tagList.length > 0 && (
                    <ExpandablePillSection
                      title="Tags"
                      items={tagList}
                      variant="tag"
                      maxVisible={6}
                    />
                  )}
                  {characterList.length > 0 && (
                    <ExpandablePillSection
                      title="Characters"
                      items={characterList}
                      variant="character"
                      maxVisible={6}
                    />
                  )}
                  {teamList.length > 0 && (
                    <ExpandablePillSection
                      title="Teams"
                      items={teamList}
                      variant="team"
                      maxVisible={6}
                    />
                  )}
                  {locationList.length > 0 && (
                    <ExpandablePillSection
                      title="Locations"
                      items={locationList}
                      variant="location"
                      maxVisible={6}
                    />
                  )}
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

              {/* File Information */}
              <div className="reader-info-section">
                <div className="reader-info-section-title">File Information</div>
                <div className="reader-info-file-grid">
                  <div className="reader-info-file-item">
                    <span className="reader-info-file-label">Format</span>
                    <span className="reader-info-file-value">{fileExtension}</span>
                  </div>
                  <div className="reader-info-file-item">
                    <span className="reader-info-file-label">Size</span>
                    <span className="reader-info-file-value">{fileSize}</span>
                  </div>
                  <div className="reader-info-file-item">
                    <span className="reader-info-file-label">Pages</span>
                    <span className="reader-info-file-value">{pageCount}</span>
                  </div>
                </div>
                <div className="reader-info-filename" title={file?.filename}>
                  {file?.filename}
                </div>
              </div>

              {/* Reading History */}
              {history && history.length > 0 && (
                <div className="reader-info-section">
                  <div className="reader-info-section-title">Reading History</div>
                  <div className="reader-info-history">
                    {history.slice(0, 5).map((session, index) => (
                      <div key={session.id || index} className="reader-info-history-item">
                        <span className="reader-info-history-date">
                          {formatDate(session.startedAt)}
                        </span>
                        <span className="reader-info-history-duration">
                          {formatDuration(session.startedAt, session.endedAt)}
                        </span>
                        {session.completed && (
                          <span className="reader-info-history-badge">Completed</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* User Rating & Notes Section */}
              <div className="reader-info-section reader-info-user-data">
                <div className="reader-info-section-title">Your Rating & Notes</div>

                {/* Rating */}
                <div className="reader-info-rating-row">
                  <RatingStars
                    value={userData?.rating ?? null}
                    onChange={handleRatingChange}
                    size="default"
                    showEmpty
                    allowClear
                    ariaLabel="Rate this issue"
                  />
                  {updateUserData.isPending && (
                    <span className="reader-info-saving">Saving...</span>
                  )}
                </div>

                {/* Private Notes */}
                <div className="reader-info-user-field">
                  <label className="reader-info-user-field-label">
                    Private Notes
                    <span className="reader-info-user-field-hint">(only you)</span>
                  </label>
                  <textarea
                    className="reader-info-textarea"
                    value={localNotes}
                    onChange={(e) => setLocalNotes(e.target.value)}
                    onFocus={() => setIsEditingNotes(true)}
                    onBlur={handleNotesSave}
                    placeholder="Add private notes..."
                    rows={2}
                  />
                </div>

                {/* Public Review */}
                <div className="reader-info-user-field">
                  <div className="reader-info-user-field-header">
                    <label className="reader-info-user-field-label">
                      Review
                      <span className="reader-info-user-field-hint">
                        ({userData?.reviewVisibility === 'public' ? 'public' : 'private'})
                      </span>
                    </label>
                    <button
                      type="button"
                      className={`reader-info-visibility-toggle ${userData?.reviewVisibility === 'public' ? 'public' : ''}`}
                      onClick={handleToggleVisibility}
                    >
                      {userData?.reviewVisibility === 'public' ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          Public
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                          Private
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    className="reader-info-textarea"
                    value={localReview}
                    onChange={(e) => setLocalReview(e.target.value)}
                    onFocus={() => setIsEditingReview(true)}
                    onBlur={handleReviewSave}
                    placeholder="Write a review..."
                    rows={3}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
