/**
 * API Reading Module
 *
 * Cache operations, reading progress, reader settings, presets, queue, and history.
 */

import { API_BASE, get, post, del, handleResponse } from './shared';

// =============================================================================
// Cache Types
// =============================================================================

export type CacheJobType = 'cover' | 'thumbnails' | 'full';
export type CacheJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface CacheJob {
  id: string;
  type: CacheJobType;
  fileIds: string[];
  status: CacheJobStatus;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  currentFile?: string;
  currentProgress?: {
    fileId: string;
    filename: string;
    currentPage: number;
    totalPages: number;
    status: 'extracting' | 'generating' | 'complete' | 'error';
    error?: string;
  };
  errors: Array<{ fileId: string; error: string }>;
}

export interface CacheSummary {
  covers: {
    totalFiles: number;
    totalSize: number;
    libraries: Array<{ libraryId: string; fileCount: number; size: number }>;
  };
  thumbnails: {
    totalFiles: number;
    totalThumbnails: number;
    totalSize: number;
    libraries: Array<{
      libraryId: string;
      fileCount: number;
      thumbnailCount: number;
      size: number;
    }>;
  };
  total: {
    size: number;
  };
}

// =============================================================================
// Reading Progress Types
// =============================================================================

export interface ReadingProgress {
  id?: string;
  fileId: string;
  currentPage: number;
  totalPages: number;
  completed: boolean;
  bookmarks: number[];
  lastReadAt: string | null;
  createdAt?: string;
}

export interface ContinueReadingItem {
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  coverHash: string | null;
  currentPage: number;
  totalPages: number;
  progress: number;
  lastReadAt: string;
  // Metadata fields
  series: string | null;
  number: string | null;
  title: string | null;
  issueCount: number | null; // Total issues in series (for "Issue X of Y")
}

export interface LibraryReadingStats {
  totalFiles: number;
  inProgress: number;
  completed: number;
  unread: number;
}

export interface AdjacentFile {
  fileId: string;
  filename: string;
  number?: string;
}

export interface AdjacentFiles {
  previous: AdjacentFile | null;
  next: AdjacentFile | null;
  currentIndex: number;
  totalInSeries: number;
  seriesName: string | null;
}

// =============================================================================
// Reader Settings Types
// =============================================================================

export type ReadingMode = 'single' | 'double' | 'doubleManga' | 'continuous';
export type ReadingDirection = 'ltr' | 'rtl' | 'vertical';
export type ImageScaling =
  | 'fitHeight'
  | 'fitWidth'
  | 'fitScreen'
  | 'original'
  | 'custom';
export type ImageSplitting = 'none' | 'ltr' | 'rtl';
export type BackgroundColor = 'white' | 'gray' | 'black';
export type ColorCorrection =
  | 'none'
  | 'sepia-correct'
  | 'contrast-boost'
  | 'desaturate'
  | 'invert';

export interface ReaderSettings {
  id: string;
  mode: ReadingMode;
  direction: ReadingDirection;
  scaling: ImageScaling;
  customWidth: number | null;
  splitting: ImageSplitting;
  background: BackgroundColor;
  brightness: number;
  colorCorrection: ColorCorrection;
  showPageShadow: boolean;
  autoHideUI: boolean;
  preloadCount: number;
  updatedAt: string;
}

export interface UpdateReaderSettingsInput {
  mode?: ReadingMode;
  direction?: ReadingDirection;
  scaling?: ImageScaling;
  customWidth?: number | null;
  splitting?: ImageSplitting;
  background?: BackgroundColor;
  brightness?: number;
  colorCorrection?: ColorCorrection;
  showPageShadow?: boolean;
  autoHideUI?: boolean;
  preloadCount?: number;
}

export interface PartialReaderSettings {
  mode?: ReadingMode | null;
  direction?: ReadingDirection | null;
  scaling?: ImageScaling | null;
  customWidth?: number | null;
  splitting?: ImageSplitting | null;
  background?: BackgroundColor | null;
  brightness?: number | null;
  showPageShadow?: boolean | null;
  autoHideUI?: boolean | null;
  preloadCount?: number | null;
}

export type SettingsSource = 'global' | 'library' | 'series' | 'issue';

