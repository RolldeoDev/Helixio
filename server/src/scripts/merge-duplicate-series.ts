/**
 * Merge Duplicate Series Script
 *
 * Merges series that have the same name+publisher but different years.
 * This fixes the issue where multi-year series runs were split into separate entries.
 *
 * Usage: npx tsx src/scripts/merge-duplicate-series.ts
 */

import { PrismaClient } from '@prisma/client';
import { getDatabaseUrl, ensureAppDirectories } from '../services/app-paths.service.js';

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

interface DuplicateGroup {
  name: string;
  publisher: string | null;
  count: number;
  seriesIds: string[];
  years: (number | null)[];
}

async function findDuplicateSeries(): Promise<DuplicateGroup[]> {
  // Find all series grouped by name only (ignoring publisher differences)
  const allSeries = await prisma.series.findMany({
    select: {
      id: true,
      name: true,
      publisher: true,
      startYear: true,
      endYear: true,
    },
    orderBy: [{ name: 'asc' }, { startYear: 'asc' }],
  });

  // Group by name only (case-insensitive, normalized) - ignore publisher
  // This allows merging series with null publisher into ones with real publisher
  const groups = new Map<string, typeof allSeries>();

  for (const series of allSeries) {
    // Create normalized key: lowercase name only
    const key = series.name.toLowerCase().trim();

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(series);
  }

  // Filter to only groups with duplicates
  const duplicates: DuplicateGroup[] = [];
  for (const [, seriesList] of groups) {
    if (seriesList.length > 1) {
      // Prefer the series with publisher info
      const withPublisher = seriesList.filter((s) => s.publisher);
      const primary = withPublisher[0] ?? seriesList[0]!;

      duplicates.push({
        name: primary.name,
        publisher: primary.publisher,
        count: seriesList.length,
        seriesIds: seriesList.map((s) => s.id),
        years: seriesList.map((s) => s.startYear),
      });
    }
  }

  return duplicates;
}

