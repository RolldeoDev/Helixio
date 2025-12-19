/**
 * Series Migration Script
 *
 * Migrates existing data to the new series-centric architecture:
 * 1. Scans all FileMetadata records for unique series combinations
 * 2. Creates Series records for each unique (name, startYear, publisher) tuple
 * 3. Links ComicFile records to their corresponding Series
 * 4. Creates SeriesProgress records for each Series
 *
 * Usage: npx tsx src/scripts/migrate-series-data.ts
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

interface SeriesKey {
  name: string;
  startYear: number | null;
  publisher: string | null;
}

interface SeriesData extends SeriesKey {
  genres: string | null;
  tags: string | null;
  languageISO: string | null;
  ageRating: string | null;
  characters: string | null;
  teams: string | null;
  locations: string | null;
  storyArcs: string | null;
  comicVineId: string | null;
  metronId: string | null;
  fileIds: string[];
  issueCount: number;
}

function getSeriesKeyString(key: SeriesKey): string {
  return `${key.name}|${key.startYear ?? 'null'}|${key.publisher ?? 'null'}`;
}

async function migrate() {
  console.log('Starting series migration...');
  console.log(`Database: ${databaseUrl}`);

  try {
    // Step 1: Check if migration already ran
    const existingSeries = await prisma.series.count();
    if (existingSeries > 0) {
      console.log(`Found ${existingSeries} existing series. Migration may have already run.`);
      const answer = process.argv.includes('--force') ? 'y' : 'n';
      if (answer !== 'y' && !process.argv.includes('--force')) {
        console.log('Use --force to run migration anyway. Exiting.');
        return;
      }
      console.log('Continuing with --force flag...');
    }

    // Step 2: Get all FileMetadata with series info
    const fileMetadataRecords = await prisma.fileMetadata.findMany({
      where: {
        series: {
          not: null,
        },
      },
      select: {
        comicId: true,
        series: true,
        year: true,
        publisher: true,
        genre: true,
        tags: true,
        languageISO: true,
        ageRating: true,
        characters: true,
        teams: true,
        locations: true,
        storyArc: true,
        comicVineId: true,
        metronId: true,
      },
    });

    console.log(`Found ${fileMetadataRecords.length} files with series metadata`);

    // Step 3: Group by unique series identity (name + year + publisher)
    const seriesMap = new Map<string, SeriesData>();

    for (const metadata of fileMetadataRecords) {
      if (!metadata.series) continue;

      const key: SeriesKey = {
        name: metadata.series,
        startYear: metadata.year,
        publisher: metadata.publisher,
      };
      const keyString = getSeriesKeyString(key);

      if (seriesMap.has(keyString)) {
        const existing = seriesMap.get(keyString)!;
        existing.fileIds.push(metadata.comicId);
        existing.issueCount++;

        // Merge optional fields (prefer non-null values)
        if (!existing.genres && metadata.genre) existing.genres = metadata.genre;
        if (!existing.tags && metadata.tags) existing.tags = metadata.tags;
        if (!existing.languageISO && metadata.languageISO) existing.languageISO = metadata.languageISO;
        if (!existing.ageRating && metadata.ageRating) existing.ageRating = metadata.ageRating;
        if (!existing.characters && metadata.characters) existing.characters = metadata.characters;
        if (!existing.teams && metadata.teams) existing.teams = metadata.teams;
        if (!existing.locations && metadata.locations) existing.locations = metadata.locations;
        if (!existing.storyArcs && metadata.storyArc) existing.storyArcs = metadata.storyArc;
        if (!existing.comicVineId && metadata.comicVineId) existing.comicVineId = metadata.comicVineId;
        if (!existing.metronId && metadata.metronId) existing.metronId = metadata.metronId;
      } else {
        seriesMap.set(keyString, {
          ...key,
          genres: metadata.genre,
          tags: metadata.tags,
          languageISO: metadata.languageISO,
          ageRating: metadata.ageRating,
          characters: metadata.characters,
          teams: metadata.teams,
          locations: metadata.locations,
          storyArcs: metadata.storyArc,
          comicVineId: metadata.comicVineId,
          metronId: metadata.metronId,
          fileIds: [metadata.comicId],
          issueCount: 1,
        });
      }
    }

    console.log(`Identified ${seriesMap.size} unique series`);

    // Step 4: Create Series records and link files
    let created = 0;
    let linked = 0;
    let errors = 0;

    for (const [keyString, seriesData] of seriesMap) {
      try {
        // Check if series already exists
        let series = await prisma.series.findFirst({
          where: {
            name: seriesData.name,
            startYear: seriesData.startYear,
            publisher: seriesData.publisher,
          },
        });

        if (!series) {
          // Create new series
          series = await prisma.series.create({
            data: {
              name: seriesData.name,
              startYear: seriesData.startYear,
              publisher: seriesData.publisher,
              genres: seriesData.genres,
              tags: seriesData.tags,
              languageISO: seriesData.languageISO,
              ageRating: seriesData.ageRating,
              characters: seriesData.characters,
              teams: seriesData.teams,
              locations: seriesData.locations,
              storyArcs: seriesData.storyArcs,
              comicVineId: seriesData.comicVineId,
              metronId: seriesData.metronId,
            },
          });
          created++;
          console.log(`Created series: ${seriesData.name} (${seriesData.startYear ?? 'unknown year'}, ${seriesData.publisher ?? 'unknown publisher'})`);
        }

        // Link files to series
        const updateResult = await prisma.comicFile.updateMany({
          where: {
            id: {
              in: seriesData.fileIds,
            },
          },
          data: {
            seriesId: series.id,
          },
        });
        linked += updateResult.count;

        // Create SeriesProgress record
        const existingProgress = await prisma.seriesProgress.findUnique({
          where: { seriesId: series.id },
        });

        if (!existingProgress) {
          // Count read files for this series
          const readCount = await prisma.readingProgress.count({
            where: {
              fileId: {
                in: seriesData.fileIds,
              },
              completed: true,
            },
          });

          const inProgressCount = await prisma.readingProgress.count({
            where: {
              fileId: {
                in: seriesData.fileIds,
              },
              completed: false,
              currentPage: {
                gt: 0,
              },
            },
          });

          // Get last read info
          const lastRead = await prisma.readingProgress.findFirst({
            where: {
              fileId: {
                in: seriesData.fileIds,
              },
            },
            orderBy: {
              lastReadAt: 'desc',
            },
            include: {
              file: {
                include: {
                  metadata: true,
                },
              },
            },
          });

          await prisma.seriesProgress.create({
            data: {
              seriesId: series.id,
              totalOwned: seriesData.fileIds.length,
              totalRead: readCount,
              totalInProgress: inProgressCount,
              lastReadFileId: lastRead?.fileId ?? null,
              lastReadIssueNum: lastRead?.file?.metadata?.number
                ? parseFloat(lastRead.file.metadata.number) || null
                : null,
              lastReadAt: lastRead?.lastReadAt ?? null,
            },
          });
        }
      } catch (error) {
        errors++;
        console.error(`Error processing series "${seriesData.name}":`, error);
      }
    }

    // Step 5: Handle files without series metadata (use folder name as fallback)
    const filesWithoutSeries = await prisma.comicFile.findMany({
      where: {
        seriesId: null,
        metadata: {
          OR: [
            { series: null },
            { series: '' },
          ],
        },
      },
      include: {
        metadata: true,
      },
    });

    console.log(`Found ${filesWithoutSeries.length} files without series metadata`);

    // Group by parent folder
    const folderGroups = new Map<string, typeof filesWithoutSeries>();
    for (const file of filesWithoutSeries) {
      const parts = file.relativePath.split('/');
      const folderName = parts.length > 1 ? (parts[parts.length - 2] ?? 'Ungrouped') : 'Ungrouped';

      const existing = folderGroups.get(folderName);
      if (existing) {
        existing.push(file);
      } else {
        folderGroups.set(folderName, [file]);
      }
    }

    // Create series for folder groups
    for (const [folderName, files] of folderGroups) {
      if (folderName === 'Ungrouped' || files.length === 0) continue;

      try {
        let series = await prisma.series.findFirst({
          where: {
            name: folderName,
            startYear: null,
            publisher: null,
          },
        });

        if (!series) {
          series = await prisma.series.create({
            data: {
              name: folderName,
            },
          });
          created++;
          console.log(`Created series from folder: ${folderName}`);
        }

        const updateResult = await prisma.comicFile.updateMany({
          where: {
            id: {
              in: files.map((f) => f.id),
            },
          },
          data: {
            seriesId: series.id,
          },
        });
        linked += updateResult.count;

        // Create SeriesProgress
        const existingProgress = await prisma.seriesProgress.findUnique({
          where: { seriesId: series.id },
        });

        if (!existingProgress) {
          await prisma.seriesProgress.create({
            data: {
              seriesId: series.id,
              totalOwned: files.length,
              totalRead: 0,
              totalInProgress: 0,
            },
          });
        }
      } catch (error) {
        errors++;
        console.error(`Error creating series from folder "${folderName}":`, error);
      }
    }

    // Summary
    console.log('\n=== Migration Complete ===');
    console.log(`Series created: ${created}`);
    console.log(`Files linked: ${linked}`);
    console.log(`Errors: ${errors}`);

    // Final stats
    const finalSeriesCount = await prisma.series.count();
    const linkedFilesCount = await prisma.comicFile.count({
      where: { seriesId: { not: null } },
    });
    const unlinkedFilesCount = await prisma.comicFile.count({
      where: { seriesId: null },
    });

    console.log('\n=== Final Statistics ===');
    console.log(`Total series: ${finalSeriesCount}`);
    console.log(`Linked files: ${linkedFilesCount}`);
    console.log(`Unlinked files: ${unlinkedFilesCount}`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrate();