export interface SettingsWithOrigin {
  settings: ReaderSettings;
  source: SettingsSource;
  basedOnPreset?: { id: string; name: string } | null;
}

// =============================================================================
// Reader Preset Types
// =============================================================================

export interface ReaderPreset {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  userId: string | null;
  isSystem: boolean;
  isBundled: boolean;
  mode: string;
  direction: string;
  scaling: string;
  customWidth: number | null;
  splitting: string;
  background: string;
  brightness: number;
  colorCorrection: ColorCorrection;
  showPageShadow: boolean;
  autoHideUI: boolean;
  preloadCount: number;
  webtoonGap: number;
  webtoonMaxWidth: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePresetInput {
  name: string;
  description?: string;
  icon?: string;
  isSystem?: boolean;
  mode?: string;
  direction?: string;
  scaling?: string;
  customWidth?: number | null;
  splitting?: string;
  background?: string;
  brightness?: number;
  colorCorrection?: ColorCorrection;
  showPageShadow?: boolean;
  autoHideUI?: boolean;
  preloadCount?: number;
  webtoonGap?: number;
  webtoonMaxWidth?: number;
}

export interface UpdatePresetInput {
  name?: string;
  description?: string;
  icon?: string;
  mode?: string;
  direction?: string;
  scaling?: string;
  customWidth?: number | null;
  splitting?: string;
  background?: string;
  brightness?: number;
  colorCorrection?: ColorCorrection;
  showPageShadow?: boolean;
  autoHideUI?: boolean;
  preloadCount?: number;
  webtoonGap?: number;
  webtoonMaxWidth?: number;
}

export interface PresetsGrouped {
  bundled: ReaderPreset[];
  system: ReaderPreset[];
  user: ReaderPreset[];
}

// =============================================================================
// Reading Queue Types
// =============================================================================

export interface QueueItem {
  id: string;
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  position: number;
  addedAt: string;
  currentPage?: number;
  totalPages?: number;
  progress?: number;
}

export interface QueueStatus {
  items: QueueItem[];
  totalCount: number;
  nextUp: QueueItem | null;
}

// =============================================================================
// Reading History Types
// =============================================================================

export interface ReadingSession {
  id: string;
  fileId: string;
  startedAt: string;
  endedAt: string | null;
  startPage: number;
  endPage: number;
  pagesRead: number;
  duration: number;
  completed: boolean;
}

export interface ReadingHistoryItem {
  id: string;
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  startedAt: string;
  endedAt: string | null;
  pagesRead: number;
  duration: number;
  completed: boolean;
}

export interface DailyStats {
  date: string;
  comicsStarted: number;
  comicsCompleted: number;
  pagesRead: number;
  totalDuration: number;
  sessionsCount: number;
}

export interface AllTimeStats {
  totalComicsRead: number;
  totalPagesRead: number;
  totalReadingTime: number;
  averageSessionDuration: number;
  longestSession: number;
  currentStreak: number;
  longestStreak: number;
  // Extended stats for fun facts
  totalActiveDays: number;
  maxPagesDay: number;
  maxComicsDay: number;
  maxTimeDay: number;
  sessionsTotal: number;
  bingeDaysCount: number;
  daysSinceLastRead: number;
}

// =============================================================================
// Recommendations Types
// =============================================================================

export interface ComicRecommendation {
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  series: string | null;
  number: string | null;
  publisher: string | null;
  genre: string | null;
  reason:
    | 'series_continuation'
    | 'same_publisher'
    | 'same_genre'
    | 'recently_added';
  reasonDetail?: string;
}

export interface DiscoverComic {
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  series: string | null;
  number: string | null;
  publisher: string | null;
}

export interface RecommendationsResult {
  seriesFromHistory: ComicRecommendation[];
  samePublisherGenre: ComicRecommendation[];
  recentlyAdded: ComicRecommendation[];
}

export interface DiscoverResult {
  comics: DiscoverComic[];
}

// =============================================================================
// Intelligent Recommendations Types
// =============================================================================

export interface RecommendationReason {
  type: 'similar_to' | 'genre' | 'creator' | 'popular' | 'random';
  sourceSeriesName?: string;
  detail?: string;
}

export interface SeriesRecommendation {
  seriesId: string;
  series: {
    id: string;
    name: string;
    publisher: string | null;
    startYear: number | null;
    coverHash: string | null;
    coverUrl: string | null;
    genres: string | null;
    issueCount: number;
    /** First issue ID for cover fallback */
    firstIssueId: string | null;
    /** First issue cover hash for cover fallback */
    firstIssueCoverHash: string | null;
  };
  score: number;
  reasons: RecommendationReason[];
}

export interface IntelligentRecommendationsResult {
  recommendations: SeriesRecommendation[];
  cached: boolean;
}

export type RecommendationFeedbackType = 'like' | 'dislike' | 'not_interested';

export interface RecommendationFeedback {
  id: string;
  userId: string;
  recommendedSeriesId: string;
  sourceSeriesId: string | null;
  feedbackType: RecommendationFeedbackType;
  createdAt: string;
}

export interface RecommendationStats {
  totalFeedback: number;
  likes: number;
  dislikes: number;
  notInterested: number;
  engagedSeriesCount: number;
  hasEnoughHistory: boolean;
}

export interface SimilarSeriesMatch {
  type: string;
  score: number;
}

export interface SimilarSeriesEntry {
  series: {
    id: string;
    name: string;
    publisher: string | null;
    startYear: number | null;
    coverHash: string | null;
    coverUrl: string | null;
    genres: string | null;
    issueCount: number;
    /** First issue ID for cover fallback */
    firstIssueId: string | null;
    /** First issue cover hash for cover fallback */
    firstIssueCoverHash: string | null;
  };
  similarityScore: number;
  matchReasons: SimilarSeriesMatch[];
}

export interface SimilarSeriesResult {
  similar: SimilarSeriesEntry[];
  cached: boolean;
}

// =============================================================================
// Cache Operations
// =============================================================================

/**
 * Get a cached thumbnail URL
 */
export function getThumbnailUrl(fileId: string, pageNumber: number): string {
  return `${API_BASE}/cache/thumbnails/${fileId}/${pageNumber}`;
}

/**
 * Get the number of cached thumbnails for a file
 */
export async function getThumbnailCount(
  fileId: string
): Promise<{ count: number }> {
  return get(`/cache/thumbnails/${fileId}/count`);
}

/**
 * Generate thumbnails for a file on-demand
 * Used when opening the reader to ensure thumbnails are available
 */
export async function generateThumbnails(fileId: string): Promise<{
  success: boolean;
  pageCount: number;
  generatedCount: number;
  fromCache: number;
  errors: Array<{ page: number; error: string }>;
}> {
  return post(`/cache/thumbnails/${fileId}/generate`, {});
}

/**
 * Rebuild cache for specific files or a folder
 */
export async function rebuildCache(options: {
  fileIds?: string[];
  folderPath?: string;
  libraryId?: string;
  type?: CacheJobType;
}): Promise<{
  jobId: string;
  fileCount: number;
  type: string;
  message: string;
}> {
  return post('/cache/rebuild', options);
}

/**
 * Get all active cache jobs
 */
export async function getCacheJobs(): Promise<{
  jobs: CacheJob[];
  queuedFiles: number;
}> {
  return get('/cache/jobs');
}

/**
 * Get a specific cache job
 */
export async function getCacheJob(jobId: string): Promise<{ job: CacheJob }> {
  return get(`/cache/jobs/${jobId}`);
}

/**
 * Cancel a cache job
 */
export async function cancelCacheJob(
  jobId: string
): Promise<{ cancelled: boolean }> {
  return del(`/cache/jobs/${jobId}`);
}

/**
 * Get cache summary statistics
 */
export async function getCacheSummary(): Promise<CacheSummary> {
  return get('/cache/summary');
}

// =============================================================================
// Reading Progress
// =============================================================================

/**
 * Get reading progress for a file
 */
export async function getReadingProgress(
  fileId: string
): Promise<ReadingProgress> {
  return get<ReadingProgress>(`/reading-progress/${fileId}`);
}

/**
 * Update reading progress for a file
 */
export async function updateReadingProgress(
  fileId: string,
  data: { currentPage: number; totalPages?: number; completed?: boolean }
): Promise<ReadingProgress> {
  const response = await fetch(`${API_BASE}/reading-progress/${fileId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<ReadingProgress>(response);
}

/**
 * Mark a file as completed
 */
export async function markAsCompleted(fileId: string): Promise<ReadingProgress> {
  return post<ReadingProgress>(`/reading-progress/${fileId}/complete`);
}

/**
 * Mark a file as incomplete
 */
export async function markAsIncomplete(
  fileId: string
): Promise<ReadingProgress> {
  return post<ReadingProgress>(`/reading-progress/${fileId}/incomplete`);
}

/**
 * Delete reading progress for a file
 */
export async function deleteReadingProgress(
  fileId: string
): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/reading-progress/${fileId}`);
}

/**
 * Add a bookmark to a file
 */
export async function addBookmark(
  fileId: string,
  pageIndex: number
): Promise<ReadingProgress> {
  return post<ReadingProgress>(`/reading-progress/${fileId}/bookmarks`, {
    pageIndex,
  });
}

/**
 * Remove a bookmark from a file
 */
export async function removeBookmark(
  fileId: string,
  pageIndex: number
): Promise<ReadingProgress> {
  return del<ReadingProgress>(
    `/reading-progress/${fileId}/bookmarks/${pageIndex}`
  );
}

/**
 * Get continue reading items
 */
export async function getContinueReading(
  limit = 3,
  libraryId?: string
): Promise<{ items: ContinueReadingItem[] }> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (libraryId) params.set('libraryId', libraryId);
  return get<{ items: ContinueReadingItem[] }>(
    `/reading-progress/continue-reading?${params}`
  );
}

