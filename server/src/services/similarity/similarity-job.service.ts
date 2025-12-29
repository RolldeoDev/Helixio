/**
 * Similarity Job Service
 *
 * Background job that computes and stores similarity scores between all series.
 * Supports both full rebuild and incremental updates.
 */

import { getDatabase } from '../database.service.js';
import {
  computeAndFilterSimilarity,
  SeriesData,
  MINIMUM_SIMILARITY_THRESHOLD,
} from './similarity.service.js';

// =============================================================================
// Types
// =============================================================================

export interface JobProgress {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  type: 'full' | 'incremental';
  totalPairs: number;
  processedPairs: number;
  percentComplete: number;
}

export interface JobResult {
  jobId: string;
  status: 'completed' | 'failed';
  pairsProcessed: number;
  pairsStored: number;
  duration: number; // milliseconds
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const BATCH_SIZE = 1000; // Number of similarity pairs to insert at once
const PROGRESS_UPDATE_INTERVAL = 500; // Update job progress every N pairs

// =============================================================================
// Main Job Functions
// =============================================================================

/**
 * Run a similarity computation job.
 *
 * @param type - 'full' for complete rebuild, 'incremental' for updates only
 * @returns Job result with statistics
 */
export async function runSimilarityJob(
  type: 'full' | 'incremental' = 'incremental'
): Promise<JobResult> {
  const db = getDatabase();
  const startTime = Date.now();

  // Create job record
  const job = await db.similarityJob.create({
    data: {
      type,
      status: 'running',
      startedAt: new Date(),
    },
  });

  let pairsProcessed = 0;
  let pairsStored = 0;

  try {
    if (type === 'full') {
      const result = await runFullRebuild(job.id);
      pairsProcessed = result.pairsProcessed;
      pairsStored = result.pairsStored;
    } else {
      const result = await runIncrementalUpdate(job.id);
      pairsProcessed = result.pairsProcessed;
      pairsStored = result.pairsStored;
    }

    // Mark job as completed
    await db.similarityJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        processedPairs: pairsProcessed,
      },
    });

    return {
      jobId: job.id,
      status: 'completed',
      pairsProcessed,
      pairsStored,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    // Mark job as failed
    await db.similarityJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: String(error),
      },
    });

    return {
      jobId: job.id,
      status: 'failed',
      pairsProcessed,
      pairsStored,
      duration: Date.now() - startTime,
      error: String(error),
    };
  }
}

/**
 * Get the current status of a running job.
 */
export async function getJobProgress(jobId: string): Promise<JobProgress | null> {
  const db = getDatabase();

  const job = await db.similarityJob.findUnique({
    where: { id: jobId },
  });

  if (!job) return null;

  return {
    jobId: job.id,
    status: job.status as JobProgress['status'],
    type: job.type as JobProgress['type'],
    totalPairs: job.totalPairs,
    processedPairs: job.processedPairs,
    percentComplete:
      job.totalPairs > 0
        ? Math.round((job.processedPairs / job.totalPairs) * 100)
        : 0,
  };
}

/**
 * Get the most recent completed job.
 */
export async function getLastCompletedJob(): Promise<{
  id: string;
  completedAt: Date;
  processedPairs: number;
} | null> {
  const db = getDatabase();

  const job = await db.similarityJob.findFirst({
    where: { status: 'completed' },
    orderBy: { completedAt: 'desc' },
    select: {
      id: true,
      completedAt: true,
      processedPairs: true,
    },
  });

  if (!job || !job.completedAt) return null;

  return {
    id: job.id,
    completedAt: job.completedAt,
    processedPairs: job.processedPairs,
  };
}

// =============================================================================
// Full Rebuild
// =============================================================================

