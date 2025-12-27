-- Migration: Add COLLATE NOCASE to searchable text columns
-- This enables case-insensitive search at the database level
-- Performance improvement: avoids loading all records for JavaScript toLowerCase() filtering

-- =============================================================================
-- Series Table - Primary search target
-- =============================================================================

PRAGMA foreign_keys=OFF;

-- Create new Series table with COLLATE NOCASE
CREATE TABLE "Series_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL COLLATE NOCASE,
  "startYear" INTEGER,
  "publisher" TEXT COLLATE NOCASE,
  "summary" TEXT,
  "deck" TEXT,
  "endYear" INTEGER,
  "volume" INTEGER,
  "issueCount" INTEGER,
  "genres" TEXT,
  "tags" TEXT,
  "ageRating" TEXT,
  "type" TEXT NOT NULL DEFAULT 'western',
  "languageISO" TEXT,
  "characters" TEXT,
  "teams" TEXT,
  "locations" TEXT,
  "storyArcs" TEXT,
  "creators" TEXT,
  "writer" TEXT,
  "penciller" TEXT,
  "inker" TEXT,
  "colorist" TEXT,
  "letterer" TEXT,
  "coverArtist" TEXT,
  "editor" TEXT,
  "creatorsJson" TEXT,
  "creatorSource" TEXT NOT NULL DEFAULT 'api',
  "coverSource" TEXT NOT NULL DEFAULT 'auto',
  "coverUrl" TEXT,
  "coverHash" TEXT,
  "coverFileId" TEXT,
  "comicVineId" TEXT,
  "metronId" TEXT,
  "anilistId" TEXT,
  "malId" TEXT,
  "primaryFolder" TEXT,
  "userNotes" TEXT,
  "aliases" TEXT COLLATE NOCASE,
  "customReadingOrder" TEXT,
  "fieldSources" TEXT,
  "lockedFields" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "lastSyncedAt" DATETIME,
  "deletedAt" DATETIME,
  "isHidden" BOOLEAN NOT NULL DEFAULT false
);

-- Copy data
INSERT INTO "Series_new" SELECT * FROM "Series";

-- Drop old table
DROP TABLE "Series";

-- Rename new table
ALTER TABLE "Series_new" RENAME TO "Series";

-- Recreate indexes
CREATE UNIQUE INDEX "series_identity" ON "Series"("name", "publisher");
CREATE INDEX "Series_isHidden_idx" ON "Series"("isHidden");
CREATE INDEX "Series_name_idx" ON "Series"("name");
CREATE INDEX "Series_publisher_idx" ON "Series"("publisher");
CREATE INDEX "Series_startYear_idx" ON "Series"("startYear");
CREATE INDEX "Series_comicVineId_idx" ON "Series"("comicVineId");
CREATE INDEX "Series_metronId_idx" ON "Series"("metronId");
CREATE INDEX "Series_anilistId_idx" ON "Series"("anilistId");
CREATE INDEX "Series_malId_idx" ON "Series"("malId");

-- =============================================================================
-- Collection Table - Collection name search
-- =============================================================================

CREATE TABLE "Collection_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL COLLATE NOCASE,
  "description" TEXT COLLATE NOCASE,
  "deck" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "systemKey" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "lockName" BOOLEAN NOT NULL DEFAULT false,
  "lockDeck" BOOLEAN NOT NULL DEFAULT false,
  "lockDescription" BOOLEAN NOT NULL DEFAULT false,
  "lockPublisher" BOOLEAN NOT NULL DEFAULT false,
  "lockStartYear" BOOLEAN NOT NULL DEFAULT false,
  "lockEndYear" BOOLEAN NOT NULL DEFAULT false,
  "lockGenres" BOOLEAN NOT NULL DEFAULT false,
  "rating" INTEGER,
  "notes" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'private',
  "readingMode" TEXT,
  "tags" TEXT,
  "isPromoted" BOOLEAN NOT NULL DEFAULT false,
  "promotedOrder" INTEGER,
  "coverType" TEXT NOT NULL DEFAULT 'auto',
  "coverSeriesId" TEXT,
  "coverFileId" TEXT,
  "coverHash" TEXT,
  "derivedPublisher" TEXT,
  "derivedStartYear" INTEGER,
  "derivedEndYear" INTEGER,
  "derivedGenres" TEXT,
  "derivedTags" TEXT,
  "derivedIssueCount" INTEGER,
  "derivedReadCount" INTEGER,
  "overridePublisher" TEXT,
  "overrideStartYear" INTEGER,
  "overrideEndYear" INTEGER,
  "overrideGenres" TEXT,
  "metadataUpdatedAt" DATETIME,
  "contentUpdatedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "Collection_new" SELECT * FROM "Collection";