/**
 * Get reading progress for all files in a library
 */
export async function getLibraryReadingProgress(libraryId: string): Promise<{
  progress: Record<
    string,
    { currentPage: number; totalPages: number; completed: boolean }
  >;
}> {
  return get(`/reading-progress/library/${libraryId}`);
}

/**
 * Get reading statistics for a library
 */
export async function getLibraryReadingStats(
  libraryId: string
): Promise<LibraryReadingStats> {
  return get<LibraryReadingStats>(`/reading-progress/library/${libraryId}/stats`);
}

/**
 * Get adjacent files (prev/next) in the same series
 */
export async function getAdjacentFiles(fileId: string): Promise<AdjacentFiles> {
  return get<AdjacentFiles>(`/reading-progress/${fileId}/adjacent`);
}

// =============================================================================
// Reader Settings
// =============================================================================

/**
 * Get current reader settings
 */
export async function getReaderSettings(): Promise<ReaderSettings> {
  return get<ReaderSettings>('/reader-settings');
}

/**
 * Update reader settings
 */
export async function updateReaderSettings(
  settings: UpdateReaderSettingsInput
): Promise<ReaderSettings> {
  const response = await fetch(`${API_BASE}/reader-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return handleResponse<ReaderSettings>(response);
}

/**
 * Reset reader settings to defaults
 */
export async function resetReaderSettings(): Promise<ReaderSettings> {
  return post<ReaderSettings>('/reader-settings/reset');
}

/**
 * Get page URL for reading
 */
export function getPageUrl(fileId: string, pagePath: string): string {
  return `${API_BASE}/archives/${fileId}/page/${encodeURIComponent(pagePath)}`;
}

/**
 * Get resolved reader settings for a specific file (applies hierarchy)
 */
export async function getResolvedReaderSettings(
  fileId: string
): Promise<ReaderSettings> {
  return get<ReaderSettings>(`/reader-settings/resolved/${fileId}`);
}

// =============================================================================
// Library Reader Settings
// =============================================================================

/**
 * Get library-level reader settings overrides
 */
export async function getLibraryReaderSettings(
  libraryId: string
): Promise<PartialReaderSettings> {
  return get<PartialReaderSettings>(`/reader-settings/library/${libraryId}`);
}

/**
 * Update library-level reader settings overrides
 */
export async function updateLibraryReaderSettings(
  libraryId: string,
  settings: PartialReaderSettings
): Promise<PartialReaderSettings> {
  const response = await fetch(
    `${API_BASE}/reader-settings/library/${libraryId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }
  );
  return handleResponse<PartialReaderSettings>(response);
}

