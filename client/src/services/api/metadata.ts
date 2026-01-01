/**
 * API Metadata Module
 *
 * Metadata fetch operations, approval workflow, series linkage repair, and metadata jobs.
 */

import { API_BASE, get, post, patch, del } from './shared';

// =============================================================================
// Metadata Fetch Types
// =============================================================================

export type MetadataSource = 'comicvine' | 'metron' | 'gcd' | 'anilist' | 'mal';
export type SearchMode = 'quick' | 'full';

export interface MetadataMatch {
  source: MetadataSource;
  sourceId: string;
  type: 'issue' | 'series';
  name: string;
  number?: string;
  publisher?: string;
  year?: number;
  confidence: number;
  coverUrl?: string;
}

export interface MetadataFetchResult {
  fileId: string;
  filename: string;
  query: {
    series?: string;
    issueNumber?: string;
    publisher?: string;
    year?: number;
  };
  bestMatch: MetadataMatch | null;
  alternateMatches: MetadataMatch[];
  status: 'matched' | 'low_confidence' | 'no_match' | 'error';
  error?: string;
}

export interface MetadataFetchResponse {
  total: number;
  matched: number;
  lowConfidence: number;
  noMatch: number;
  errors: number;
  results: MetadataFetchResult[];
  sessionId?: string;
}

// =============================================================================
// Metadata Fetch Logging Types
// =============================================================================

export type MetadataFetchStep =
  | 'parsing'
  | 'searching'
  | 'scoring'
  | 'organizing'
  | 'fetching'
  | 'applying'
  | 'complete'
  | 'error';

export interface MetadataFetchLogEntry {
  timestamp: string;
  sessionId: string;
  step: MetadataFetchStep;
  stepName: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  details?: Record<string, unknown>;
  overallProgress?: number;
  formatted: string;
}

export interface MetadataFetchAPICall {
  source: 'comicvine' | 'metron' | 'anthropic';
  endpoint: string;
  status: 'pending' | 'success' | 'error' | 'rate_limited';
  duration?: number;
  resultCount?: number;
  error?: string;
  retryCount?: number;
  startTime: string;
  endTime?: string;
}

export interface MetadataFetchSessionSummary {
  filesParsed: number;
  sourcesSearched: string[];
  resultsFound: number;
  bestMatchConfidence?: number;
  appliedSource?: string;
  errors: string[];
}

export interface MetadataFetchSession {
  id: string;
  fileId?: string;
  filename?: string;
  status: 'in_progress' | 'completed' | 'error';
  currentStep: MetadataFetchStep;
  currentStepName: string;
  stepNumber: number;
  totalSteps: number;
  startedAt: string;
  completedAt?: string;
  summary?: MetadataFetchSessionSummary;
  logCount?: number;
}

export interface MetadataFetchSessionDetails {
  session: MetadataFetchSession;
  logs: MetadataFetchLogEntry[];
  apiCalls: MetadataFetchAPICall[];
}

// =============================================================================
// Metadata Approval Types
// =============================================================================

export type ApprovalSessionStatus =
  | 'grouping'
  | 'series_approval'
  | 'fetching_issues'
  | 'file_review'
  | 'applying'
  | 'complete'
  | 'cancelled';

/** Credit entry with optional count and extended fields */
export interface SeriesCredit {
  id: number;
  name: string;
  count?: number;
  // Extended fields (populated by AniList)
  alternativeNames?: string[]; // Pen names, aliases
  nativeName?: string; // Name in native language
  profileUrl?: string; // Link to source profile page
  imageUrl?: string; // Portrait/avatar image
}

export interface SeriesMatch {
  source: MetadataSource;
  sourceId: string;
  name: string;
  startYear?: number;
  endYear?: number;
  publisher?: string;
  issueCount?: number;
  description?: string;
  coverUrl?: string;
  confidence: number;
  url?: string;

  // Extended fields for expanded series info
  aliases?: string[];
  shortDescription?: string;
  seriesType?: string;
  volume?: number;
  firstIssueNumber?: string;
  lastIssueNumber?: string;
  imageUrls?: {
    thumb?: string;
    small?: string;
    medium?: string;
  };

  // Rich series data from ComicVine
  characters?: SeriesCredit[]; // Characters appearing in the series
  creators?: SeriesCredit[]; // Writers, artists, etc.
  locations?: SeriesCredit[]; // Locations featured
  objects?: SeriesCredit[]; // Notable objects/items
}