DROP TABLE "Collection";
ALTER TABLE "Collection_new" RENAME TO "Collection";

CREATE UNIQUE INDEX "Collection_userId_systemKey_key" ON "Collection"("userId", "systemKey");
CREATE INDEX "Collection_userId_idx" ON "Collection"("userId");
CREATE INDEX "Collection_isSystem_idx" ON "Collection"("isSystem");
CREATE INDEX "Collection_sortOrder_idx" ON "Collection"("sortOrder");
CREATE INDEX "Collection_isPromoted_idx" ON "Collection"("isPromoted");
CREATE INDEX "Collection_promotedOrder_idx" ON "Collection"("promotedOrder");
CREATE INDEX "Collection_userId_isPromoted_idx" ON "Collection"("userId", "isPromoted");

-- =============================================================================
-- User Table - Username search (login)
-- =============================================================================

CREATE TABLE "User_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL COLLATE NOCASE,
  "email" TEXT COLLATE NOCASE,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT,
  "avatarUrl" TEXT,
  "role" TEXT NOT NULL DEFAULT 'user',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "profilePrivate" BOOLEAN NOT NULL DEFAULT false,
  "hideReadingStats" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "lastLoginAt" DATETIME
);

INSERT INTO "User_new" SELECT * FROM "User";
DROP TABLE "User";
ALTER TABLE "User_new" RENAME TO "User";

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_username_idx" ON "User"("username");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_role_idx" ON "User"("role");

-- =============================================================================
-- FileMetadata Table - Series/title search within files
-- =============================================================================

CREATE TABLE "FileMetadata_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "comicId" TEXT NOT NULL,
  "series" TEXT COLLATE NOCASE,
  "number" TEXT,
  "title" TEXT COLLATE NOCASE,
  "volume" INTEGER,
  "publisher" TEXT COLLATE NOCASE,
  "imprint" TEXT,
  "year" INTEGER,
  "month" INTEGER,
  "day" INTEGER,
  "writer" TEXT,
  "penciller" TEXT,
  "inker" TEXT,
  "colorist" TEXT,
  "letterer" TEXT,
  "coverArtist" TEXT,
  "editor" TEXT,
  "creator" TEXT,
  "summary" TEXT,
  "genre" TEXT,
  "tags" TEXT,
  "characters" TEXT,
  "teams" TEXT,
  "locations" TEXT,
  "count" INTEGER,
  "storyArc" TEXT,
  "seriesGroup" TEXT,
  "pageCount" INTEGER,
  "languageISO" TEXT,
  "format" TEXT,
  "ageRating" TEXT,
  "comicVineId" TEXT,
  "metronId" TEXT,
  "contentType" TEXT,
  "parsedVolume" TEXT,
  "parsedChapter" TEXT,
  "seriesInherited" BOOLEAN NOT NULL DEFAULT false,
  "lastInheritedAt" DATETIME,
  "seriesSource" TEXT NOT NULL DEFAULT 'comicinfo',
  "fieldSourceOverrides" TEXT,
  "lastScanned" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "FileMetadata_comicId_fkey" FOREIGN KEY ("comicId") REFERENCES "ComicFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "FileMetadata_new" SELECT * FROM "FileMetadata";
DROP TABLE "FileMetadata";
ALTER TABLE "FileMetadata_new" RENAME TO "FileMetadata";

CREATE UNIQUE INDEX "FileMetadata_comicId_key" ON "FileMetadata"("comicId");
CREATE INDEX "FileMetadata_series_idx" ON "FileMetadata"("series");
CREATE INDEX "FileMetadata_writer_idx" ON "FileMetadata"("writer");
CREATE INDEX "FileMetadata_publisher_idx" ON "FileMetadata"("publisher");
CREATE INDEX "FileMetadata_year_idx" ON "FileMetadata"("year");

-- =============================================================================
-- Library Table - Library name search
-- =============================================================================

CREATE TABLE "Library_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL COLLATE NOCASE,
  "rootPath" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'western',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

INSERT INTO "Library_new" SELECT * FROM "Library";
DROP TABLE "Library";
ALTER TABLE "Library_new" RENAME TO "Library";

CREATE UNIQUE INDEX "Library_rootPath_key" ON "Library"("rootPath");
CREATE INDEX "Library_name_idx" ON "Library"("name");

-- =============================================================================
-- Re-enable foreign keys
-- =============================================================================

PRAGMA foreign_keys=ON;