/**
 * Delete library-level reader settings (revert to global defaults)
 */
export async function deleteLibraryReaderSettings(
  libraryId: string
): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/reader-settings/library/${libraryId}`);
}

// =============================================================================
// Series Reader Settings
// =============================================================================

/**
 * Get all series that have custom reader settings
 */
export async function getSeriesWithReaderSettings(): Promise<string[]> {
  return get<string[]>('/reader-settings/series');
}

/**
 * Get series-level reader settings overrides
 */
export async function getSeriesReaderSettings(
  series: string
): Promise<PartialReaderSettings> {
  return get<PartialReaderSettings>(
    `/reader-settings/series/${encodeURIComponent(series)}`
  );
}

/**
 * Update series-level reader settings overrides
 */
export async function updateSeriesReaderSettings(
  series: string,
  settings: PartialReaderSettings
): Promise<PartialReaderSettings> {
  const response = await fetch(
    `${API_BASE}/reader-settings/series/${encodeURIComponent(series)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }
  );
  return handleResponse<PartialReaderSettings>(response);
}

/**
 * Delete series-level reader settings (revert to library/global defaults)
 */
export async function deleteSeriesReaderSettings(
  series: string
): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(
    `/reader-settings/series/${encodeURIComponent(series)}`
  );
}

// =============================================================================
// Issue Reader Settings (4th level - most specific)
// =============================================================================