export interface SeriesGroup {
  displayName: string;
  query: {
    series?: string;
    issueNumber?: string;
    publisher?: string;
    year?: number;
  };
  fileCount: number;
  fileIds: string[];
  filenames: string[];
  status: 'pending' | 'searching' | 'approved' | 'skipped';
  searchResults: SeriesMatch[];
  /** Pagination info for search results */
  searchPagination?: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  /** Series to use for series-level metadata (name, publisher, etc.) */
  selectedSeries: SeriesMatch | null;
  /** Series to use for issue matching (may differ from selectedSeries for collected editions) */
  issueMatchingSeries: SeriesMatch | null;
  /** Whether this group was pre-approved from series.json */
  preApprovedFromSeriesJson?: boolean;
  /** Whether this group was pre-approved from a database Series with existing external IDs */
  preApprovedFromDatabase?: boolean;
}

export interface FieldChange {
  current: string | number | null;
  proposed: string | number | null;
  approved: boolean;
  edited: boolean;
  editedValue?: string | number | null; // null means user explicitly cleared the field
}

export interface FileChange {
  fileId: string;
  filename: string;
  matchedIssue: {
    source: MetadataSource;
    sourceId: string;
    number: string;
    title?: string;
    coverDate?: string;
  } | null;
  matchConfidence: number;
  fields: Record<string, FieldChange>;
  status: 'matched' | 'unmatched' | 'manual' | 'rejected';
}

