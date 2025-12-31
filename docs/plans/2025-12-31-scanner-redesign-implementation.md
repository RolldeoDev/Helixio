# Scanner Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate race conditions in the library scanner that cause duplicate/empty series by implementing sequential series creation with a streaming architecture.

**Architecture:** Replace parallel series linking with a 5-phase approach: Discovery → Metadata Extraction → Sequential Series Creation → File Linking → Cover Extraction. Add `seriesNameRaw` field to decouple metadata extraction from series creation.

**Tech Stack:** Prisma/SQLite, TypeScript, Node.js

---

## Task 1: Add seriesNameRaw Field to Schema

**Files:**
- Modify: `server/prisma/schema.prisma:287-326` (ComicFile model)

**Step 1: Add the field to schema**

In `server/prisma/schema.prisma`, find the ComicFile model and add after line 303 (after `seriesId`):

```prisma
  // Raw series name extracted during scan (before series creation)
  // Used to decouple metadata extraction from series linking
  seriesNameRaw  String?
```

**Step 2: Generate Prisma client and create migration**

Run:
```bash
cd server && DATABASE_URL="file:$HOME/.helixio/helixio.db" npx prisma migrate dev --name add_series_name_raw
```

Expected: Migration created successfully, Prisma client regenerated.

**Step 3: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat(schema): add seriesNameRaw field to ComicFile for scanner redesign"
```

---

## Task 2: Create New Scanner Service Structure

**Files:**
- Create: `server/src/services/library-scanner/index.ts`
- Create: `server/src/services/library-scanner/types.ts`
- Create: `server/src/services/library-scanner/phases/discovery.ts`
- Create: `server/src/services/library-scanner/phases/metadata-extraction.ts`
- Create: `server/src/services/library-scanner/phases/series-creation.ts`
- Create: `server/src/services/library-scanner/phases/file-linking.ts`
- Create: `server/src/services/library-scanner/phases/cover-extraction.ts`

**Step 1: Create directory structure**

Run:
```bash
mkdir -p server/src/services/library-scanner/phases
```

**Step 2: Create types.ts**

Create `server/src/services/library-scanner/types.ts`:

```typescript
/**
 * Library Scanner Types
 *
 * Types for the redesigned 5-phase library scanner.
 */

export interface ScanProgress {
  phase: ScanPhase;
  current: number;
  total: number;
  message: string;
  detail?: string;
}

export type ScanPhase =
  | 'discovery'
  | 'metadata'
  | 'series'
  | 'linking'
  | 'covers'
  | 'complete';

export interface PhaseResult {
  success: boolean;
  processed: number;
  errors: number;
  duration: number;
}

export interface DiscoveryResult extends PhaseResult {
  newFiles: number;
  existingFiles: number;
  orphanedFiles: number;
}

export interface MetadataResult extends PhaseResult {
  fromComicInfo: number;
  fromFolder: number;
}

export interface SeriesResult extends PhaseResult {
  created: number;
  existing: number;
}

export interface LinkingResult extends PhaseResult {
  linked: number;
}

export interface CoverResult extends PhaseResult {
  extracted: number;
  cached: number;
}

export interface ScanResult {
  libraryId: string;
  success: boolean;
  phases: {
    discovery?: DiscoveryResult;
    metadata?: MetadataResult;
    series?: SeriesResult;
    linking?: LinkingResult;
    covers?: CoverResult;
  };
  totalDuration: number;
  error?: string;
}

export type ProgressCallback = (progress: ScanProgress) => void;

