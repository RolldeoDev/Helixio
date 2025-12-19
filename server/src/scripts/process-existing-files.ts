/**
 * Process Existing Files Script
 *
 * Extracts metadata from ComicInfo.xml and creates/links series for all
 * unprocessed files in the database.
 *
 * Usage: npx tsx src/scripts/process-existing-files.ts
 */

import { PrismaClient } from '@prisma/client';
import { getDatabaseUrl, ensureAppDirectories } from '../services/app-paths.service.js';
import { readComicInfo } from '../services/comicinfo.service.js';

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

/**
 * Extract folder name from relative path.
 */
function getFolderNameFromPath(relativePath: string): string | null {
  const parts = relativePath.split('/');
  if (parts.length > 1) {
    return parts[parts.length - 2] ?? null;
  }
  return null;
}

/**
 * Get or create a series based on name and publisher only.
 * Year is used for display/metadata but not for identity matching
 * to avoid splitting multi-year series runs.
 */
async function getOrCreateSeries(
  name: string,
  year: number | null,
  publisher: string | null,
  metadata?: {
    genres?: string | null;
    tags?: string | null;
    languageISO?: string | null;
    ageRating?: string | null;
  }
): Promise<{ id: string; created: boolean; yearUpdated?: boolean }> {
  // Try to find existing series by name + publisher only (not year)
  const existing = await prisma.series.findFirst({
    where: {
      name,
      publisher: publisher,
    },
  });

  if (existing) {
    // Update year range if this issue extends the range
    let yearUpdated = false;
    if (year) {
      const updates: { startYear?: number; endYear?: number } = {};

      // If this issue is earlier than startYear, update startYear
      if (!existing.startYear || year < existing.startYear) {
        updates.startYear = year;
        yearUpdated = true;
      }

      // If this issue is later than endYear (or startYear if no endYear), update endYear
      const latestYear = existing.endYear ?? existing.startYear ?? 0;
      if (year > latestYear) {
        updates.endYear = year;
        yearUpdated = true;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.series.update({
          where: { id: existing.id },
          data: updates,
        });
      }
    }

    return { id: existing.id, created: false, yearUpdated };
  }

  // Create new series
  const newSeries = await prisma.series.create({
    data: {
      name,
      startYear: year,
      publisher: publisher,
      genres: metadata?.genres ?? null,
      tags: metadata?.tags ?? null,
      languageISO: metadata?.languageISO ?? null,
      ageRating: metadata?.ageRating ?? null,
    },
  });

  return { id: newSeries.id, created: true };
}

async function main() {
  console.log('Processing existing files...\n');

  // Get all files that don't have a series linked
  const files = await prisma.comicFile.findMany({
    where: {
      seriesId: null,
    },
    select: {
      id: true,
      path: true,
      filename: true,
      relativePath: true,
      seriesId: true,
      metadata: true,
    },
  });

  console.log(`Found ${files.length} files without series link\n`);

  if (files.length === 0) {
    console.log('No files need processing.');
    return;
  }

  let metadataCached = 0;
  let linked = 0;
  let created = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const progress = `[${i + 1}/${files.length}]`;

    try {
      let seriesName: string | null = null;
      let year: number | null = null;
      let publisher: string | null = null;
      let genres: string | null = null;
      let tags: string | null = null;
      let languageISO: string | null = null;
      let ageRating: string | null = null;

      // Step 1: Extract metadata if not already cached
      if (!file.metadata) {
        const result = await readComicInfo(file.path);

        if (result.success && result.comicInfo) {
          const ci = result.comicInfo;
          await prisma.fileMetadata.create({
            data: {
              comicId: file.id,
              series: ci.Series || null,
              number: ci.Number || null,
              title: ci.Title || null,
              volume: ci.Volume || null,
              publisher: ci.Publisher || null,
              imprint: ci.Imprint || null,
              year: ci.Year || null,
              month: ci.Month || null,
              day: ci.Day || null,
              writer: ci.Writer || null,
              penciller: ci.Penciller || null,
              inker: ci.Inker || null,
              colorist: ci.Colorist || null,
              letterer: ci.Letterer || null,
              coverArtist: ci.CoverArtist || null,
              editor: ci.Editor || null,
              summary: ci.Summary || null,
              genre: ci.Genre || null,
              tags: ci.Tags || null,
              characters: ci.Characters || null,
              teams: ci.Teams || null,
              locations: ci.Locations || null,
              count: ci.Count || null,
              storyArc: ci.StoryArc || null,
              seriesGroup: ci.SeriesGroup || null,
              pageCount: ci.PageCount || null,
              languageISO: ci.LanguageISO || null,
              format: ci.Format || null,
              ageRating: ci.AgeRating || null,
              lastScanned: new Date(),
            },
          });
          metadataCached++;

          // Use extracted metadata for series
          seriesName = ci.Series || null;
          year = ci.Year || null;
          publisher = ci.Publisher || null;
          genres = ci.Genre || null;
          tags = ci.Tags || null;
          languageISO = ci.LanguageISO || null;
          ageRating = ci.AgeRating || null;
        }
      } else {
        // Use existing metadata
        seriesName = file.metadata.series;
        year = file.metadata.year;
        publisher = file.metadata.publisher;
        genres = file.metadata.genre;
        tags = file.metadata.tags;
        languageISO = file.metadata.languageISO;
        ageRating = file.metadata.ageRating;
      }

      // If no series name from metadata, use folder name
      if (!seriesName) {
        seriesName = getFolderNameFromPath(file.relativePath);
      }

      // Step 2: Create or find series and link file
      if (seriesName) {
        const seriesResult = await getOrCreateSeries(seriesName, year, publisher, {
          genres,
          tags,
          languageISO,
          ageRating,
        });

        // Link file to series
        await prisma.comicFile.update({
          where: { id: file.id },
          data: {
            seriesId: seriesResult.id,
            status: 'indexed',
          },
        });

        if (seriesResult.created) {
          created++;
          console.log(`${progress} Created series "${seriesName}" for: ${file.filename}`);
        } else {
          linked++;
          console.log(`${progress} Linked to "${seriesName}": ${file.filename}`);
        }
      } else {
        console.log(`${progress} No series name found for: ${file.filename}`);
        failed++;
      }
    } catch (err) {
      failed++;
      console.error(`${progress} Failed: ${file.filename}`, err instanceof Error ? err.message : err);
    }
  }

  // Update series progress for all series
  console.log('\nUpdating series progress...');
  const allSeries = await prisma.series.findMany({ select: { id: true } });
  for (const series of allSeries) {
    const totalOwned = await prisma.comicFile.count({ where: { seriesId: series.id } });
    const totalRead = await prisma.readingProgress.count({
      where: {
        file: { seriesId: series.id },
        completed: true,
      },
    });

    await prisma.seriesProgress.upsert({
      where: { seriesId: series.id },
      create: {
        seriesId: series.id,
        totalOwned,
        totalRead,
      },
      update: {
        totalOwned,
        totalRead,
      },
    });
  }

  console.log('\n=== Summary ===');
  console.log(`Total files processed: ${files.length}`);
  console.log(`Metadata cached: ${metadataCached}`);
  console.log(`Linked to existing series: ${linked}`);
  console.log(`New series created: ${created}`);
  console.log(`Failed: ${failed}`);

  // Show series count
  const seriesCount = await prisma.series.count();
  console.log(`\nTotal series in database: ${seriesCount}`);
}

main()
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