export interface ApprovalSession {
  sessionId: string;
  status: ApprovalSessionStatus;
  useLLMCleanup?: boolean;
  /**
   * Library type for metadata source prioritization.
   * - 'manga': Prioritizes AniList/MAL sources, uses chapter/volume classification
   * - 'western': Prioritizes ComicVine/Metron sources, uses issue-based classification
   *
   * Populated from the source library's type when creating the approval session.
   * Used by SeriesApprovalStep and SeriesMetadataSearchModal to default the source selector.
   */
  libraryType?: 'western' | 'manga';
  fileCount: number;
  seriesGroups: Array<{
    displayName: string;
    query?: {
      series?: string;
      issueNumber?: string;
      publisher?: string;
      year?: number;
    };
    fileCount: number;
    fileIds: string[];
    filenames: string[];
    status: 'pending' | 'searching' | 'approved' | 'skipped';
    searchResults: SeriesMatch[];
    selectedSeries: SeriesMatch | null;
    /** Series to use for issue matching (may differ from selectedSeries for collected editions) */
    issueMatchingSeries?: SeriesMatch | null;
    /** Whether this group was pre-approved from series.json */
    preApprovedFromSeriesJson?: boolean;
    /** Whether this group was pre-approved from a database Series with existing external IDs */
    preApprovedFromDatabase?: boolean;
  }>;
  currentSeriesIndex: number;
  currentSeriesGroup: SeriesGroup | null;
  fileChangesSummary?: {
    total: number;
    matched: number;
    unmatched: number;
    manual: number;
    rejected: number;
  };
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface CreateApprovalSessionOptions {
  useLLMCleanup?: boolean;
  /** File IDs to exclude from processing (already searched/indexed files) */
  excludeFileIds?: string[];
  /** Mixed series mode - ignores series.json and parses each file individually */
  mixedSeries?: boolean;
  /** Search mode: 'quick' (primary source only) or 'full' (all sources with merge) */
  searchMode?: SearchMode;
  /** Fetch external ratings from ComicBookRoundup after applying metadata */
  fetchExternalRatings?: boolean;
}

/**
 * Info about files that have already been indexed
 */
export interface IndexedFilesInfo {
  /** Total count of indexed files in the selection */
  indexedCount: number;
  /** IDs of indexed files */
  indexedFileIds: string[];
  /** Files with their indexed status for individual selection */
  files: Array<{
    id: string;
    filename: string;
    isIndexed: boolean;
  }>;
}

export interface SeriesCacheStats {
  totalEntries: number;
  totalSizeMb: number;
  entriesWithIssues: number;
  bySource: {
    comicvine: number;
    metron: number;
  };
  oldestEntry?: string;
  newestEntry?: string;
}

/** Progress log entry from streaming session creation */
export interface ProgressLogEntry {
  message: string;
  detail?: string;
  timestamp: string;
}

/**
 * Issue data from series cache for manual selection
 */
export interface AvailableIssue {
  id: number;
  name: string | null;
  aliases: string | null;
  issue_number: string;
  cover_date: string | null;
  store_date: string | null;
  deck: string | null;
  description: string | null;
  image: {
    icon_url: string;
    medium_url: string;
    screen_url: string;
    screen_large_url: string;
    small_url: string;
    super_url: string;
    thumb_url: string;
    tiny_url: string;
    original_url: string;
  } | null;
  volume: {
    id: number;
    name: string;
    api_detail_url: string;
    site_detail_url: string;
  } | null;
  api_detail_url: string | null;
  site_detail_url: string | null;
  person_credits?: Array<{ id: number; name: string; role: string }>;
  character_credits?: Array<{ id: number; name: string }>;
  team_credits?: Array<{ id: number; name: string }>;
  location_credits?: Array<{ id: number; name: string }>;
  story_arc_credits?: Array<{ id: number; name: string }>;
}

// =============================================================================
// Series Linkage Repair Types
// =============================================================================

export interface MismatchedFile {
  fileId: string;
  fileName: string;
  metadataSeries: string | null;
  linkedSeriesName: string | null;
  linkedSeriesId: string | null;
}

export interface RepairResult {
  totalMismatched: number;
  repaired: number;
  newSeriesCreated: number;
  errors: string[];
  details: Array<{
    fileId: string;
    fileName: string;
    oldSeriesName: string | null;
    newSeriesName: string | null;
    action: 'relinked' | 'created' | 'error';
    error?: string;
  }>;
}

export interface SyncMetadataResult {
  success: boolean;
  oldSeriesName: string | null;
  newSeriesName: string | null;
  error?: string;
}

export interface BatchSyncMetadataResult {
  total: number;
  synced: number;
  errors: string[];
  details: Array<{
    fileId: string;
    oldSeriesName: string | null;
    newSeriesName: string | null;
    success: boolean;
    error?: string;
  }>;
}

// =============================================================================
// Metadata Jobs Types
// =============================================================================

export type JobStatus =
  | 'options'
  | 'initializing'
  | 'series_approval'
  | 'fetching_issues'
  | 'file_review'
  | 'applying'
  | 'complete'
  | 'cancelled'
  | 'error';

export interface JobLogEntry {
  id: string;
  step: string;
  message: string;
  detail?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
}

export interface ApplyResult {
  total: number;
  successful: number;
  failed: number;
  converted: number;
  conversionFailed: number;
  results: Array<{
    fileId: string;
    filename: string;
    success: boolean;
    error?: string;
    converted?: boolean;
  }>;
}

export interface MetadataJob {
  id: string;
  status: JobStatus;
  step: string;
  fileIds: string[];
  options: CreateApprovalSessionOptions;
  session: ApprovalSession | null;
  currentSeriesIndex: number;
  totalFiles: number;
  processedFiles: number;
  error: string | null;
  applyResult: ApplyResult | null;
  createdAt: string;
  updatedAt: string;
  logs: Record<string, JobLogEntry[]>;
  // Progress snapshot for real-time display on reconnect
  currentProgressMessage?: string | null;
  currentProgressDetail?: string | null;
  lastProgressAt?: string | null;
}

// =============================================================================
// Metadata Fetch Operations
// =============================================================================

export async function fetchMetadataForFiles(
  fileIds: string[],
  includeSession = true
): Promise<MetadataFetchResponse> {
  return post<MetadataFetchResponse>('/search/fetch-metadata', {
    fileIds,
    includeSession,
  });
}

export async function getMetadataFetchSession(
  sessionId: string
): Promise<MetadataFetchSessionDetails> {
  return get<MetadataFetchSessionDetails>(`/search/logs/session/${sessionId}`);
}

export function createMetadataFetchLogStream(
  sessionId: string,
  onLog: (data: {
    type: string;
    log?: MetadataFetchLogEntry;
    status?: string;
    error?: string;
  }) => void,
  onError?: (error: Event) => void
): EventSource {
  const eventSource = new EventSource(
    `${API_BASE}/search/logs/stream/${sessionId}`
  );

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onLog(data);
    } catch (e) {
      console.error('Failed to parse log stream data:', e);
    }
  };

  if (onError) {
    eventSource.onerror = onError;
  }

  return eventSource;
}