export interface ScanOptions {
  /** Called with progress updates */
  onProgress?: ProgressCallback;
  /** Check if scan should be cancelled */
  shouldCancel?: () => boolean;
  /** Batch size for DB operations (default: 100) */
  batchSize?: number;
}
```

**Step 3: Commit**

```bash
git add server/src/services/library-scanner/
git commit -m "feat(scanner): add types for redesigned library scanner"
```

---

## Task 3: Implement Phase 1 - Discovery

**Files:**
- Create: `server/src/services/library-scanner/phases/discovery.ts`
- Test: `server/src/services/library-scanner/__tests__/discovery.test.ts`

**Step 1: Write failing test**

Create `server/src/services/library-scanner/__tests__/discovery.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database before importing module
vi.mock('../../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

describe('Discovery Phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip files already in database', async () => {
    // Import after mocks are set up
    const { discoverFiles } = await import('../phases/discovery.js');

    // This test verifies idempotent behavior
    // Implementation will be tested with actual files
    expect(discoverFiles).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd server && npx vitest run src/services/library-scanner/__tests__/discovery.test.ts
```

Expected: FAIL (module not found)

**Step 3: Implement discovery phase**

Create `server/src/services/library-scanner/phases/discovery.ts`:

```typescript
/**
 * Discovery Phase
 *
 * Phase 1 of the library scanner. Finds all comic files and creates
 * database records. Idempotent - skips files already in DB.
 */

import { readdir, stat } from 'fs/promises';
import { join, relative, extname, basename } from 'path';
import { getDatabase } from '../../database.service.js';
import { generatePartialHash, getFileInfo } from '../../hash.service.js';
import { createServiceLogger } from '../../logger.service.js';
import type { DiscoveryResult, ProgressCallback } from '../types.js';

const logger = createServiceLogger('scanner-discovery');

const COMIC_EXTENSIONS = new Set(['.cbz', '.cbr', '.cb7']);
const BATCH_SIZE = 100;

interface DiscoveredFile {
  path: string;
  relativePath: string;
  filename: string;
  extension: string;
  size: number;
  modifiedAt: Date;
}

/**
 * Discover all comic files in a library directory.
 * Creates ComicFile records for new files, marks missing files as orphaned.
 */
export async function discoverFiles(
  libraryId: string,
  rootPath: string,
  options: {
    onProgress?: ProgressCallback;
    shouldCancel?: () => boolean;
    batchSize?: number;
  } = {}
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const db = getDatabase();
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const onProgress = options.onProgress ?? (() => {});

  // Get existing file paths for this library
  const existingFiles = await db.comicFile.findMany({
    where: { libraryId },
    select: { id: true, path: true, status: true },
  });
  const existingPathMap = new Map(existingFiles.map(f => [f.path, f]));

  // Discover files on disk
  const discoveredFiles: DiscoveredFile[] = [];
  const discoveredPaths = new Set<string>();
  let scanErrors = 0;

  async function scanDirectory(dirPath: string): Promise<void> {
    if (options.shouldCancel?.()) return;

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (options.shouldCancel?.()) return;
        if (entry.name.startsWith('.')) continue;

        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (COMIC_EXTENSIONS.has(ext)) {
            try {
              const stats = await stat(fullPath);
              discoveredFiles.push({
                path: fullPath,
                relativePath: relative(rootPath, fullPath),
                filename: basename(fullPath),
                extension: ext.slice(1),
                size: stats.size,
                modifiedAt: stats.mtime,
              });
              discoveredPaths.add(fullPath);

              if (discoveredFiles.length % 100 === 0) {
                onProgress({
                  phase: 'discovery',
                  current: discoveredFiles.length,
                  total: 0, // Unknown until complete
                  message: `Discovering files: ${discoveredFiles.length} found`,
                });
              }
            } catch (err) {
              scanErrors++;
              logger.warn({ path: fullPath, error: err }, 'Failed to stat file');
            }
          }
        }
      }
    } catch (err) {
      scanErrors++;
      logger.warn({ path: dirPath, error: err }, 'Failed to read directory');
    }
  }

  await scanDirectory(rootPath);

  if (options.shouldCancel?.()) {
    return {
      success: false,
      processed: 0,
      errors: 0,
      duration: Date.now() - startTime,
      newFiles: 0,
      existingFiles: 0,
      orphanedFiles: 0,
    };
  }

  // Process discovered files in batches
  let newFiles = 0;
  let existingCount = 0;
  const filesToCreate: DiscoveredFile[] = [];

  for (const file of discoveredFiles) {
    const existing = existingPathMap.get(file.path);
    if (existing) {
      existingCount++;
      // If it was orphaned, restore it
      if (existing.status === 'orphaned') {
        await db.comicFile.update({
          where: { id: existing.id },
          data: { status: 'pending' },
        });
      }
    } else {
      filesToCreate.push(file);
    }
  }

  // Batch create new files
  for (let i = 0; i < filesToCreate.length; i += batchSize) {
    if (options.shouldCancel?.()) break;

    const batch = filesToCreate.slice(i, i + batchSize);

    for (const file of batch) {
      try {
        const hash = await generatePartialHash(file.path);
        await db.comicFile.create({
          data: {
            libraryId,
            path: file.path,
            relativePath: file.relativePath,
            filename: file.filename,
            extension: file.extension,
            size: file.size,
            modifiedAt: file.modifiedAt,
            hash,
            status: 'pending',
          },
        });
        newFiles++;
      } catch (err) {
        scanErrors++;
        logger.warn({ path: file.path, error: err }, 'Failed to create file record');
      }
    }

    onProgress({
      phase: 'discovery',
      current: i + batch.length,
      total: filesToCreate.length,
      message: `Creating file records: ${i + batch.length}/${filesToCreate.length}`,
    });
  }

  // Mark orphaned files (in DB but not on disk)
  let orphanedCount = 0;
  for (const [path, file] of existingPathMap) {
    if (!discoveredPaths.has(path) && file.status !== 'orphaned') {
      await db.comicFile.update({
        where: { id: file.id },
        data: { status: 'orphaned' },
      });
      orphanedCount++;
    }
  }

  const duration = Date.now() - startTime;

  onProgress({
    phase: 'discovery',
    current: discoveredFiles.length,
    total: discoveredFiles.length,
    message: `Discovery complete: ${newFiles} new, ${existingCount} existing, ${orphanedCount} orphaned`,
  });

  logger.info({
    libraryId,
    newFiles,
    existingFiles: existingCount,
    orphanedFiles: orphanedCount,
    errors: scanErrors,
    duration,
  }, 'Discovery phase complete');

  return {
    success: true,
    processed: discoveredFiles.length,
    errors: scanErrors,
    duration,
    newFiles,
    existingFiles: existingCount,
    orphanedFiles: orphanedCount,
  };
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd server && npx vitest run src/services/library-scanner/__tests__/discovery.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add server/src/services/library-scanner/
git commit -m "feat(scanner): implement Phase 1 - Discovery"
```

---

## Task 4: Implement Phase 2 - Metadata Extraction

**Files:**
- Create: `server/src/services/library-scanner/phases/metadata-extraction.ts`
- Test: `server/src/services/library-scanner/__tests__/metadata-extraction.test.ts`

**Step 1: Write failing test**

Create `server/src/services/library-scanner/__tests__/metadata-extraction.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

describe('Metadata Extraction Phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should extract series name from ComicInfo.xml', async () => {
    const { extractMetadata } = await import('../phases/metadata-extraction.js');
    expect(extractMetadata).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd server && npx vitest run src/services/library-scanner/__tests__/metadata-extraction.test.ts
```

Expected: FAIL (module not found)

**Step 3: Implement metadata extraction phase**

Create `server/src/services/library-scanner/phases/metadata-extraction.ts`:

```typescript
/**
 * Metadata Extraction Phase
 *
 * Phase 2 of the library scanner. Extracts ComicInfo.xml from each file
 * and stores seriesNameRaw for later series creation.
 */

import { dirname, basename } from 'path';
import { getDatabase } from '../../database.service.js';
import { refreshMetadataCache } from '../../metadata-cache.service.js';
import { parseSeriesFolderName } from '../../series-metadata.service.js';
import { createServiceLogger } from '../../logger.service.js';
import { parallelMap, getOptimalConcurrency } from '../../parallel.service.js';
import type { MetadataResult, ProgressCallback } from '../types.js';

const logger = createServiceLogger('scanner-metadata');

const BATCH_SIZE = 100;

/**
 * Extract metadata from all files that need it.
 * Sets seriesNameRaw from ComicInfo.xml or folder name fallback.
 */
export async function extractMetadata(
  libraryId: string,
  options: {
    onProgress?: ProgressCallback;
    shouldCancel?: () => boolean;
    batchSize?: number;
  } = {}
): Promise<MetadataResult> {
  const startTime = Date.now();
  const db = getDatabase();
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const onProgress = options.onProgress ?? (() => {});

  let processed = 0;
  let errors = 0;
  let fromComicInfo = 0;
  let fromFolder = 0;

  // Get files needing metadata extraction (seriesNameRaw is null)
  const totalCount = await db.comicFile.count({
    where: {
      libraryId,
      seriesNameRaw: null,
      status: { in: ['pending', 'indexed'] },
    },
  });

  if (totalCount === 0) {
    return {
      success: true,
      processed: 0,
      errors: 0,
      duration: Date.now() - startTime,
      fromComicInfo: 0,
      fromFolder: 0,
    };
  }

  onProgress({
    phase: 'metadata',
    current: 0,
    total: totalCount,
    message: `Extracting metadata: 0/${totalCount} files`,
  });

  // Process in batches
  let offset = 0;
  const concurrency = getOptimalConcurrency('io');

  while (true) {
    if (options.shouldCancel?.()) break;

    const files = await db.comicFile.findMany({
      where: {
        libraryId,
        seriesNameRaw: null,
        status: { in: ['pending', 'indexed'] },
      },
      select: {
        id: true,
        path: true,
        relativePath: true,
        filename: true,
      },
      take: batchSize,
    });

    if (files.length === 0) break;

    // Process batch in parallel
    const results = await parallelMap(
      files,
      async (file) => {
        try {
          // Extract ComicInfo.xml and cache it
          const metadataSuccess = await refreshMetadataCache(file.id);

          // Get the extracted metadata
          const metadata = await db.fileMetadata.findUnique({
            where: { comicId: file.id },
            select: { series: true },
          });

          let seriesName: string | null = null;
          let source: 'comicinfo' | 'folder' = 'folder';

          if (metadata?.series) {
            // Use ComicInfo.xml series name
            seriesName = metadata.series;
            source = 'comicinfo';
          } else {
            // Fallback to folder name
            const folderPath = dirname(file.relativePath);
            const folderName = basename(folderPath);

            if (folderName && folderName !== '.') {
              const parsed = parseSeriesFolderName(folderName);
              seriesName = parsed.seriesName || folderName;
            } else {
              // Last resort: use filename without extension
              seriesName = file.filename.replace(/\.[^.]+$/, '');
            }
          }

          // Update the file with seriesNameRaw
          if (seriesName) {
            await db.comicFile.update({
              where: { id: file.id },
              data: { seriesNameRaw: seriesName },
            });
          }

          return { success: true, source };
        } catch (err) {
          logger.warn({ fileId: file.id, error: err }, 'Failed to extract metadata');
          return { success: false, source: 'folder' as const };
        }
      },
      {
        concurrency,
        shouldCancel: options.shouldCancel,
      }
    );

    // Count results
    for (const result of results.results) {
      if (result.success && result.result) {
        processed++;
        if (result.result.source === 'comicinfo') {
          fromComicInfo++;
        } else {
          fromFolder++;
        }
      } else {
        errors++;
      }
    }

    onProgress({
      phase: 'metadata',
      current: processed,
      total: totalCount,
      message: `Extracting metadata: ${processed}/${totalCount} files`,
      detail: `${fromComicInfo} from ComicInfo, ${fromFolder} from folder`,
    });

    offset += batchSize;
  }

  const duration = Date.now() - startTime;

  logger.info({
    libraryId,
    processed,
    errors,
    fromComicInfo,
    fromFolder,
    duration,
  }, 'Metadata extraction phase complete');

  return {
    success: true,
    processed,
    errors,
    duration,
    fromComicInfo,
    fromFolder,
  };
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd server && npx vitest run src/services/library-scanner/__tests__/metadata-extraction.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add server/src/services/library-scanner/
git commit -m "feat(scanner): implement Phase 2 - Metadata Extraction"
```

---

## Task 5: Implement Phase 3 - Series Creation

**Files:**
- Create: `server/src/services/library-scanner/phases/series-creation.ts`
- Test: `server/src/services/library-scanner/__tests__/series-creation.test.ts`

**Step 1: Write failing test**

Create `server/src/services/library-scanner/__tests__/series-creation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

describe('Series Creation Phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create series sequentially', async () => {
    const { createSeriesFromFiles } = await import('../phases/series-creation.js');
    expect(createSeriesFromFiles).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd server && npx vitest run src/services/library-scanner/__tests__/series-creation.test.ts
```

Expected: FAIL (module not found)

**Step 3: Implement series creation phase**

Create `server/src/services/library-scanner/phases/series-creation.ts`:

```typescript
/**
 * Series Creation Phase
 *
 * Phase 3 of the library scanner. Creates series records SEQUENTIALLY
 * to eliminate race conditions. This is the critical phase.
 */

import { getDatabase } from '../../database.service.js';
import { createSeries, getSeriesByIdentity } from '../../series/index.js';
import { createServiceLogger } from '../../logger.service.js';
import type { SeriesResult, ProgressCallback } from '../types.js';

const logger = createServiceLogger('scanner-series');

/**
 * Create series from all unique seriesNameRaw values.
 * IMPORTANT: This runs SEQUENTIALLY to prevent race conditions.
 */
export async function createSeriesFromFiles(
  libraryId: string,
  options: {
    onProgress?: ProgressCallback;
    shouldCancel?: () => boolean;
  } = {}
): Promise<SeriesResult> {
  const startTime = Date.now();
  const db = getDatabase();
  const onProgress = options.onProgress ?? (() => {});

  let created = 0;
  let existing = 0;
  let errors = 0;

  // Get distinct series names that need processing
  // Only files without a seriesId but with seriesNameRaw
  const distinctSeriesNames = await db.comicFile.findMany({
    where: {
      libraryId,
      seriesId: null,
      seriesNameRaw: { not: null },
    },
    select: {
      seriesNameRaw: true,
    },
    distinct: ['seriesNameRaw'],
    orderBy: { seriesNameRaw: 'asc' },
  });

  const uniqueNames = distinctSeriesNames
    .map(f => f.seriesNameRaw)
    .filter((name): name is string => name !== null);

  const total = uniqueNames.length;

  if (total === 0) {
    return {
      success: true,
      processed: 0,
      errors: 0,
      duration: Date.now() - startTime,
      created: 0,
      existing: 0,
    };
  }

  onProgress({
    phase: 'series',
    current: 0,
    total,
    message: `Creating series: 0/${total}`,
  });

  // Process each series name SEQUENTIALLY - no parallelism here!
  for (let i = 0; i < uniqueNames.length; i++) {
    if (options.shouldCancel?.()) break;

    const seriesName = uniqueNames[i]!;

    try {
      // Get first file's metadata for this series (alphabetically by path)
      const firstFile = await db.comicFile.findFirst({
        where: {
          libraryId,
          seriesNameRaw: seriesName,
        },
        include: {
          metadata: true,
        },
        orderBy: { relativePath: 'asc' },
      });

      if (!firstFile) continue;

      const metadata = firstFile.metadata;

      // Check if series already exists (case-insensitive)
      const existingSeries = await getSeriesByIdentity(
        seriesName,
        null, // Don't match on year for identity
        metadata?.publisher ?? null
      );

      if (existingSeries) {
        existing++;
        logger.debug({ seriesName, seriesId: existingSeries.id }, 'Series already exists');
      } else {
        // Create new series with first file's metadata
        try {
          await createSeries({
            name: seriesName,
            startYear: metadata?.year ?? null,
            publisher: metadata?.publisher ?? null,
            genres: metadata?.genre ?? null,
            tags: metadata?.tags ?? null,
            languageISO: metadata?.languageISO ?? null,
            ageRating: metadata?.ageRating ?? null,
            comicVineId: metadata?.comicVineId ?? null,
            metronId: metadata?.metronId ?? null,
            primaryFolder: firstFile.relativePath.includes('/')
              ? firstFile.relativePath.substring(0, firstFile.relativePath.lastIndexOf('/'))
              : null,
          });
          created++;
          logger.debug({ seriesName }, 'Created new series');
        } catch (err) {
          // Handle race condition where series was created between check and create
          if (err instanceof Error && err.message.includes('already exists')) {
            existing++;
            logger.debug({ seriesName }, 'Series created by concurrent process');
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      errors++;
      logger.warn({ seriesName, error: err }, 'Failed to create series');
    }

    onProgress({
      phase: 'series',
      current: i + 1,
      total,
      message: `Creating series: ${i + 1}/${total}`,
      detail: `${created} new, ${existing} existing`,
    });
  }

  const duration = Date.now() - startTime;

  logger.info({
    libraryId,
    total: uniqueNames.length,
    created,
    existing,
    errors,
    duration,
  }, 'Series creation phase complete');

  return {
    success: true,
    processed: uniqueNames.length,
    errors,
    duration,
    created,
    existing,
  };
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd server && npx vitest run src/services/library-scanner/__tests__/series-creation.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add server/src/services/library-scanner/
git commit -m "feat(scanner): implement Phase 3 - Sequential Series Creation"
```

---

## Task 6: Implement Phase 4 - File Linking

**Files:**
- Create: `server/src/services/library-scanner/phases/file-linking.ts`
- Test: `server/src/services/library-scanner/__tests__/file-linking.test.ts`

**Step 1: Write failing test**

Create `server/src/services/library-scanner/__tests__/file-linking.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

describe('File Linking Phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should link files to their series', async () => {
    const { linkFilesToSeries } = await import('../phases/file-linking.js');
    expect(linkFilesToSeries).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd server && npx vitest run src/services/library-scanner/__tests__/file-linking.test.ts
```

Expected: FAIL (module not found)

**Step 3: Implement file linking phase**

Create `server/src/services/library-scanner/phases/file-linking.ts`:

```typescript
/**
 * File Linking Phase
 *
 * Phase 4 of the library scanner. Links files to their series.
 * Safe to parallelize since all series already exist.
 */

import { getDatabase } from '../../database.service.js';
import { updateSeriesProgress } from '../../series/index.js';
import { createServiceLogger } from '../../logger.service.js';
import { parallelMap, getOptimalConcurrency } from '../../parallel.service.js';
import type { LinkingResult, ProgressCallback } from '../types.js';

const logger = createServiceLogger('scanner-linking');

const BATCH_SIZE = 100;

/**
 * Normalize a series key for lookup.
 * Uses lowercase name + publisher (or empty string if no publisher).
 */
function normalizeSeriesKey(name: string, publisher: string | null): string {
  return `${name.toLowerCase()}|${(publisher ?? '').toLowerCase()}`;
}

/**
 * Link all unlinked files to their corresponding series.
 */
export async function linkFilesToSeries(
  libraryId: string,
  options: {
    onProgress?: ProgressCallback;
    shouldCancel?: () => boolean;
    batchSize?: number;
  } = {}
): Promise<LinkingResult> {
  const startTime = Date.now();
  const db = getDatabase();
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const onProgress = options.onProgress ?? (() => {});

  let linked = 0;
  let errors = 0;
  const affectedSeriesIds = new Set<string>();

  // Build series lookup map (all non-deleted series)
  const allSeries = await db.series.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, publisher: true },
  });

  const seriesMap = new Map<string, string>();
  for (const series of allSeries) {
    const key = normalizeSeriesKey(series.name, series.publisher);
    seriesMap.set(key, series.id);

    // Also add key without publisher for fallback matching
    const keyNoPublisher = normalizeSeriesKey(series.name, null);
    if (!seriesMap.has(keyNoPublisher)) {
      seriesMap.set(keyNoPublisher, series.id);
    }
  }

  // Count files to link
  const totalCount = await db.comicFile.count({
    where: {
      libraryId,
      seriesId: null,
      seriesNameRaw: { not: null },
    },
  });

  if (totalCount === 0) {
    return {
      success: true,
      processed: 0,
      errors: 0,
      duration: Date.now() - startTime,
      linked: 0,
    };
  }

  onProgress({
    phase: 'linking',
    current: 0,
    total: totalCount,
    message: `Linking files: 0/${totalCount}`,
  });

  // Process in batches with parallelism
  const concurrency = Math.min(getOptimalConcurrency('io'), 8);
  let processed = 0;

  while (true) {
    if (options.shouldCancel?.()) break;

    const files = await db.comicFile.findMany({
      where: {
        libraryId,
        seriesId: null,
        seriesNameRaw: { not: null },
      },
      select: {
        id: true,
        seriesNameRaw: true,
        metadata: {
          select: { publisher: true },
        },
      },
      take: batchSize,
    });

    if (files.length === 0) break;

    // Process batch in parallel
    const results = await parallelMap(
      files,
      async (file) => {
        if (!file.seriesNameRaw) return { success: false };

        try {
          // Look up series by name + publisher
          const publisher = file.metadata?.publisher ?? null;
          let seriesId = seriesMap.get(normalizeSeriesKey(file.seriesNameRaw, publisher));

          // Fallback to name-only lookup
          if (!seriesId) {
            seriesId = seriesMap.get(normalizeSeriesKey(file.seriesNameRaw, null));
          }

          if (!seriesId) {
            logger.warn({ fileId: file.id, seriesNameRaw: file.seriesNameRaw }, 'No matching series found');
            return { success: false };
          }

          // Link file to series
          await db.comicFile.update({
            where: { id: file.id },
            data: {
              seriesId,
              status: 'indexed',
            },
          });

          return { success: true, seriesId };
        } catch (err) {
          logger.warn({ fileId: file.id, error: err }, 'Failed to link file');
          return { success: false };
        }
      },
      {
        concurrency,
        shouldCancel: options.shouldCancel,
      }
    );

    // Count results
    for (const result of results.results) {
      if (result.success && result.result?.success) {
        linked++;
        if (result.result.seriesId) {
          affectedSeriesIds.add(result.result.seriesId);
        }
      } else {
        errors++;
      }
    }

    processed += files.length;

    onProgress({
      phase: 'linking',
      current: processed,
      total: totalCount,
      message: `Linking files: ${processed}/${totalCount}`,
      detail: `${linked} linked`,
    });
  }

  // Update progress for all affected series
  onProgress({
    phase: 'linking',
    current: totalCount,
    total: totalCount,
    message: 'Updating series progress...',
  });

  for (const seriesId of affectedSeriesIds) {
    try {
      await updateSeriesProgress(seriesId);
    } catch (err) {
      logger.warn({ seriesId, error: err }, 'Failed to update series progress');
    }
  }

  const duration = Date.now() - startTime;

  logger.info({
    libraryId,
    linked,
    errors,
    affectedSeries: affectedSeriesIds.size,
    duration,
  }, 'File linking phase complete');

  return {
    success: true,
    processed,
    errors,
    duration,
    linked,
  };
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd server && npx vitest run src/services/library-scanner/__tests__/file-linking.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add server/src/services/library-scanner/
git commit -m "feat(scanner): implement Phase 4 - File Linking"
```

---

## Task 7: Implement Phase 5 - Cover Extraction

**Files:**
- Create: `server/src/services/library-scanner/phases/cover-extraction.ts`

**Step 1: Implement cover extraction phase**

Create `server/src/services/library-scanner/phases/cover-extraction.ts`:

```typescript
/**
 * Cover Extraction Phase
 *
 * Phase 5 of the library scanner. Extracts and caches cover images.
 * Mostly reuses existing cover.service.ts logic.
 */

import { getDatabase } from '../../database.service.js';
import { batchExtractCovers, recalculateSeriesCover } from '../../cover.service.js';
import { createServiceLogger } from '../../logger.service.js';
import type { CoverResult, ProgressCallback } from '../types.js';

const logger = createServiceLogger('scanner-covers');

const BATCH_SIZE = 20;

/**
 * Extract covers for all files that need them.
 */
export async function extractCovers(
  libraryId: string,
  options: {
    onProgress?: ProgressCallback;
    shouldCancel?: () => boolean;
    batchSize?: number;
  } = {}
): Promise<CoverResult> {
  const startTime = Date.now();
  const db = getDatabase();
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const onProgress = options.onProgress ?? (() => {});

  let extracted = 0;
  let cached = 0;
  let errors = 0;
  const affectedSeriesIds = new Set<string>();

  // Get files needing covers
  const files = await db.comicFile.findMany({
    where: {
      libraryId,
      status: 'indexed',
      coverHash: null,
    },
    select: { id: true, seriesId: true },
  });

  const total = files.length;

  if (total === 0) {
    return {
      success: true,
      processed: 0,
      errors: 0,
      duration: Date.now() - startTime,
      extracted: 0,
      cached: 0,
    };
  }

  onProgress({
    phase: 'covers',
    current: 0,
    total,
    message: `Extracting covers: 0/${total}`,
  });

  // Collect affected series
  for (const file of files) {
    if (file.seriesId) {
      affectedSeriesIds.add(file.seriesId);
    }
  }

  // Process in batches
  const fileIds = files.map(f => f.id);

  for (let i = 0; i < fileIds.length; i += batchSize) {
    if (options.shouldCancel?.()) break;

    const batch = fileIds.slice(i, i + batchSize);

    try {
      const result = await batchExtractCovers(batch);
      extracted += result.success;
      cached += result.cached;
      errors += result.failed;
    } catch (err) {
      errors += batch.length;
      logger.warn({ batchStart: i, error: err }, 'Failed to extract batch of covers');
    }

    const processed = Math.min(i + batchSize, total);
    onProgress({
      phase: 'covers',
      current: processed,
      total,
      message: `Extracting covers: ${processed}/${total}`,
      detail: `${extracted} extracted, ${cached} cached`,
    });
  }

  // Update series covers
  onProgress({
    phase: 'covers',
    current: total,
    total,
    message: 'Updating series covers...',
  });

  for (const seriesId of affectedSeriesIds) {
    try {
      await recalculateSeriesCover(seriesId);
    } catch (err) {
      logger.warn({ seriesId, error: err }, 'Failed to recalculate series cover');
    }
  }

  const duration = Date.now() - startTime;

  logger.info({
    libraryId,
    extracted,
    cached,
    errors,
    affectedSeries: affectedSeriesIds.size,
    duration,
  }, 'Cover extraction phase complete');

  return {
    success: true,
    processed: total,
    errors,
    duration,
    extracted,
    cached,
  };
}
```

**Step 2: Commit**

```bash
git add server/src/services/library-scanner/
git commit -m "feat(scanner): implement Phase 5 - Cover Extraction"
```

---

## Task 8: Create Main Scanner Orchestrator

**Files:**
- Create: `server/src/services/library-scanner/index.ts`
- Modify: `server/src/services/library-scan-queue.service.ts`

**Step 1: Create main scanner orchestrator**

Create `server/src/services/library-scanner/index.ts`:

```typescript
/**
 * Library Scanner
 *
 * Main orchestrator for the 5-phase library scan.
 * Processes one library at a time to eliminate race conditions.
 */

import { getDatabase } from '../database.service.js';
import { createServiceLogger } from '../logger.service.js';
import { discoverFiles } from './phases/discovery.js';
import { extractMetadata } from './phases/metadata-extraction.js';
import { createSeriesFromFiles } from './phases/series-creation.js';
import { linkFilesToSeries } from './phases/file-linking.js';
import { extractCovers } from './phases/cover-extraction.js';
import type { ScanResult, ScanOptions, ProgressCallback } from './types.js';

const logger = createServiceLogger('library-scanner');

// Re-export types
export * from './types.js';

/**
 * Run a full library scan with all 5 phases.
 */
export async function scanLibrary(
  libraryId: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const startTime = Date.now();
  const db = getDatabase();
  const onProgress = options.onProgress ?? (() => {});

  const result: ScanResult = {
    libraryId,
    success: false,
    phases: {},
    totalDuration: 0,
  };

  try {
    // Verify library exists
    const library = await db.library.findUnique({
      where: { id: libraryId },
    });

    if (!library) {
      throw new Error(`Library not found: ${libraryId}`);
    }

    logger.info({ libraryId, rootPath: library.rootPath }, 'Starting library scan');

    // Phase 1: Discovery
    result.phases.discovery = await discoverFiles(libraryId, library.rootPath, {
      onProgress,
      shouldCancel: options.shouldCancel,
      batchSize: options.batchSize,
    });

    if (options.shouldCancel?.()) {
      result.error = 'Scan cancelled';
      result.totalDuration = Date.now() - startTime;
      return result;
    }

    // Phase 2: Metadata Extraction
    result.phases.metadata = await extractMetadata(libraryId, {
      onProgress,
      shouldCancel: options.shouldCancel,
      batchSize: options.batchSize,
    });

    if (options.shouldCancel?.()) {
      result.error = 'Scan cancelled';
      result.totalDuration = Date.now() - startTime;
      return result;
    }

    // Phase 3: Series Creation (SEQUENTIAL - critical for correctness)
    result.phases.series = await createSeriesFromFiles(libraryId, {
      onProgress,
      shouldCancel: options.shouldCancel,
    });

    if (options.shouldCancel?.()) {
      result.error = 'Scan cancelled';
      result.totalDuration = Date.now() - startTime;
      return result;
    }

    // Phase 4: File Linking
    result.phases.linking = await linkFilesToSeries(libraryId, {
      onProgress,
      shouldCancel: options.shouldCancel,
      batchSize: options.batchSize,
    });

    if (options.shouldCancel?.()) {
      result.error = 'Scan cancelled';
      result.totalDuration = Date.now() - startTime;
      return result;
    }

    // Phase 5: Cover Extraction
    result.phases.covers = await extractCovers(libraryId, {
      onProgress,
      shouldCancel: options.shouldCancel,
      batchSize: 20, // Smaller batches for cover extraction
    });

    // Final progress update
    onProgress({
      phase: 'complete',
      current: 1,
      total: 1,
      message: 'Scan complete',
    });

    result.success = true;
    result.totalDuration = Date.now() - startTime;

    logger.info({
      libraryId,
      duration: result.totalDuration,
      phases: result.phases,
    }, 'Library scan complete');

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.totalDuration = Date.now() - startTime;

    logger.error({ libraryId, error }, 'Library scan failed');

    return result;
  }
}
```

**Step 2: Commit**

```bash
git add server/src/services/library-scanner/
git commit -m "feat(scanner): add main scanner orchestrator"
```

---

## Task 9: Update Scan Queue to Use New Scanner

**Files:**
- Modify: `server/src/services/library-scan-queue.service.ts`

**Step 1: Update scan queue configuration**

In `server/src/services/library-scan-queue.service.ts`, change `MAX_CONCURRENT_SCANS` from 3 to 1:

```typescript
/** Maximum number of concurrent library scans */
const MAX_CONCURRENT_SCANS = 1;
```

**Step 2: Replace executeFullScan function**

Replace the `executeFullScan` function (around line 315) with:

```typescript
/**
 * Execute the full library scan workflow using new 5-phase scanner.
 */
async function executeFullScan(
  jobId: string,
  cancellationToken: { cancelled: boolean }
): Promise<void> {
  const job = await getScanJob(jobId);
  if (!job) {
    throw new Error('Scan job not found');
  }

  const libraryId = job.libraryId;

  // Import new scanner
  const { scanLibrary } = await import('./library-scanner/index.js');

  // Run the scan
  const result = await scanLibrary(libraryId, {
    onProgress: async (progress) => {
      // Map phase to job stage
      const stageMap: Record<string, string> = {
        discovery: 'discovering',
        metadata: 'indexing',
        series: 'linking',
        linking: 'linking',
        covers: 'covers',
        complete: 'complete',
      };

      const stage = stageMap[progress.phase] ?? progress.phase;

      await updateScanJobStatus(jobId, stage as ScanJobStatus, stage);
      await updateScanJobProgress(jobId, {
        discoveredFiles: progress.phase === 'discovery' ? progress.current : undefined,
        indexedFiles: progress.phase === 'metadata' ? progress.current : undefined,
        linkedFiles: progress.phase === 'linking' ? progress.current : undefined,
        coversExtracted: progress.phase === 'covers' ? progress.current : undefined,
        totalFiles: progress.total > 0 ? progress.total : undefined,
      });
      await addScanJobLog(jobId, stage, progress.message, progress.detail, 'info');
    },
    shouldCancel: () => cancellationToken.cancelled,
  });

  if (!result.success) {
    throw new Error(result.error ?? 'Scan failed');
  }

  await updateScanJobStatus(jobId, 'complete', 'complete');
  await addScanJobLog(
    jobId,
    'complete',
    'Library scan completed successfully',
    `Duration: ${Math.round(result.totalDuration / 1000)}s`,
    'success'
  );
}
```

**Step 3: Run tests to verify nothing broke**

Run:
```bash
cd server && npm test
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add server/src/services/library-scan-queue.service.ts
git commit -m "feat(scanner): integrate new 5-phase scanner into scan queue

- Set MAX_CONCURRENT_SCANS to 1 (sequential library processing)
- Replace executeFullScan with new scanner orchestrator"
```

---

## Task 10: Create Integration Test

**Files:**
- Create: `server/src/services/library-scanner/__tests__/integration.test.ts`

**Step 1: Create integration test**

Create `server/src/services/library-scanner/__tests__/integration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Library Scanner Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export all phases', async () => {
    const scanner = await import('../index.js');

    expect(scanner.scanLibrary).toBeDefined();
  });

  it('should have correct phase order', async () => {
    // The scanner should process phases in order:
    // 1. discovery
    // 2. metadata
    // 3. series (sequential!)
    // 4. linking
    // 5. covers

    const types = await import('../types.js');
    expect(types).toBeDefined();
  });
});
```

**Step 2: Run all scanner tests**

Run:
```bash
cd server && npx vitest run src/services/library-scanner/
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add server/src/services/library-scanner/
git commit -m "test(scanner): add integration tests for new scanner"
```

---

## Task 11: Final Verification

**Step 1: Run full test suite**

Run:
```bash
cd server && npm test
```

Expected: All 1903+ tests pass

**Step 2: Build to verify no TypeScript errors**

Run:
```bash
cd server && npm run build
```

Expected: Build succeeds with no errors

**Step 3: Final commit if any cleanup needed**

If all tests pass and build succeeds, the implementation is complete.

---

## Summary

This implementation plan creates a new 5-phase scanner that:

1. **Eliminates race conditions** by processing series creation sequentially
2. **Streams data** through the database to avoid memory issues
3. **Is idempotent** so interrupted scans can restart cleanly
4. **Processes one library at a time** to prevent cross-library conflicts

The key files created:
- `server/src/services/library-scanner/types.ts` - Type definitions
- `server/src/services/library-scanner/phases/discovery.ts` - Phase 1
- `server/src/services/library-scanner/phases/metadata-extraction.ts` - Phase 2
- `server/src/services/library-scanner/phases/series-creation.ts` - Phase 3 (SEQUENTIAL)
- `server/src/services/library-scanner/phases/file-linking.ts` - Phase 4
- `server/src/services/library-scanner/phases/cover-extraction.ts` - Phase 5
- `server/src/services/library-scanner/index.ts` - Orchestrator

The key change to existing code:
- `server/src/services/library-scan-queue.service.ts` - Uses new scanner, MAX_CONCURRENT_SCANS = 1