async function runFullRebuild(
  jobId: string
): Promise<{ pairsProcessed: number; pairsStored: number }> {
  const db = getDatabase();

  // Delete all existing similarities
  await db.seriesSimilarity.deleteMany({});

  // Get all series with metadata fields
  const allSeries = await db.series.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      genres: true,
      tags: true,
      characters: true,
      teams: true,
      creators: true,
      writer: true,
      penciller: true,
      publisher: true,
      summary: true,
    },
  });

  const seriesCount = allSeries.length;
  const totalPairs = (seriesCount * (seriesCount - 1)) / 2;

  // Update job with total pairs count
  await db.similarityJob.update({
    where: { id: jobId },
    data: { totalPairs },
  });

  let pairsProcessed = 0;
  let pairsStored = 0;
  const batch: Array<{
    sourceSeriesId: string;
    targetSeriesId: string;
    similarityScore: number;
    genreScore: number;
    tagScore: number;
    characterScore: number;
    teamScore: number;
    creatorScore: number;
    publisherScore: number;
    keywordScore: number;
  }> = [];

  // Process all pairs
  for (let i = 0; i < seriesCount; i++) {
    for (let j = i + 1; j < seriesCount; j++) {
      const seriesA = allSeries[i] as SeriesData;
      const seriesB = allSeries[j] as SeriesData;

      const scores = computeAndFilterSimilarity(seriesA, seriesB);

      if (scores) {
        // Ensure sourceSeriesId < targetSeriesId for consistent storage
        const [sourceId, targetId] =
          seriesA.id < seriesB.id
            ? [seriesA.id, seriesB.id]
            : [seriesB.id, seriesA.id];

        batch.push({
          sourceSeriesId: sourceId,
          targetSeriesId: targetId,
          similarityScore: scores.similarityScore,
          genreScore: scores.genreScore,
          tagScore: scores.tagScore,
          characterScore: scores.characterScore,
          teamScore: scores.teamScore,
          creatorScore: scores.creatorScore,
          publisherScore: scores.publisherScore,
          keywordScore: scores.keywordScore,
        });
      }

      pairsProcessed++;

      // Batch insert when batch is full
      if (batch.length >= BATCH_SIZE) {
        await db.seriesSimilarity.createMany({
          data: batch,
        });
        pairsStored += batch.length;
        batch.length = 0;
      }

      // Update progress periodically
      if (pairsProcessed % PROGRESS_UPDATE_INTERVAL === 0) {
        await db.similarityJob.update({
          where: { id: jobId },
          data: {
            processedPairs: pairsProcessed,
            lastProcessedId: seriesA.id,
          },
        });
      }
    }
  }

  // Insert remaining batch
  if (batch.length > 0) {
    await db.seriesSimilarity.createMany({
      data: batch,
    });
    pairsStored += batch.length;
  }

  return { pairsProcessed, pairsStored };
}

// =============================================================================
// Incremental Update
// =============================================================================

async function runIncrementalUpdate(
  jobId: string
): Promise<{ pairsProcessed: number; pairsStored: number }> {
  const db = getDatabase();

  // Find series updated since last completed job
  const lastJob = await getLastCompletedJob();
  const sinceDate = lastJob?.completedAt ?? new Date(0);

  const updatedSeries = await db.series.findMany({
    where: {
      deletedAt: null,
      updatedAt: { gt: sinceDate },
    },
    select: {
      id: true,
      name: true,
      genres: true,
      tags: true,
      characters: true,
      teams: true,
      creators: true,
      writer: true,
      penciller: true,
      publisher: true,
      summary: true,
    },
  });

  // If no updates, we're done
  if (updatedSeries.length === 0) {
    return { pairsProcessed: 0, pairsStored: 0 };
  }

  // Get all series for comparison
  const allSeries = await db.series.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      genres: true,
      tags: true,
      characters: true,
      teams: true,
      creators: true,
      writer: true,
      penciller: true,
      publisher: true,
      summary: true,
    },
  });

  const seriesMap = new Map(allSeries.map((s) => [s.id, s as SeriesData]));

  // Calculate total pairs to process
  const totalPairs = updatedSeries.length * (allSeries.length - 1);
  await db.similarityJob.update({
    where: { id: jobId },
    data: { totalPairs },
  });

  let pairsProcessed = 0;
  let pairsStored = 0;

  // For each updated series, recompute its similarities
  for (const series of updatedSeries) {
    const seriesData = series as SeriesData;

    // Delete existing similarities for this series
    await db.seriesSimilarity.deleteMany({
      where: {
        OR: [{ sourceSeriesId: series.id }, { targetSeriesId: series.id }],
      },
    });

    const batch: Array<{
      sourceSeriesId: string;
      targetSeriesId: string;
      similarityScore: number;
      genreScore: number;
      tagScore: number;
      characterScore: number;
      teamScore: number;
      creatorScore: number;
      publisherScore: number;
      keywordScore: number;
    }> = [];

    // Compute similarity against all other series
    for (const other of allSeries) {
      if (other.id === series.id) continue;

      const otherData = other as SeriesData;
      const scores = computeAndFilterSimilarity(seriesData, otherData);

      if (scores) {
        // Ensure sourceSeriesId < targetSeriesId
        const [sourceId, targetId] =
          series.id < other.id
            ? [series.id, other.id]
            : [other.id, series.id];

        batch.push({
          sourceSeriesId: sourceId,
          targetSeriesId: targetId,
          similarityScore: scores.similarityScore,
          genreScore: scores.genreScore,
          tagScore: scores.tagScore,
          characterScore: scores.characterScore,
          teamScore: scores.teamScore,
          creatorScore: scores.creatorScore,
          publisherScore: scores.publisherScore,
          keywordScore: scores.keywordScore,
        });
      }

      pairsProcessed++;
    }

    // Insert similarities for this series
    // Note: We already deleted existing similarities above, so no duplicates expected
    if (batch.length > 0) {
      await db.seriesSimilarity.createMany({
        data: batch,
      });
      pairsStored += batch.length;
    }

    // Update progress
    await db.similarityJob.update({
      where: { id: jobId },
      data: {
        processedPairs: pairsProcessed,
        lastProcessedId: series.id,
      },
    });
  }

  return { pairsProcessed, pairsStored };
}

