/**
 * Cleanup Incompatible External IDs Script
 *
 * Clears AniList and MAL IDs from western comics/series.
 * These IDs are only valid for manga content.
 *
 * Also deletes associated external ratings and reviews from AniList/MAL
 * for affected series.
 *
 * Usage:
 *   npx tsx src/scripts/cleanup-incompatible-external-ids.ts --dry-run   # Preview changes
 *   npx tsx src/scripts/cleanup-incompatible-external-ids.ts --apply     # Apply changes
 */

import { PrismaClient } from '@prisma/client';
import {
  getDatabaseUrl,
  ensureAppDirectories,
} from '../services/app-paths.service.js';

// Initialize database
ensureAppDirectories();
const databaseUrl = getDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

interface IncompatibleSeries {
  id: string;
  name: string;
  type: string;
  anilistId: string | null;
  malId: string | null;
}

interface CleanupResult {
  success: boolean;
  seriesCleaned: number;
  anilistIdsCleared: number;
  malIdsCleared: number;
  ratingsDeleted: number;
  reviewsDeleted: number;
  errors: string[];
}

async function findIncompatibleSeries(): Promise<IncompatibleSeries[]> {
  // Find all non-manga series that have AniList or MAL IDs
  const incompatibleSeries = await prisma.series.findMany({
    where: {
      type: { not: 'manga' },
      OR: [{ anilistId: { not: null } }, { malId: { not: null } }],
    },
    select: {
      id: true,
      name: true,
      type: true,
      anilistId: true,
      malId: true,
    },
    orderBy: { name: 'asc' },
  });

  return incompatibleSeries;
}

async function previewCleanup(
  incompatibleSeries: IncompatibleSeries[]
): Promise<void> {
  console.log('\n=== DRY RUN - No changes will be made ===\n');

  if (incompatibleSeries.length === 0) {
    console.log('No incompatible series found. Database is clean.');
    return;
  }

  console.log(
    `Found ${incompatibleSeries.length} non-manga series with AniList/MAL IDs:\n`
  );

  for (const series of incompatibleSeries) {
    console.log(`  - "${series.name}" (type: ${series.type})`);
    if (series.anilistId) {
      console.log(`      AniList ID: ${series.anilistId} (will be cleared)`);
    }
    if (series.malId) {
      console.log(`      MAL ID: ${series.malId} (will be cleared)`);
    }
  }

  // Count associated ratings and reviews
  const seriesIds = incompatibleSeries.map((s) => s.id);

  const ratingsCount = await prisma.externalRating.count({
    where: {
      seriesId: { in: seriesIds },
      source: { in: ['anilist', 'myanimelist'] },
    },
  });

  const reviewsCount = await prisma.externalReview.count({
    where: {
      seriesId: { in: seriesIds },
      source: { in: ['anilist', 'myanimelist'] },
    },
  });

  console.log(`\nAssociated data to be deleted:`);
  console.log(`  - ${ratingsCount} external ratings from AniList/MAL`);
  console.log(`  - ${reviewsCount} external reviews from AniList/MAL`);

  console.log(
    '\nTo apply these changes, run with --apply flag:\n  npx tsx src/scripts/cleanup-incompatible-external-ids.ts --apply\n'
  );
}

async function applyCleanup(
  incompatibleSeries: IncompatibleSeries[]
): Promise<CleanupResult> {
  const result: CleanupResult = {
    success: false,
    seriesCleaned: 0,
    anilistIdsCleared: 0,
    malIdsCleared: 0,
    ratingsDeleted: 0,
    reviewsDeleted: 0,
    errors: [],
  };

  if (incompatibleSeries.length === 0) {
    console.log('No incompatible series found. Database is already clean.');
    result.success = true;
    return result;
  }

  console.log(
    `\nApplying cleanup to ${incompatibleSeries.length} series...\n`
  );

  const seriesIds = incompatibleSeries.map((s) => s.id);

  // Delete associated ratings first
  try {
    const ratingsResult = await prisma.externalRating.deleteMany({
      where: {
        seriesId: { in: seriesIds },
        source: { in: ['anilist', 'myanimelist'] },
      },
    });
    result.ratingsDeleted = ratingsResult.count;
    console.log(`  Deleted ${result.ratingsDeleted} external ratings`);
  } catch (err) {
    const error = `Failed to delete ratings: ${err instanceof Error ? err.message : 'Unknown error'}`;
    result.errors.push(error);
    console.error(`  Error: ${error}`);
  }

  // Delete associated reviews
  try {
    const reviewsResult = await prisma.externalReview.deleteMany({
      where: {
        seriesId: { in: seriesIds },
        source: { in: ['anilist', 'myanimelist'] },
      },
    });
    result.reviewsDeleted = reviewsResult.count;
    console.log(`  Deleted ${result.reviewsDeleted} external reviews`);
  } catch (err) {
    const error = `Failed to delete reviews: ${err instanceof Error ? err.message : 'Unknown error'}`;
    result.errors.push(error);
    console.error(`  Error: ${error}`);
  }

  // Clear external IDs from each series
  for (const series of incompatibleSeries) {
    try {
      await prisma.series.update({
        where: { id: series.id },
        data: {
          anilistId: null,
          malId: null,
        },
      });

      result.seriesCleaned++;
      if (series.anilistId) result.anilistIdsCleared++;
      if (series.malId) result.malIdsCleared++;

      console.log(`  Cleaned: "${series.name}"`);
    } catch (err) {
      const error = `Failed to clean series "${series.name}" (${series.id}): ${err instanceof Error ? err.message : 'Unknown error'}`;
      result.errors.push(error);
      console.error(`  Error: ${error}`);
    }
  }

  result.success = result.errors.length === 0;

  console.log('\n=== Cleanup Summary ===');
  console.log(`  Series cleaned: ${result.seriesCleaned}`);
  console.log(`  AniList IDs cleared: ${result.anilistIdsCleared}`);
  console.log(`  MAL IDs cleared: ${result.malIdsCleared}`);
  console.log(`  Ratings deleted: ${result.ratingsDeleted}`);
  console.log(`  Reviews deleted: ${result.reviewsDeleted}`);
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.length}`);
  }
  console.log(
    `  Status: ${result.success ? 'SUCCESS' : 'COMPLETED WITH ERRORS'}`
  );

  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || !args.includes('--apply');

  console.log('===========================================');
  console.log(' Cleanup Incompatible External IDs Script');
  console.log('===========================================');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (preview only)' : 'APPLY CHANGES'}`);

  try {
    const incompatibleSeries = await findIncompatibleSeries();

    if (isDryRun) {
      await previewCleanup(incompatibleSeries);
    } else {
      await applyCleanup(incompatibleSeries);
    }
  } catch (err) {
    console.error(
      '\nFatal error:',
      err instanceof Error ? err.message : 'Unknown error'
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