/**
 * Get issue-level reader settings overrides
 */
export async function getIssueReaderSettings(
  fileId: string
): Promise<PartialReaderSettings> {
  return get<PartialReaderSettings>(`/reader-settings/issue/${fileId}`);
}

/**
 * Update issue-level reader settings overrides
 */
export async function updateIssueReaderSettings(
  fileId: string,
  settings: PartialReaderSettings
): Promise<PartialReaderSettings> {
  const response = await fetch(`${API_BASE}/reader-settings/issue/${fileId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return handleResponse<PartialReaderSettings>(response);
}

/**
 * Delete issue-level reader settings (revert to series/library/global defaults)
 */
export async function deleteIssueReaderSettings(
  fileId: string
): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/reader-settings/issue/${fileId}`);
}

// =============================================================================
// Resolved Settings with Origin
// =============================================================================

/**
 * Get resolved reader settings with origin information
 */
export async function getResolvedReaderSettingsWithOrigin(
  fileId: string
): Promise<SettingsWithOrigin> {
  return get<SettingsWithOrigin>(
    `/reader-settings/resolved/${fileId}/with-origin`
  );
}

// =============================================================================
// Reader Presets
// =============================================================================

/**
 * Get all reader presets
 */
export async function getReaderPresets(): Promise<ReaderPreset[]> {
  return get<ReaderPreset[]>('/reader-presets');
}

/**
 * Get reader presets grouped by type (bundled, system, user)
 */
export async function getReaderPresetsGrouped(): Promise<PresetsGrouped> {
  return get<PresetsGrouped>('/reader-presets?grouped=true');
}

/**
 * Get a single reader preset by ID
 */
export async function getReaderPreset(id: string): Promise<ReaderPreset> {
  return get<ReaderPreset>(`/reader-presets/${id}`);
}

/**
 * Create a new reader preset
 */
export async function createReaderPreset(
  input: CreatePresetInput
): Promise<ReaderPreset> {
  return post<ReaderPreset>('/reader-presets', input);
}

/**
 * Update an existing reader preset
 */
export async function updateReaderPreset(
  id: string,
  input: UpdatePresetInput
): Promise<ReaderPreset> {
  const response = await fetch(`${API_BASE}/reader-presets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<ReaderPreset>(response);
}

/**
 * Delete a reader preset
 */
export async function deleteReaderPreset(
  id: string
): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/reader-presets/${id}`);
}

/**
 * Apply a preset to a library
 */
export async function applyPresetToLibrary(
  presetId: string,
  libraryId: string
): Promise<{ success: boolean; message: string }> {
  return post<{ success: boolean; message: string }>(
    `/reader-presets/${presetId}/apply/library/${libraryId}`,
    {}
  );
}

/**
 * Apply a preset to a series
 */
export async function applyPresetToSeries(
  presetId: string,
  seriesId: string
): Promise<{ success: boolean; message: string }> {
  return post<{ success: boolean; message: string }>(
    `/reader-presets/${presetId}/apply/series/${seriesId}`,
    {}
  );
}

/**
 * Apply a preset to an issue (file)
 */
