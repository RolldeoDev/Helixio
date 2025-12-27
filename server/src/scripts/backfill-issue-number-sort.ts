/**
 * Backfill Script: Issue Number Sort
 *
 * One-time script to populate issueNumberSort for existing FileMetadata records.
 * This enables proper numeric sorting of issues in the database.
 *
 * Usage: npx tsx src/scripts/backfill-issue-number-sort.ts
 */

import { PrismaClient } from '@prisma/client';
import { getDatabaseUrl, ensureAppDirectories } from '../services/app-paths.service.js';
import { computeIssueNumberSort } from '../services/issue-number-utils.js';

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

async function backfill(): Promise<void> {
  const batchSize = 1000;
  let processed = 0;
  let updated = 0;
  let skipped = 0;

  console.log('Starting issueNumberSort backfill...');
  console.log(`Database: ${databaseUrl}`);

  // Get total count of records that need processing
  const total = await prisma.fileMetadata.count({
    where: {
      number: { not: null },
      issueNumberSort: null,
    },
  });

  console.log(`Found ${total} records with number but no issueNumberSort`);

  if (total === 0) {
    console.log('Nothing to process. All records are up to date.');
    return;
  }

  while (true) {
    // Fetch a batch of records that need processing
    const batch = await prisma.fileMetadata.findMany({
      where: {
        number: { not: null },
        issueNumberSort: null,
      },
      take: batchSize,
      select: {
        id: true,
        number: true,
      },
    });

    if (batch.length === 0) {
      break;
    }

    // Process each record
    for (const record of batch) {
      const sortKey = computeIssueNumberSort(record.number);

      if (sortKey !== null) {
        await prisma.fileMetadata.update({
          where: { id: record.id },
          data: { issueNumberSort: sortKey },
        });
        updated++;
      } else {
        // Non-numeric issue number (e.g., "Annual", "Special")
        // Leave issueNumberSort as null - they'll sort to the end
        skipped++;
      }

      processed++;
    }

    const percent = Math.round((processed / total) * 100);
    console.log(`Progress: ${processed}/${total} (${percent}%) - Updated: ${updated}, Skipped: ${skipped}`);
  }

  console.log('\nBackfill complete!');
  console.log(`  Total processed: ${processed}`);
  console.log(`  Updated with sort key: ${updated}`);
  console.log(`  Skipped (non-numeric): ${skipped}`);
}

// Run the backfill
backfill()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
