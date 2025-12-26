/**
 * Migration Script: User Data Isolation
 *
 * This script migrates existing data to support per-user data isolation:
 * - Migrates ReadingProgress data to UserReadingProgress
 * - Adds userId to SeriesProgress
 * - Adds userId to Collection
 *
 * Run with: npx tsx scripts/migrate-user-data-isolation.ts
 */

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';

const DB_PATH = join(homedir(), '.helixio', 'helixio.db');

async function migrate() {
  console.log('Starting user data isolation migration...');
  console.log(`Database: ${DB_PATH}`);

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = OFF');

  try {
    // Get the first admin user to assign existing data
    const adminUser = db.prepare(`
      SELECT id, username FROM User WHERE role = 'admin' LIMIT 1
    `).get() as { id: string; username: string } | undefined;

    if (!adminUser) {
      console.error('ERROR: No admin user found. Please create an admin account first.');
      process.exit(1);
    }

    console.log(`Found admin user: ${adminUser.username} (${adminUser.id})`);
    const adminId = adminUser.id;

    // Begin transaction
    db.exec('BEGIN TRANSACTION');

    // =========================================================================
    // 1. Migrate ReadingProgress to UserReadingProgress
    // =========================================================================
    console.log('\n1. Migrating ReadingProgress to UserReadingProgress...');

    // Check if ReadingProgress has data
    const progressCount = db.prepare(`SELECT COUNT(*) as count FROM ReadingProgress`).get() as { count: number };
    console.log(`   Found ${progressCount.count} reading progress records`);

    if (progressCount.count > 0) {
      // Insert ReadingProgress data into UserReadingProgress for the admin user
      // Skip duplicates (in case this migration was partially run before)
      const insertProgress = db.prepare(`
        INSERT OR IGNORE INTO UserReadingProgress (id, userId, fileId, currentPage, totalPages, completed, bookmarks, lastReadAt, createdAt)
        SELECT
          'urp_' || id,
          ?,
          fileId,
          currentPage,
          totalPages,
          completed,
          bookmarks,
          lastReadAt,
          createdAt
        FROM ReadingProgress
        WHERE NOT EXISTS (
          SELECT 1 FROM UserReadingProgress
          WHERE UserReadingProgress.userId = ? AND UserReadingProgress.fileId = ReadingProgress.fileId
        )
      `);

      const result = insertProgress.run(adminId, adminId);
      console.log(`   Migrated ${result.changes} records to UserReadingProgress`);
    }

    // =========================================================================
    // 2. Add userId to SeriesProgress
    // =========================================================================
    console.log('\n2. Migrating SeriesProgress with userId...');

    // Check current schema
    const seriesProgressInfo = db.prepare(`PRAGMA table_info(SeriesProgress)`).all();
    const hasSeriesUserId = seriesProgressInfo.some((col: any) => col.name === 'userId');

    if (!hasSeriesUserId) {
      console.log('   Adding userId column to SeriesProgress...');

      // SQLite doesn't allow adding NOT NULL column without default
      // So we need to recreate the table

      // Create new table with userId
      db.exec(`
        CREATE TABLE SeriesProgress_new (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          seriesId TEXT NOT NULL,
          totalOwned INTEGER NOT NULL DEFAULT 0,
          totalRead INTEGER NOT NULL DEFAULT 0,
          totalInProgress INTEGER NOT NULL DEFAULT 0,
          lastReadFileId TEXT,
          lastReadIssueNum REAL,
          lastReadAt DATETIME,
          nextUnreadFileId TEXT,
          FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
          FOREIGN KEY (seriesId) REFERENCES Series(id) ON DELETE CASCADE
        )
      `);

      // Copy data with admin userId
      db.exec(`
        INSERT INTO SeriesProgress_new (id, userId, seriesId, totalOwned, totalRead, totalInProgress, lastReadFileId, lastReadIssueNum, lastReadAt, nextUnreadFileId)
        SELECT id, '${adminId}', seriesId, totalOwned, totalRead, totalInProgress, lastReadFileId, lastReadIssueNum, lastReadAt, nextUnreadFileId
        FROM SeriesProgress
      `);

      // Drop old table and rename
      db.exec(`DROP TABLE SeriesProgress`);
      db.exec(`ALTER TABLE SeriesProgress_new RENAME TO SeriesProgress`);

      // Create indexes
      db.exec(`CREATE UNIQUE INDEX SeriesProgress_userId_seriesId_key ON SeriesProgress(userId, seriesId)`);
      db.exec(`CREATE INDEX SeriesProgress_userId_idx ON SeriesProgress(userId)`);
      db.exec(`CREATE INDEX SeriesProgress_seriesId_idx ON SeriesProgress(seriesId)`);
      db.exec(`CREATE INDEX SeriesProgress_lastReadAt_idx ON SeriesProgress(lastReadAt)`);

      console.log('   SeriesProgress migration complete');
    } else {
      console.log('   SeriesProgress already has userId column, skipping');
    }

    // =========================================================================
    // 3. Add userId to Collection
    // =========================================================================
    console.log('\n3. Migrating Collection with userId...');

    const collectionInfo = db.prepare(`PRAGMA table_info(Collection)`).all();
    const hasCollectionUserId = collectionInfo.some((col: any) => col.name === 'userId');

    if (!hasCollectionUserId) {
      console.log('   Adding userId column to Collection...');

      // Create new table with userId
      db.exec(`
        CREATE TABLE Collection_new (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          isSystem INTEGER NOT NULL DEFAULT 0,
          systemKey TEXT,
          iconName TEXT,
          color TEXT,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL,
          FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
        )
      `);

      // Copy data with admin userId
      db.exec(`
        INSERT INTO Collection_new (id, userId, name, description, isSystem, systemKey, iconName, color, sortOrder, createdAt, updatedAt)
        SELECT id, '${adminId}', name, description, isSystem, systemKey, iconName, color, sortOrder, createdAt, updatedAt
        FROM Collection
      `);

      // Drop old table and rename
      db.exec(`DROP TABLE Collection`);
      db.exec(`ALTER TABLE Collection_new RENAME TO Collection`);

      // Create indexes - note: unique constraint on userId+systemKey allows each user to have their own system collections
      db.exec(`CREATE UNIQUE INDEX Collection_userId_systemKey_key ON Collection(userId, systemKey)`);
      db.exec(`CREATE INDEX Collection_userId_idx ON Collection(userId)`);
      db.exec(`CREATE INDEX Collection_isSystem_idx ON Collection(isSystem)`);
      db.exec(`CREATE INDEX Collection_sortOrder_idx ON Collection(sortOrder)`);

      console.log('   Collection migration complete');
    } else {
      console.log('   Collection already has userId column, skipping');
    }

    // =========================================================================
    // 4. Update UserReadingProgress schema (add bookmarks, file relation)
    // =========================================================================
    console.log('\n4. Checking UserReadingProgress schema...');

    const userProgressInfo = db.prepare(`PRAGMA table_info(UserReadingProgress)`).all();
    const hasBookmarks = userProgressInfo.some((col: any) => col.name === 'bookmarks');

    if (!hasBookmarks) {
      console.log('   Adding bookmarks column to UserReadingProgress...');
      db.exec(`ALTER TABLE UserReadingProgress ADD COLUMN bookmarks TEXT NOT NULL DEFAULT '[]'`);
      console.log('   Added bookmarks column');
    } else {
      console.log('   UserReadingProgress already has bookmarks column');
    }

    // Add completed index if missing
    try {
      db.exec(`CREATE INDEX IF NOT EXISTS UserReadingProgress_completed_idx ON UserReadingProgress(completed)`);
    } catch {
      // Index may already exist
    }

    // Commit transaction
    db.exec('COMMIT');
    console.log('\n✅ Migration completed successfully!');

    // Show summary
    const newProgressCount = db.prepare(`SELECT COUNT(*) as count FROM UserReadingProgress WHERE userId = ?`).get(adminId) as { count: number };
    const newSeriesCount = db.prepare(`SELECT COUNT(*) as count FROM SeriesProgress WHERE userId = ?`).get(adminId) as { count: number };
    const newCollectionCount = db.prepare(`SELECT COUNT(*) as count FROM Collection WHERE userId = ?`).get(adminId) as { count: number };

    console.log('\nSummary:');
    console.log(`   UserReadingProgress records for admin: ${newProgressCount.count}`);
    console.log(`   SeriesProgress records for admin: ${newSeriesCount.count}`);
    console.log(`   Collection records for admin: ${newCollectionCount.count}`);

  } catch (error) {
    console.error('Migration failed:', error);
    db.exec('ROLLBACK');
    process.exit(1);
  } finally {
    db.pragma('foreign_keys = ON');
    db.close();
  }
}

migrate();
