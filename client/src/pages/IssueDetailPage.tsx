/**
 * IssueDetailPage Component
 *
 * Detailed view of a single comic issue with full metadata, reading progress,
 * and actions. Part of the Series-Centric Architecture UI.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getFile,
  getComicInfo,
  getArchiveInfo,
  getReadingProgress,
  getFileReadingHistory,
  getCoverUrl,
  markAsCompleted,
  markAsIncomplete,
  ComicFile,
  ComicInfo,
  ArchiveInfo,
  ReadingProgress,
  ReadingSession,
} from '../services/api.service';
import { useMetadataJob } from '../contexts/MetadataJobContext';
import { MetadataEditor } from '../components/MetadataEditor';
import { formatFileSize } from '../utils/format';
import './IssueDetailPage.css';

// Format date for display
function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Format publication date from year/month/day
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

// Format duration in minutes
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

export function IssueDetailPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const { startJob } = useMetadataJob();

  // Data state
  const [file, setFile] = useState<ComicFile | null>(null);
  const [comicInfo, setComicInfo] = useState<ComicInfo | null>(null);
  const [archiveInfo, setArchiveInfo] = useState<ArchiveInfo | null>(null);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [history, setHistory] = useState<ReadingSession[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [isFileInfoExpanded, setIsFileInfoExpanded] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [summaryNeedsTruncation, setSummaryNeedsTruncation] = useState(false);
  const summaryRef = useRef<HTMLParagraphElement>(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!fileId) return;

    setLoading(true);
    setError(null);

    try {
      const [fileResult, comicInfoResult, archiveResult, progressResult, historyResult] =
        await Promise.allSettled([
          getFile(fileId),
          getComicInfo(fileId),
          getArchiveInfo(fileId),
          getReadingProgress(fileId),
          getFileReadingHistory(fileId),
        ]);

      // File is required
      if (fileResult.status === 'fulfilled') {
        setFile(fileResult.value);
      } else {
        throw new Error('Failed to load file');
      }

      // ComicInfo is optional
      if (comicInfoResult.status === 'fulfilled') {
        setComicInfo(comicInfoResult.value.comicInfo || null);
      }

      // Archive info is optional
      if (archiveResult.status === 'fulfilled') {
        setArchiveInfo(archiveResult.value);
      }

      // Progress is optional
      if (progressResult.status === 'fulfilled') {
        setProgress(progressResult.value);
      }

      // History is optional
      if (historyResult.status === 'fulfilled') {
        setHistory(historyResult.value.sessions || []);
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

  // Check if summary needs truncation
  useEffect(() => {
    if (summaryRef.current) {
      const lineHeight = parseFloat(getComputedStyle(summaryRef.current).lineHeight);
      const maxHeight = lineHeight * 4; // 4 lines
      setSummaryNeedsTruncation(summaryRef.current.scrollHeight > maxHeight + 2);
    }
  }, [comicInfo, file]);

  // Action handlers
  const handleContinueReading = () => {
    if (!file) return;
    const page = progress?.currentPage || 0;
    navigate(`/read/${fileId}?filename=${encodeURIComponent(file.filename)}&page=${page}`);
  };

  const handleStartReading = () => {
    if (!file) return;
    navigate(`/read/${fileId}?filename=${encodeURIComponent(file.filename)}`);
  };

  const handleMarkRead = async () => {
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
  };

  const handleMarkUnread = async () => {
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
  };

  const handleFetchMetadata = () => {
    if (!fileId) return;
    startJob([fileId]);
  };

  const handleEditMetadata = () => {
    setIsEditingMetadata(true);
  };

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

  // Extract metadata from both sources (comicInfo has more detail)
  const metadata = file.metadata;
  const series = comicInfo?.Series || metadata?.series || '';
  const number = comicInfo?.Number || metadata?.number || '';
  const title = comicInfo?.Title || metadata?.title || '';
  const volume = comicInfo?.Volume || metadata?.volume;
  const publisher = comicInfo?.Publisher || metadata?.publisher || '';
  const year = comicInfo?.Year || metadata?.year;
  const month = comicInfo?.Month || metadata?.month;
  const day = comicInfo?.Day;
  const summary = comicInfo?.Summary || metadata?.summary || '';
  const writer = comicInfo?.Writer || metadata?.writer || '';
  const penciller = comicInfo?.Penciller || metadata?.penciller || '';
  const inker = comicInfo?.Inker || '';
  const colorist = comicInfo?.Colorist || '';
  const letterer = comicInfo?.Letterer || '';
  const coverArtist = comicInfo?.CoverArtist || '';
  // Editor is not in the ComicInfo type, access via type assertion if it exists
  const editor = (comicInfo as Record<string, unknown> | null)?.Editor as string || '';
  const genre = comicInfo?.Genre || metadata?.genre || '';
  const tags = comicInfo?.Tags || '';
  const characters = comicInfo?.Characters || metadata?.characters || '';
  const teams = comicInfo?.Teams || metadata?.teams || '';
  const locations = comicInfo?.Locations || metadata?.locations || '';
  const storyArc = comicInfo?.StoryArc || metadata?.storyArc || '';
  const pageCount = comicInfo?.PageCount || archiveInfo?.archive.fileCount || 0;
  // LanguageISO and Format are not in the ComicInfo type, access via type assertion
  const languageISO = (comicInfo as Record<string, unknown> | null)?.LanguageISO as string || '';
  const format = (comicInfo as Record<string, unknown> | null)?.Format as string || '';
  const ageRating = comicInfo?.AgeRating || '';
  const notes = comicInfo?.Notes || '';

  // Parse comma-separated lists
  const parseList = (value: string | null | undefined): string[] =>
    value?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  const genreList = parseList(genre);
  const tagList = parseList(tags);
  const characterList = parseList(characters);
  const teamList = parseList(teams);
  const locationList = parseList(locations);
  const storyArcList = parseList(storyArc);

  // Creators list for display
  const creators = [
    { role: 'Writer', name: writer },
    { role: 'Penciller', name: penciller },
    { role: 'Inker', name: inker },
    { role: 'Colorist', name: colorist },
    { role: 'Letterer', name: letterer },
    { role: 'Cover Artist', name: coverArtist },
    { role: 'Editor', name: editor },
  ].filter((c) => c.name);

  // Progress calculations
  const isCompleted = progress?.completed ?? false;
  const currentPage = progress?.currentPage ?? 0;
  const totalPages = progress?.totalPages ?? pageCount ?? 0;
  const progressPercent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const hasProgress = currentPage > 0 && !isCompleted;

  // Cover URL
  const coverUrl = getCoverUrl(fileId!);

  // Get seriesId from file (not in type but exists in data)
  const fileSeriesId = (file as unknown as { seriesId?: string }).seriesId;

  // Get file extension from filename
  const fileExtension = file.filename.split('.').pop()?.toUpperCase() || '';

  // Display title
  const displayTitle = series
    ? number
      ? `${series} #${number}`
      : series
    : file.filename.replace(/\.(cbz|cbr|cb7|cbt)$/i, '');

  // Check what metadata is available
  const hasSummary = Boolean(summary);
  const hasCreators = creators.length > 0;
  // hasPublication only checks for items NOT already in header (year+month+day for full date)
  const hasFullDate = year && (month || day);
  const hasCharacters = characterList.length > 0 || teamList.length > 0;
  const hasLocationsOrArcs = locationList.length > 0 || storyArcList.length > 0;
  const hasTags = genreList.length > 0 || tagList.length > 0;
  const hasNotes = Boolean(notes);
  const hasEntities = hasCharacters || hasLocationsOrArcs;

  return (
    <div className="issue-detail-page">
      {/* Navigation */}
      <div className="issue-detail-nav">
        <button className="back-btn" onClick={() => navigate(-1)}>
          &larr; Back
        </button>
        {fileSeriesId && series && (
          <Link to={`/series/${fileSeriesId}`} className="series-link-btn">
            &larr; {series}
          </Link>
        )}
      </div>

      {/* Operation message */}
      {operationMessage && (
        <div className="issue-operation-message">{operationMessage}</div>
      )}

      {/* Header section */}
      <div className="issue-detail-header">
        <div className="issue-detail-cover">
          <img src={coverUrl} alt={displayTitle} />
        </div>

        <div className="issue-detail-info">
          <h1>{displayTitle}</h1>
          {title && <h2 className="issue-title-subtitle">&ldquo;{title}&rdquo;</h2>}

          {/* Primary meta line */}
          <div className="issue-meta-primary">
            {publisher && <span className="meta-publisher">{publisher}</span>}
            {year && <span className="meta-year">{year}</span>}
            {volume && <span className="meta-volume">Vol. {volume}</span>}
            {pageCount > 0 && <span className="meta-pages">{pageCount} pages</span>}
          </div>

          {/* Secondary meta line */}
          <div className="issue-meta-secondary">
            {format && <span className="meta-badge format">{format}</span>}
            {ageRating && <span className="meta-badge age-rating">{ageRating}</span>}
            {languageISO && <span className="meta-badge language">{languageISO.toUpperCase()}</span>}
          </div>

          {/* Progress bar */}
          {totalPages > 0 && (
            <div className="issue-progress-container">
              <div className="issue-progress-bar">
                <div
                  className="issue-progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="issue-progress-text">
                {isCompleted ? (
                  <>Completed</>
                ) : currentPage > 0 ? (
                  <>
                    {currentPage} / {totalPages} pages ({progressPercent}%)
                  </>
                ) : (
                  <>Not started</>
                )}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="issue-actions">
            {hasProgress && !isCompleted ? (
              <button className="btn-primary" onClick={handleContinueReading}>
                Continue Reading
              </button>
            ) : (
              <button className="btn-primary" onClick={handleStartReading}>
                {isCompleted ? 'Read Again' : 'Start Reading'}
              </button>
            )}
            <button className="btn-secondary" onClick={handleEditMetadata}>
              Edit Metadata
            </button>
            {isCompleted ? (
              <button className="btn-ghost" onClick={handleMarkUnread}>
                Mark Unread
              </button>
            ) : (
              <button className="btn-ghost" onClick={handleMarkRead}>
                Mark Read
              </button>
            )}
            <button className="btn-ghost" onClick={handleFetchMetadata}>
              Fetch Metadata
            </button>
          </div>
        </div>
      </div>

      {/* Compact metadata layout */}
      {(hasSummary || hasCreators || hasFullDate || hasTags) && (
        <div className="issue-metadata-compact">
          {/* Left: Summary */}
          {hasSummary && (
            <div className="metadata-summary">
              <div
                className={`summary-content ${isSummaryExpanded ? 'expanded' : 'collapsed'}`}
              >
                <p ref={summaryRef}>{summary}</p>
              </div>
              {summaryNeedsTruncation && (
                <button
                  className="summary-toggle"
                  onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                  aria-expanded={isSummaryExpanded}
                >
                  {isSummaryExpanded ? 'Show less' : '... Show more'}
                </button>
              )}
            </div>
          )}

          {/* Right: Creators + quick info */}
          <div className="metadata-sidebar">
            {/* Full publication date if available */}
            {hasFullDate && (
              <div className="sidebar-date">
                <span className="date-value">{formatPublicationDate(year, month, day)}</span>
                <span className="date-label">Release Date</span>
              </div>
            )}

            {/* Creators - compact inline display */}
            {hasCreators && (
              <div className="sidebar-creators">
                {creators.slice(0, 4).map(({ role, name }) => (
                  <div key={role} className="creator-inline">
                    <span className="creator-role">{role}</span>
                    <span className="creator-name">{name}</span>
                  </div>
                ))}
                {creators.length > 4 && (
                  <span className="creators-more">+{creators.length - 4} more</span>
                )}
              </div>
            )}

            {/* Genres and tags inline */}
            {hasTags && (
              <div className="sidebar-tags">
                {genreList.map((g) => (
                  <span key={g} className="tag genre-tag">{g}</span>
                ))}
                {tagList.slice(0, 3).map((t) => (
                  <span key={t} className="tag">{t}</span>
                ))}
                {tagList.length > 3 && (
                  <span className="tag tag-more">+{tagList.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes - if exists */}
      {hasNotes && (
        <div className="issue-notes">
          <p className="user-notes">{notes}</p>
        </div>
      )}

      {/* Entities two-column grid */}
      {hasEntities && (
        <div className="issue-entities-section">
          {/* Left column: Characters and Teams */}
          <div className="entities-column">
            {characterList.length > 0 && (
              <div className="entity-group">
                <h3>Characters</h3>
                <div className="entity-list">
                  {characterList.map((character) => (
                    <span key={character} className="entity-chip character">
                      {character}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {teamList.length > 0 && (
              <div className="entity-group">
                <h3>Teams</h3>
                <div className="entity-list">
                  {teamList.map((team) => (
                    <span key={team} className="entity-chip team">
                      {team}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column: Locations and Story Arcs */}
          <div className="entities-column">
            {locationList.length > 0 && (
              <div className="entity-group">
                <h3>Locations</h3>
                <div className="entity-list">
                  {locationList.map((location) => (
                    <span key={location} className="entity-chip location">
                      {location}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {storyArcList.length > 0 && (
              <div className="entity-group">
                <h3>Story Arcs</h3>
                <div className="entity-list">
                  {storyArcList.map((arc) => (
                    <span key={arc} className="entity-chip arc">
                      {arc}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collapsible File Information */}
      <div className="issue-file-section">
        <button
          className="file-section-toggle"
          onClick={() => setIsFileInfoExpanded(!isFileInfoExpanded)}
          aria-expanded={isFileInfoExpanded}
        >
          <span>File Information</span>
          <span className="toggle-icon">{isFileInfoExpanded ? '−' : '+'}</span>
        </button>

        {isFileInfoExpanded && (
          <div className="file-section-content">
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

      {/* Compact Reading History */}
      {history.length > 0 && (
        <div className="issue-history-section">
          <h3>Reading History</h3>
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
            />
          </div>
        </div>
      )}
    </div>
  );
}