async function mergeSeries(group: DuplicateGroup): Promise<{ merged: number; issuesMoved: number }> {
  const seriesIds = group.seriesIds;

  // Get all series records
  const seriesRecords = await prisma.series.findMany({
    where: { id: { in: seriesIds } },
    include: {
      _count: { select: { issues: true } },
      progress: true,
    },
    orderBy: { startYear: 'asc' },
  });

  if (seriesRecords.length <= 1) {
    return { merged: 0, issuesMoved: 0 };
  }

  // Choose primary series priority:
  // 1. Has publisher (prefer series with metadata)
  // 2. Most issues
  // 3. Earliest year
  const primary = seriesRecords.reduce((best, current) => {
    // First priority: prefer series WITH publisher
    const bestHasPublisher = !!best.publisher;
    const currentHasPublisher = !!current.publisher;
    if (currentHasPublisher && !bestHasPublisher) return current;
    if (bestHasPublisher && !currentHasPublisher) return best;

    // Second priority: most issues
    const bestCount = best._count?.issues ?? 0;
    const currentCount = current._count?.issues ?? 0;
    if (currentCount > bestCount) return current;
    if (bestCount > currentCount) return best;

    // Third priority: earliest year
    if ((current.startYear ?? 9999) < (best.startYear ?? 9999)) return current;
    return best;
  });

  const duplicateIds = seriesIds.filter((id) => id !== primary.id);

  // Calculate year range across all series
  const allYears = seriesRecords
    .flatMap((s) => [s.startYear, s.endYear])
    .filter((y): y is number => y !== null);

  const minYear = allYears.length > 0 ? Math.min(...allYears) : null;
  const maxYear = allYears.length > 0 ? Math.max(...allYears) : null;

  // Merge metadata from duplicates into primary
  // Take non-null values from duplicates if primary is null
  const mergedData: Record<string, unknown> = {};

  for (const dup of seriesRecords.filter((s) => s.id !== primary.id)) {
    if (!primary.summary && dup.summary) mergedData.summary = dup.summary;
    if (!primary.deck && dup.deck) mergedData.deck = dup.deck;
    if (!primary.genres && dup.genres) mergedData.genres = dup.genres;
    if (!primary.tags && dup.tags) mergedData.tags = dup.tags;
    if (!primary.ageRating && dup.ageRating) mergedData.ageRating = dup.ageRating;
    if (!primary.languageISO && dup.languageISO) mergedData.languageISO = dup.languageISO;
    if (!primary.characters && dup.characters) mergedData.characters = dup.characters;
    if (!primary.teams && dup.teams) mergedData.teams = dup.teams;
    if (!primary.locations && dup.locations) mergedData.locations = dup.locations;
    if (!primary.storyArcs && dup.storyArcs) mergedData.storyArcs = dup.storyArcs;
    if (!primary.coverUrl && dup.coverUrl) mergedData.coverUrl = dup.coverUrl;
    // Priority: coverHash (API-downloaded covers) > coverFileId
    if (!primary.coverHash && dup.coverHash) mergedData.coverHash = dup.coverHash;
    if (!primary.coverFileId && dup.coverFileId) mergedData.coverFileId = dup.coverFileId;
    if (!primary.comicVineId && dup.comicVineId) mergedData.comicVineId = dup.comicVineId;
    if (!primary.metronId && dup.metronId) mergedData.metronId = dup.metronId;
  }

  // Count issues to be moved
  const issuesToMove = await prisma.comicFile.count({
    where: { seriesId: { in: duplicateIds } },
  });

  // Use transaction for atomic merge
  await prisma.$transaction(async (tx) => {
    // 1. Move all issues from duplicates to primary
    await tx.comicFile.updateMany({
      where: { seriesId: { in: duplicateIds } },
      data: { seriesId: primary.id },
    });

    // 2. Delete duplicate series progress records
    await tx.seriesProgress.deleteMany({
      where: { seriesId: { in: duplicateIds } },
    });

    // 3. Delete duplicate series reader settings
    await tx.seriesReaderSettingsNew.deleteMany({
      where: { seriesId: { in: duplicateIds } },
    });

    // 4. Delete duplicate series
    await tx.series.deleteMany({
      where: { id: { in: duplicateIds } },
    });

    // 5. Update primary series with merged data and year range
    await tx.series.update({
      where: { id: primary.id },
      data: {
        ...mergedData,
        startYear: minYear,
        endYear: minYear !== maxYear ? maxYear : null,
      },
    });

    // 6. SeriesProgress is now per-user, so we update all existing progress records
    const totalOwned = await tx.comicFile.count({
      where: { seriesId: primary.id },
    });

    // Update totalOwned for all users with existing progress on this series
    await tx.seriesProgress.updateMany({
      where: { seriesId: primary.id },
      data: { totalOwned },
    });
  });

  return { merged: duplicateIds.length, issuesMoved: issuesToMove };
}

async function main() {
  console.log('Finding duplicate series...\n');

  const duplicates = await findDuplicateSeries();

  if (duplicates.length === 0) {
    console.log('No duplicate series found. All series are unique by name+publisher.');
    return;
  }

  console.log(`Found ${duplicates.length} series with duplicates:\n`);

  for (const dup of duplicates) {
    const years = dup.years.filter((y) => y !== null).sort((a, b) => (a ?? 0) - (b ?? 0));
    console.log(`  "${dup.name}" (${dup.publisher || 'no publisher'})`);
    console.log(`    ${dup.count} entries, years: ${years.join(', ') || 'none'}`);
  }

  console.log('\nMerging duplicates...\n');

  let totalMerged = 0;
  let totalIssuesMoved = 0;

  for (const dup of duplicates) {
    try {
      const result = await mergeSeries(dup);
      totalMerged += result.merged;
      totalIssuesMoved += result.issuesMoved;
      console.log(
        `  Merged "${dup.name}": ${result.merged} duplicates removed, ${result.issuesMoved} issues moved`
      );
    } catch (err) {
      console.error(`  Failed to merge "${dup.name}":`, err instanceof Error ? err.message : err);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Duplicate groups processed: ${duplicates.length}`);
  console.log(`Series entries removed: ${totalMerged}`);
  console.log(`Issues moved: ${totalIssuesMoved}`);

  const finalCount = await prisma.series.count();
  console.log(`\nTotal series in database: ${finalCount}`);
}

main()
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