export async function applyMetadataBatch(
  matches: Array<{
    fileId: string;
    source: MetadataSource;
    sourceId: string;
    type: 'issue' | 'series';
  }>,
  options?: {
    /** Fetch external ratings after applying metadata */
    fetchExternalRatings?: boolean;
  }
): Promise<{
  total: number;
  successful: number;
  failed: number;
  results: Array<{ fileId: string; success: boolean; error?: string }>;
}> {
  return post('/search/apply-batch', {
    matches,
    fetchExternalRatings: options?.fetchExternalRatings,
  });
}

// =============================================================================
// Metadata Approval API
// =============================================================================

/**
 * Get indexed status info for a list of files
 * Returns which files have already been indexed (searched for metadata)
 */
export async function getIndexedFilesInfo(
  fileIds: string[]
): Promise<IndexedFilesInfo> {
  return post<IndexedFilesInfo>('/metadata-approval/indexed-files', { fileIds });
}

/**
 * Create a new metadata approval session
 */
export async function createApprovalSession(
  fileIds: string[],
  options: CreateApprovalSessionOptions = {}
): Promise<ApprovalSession> {
  return post<ApprovalSession>('/metadata-approval/sessions', {
    fileIds,
    useLLMCleanup: options.useLLMCleanup,
    mixedSeries: options.mixedSeries,
  });
}

/**
 * Create approval session with streaming progress updates
 * Returns an async generator that yields progress events
 */
export async function* createApprovalSessionWithProgress(
  fileIds: string[],
  options: CreateApprovalSessionOptions = {}
): AsyncGenerator<
  | { type: 'progress'; data: ProgressLogEntry }
  | { type: 'complete'; data: ApprovalSession }
  | { type: 'error'; data: { error: string; message: string } }
