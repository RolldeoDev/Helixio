/**
 * React Query Hooks
 *
 * Barrel export for all React Query hooks.
 */

// Libraries
export {
  useLibraries,
  useLibrary,
  useCreateLibrary,
  useUpdateLibrary,
  useDeleteLibrary,
  useLibraryFromCache,
  useInvalidateLibraries,
} from './useLibraries';

// Series
export {
  useSeriesList,
  useUnifiedGrid,
  useSeries,
  useSeriesIssues,
  useSeriesCover,
  useNextSeriesIssue,
  useSeriesPublishers,
  useSeriesGenres,
  useSeriesSearch,
  usePotentialDuplicates,
  useUpdateSeries,
  useInvalidateSeries,
  usePrefetchSeries,
} from './useSeries';
export type {
  Series,
  SeriesListOptions,
  SeriesListResult,
  SeriesIssue,
  SeriesCover,
} from './useSeries';

// Collections
export {
  useCollections,
  useCollection,
  useCollectionExpanded,
  useSystemCollection,
  useCollectionsForItem,
  useCreateCollection,
  useUpdateCollection,
  useDeleteCollection,
  useAddToCollection,
  useRemoveFromCollection,
  useToggleFavorite,
  useToggleWantToRead,
  useBulkToggleFavorite,
  useBulkToggleWantToRead,
  useInvalidateCollections,
} from './useCollections';
export type { Collection, CollectionWithItems } from './useCollections';

// Achievements
export {
  useAchievements,
  useAchievementSummary,
  useUnlockedAchievements,
  useRecentAchievements,
  useUnnotifiedAchievements,
  useMarkAchievementsNotified,
  useInvalidateAchievements,
} from './useAchievements';
export type { AchievementWithProgress, AchievementSummary } from './useAchievements';

// Library Scans
export {
  useScanJob,
  useActiveScan,
  useAllActiveScans,
  useScanHistory,
  useStartScan,
  useCancelScan,
  useDeleteScanJob,
  useInvalidateLibraryScans,
} from './useLibraryScan';
export type { LibraryScanJob, LibraryScanJobStatus } from './useLibraryScan';

// Metadata Jobs
export {
  useMetadataJobsList,
  useMetadataJob,
  useCreateMetadataJob,
  useStartMetadataJob,
  useUpdateMetadataJobOptions,
  useCancelMetadataJob,
  useAbandonMetadataJob,
  useDeleteMetadataJob,
  useHasActiveMetadataJob,
  useInvalidateMetadataJobs,
} from './useMetadataJobs';
export type { MetadataJob, JobStatus } from './useMetadataJobs';

// Files
export {
  useFiles,
  useFile,
  useFilePages,
  useFileCoverInfo,
  useLibraryFolders,
  useAllLibraryFolders,
  useMoveFile,
  useRenameFile,
  useDeleteFile,
  useQuarantineFile,
  useRestoreFile,
  useBulkDeleteFiles,
  useBulkQuarantineFiles,
  useSetFileCover,
  useUploadFileCover,
  useRenameFolder,
  useInvalidateFiles,
  useFileFromCache,
} from './useFiles';
export type {
  ComicFile,
  PaginatedResponse,
  GetFilesParams,
  LibraryFolders,
  FileCoverInfo,
  UseFilesOptions,
} from './useFiles';

// User Data (ratings, reviews, notes)
export {
  useSeriesUserData,
  useUpdateSeriesUserData,
  useDeleteSeriesUserData,
  useSeriesAverageRating,
  useSeriesPublicReviews,
  useIssueUserData,
  useUpdateIssueUserData,
  useDeleteIssueUserData,
  useIssuePublicReviews,
  useSeriesUserDataBatch,
  useIssuesUserDataBatch,
  useMigrateNotes,
  useInvalidateUserData,
} from './useUserData';
export type { UpdateUserDataInput, LocalStorageNote } from './useUserData';

// External Ratings (community/critic ratings)
export {
  useSeriesExternalRatings,
  useSyncSeriesRatings,
  useDeleteSeriesExternalRatings,
  useIssueExternalRatings,
  useSyncLibraryRatings,
  useSyncJobs,
  useSyncJobStatus,
  useCancelSyncJob,
  useRatingSources,
  useExternalRatingsSettings,
  useUpdateExternalRatingsSettings,
  useInvalidateExternalRatings,
  useHasExternalRatings,
} from './useExternalRatings';
export type {
  RatingSource,
  ExternalRatingsResponse,
  SyncResult,
  SyncJobStatus,
  RatingSourceStatus,
  ExternalRatingsSettings,
  ExternalRatingDisplay,
} from './useExternalRatings';

// External Reviews (full reviews from AniList, MAL, etc.)
export {
  useSeriesReviews,
  useIssueReviews,
  useReviewSources,
  useReviewSyncJobs,
  useReviewSyncJobStatus,
  useHasExternalReviews,
  useSyncSeriesReviews,
  useSyncIssueReviews,
  useDeleteSeriesReviews as useDeleteSeriesExternalReviews,
  useDeleteIssueReviews as useDeleteIssueExternalReviews,
  useSyncLibraryReviews,
  useCancelReviewSyncJob,
  useInvalidateExternalReviews,
} from './useExternalReviews';
export type {
  SeriesReviewsResponse,
  IssueReviewsResponse,
  ReviewSyncResult,
  IssueSyncResult,
  ReviewSyncOptions,
  ReviewSyncJobStatus,
  ReviewSourceStatus,
  ExternalReview,
  UserReview,
  ReviewSource,
} from './useExternalReviews';
