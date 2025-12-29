/**
 * Similarity Module
 *
 * Provides series similarity computation and recommendation support.
 */

// Core similarity algorithm
export {
  computeSeriesSimilarity,
  computeAndFilterSimilarity,
  jaccardSimilarity,
  tokenize,
  tokenizeMultiple,
  extractKeywords,
  getMatchReasons,
  SIMILARITY_WEIGHTS,
  MINIMUM_SIMILARITY_THRESHOLD,
  type SeriesData,
  type SimilarityScores,
} from './similarity.service.js';

// Background job management
export {
  runSimilarityJob,
  getJobProgress,
  getLastCompletedJob,
  updateSeriesSimilarities,
  getSimilarSeries,
  hasSimilarityData,
  getSimilarityStats,
  type JobProgress,
  type JobResult,
} from './similarity-job.service.js';

// Scheduler
export {
  startSimilarityScheduler,
  stopSimilarityScheduler,
  getSimilaritySchedulerStatus,
  triggerIncrementalUpdate,
  triggerFullRebuildJob,
} from './similarity-scheduler.service.js';