> {
  const response = await fetch(`${API_BASE}/metadata-approval/sessions/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileIds,
      useLLMCleanup: options.useLLMCleanup,
      mixedSeries: options.mixedSeries,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    yield {
      type: 'error',
      data: { error: 'Request failed', message: error.message || 'Unknown error' },
    };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield {
      type: 'error',
      data: { error: 'No response body', message: 'Failed to read response stream' },
    };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    let currentData = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6);
      } else if (line === '' && currentEvent && currentData) {
        try {
          const parsed = JSON.parse(currentData);
          if (currentEvent === 'progress') {
            yield { type: 'progress', data: parsed as ProgressLogEntry };
          } else if (currentEvent === 'complete') {
            yield { type: 'complete', data: parsed as ApprovalSession };
          } else if (currentEvent === 'error') {
            yield {
              type: 'error',
              data: parsed as { error: string; message: string },
            };
          }
        } catch {
          // Ignore parse errors
        }
        currentEvent = '';
        currentData = '';
      }
    }
  }
}

/**
 * Get the current state of an approval session
 */
export async function getApprovalSession(
  sessionId: string
): Promise<ApprovalSession> {
  return get<ApprovalSession>(`/metadata-approval/sessions/${sessionId}`);
}

/**
 * Delete/cancel an approval session
 */
export async function deleteApprovalSession(
  sessionId: string
): Promise<{ success: boolean; message: string }> {
  return del<{ success: boolean; message: string }>(
    `/metadata-approval/sessions/${sessionId}`
  );
}

/**
 * Re-search for series with a custom query
 */
export async function searchSeriesCustom(
  sessionId: string,
  query: string
): Promise<{ query: string; results: SeriesMatch[]; resultCount: number }> {
  return post(`/metadata-approval/sessions/${sessionId}/series/search`, {
    query,
  });
}

/**
 * Approve the selected series and advance to the next
 * @param seriesId - Series to use for series-level metadata (name, publisher, etc.)
 * @param issueMatchingSeriesId - Series to use for issue matching (optional, defaults to seriesId)
 */
export async function approveSeries(
  sessionId: string,
  seriesId: string,
  issueMatchingSeriesId?: string
): Promise<{
  success: boolean;
  hasMoreSeries: boolean;
  nextSeriesIndex: number;
  status: ApprovalSessionStatus;
  currentSeriesGroup: SeriesGroup | null;
  fileChangesSummary?: ApprovalSession['fileChangesSummary'];
}> {
  return post(`/metadata-approval/sessions/${sessionId}/series/approve`, {
    seriesId,
    issueMatchingSeriesId,
  });
}

/**
 * Skip the current series and advance to the next
 */
export async function skipSeries(sessionId: string): Promise<{
  success: boolean;
  hasMoreSeries: boolean;
  nextSeriesIndex: number;
  status: ApprovalSessionStatus;
  currentSeriesGroup: SeriesGroup | null;
}> {
  return post(`/metadata-approval/sessions/${sessionId}/series/skip`);
}

/**
 * Get all file changes for the session (deprecated - use getFileChangesByJob)
 */
export async function getFileChanges(sessionId: string): Promise<{
  status: ApprovalSessionStatus;
  fileChanges: FileChange[];
  summary: ApprovalSession['fileChangesSummary'];
}> {
  return get(`/metadata-approval/sessions/${sessionId}/files`);
}

/**
 * Get all file changes for a job (restores session if needed)
 * This is the preferred method as it handles session restoration.
 */
export async function getFileChangesByJob(jobId: string): Promise<{
  status: ApprovalSessionStatus;
  fileChanges: FileChange[];
  summary: ApprovalSession['fileChangesSummary'];
}> {
  return get(`/metadata-jobs/${jobId}/files`);
}

/**
 * Get available issues for manual selection for a file
 */
export async function getAvailableIssues(
  sessionId: string,
  fileId: string
): Promise<{
  success: boolean;
  seriesName: string;
  source: MetadataSource;
  sourceId: string;
  issues: AvailableIssue[];
  totalCount: number;
  currentMatchedIssueId: string | null;
}> {
  return get(
    `/metadata-approval/sessions/${sessionId}/files/${fileId}/available-issues`
  );
}

/**
 * Manually select an issue for a file
 */
export async function manualSelectIssue(
  sessionId: string,
  fileId: string,
  issueSource: MetadataSource,
  issueId: string
): Promise<{ success: boolean; fileChange: FileChange }> {
  return post(`/metadata-approval/sessions/${sessionId}/files/match`, {
    fileId,
    issueSource,
    issueId,
  });
}

/**
 * Update field approvals for a file
 */
export async function updateFieldApprovals(
  sessionId: string,
  fileId: string,
  fieldUpdates: Record<string, { approved?: boolean; editedValue?: string | number }>
): Promise<{ success: boolean; fileChange: FileChange }> {
  return patch(
    `/metadata-approval/sessions/${sessionId}/files/${fileId}/fields`,
    fieldUpdates
  );
}

/**
 * Reject an entire file
 */
export async function rejectFile(
  sessionId: string,
  fileId: string
): Promise<{ success: boolean; fileChange: FileChange }> {
  return post(`/metadata-approval/sessions/${sessionId}/files/${fileId}/reject`);
}

/**
 * Accept all files and all field changes
 */
export async function acceptAllFiles(
  sessionId: string
): Promise<{ success: boolean; fileChanges: FileChange[] }> {
  return post(`/metadata-approval/sessions/${sessionId}/files/accept-all`);
}

/**
 * Reject all files
 */
export async function rejectAllFiles(
  sessionId: string
): Promise<{ success: boolean; fileChanges: FileChange[] }> {
  return post(`/metadata-approval/sessions/${sessionId}/files/reject-all`);
}

/**
 * Move a file to a different series group within the approval session
 */
export async function moveFileToSeriesGroup(
  sessionId: string,
  fileId: string,
  targetSeriesGroupIndex: number
): Promise<{
  success: boolean;
  fileChange: FileChange;
  seriesGroups: Array<{
    index: number;
    displayName: string;
    fileCount: number;
    status: string;
    selectedSeries: { name: string; startYear?: number } | null;
  }>;
}> {
  return post(`/metadata-approval/sessions/${sessionId}/files/${fileId}/move`, {
    targetSeriesGroupIndex,
  });
}

/**
 * Apply all approved changes to files
 */
export async function applyApprovedChanges(sessionId: string): Promise<{
  success: boolean;
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    fileId: string;
    filename: string;
    success: boolean;
    error?: string;
  }>;
}> {
  return post(`/metadata-approval/sessions/${sessionId}/apply`);
}

/**
 * Get series cache statistics
 */
export async function getSeriesCacheStats(): Promise<SeriesCacheStats> {
  return get<SeriesCacheStats>('/metadata-approval/cache/stats');
}

/**
 * Clean up expired cache entries
 */
export async function cleanSeriesCache(): Promise<{
  success: boolean;
  deleted: number;
  freedMb: number;
}> {
  return post('/metadata-approval/cache/clean');
}

/**
 * Clear entire series cache
 */
export async function clearSeriesCache(): Promise<{
  success: boolean;
  deleted: number;
  freedMb: number;
}> {
  return post('/metadata-approval/cache/clear');
}

// =============================================================================
// Series Linkage Repair
// =============================================================================

/**
 * Get files where FileMetadata.series doesn't match their linked Series.name
 */
export async function getMismatchedSeriesFiles(): Promise<{
  count: number;
  files: MismatchedFile[];
}> {
  return get('/series/admin/mismatched');
}

/**
 * Repair mismatched series linkages.
 * Re-links files to the correct series based on their FileMetadata.series,
 * creating new series if needed.
 *
 * @param fileIds - Optional array of file IDs to repair. If not provided, repairs all mismatched files.
 */
export async function repairSeriesLinkages(fileIds?: string[]): Promise<RepairResult> {
  return post('/series/admin/repair', fileIds ? { fileIds } : undefined);
}

/**
 * Sync a single file's metadata to match its linked series.
 * Use when the file is in the correct series but the metadata is wrong.
 */
export async function syncFileMetadataToSeries(
  fileId: string
): Promise<SyncMetadataResult> {
  return post(`/series/admin/sync-metadata/${fileId}`);
}

/**
 * Batch sync file metadata to match their linked series.
 */
export async function batchSyncFileMetadataToSeries(
  fileIds: string[]
): Promise<BatchSyncMetadataResult> {
  return post('/series/admin/sync-metadata-batch', { fileIds });
}

// =============================================================================
// Metadata Jobs (Persistent Jobs)
// =============================================================================

/**
 * List active metadata jobs
 */
export async function listMetadataJobs(): Promise<{ jobs: MetadataJob[] }> {
  return get('/metadata-jobs');
}

/**
 * List all metadata jobs (including completed)
 */
export async function listAllMetadataJobs(): Promise<{ jobs: MetadataJob[] }> {
  return get('/metadata-jobs/all');
}

/**
 * Create a new metadata job
 */
export async function createMetadataJob(
  fileIds: string[]
): Promise<{ job: MetadataJob }> {
  return post('/metadata-jobs', { fileIds });
}

/**
 * Get metadata job by ID
 */
export async function getMetadataJob(
  jobId: string
): Promise<{ job: MetadataJob }> {
  return get(`/metadata-jobs/${jobId}`);
}

/**
 * Update job options
 */
export async function updateMetadataJobOptions(
  jobId: string,
  options: CreateApprovalSessionOptions
): Promise<{ job: MetadataJob }> {
  return patch(`/metadata-jobs/${jobId}/options`, { options });
}

/**
 * Delete a metadata job
 */
export async function deleteMetadataJob(
  jobId: string
): Promise<{ success: boolean }> {
  return del(`/metadata-jobs/${jobId}`);
}

/**
 * Start a metadata job (enqueues for background processing)
 * Returns immediately - poll getMetadataJob for status updates.
 */
export async function startMetadataJob(
  jobId: string
): Promise<{ status: string; message: string; jobId: string }> {
  return post(`/metadata-jobs/${jobId}/start`);
}

/**
 * Cancel a metadata job
 */
export async function cancelMetadataJob(
  jobId: string
): Promise<{ success: boolean }> {
  return post(`/metadata-jobs/${jobId}/cancel`);
}

/**
 * Abandon a metadata job completely - cancel, cleanup, and delete all data
 */
export async function abandonMetadataJob(
  jobId: string
): Promise<{ success: boolean; message: string }> {
  return post(`/metadata-jobs/${jobId}/abandon`);
}

/**
 * Custom search for current series in job
 * @param jobId - The job ID
 * @param query - The search query string
 * @param source - Optional specific source to search (if not provided, searches all configured sources)
 */
export async function searchJobSeries(
  jobId: string,
  query: string,
  source?: MetadataSource
): Promise<{ results: SeriesMatch[]; job: MetadataJob }> {
  return post(`/metadata-jobs/${jobId}/search`, { query, source });
}

/**
 * Load more search results for current series in job
 * @param jobId - The job ID
 */
export async function loadMoreJobSeriesResults(
  jobId: string
): Promise<{ results: SeriesMatch[]; job: MetadataJob }> {
  return post(`/metadata-jobs/${jobId}/load-more`, {});
}

/**
 * Approve series in job
 * @param selectedSeriesId - Series to use for series-level metadata (name, publisher, etc.)
 * @param issueMatchingSeriesId - Series to use for issue matching (optional, defaults to selectedSeriesId)
 * @param applyToRemaining - If true, auto-approve remaining series with top matches
 */
export async function approveJobSeries(
  jobId: string,
  selectedSeriesId: string,
  issueMatchingSeriesId?: string,
  applyToRemaining?: boolean
): Promise<{ hasMore: boolean; nextIndex: number; job: MetadataJob }> {
  return post(`/metadata-jobs/${jobId}/approve-series`, {
    selectedSeriesId,
    issueMatchingSeriesId,
    applyToRemaining,
  });
}

/**
 * Skip series in job
 */
export async function skipJobSeries(
  jobId: string
): Promise<{ hasMore: boolean; nextIndex: number; job: MetadataJob }> {
  return post(`/metadata-jobs/${jobId}/skip-series`);
}

/**
 * Navigate to a series group for review/change (keeps current selection visible)
 * Used when user wants to change series selection from file review - no confirmation needed.
 */
export async function navigateToJobSeriesGroup(
  jobId: string,
  seriesGroupIndex: number
): Promise<{
  success: boolean;
  status: ApprovalSessionStatus;
  currentSeriesIndex: number;
  currentSeriesGroup: SeriesGroup | null;
  job: MetadataJob;
}> {
  return post(`/metadata-jobs/${jobId}/navigate-series/${seriesGroupIndex}`);
}

/**
 * Reset a series group to allow re-selection (clears current selection)
 * Used when user explicitly wants to clear and search fresh.
 */
export async function resetJobSeriesGroup(
  jobId: string,
  seriesGroupIndex: number
): Promise<{
  success: boolean;
  status: ApprovalSessionStatus;
  currentSeriesIndex: number;
  currentSeriesGroup: SeriesGroup | null;
  job: MetadataJob;
}> {
  return post(`/metadata-jobs/${jobId}/reset-series/${seriesGroupIndex}`);
}

/**
 * Get available issues for manual selection in a job
 */
export async function getAvailableIssuesForJob(
  jobId: string,
  fileId: string
): Promise<{
  success: boolean;
  seriesName: string;
  source: MetadataSource;
  sourceId: string;
  issues: AvailableIssue[];
  totalCount: number;
  currentMatchedIssueId: string | null;
}> {
  return get(`/metadata-jobs/${jobId}/files/${fileId}/available-issues`);
}

/**
 * Update field approvals for a file in job
 */
export async function updateJobFileFields(
  jobId: string,
  fileId: string,
  fieldUpdates: Record<string, { approved?: boolean; editedValue?: string | number }>
): Promise<{ fileChange: FileChange; job: MetadataJob }> {
  return patch(`/metadata-jobs/${jobId}/files/${fileId}`, { fieldUpdates });
}

/**
 * Reject a file in job
 */
export async function rejectJobFile(
  jobId: string,
  fileId: string
): Promise<{ fileChange: FileChange; job: MetadataJob }> {
  return post(`/metadata-jobs/${jobId}/files/${fileId}/reject`);
}

/**
 * Accept all files in job
 */
export async function acceptAllJobFiles(
  jobId: string
): Promise<{ job: MetadataJob }> {
  return post(`/metadata-jobs/${jobId}/accept-all`);
}

/**
 * Reject all files in job
 */
export async function rejectAllJobFiles(
  jobId: string
): Promise<{ job: MetadataJob }> {
  return post(`/metadata-jobs/${jobId}/reject-all`);
}

/**
 * Apply changes in job (enqueues for background processing)
 * Returns immediately - poll getMetadataJob for status updates.
 * Automatically converts CBR files to CBZ before applying metadata.
 */
export async function applyJobChanges(
  jobId: string
): Promise<{ status: string; message: string; jobId: string }> {
  return post(`/metadata-jobs/${jobId}/apply`);
}