export async function applyPresetToIssue(
  presetId: string,
  fileId: string
): Promise<{ success: boolean; message: string }> {
  return post<{ success: boolean; message: string }>(
    `/reader-presets/${presetId}/apply/issue/${fileId}`,
    {}
  );
}

// =============================================================================
// Reading Queue
// =============================================================================

/**
 * Get the full reading queue with status
 */
export async function getReadingQueue(): Promise<QueueStatus> {
  return get<QueueStatus>('/reading-queue');
}

/**
 * Add a file to the reading queue
 */
export async function addToReadingQueue(
  fileId: string,
  position?: number
): Promise<QueueItem> {
  return post<QueueItem>(
    `/reading-queue/${fileId}`,
    position !== undefined ? { position } : {}
  );
}

/**
 * Add multiple files to the reading queue
 */
export async function addManyToReadingQueue(
  fileIds: string[]
): Promise<{ added: number; items: QueueItem[] }> {
  return post<{ added: number; items: QueueItem[] }>('/reading-queue/batch', {
    fileIds,
  });
}

/**
 * Remove a file from the reading queue
 */
export async function removeFromReadingQueue(
  fileId: string
): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/reading-queue/${fileId}`);
}

/**
 * Clear the entire reading queue
 */
export async function clearReadingQueue(): Promise<{ success: boolean }> {
  return del<{ success: boolean }>('/reading-queue');
}

/**
 * Check if a file is in the queue
 */
export async function checkQueueStatus(
  fileId: string
): Promise<{ inQueue: boolean; position: number | null }> {
  return get<{ inQueue: boolean; position: number | null }>(
    `/reading-queue/check/${fileId}`
  );
}

/**
 * Get the next item in the queue
 */
export async function getNextInQueue(): Promise<QueueItem | null> {
  return get<QueueItem | null>('/reading-queue/next');
}

/**
 * Get the item after a specific file in the queue
 */
export async function getNextAfterInQueue(
  fileId: string
): Promise<QueueItem | null> {
  return get<QueueItem | null>(`/reading-queue/next-after/${fileId}`);
}

/**
 * Pop the first item from the queue (removes it and returns the file ID)
 */
export async function popFromQueue(): Promise<{ fileId: string | null }> {
  return post<{ fileId: string | null }>('/reading-queue/pop');
}

/**
 * Move an item to a new position in the queue
 */
export async function moveInQueue(
  fileId: string,
  position: number
): Promise<{ success: boolean }> {
  const response = await fetch(
    `${API_BASE}/reading-queue/${fileId}/position`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position }),
    }
  );
  return handleResponse<{ success: boolean }>(response);
}

/**
 * Move an item to the front of the queue
 */
export async function moveToFrontOfQueue(
  fileId: string
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/reading-queue/${fileId}/front`, {
    method: 'PUT',
  });
  return handleResponse<{ success: boolean }>(response);
}

/**
 * Reorder the entire queue
 */
export async function reorderQueue(
  fileIds: string[]
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/reading-queue/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileIds }),
  });
  return handleResponse<{ success: boolean }>(response);
}

// =============================================================================
// Reading History
// =============================================================================

/**
 * Start a reading session
 */
export async function startReadingSession(
  fileId: string,
  startPage: number = 0
): Promise<{ sessionId: string }> {
  return post<{ sessionId: string }>('/reading-history/session/start', {
    fileId,
    startPage,
  });
}

/**
 * Update a reading session with current progress
 */
export async function updateReadingSession(
  sessionId: string,
  currentPage: number,
  confirmedPagesRead?: number
): Promise<{ success: boolean }> {
  const response = await fetch(
    `${API_BASE}/reading-history/session/${sessionId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPage, confirmedPagesRead }),
    }
  );
  return handleResponse<{ success: boolean }>(response);
}

/**
 * End a reading session
 */
export async function endReadingSession(
  sessionId: string,
  endPage: number,
  completed: boolean = false,
  confirmedPagesRead?: number
): Promise<ReadingSession | null> {
  return post<ReadingSession | null>(
    `/reading-history/session/${sessionId}/end`,
    {
      endPage,
      completed,
      confirmedPagesRead,
    }
  );
}

/**
 * Get recent reading history
 */
export async function getReadingHistory(
  limit: number = 20,
  libraryId?: string
): Promise<{ items: ReadingHistoryItem[] }> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (libraryId) params.set('libraryId', libraryId);
  return get<{ items: ReadingHistoryItem[] }>(`/reading-history?${params}`);
}

/**
 * Get reading history for a specific file
 */
export async function getFileReadingHistory(
  fileId: string
): Promise<{ sessions: ReadingSession[] }> {
  return get<{ sessions: ReadingSession[] }>(`/reading-history/file/${fileId}`);
}

/**
 * Clear history for a file
 */
export async function clearFileReadingHistory(
  fileId: string
): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/reading-history/file/${fileId}`);
}