// =============================================================================
// Single Series Update
// =============================================================================

/**
 * Update similarities for a single series.
 * Called when series metadata is updated.
 */
export async function updateSeriesSimilarities(seriesId: string): Promise<void> {
  const db = getDatabase();

  // Get the series data
  const series = await db.series.findUnique({
    where: { id: seriesId },
    select: {
      id: true,
      name: true,
      genres: true,
      tags: true,
      characters: true,
      teams: true,
      creators: true,
      writer: true,
      penciller: true,
      publisher: true,
      summary: true,
      deletedAt: true,
    },
  });

  if (!series || series.deletedAt) {
    // Series deleted - remove all its similarities
    await db.seriesSimilarity.deleteMany({
      where: {
        OR: [{ sourceSeriesId: seriesId }, { targetSeriesId: seriesId }],
      },
    });
    return;
  }

  // Delete existing similarities for this series
  await db.seriesSimilarity.deleteMany({
    where: {
      OR: [{ sourceSeriesId: seriesId }, { targetSeriesId: seriesId }],
    },
  });

  // Get all other series
  const allOtherSeries = await db.series.findMany({
    where: {
      deletedAt: null,
      id: { not: seriesId },
    },
    select: {
      id: true,
      name: true,
      genres: true,
      tags: true,
      characters: true,
      teams: true,
      creators: true,
      writer: true,
      penciller: true,
      publisher: true,
      summary: true,
    },
  });

  const seriesData = series as SeriesData;
  const batch: Array<{
    sourceSeriesId: string;
    targetSeriesId: string;
    similarityScore: number;
    genreScore: number;
    tagScore: number;
    characterScore: number;
    teamScore: number;
    creatorScore: number;
    publisherScore: number;
    keywordScore: number;
  }> = [];

  // Compute similarities
  for (const other of allOtherSeries) {
    const otherData = other as SeriesData;
    const scores = computeAndFilterSimilarity(seriesData, otherData);

    if (scores) {
      const [sourceId, targetId] =
        seriesId < other.id ? [seriesId, other.id] : [other.id, seriesId];

      batch.push({
        sourceSeriesId: sourceId,
        targetSeriesId: targetId,
        similarityScore: scores.similarityScore,
        genreScore: scores.genreScore,
        tagScore: scores.tagScore,
        characterScore: scores.characterScore,
        teamScore: scores.teamScore,
        creatorScore: scores.creatorScore,
        publisherScore: scores.publisherScore,
        keywordScore: scores.keywordScore,
      });
    }
  }

  // Insert new similarities
  if (batch.length > 0) {
    await db.seriesSimilarity.createMany({
      data: batch,
    });
  }
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get similar series for a given series.
 *
 * @param seriesId - The series to find similar series for
 * @param limit - Maximum number of results (default: 10)
 * @returns Array of similar series with scores
 */
export async function getSimilarSeries(
  seriesId: string,
  limit = 10
): Promise<
  Array<{
    seriesId: string;
    similarityScore: number;
    genreScore: number;
    tagScore: number;
    characterScore: number;
    teamScore: number;
    creatorScore: number;
    publisherScore: number;
    keywordScore: number;
  }>
> {
  const db = getDatabase();

  // Query both directions since similarity is symmetric
  const similarities = await db.seriesSimilarity.findMany({
    where: {
      OR: [{ sourceSeriesId: seriesId }, { targetSeriesId: seriesId }],
    },
    orderBy: { similarityScore: 'desc' },
    take: limit,
  });

  return similarities.map((sim) => ({
    seriesId:
      sim.sourceSeriesId === seriesId ? sim.targetSeriesId : sim.sourceSeriesId,
    similarityScore: sim.similarityScore,
    genreScore: sim.genreScore,
    tagScore: sim.tagScore,
    characterScore: sim.characterScore,
    teamScore: sim.teamScore,
    creatorScore: sim.creatorScore,
    publisherScore: sim.publisherScore,
    keywordScore: sim.keywordScore,
  }));
}

/**
 * Check if similarity data exists.
 */
export async function hasSimilarityData(): Promise<boolean> {
  const db = getDatabase();
  const count = await db.seriesSimilarity.count();
  return count > 0;
}

/**
 * Get similarity statistics.
 */
export async function getSimilarityStats(): Promise<{
  totalPairs: number;
  avgScore: number;
  lastComputedAt: Date | null;
}> {
  const db = getDatabase();

  const [count, avgResult, lastJob] = await Promise.all([
    db.seriesSimilarity.count(),
    db.seriesSimilarity.aggregate({
      _avg: { similarityScore: true },
    }),
    db.similarityJob.findFirst({
      where: { status: 'completed' },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    }),
  ]);

  return {
    totalPairs: count,
    avgScore: avgResult._avg.similarityScore ?? 0,
    lastComputedAt: lastJob?.completedAt ?? null,
  };
}