/**
 * Clear all reading history
 */
export async function clearAllReadingHistory(): Promise<{ success: boolean }> {
  return del<{ success: boolean }>('/reading-history');
}

/**
 * Get daily reading statistics
 */
export async function getReadingStats(
  startDate?: string,
  endDate?: string
): Promise<{ stats: DailyStats[] }> {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  return get<{ stats: DailyStats[] }>(`/reading-history/stats?${params}`);
}

/**
 * Get all-time reading statistics
 */
export async function getAllTimeReadingStats(): Promise<AllTimeStats> {
  return get<AllTimeStats>('/reading-history/stats/all-time');
}

// =============================================================================
// Recommendations
// =============================================================================

/**
 * Get all recommendations
 */
export async function getRecommendations(
  limit = 8,
  libraryId?: string
): Promise<RecommendationsResult> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (libraryId) params.set('libraryId', libraryId);
  return get<RecommendationsResult>(`/recommendations?${params}`);
}

/**
 * Get discover comics (random unread) - Legacy endpoint
 */
export async function getDiscoverComics(
  limit = 12,
  libraryId?: string
): Promise<DiscoverResult> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (libraryId) params.set('libraryId', libraryId);
  return get<DiscoverResult>(`/recommendations/discover/legacy?${params}`);
}

// =============================================================================
// Intelligent Recommendations API
// =============================================================================

/**
 * Get intelligent series recommendations based on reading history
 */
export async function getIntelligentRecommendations(
  userId: string,
  limit = 20,
  libraryId?: string,
  noCache = false
): Promise<IntelligentRecommendationsResult> {
  const params = new URLSearchParams();
  params.set('userId', userId);
  params.set('limit', limit.toString());
  if (libraryId) params.set('libraryId', libraryId);
  if (noCache) params.set('noCache', 'true');
  return get<IntelligentRecommendationsResult>(
    `/recommendations/discover?${params}`
  );
}

/**
 * Submit feedback on a recommendation
 */
export async function submitRecommendationFeedback(
  userId: string,
  recommendedSeriesId: string,
  feedbackType: RecommendationFeedbackType,
  sourceSeriesId?: string
): Promise<{ success: boolean }> {
  return post<{ success: boolean }>('/recommendations/feedback', {
    userId,
    recommendedSeriesId,
    feedbackType,
    sourceSeriesId,
  });
}

/**
 * Remove feedback for a recommendation
 */
export async function removeRecommendationFeedback(
  userId: string,
  recommendedSeriesId: string
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/recommendations/feedback`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, recommendedSeriesId }),
  });
  return handleResponse<{ success: boolean }>(response);
}

/**
 * Get user's recommendation feedback history
 */
export async function getRecommendationFeedback(
  userId: string
): Promise<{ feedback: RecommendationFeedback[] }> {
  const params = new URLSearchParams();
  params.set('userId', userId);
  return get<{ feedback: RecommendationFeedback[] }>(
    `/recommendations/feedback?${params}`
  );
}

/**
 * Get recommendation statistics for a user
 */
export async function getRecommendationStats(
  userId: string
): Promise<RecommendationStats> {
  const params = new URLSearchParams();
  params.set('userId', userId);
  return get<RecommendationStats>(`/recommendations/stats?${params}`);
}

/**
 * Get similar series for a given series
 */
export async function getSimilarSeries(
  seriesId: string,
  limit = 10,
  userId?: string
): Promise<SimilarSeriesResult> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (userId) params.set('userId', userId);
  return get<SimilarSeriesResult>(`/series/${seriesId}/similar?${params}`);
}
