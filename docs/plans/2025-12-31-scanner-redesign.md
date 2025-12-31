# Scanner Redesign: Eliminating Race Conditions

## Problem Statement

The current library scanner creates duplicate series, empty series, or series with incorrect issue counts. Examples observed:
- "Helck" appearing multiple times with different issue counts
- "Fairest" created as empty series
- "Warriors: Prophecy Begins" appearing as multiple series

**Root Cause:** Race conditions in the parallel series linking stage. When multiple files from the same series are processed concurrently, multiple threads check "does series X exist?" simultaneously, both get "no", and both attempt to create the series.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Performance vs Correctness | Correctness first | Duplicate cleanup is painful; can optimize later |
| Series identity source | Metadata-first | Trust ComicInfo.xml `<Series>` field when present |
| Fallback for no metadata | Folder name (cross-folder grouping allowed) | Simpler, fewer series; user can split later |
| Conflicting metadata | First file wins (alphabetical by path) | Deterministic; metadata fetch can refine later |
| Memory management | Streaming with batched DB writes | Scales to 100k+ files without memory issues |
| Scan/Wizard integration | Keep separate | Scan = fast/deterministic, Wizard = LLM enrichment |
| Interruption recovery | Idempotent restart | Each phase skips completed work; simple, robust |
| Multi-library handling | Fully sequential (one at a time) | Eliminates all cross-library race conditions |
| Progress reporting | Batch-level | Updates every 100 files; good balance of feedback/performance |

## Architecture Overview

### Key Changes from Current Implementation

1. **Single library at a time** - Remove `MAX_CONCURRENT_SCANS`. Queue processes one library, then the next.

2. **Five distinct phases** with clear boundaries:
   - Phase 1: **Discovery** - Find files, write to DB immediately
   - Phase 2: **Metadata Extraction** - Extract ComicInfo.xml, store `seriesNameRaw`
   - Phase 3: **Series Creation** - Sequential, one series at a time
   - Phase 4: **File Linking** - Batch link files to their series
   - Phase 5: **Cover Extraction** - Extract and cache covers

3. **Memory-bounded streaming** - No in-memory accumulation of file metadata. Each phase queries the DB for its work, processes in batches, writes results.

4. **Idempotent phases** - If interrupted, restart skips already-completed work:
   - Discovery skips files already in DB (by path)
   - Metadata extraction skips files with `seriesNameRaw` set
   - Series creation skips existing series
   - Linking skips files with `seriesId` set
   - Cover extraction skips files with `coverHash` set

5. **Clean separation** - LLM parsing remains in the Metadata Wizard. Scan uses ComicInfo.xml + regex folder parsing only.

### New Database Field

```prisma
model ComicFile {
  // ... existing fields ...
  seriesNameRaw  String?   // Extracted series name before linking (from ComicInfo or folder)
}
```

This field decouples metadata extraction from series creation, enabling the streaming architecture.

---

## Phase 1: Discovery

**Purpose:** Find all comic files and create database records. No metadata extraction yet.

### Process

1. Recursively scan library directory
2. For each comic file found (`.cbz`, `.cbr`, `.cb7`):
   - Check if file exists in DB by path
   - If exists: skip (idempotent)
   - If new: create `ComicFile` record with status `pending`
3. Write in batches of 100 files
4. Track orphaned files (in DB but not on disk) for later cleanup

### Data Written per File

```typescript
{
  path: string,
  relativePath: string,
  filename: string,
  extension: string,
  size: number,
  modifiedAt: Date,
  hash: string,
  libraryId: string,
  status: 'pending',
  seriesId: null,
  seriesNameRaw: null
}
```

### Parallelism

File system traversal is inherently sequential per directory, but `stat()` calls for file info can be batched. No DB write conflicts since we're only inserting new records.

### Progress Updates

- "Discovering files: 1,500 found" (every 100 files)
- "Discovery complete: 10,234 files (2,150 new, 8,084 unchanged)"

### Orphan Handling

Files in DB but not on disk are marked `orphaned`. Deletion happens at end of scan (after all phases complete) to allow recovery if scan is interrupted.

---

## Phase 2: Metadata Extraction

**Purpose:** Extract ComicInfo.xml from each file and determine the series name. Store `seriesNameRaw` for later series creation.

### Process

1. Query files needing metadata:
   ```sql
   SELECT id, path, filename, relativePath
   FROM ComicFile
   WHERE libraryId = ? AND seriesNameRaw IS NULL
   ```

2. Process in batches of 100 files

3. For each file:
   - Extract ComicInfo.xml using `archive.service.ts`
   - If `<Series>` field exists: use it as `seriesNameRaw`
   - If no metadata: parse folder name using `parseSeriesFolderName()` (regex)
   - Store first file's metadata for later series creation (year, publisher, etc.)

4. Write batch: update `ComicFile.seriesNameRaw` and create/update `FileMetadata` record

### Parallelism

Archive extraction is I/O bound. Process batch of 100 files with concurrency of 4-8 (configurable). Safe because each file writes to its own record—no shared state.

### Fallback Hierarchy

1. ComicInfo.xml `<Series>` field
2. `parseSeriesFolderName(parentFolder)` - extracts name/year from patterns like "Batman (2016)"
3. Raw folder name as-is

### Progress Updates

- "Extracting metadata: 500/2,150 files"
- "Metadata complete: 2,150 files (1,890 from ComicInfo, 260 from folder names)"

### Error Handling

If extraction fails (corrupt archive), log warning, use folder name fallback. File remains processable.

---

## Phase 3: Series Creation

**Purpose:** Create series records sequentially. This is the critical phase that eliminates race conditions.

### Process

1. Query distinct series names:
   ```sql
   SELECT DISTINCT seriesNameRaw
   FROM ComicFile
   WHERE libraryId = ? AND seriesId IS NULL AND seriesNameRaw IS NOT NULL
   ORDER BY seriesNameRaw
   ```

2. For each unique series name (**sequential loop, no parallelism**):
   - Check if series exists in DB (case-insensitive match on name + publisher)
   - If exists: note the `seriesId` for linking phase
   - If not: create series using first file's metadata

### First File Metadata Lookup

```sql
SELECT fm.* FROM FileMetadata fm
JOIN ComicFile cf ON cf.id = fm.fileId
WHERE cf.seriesNameRaw = ? AND cf.libraryId = ?
ORDER BY cf.relativePath ASC
LIMIT 1
```

This ensures deterministic "first file wins" by alphabetical path order.

### Series Creation Data

```typescript
{
  name: seriesNameRaw,
  startYear: firstFile.year,
  publisher: firstFile.publisher,
  genres: firstFile.genres,
  tags: firstFile.tags,
  ageRating: firstFile.ageRating,
  languageISO: firstFile.languageISO,
  comicVineId: firstFile.comicVineId,  // if present in ComicInfo
  metronId: firstFile.metronId          // if present in ComicInfo
}
```

### Why No Race Conditions

Sequential processing means only one series is created at a time. No parallel threads can create duplicates. The performance cost is acceptable because:
- Series count is typically 1-2 orders of magnitude smaller than file count
- Series creation is a fast DB insert (no I/O like archive extraction)
- A library with 10,000 files might have 500 series = 500 sequential inserts = ~1-2 seconds

### Progress Updates

- "Creating series: 45/120"
- "Series complete: 120 series (85 new, 35 existing)"

---

## Phase 4: File Linking

**Purpose:** Link each file to its series. Safe to parallelize since series already exist.

### Process

1. Build series lookup map (single query):
   ```sql
   SELECT id, name, publisher FROM Series WHERE deletedAt IS NULL
   ```
   Store as `Map<normalizedKey, seriesId>` where key is `lowercase(name + '|' + publisher)`

2. Query unlinked files in batches:
   ```sql
   SELECT id, seriesNameRaw FROM ComicFile
   WHERE libraryId = ? AND seriesId IS NULL AND seriesNameRaw IS NOT NULL
   LIMIT 100
   ```

3. For each batch (parallel within batch, concurrency 8):
   - Look up `seriesId` from map using `seriesNameRaw`
   - Update `ComicFile.seriesId`
   - Update file status to `indexed`

4. After linking, update series progress:
   - Call `updateSeriesProgress(seriesId)` for each affected series
   - Recalculate `totalOwned`, `nextUnreadFileId`

### Parallelism

Safe because:
- Series already exist (no creation race)
- Each file updates its own record (no shared state)
- Progress updates batched per-series at end

### Progress Updates

- "Linking files: 1,500/2,150"
- "Linking complete: 2,150 files linked to 120 series"

### Post-Linking Cleanup

- Delete orphaned files marked in Phase 1
- Soft-delete empty series (0 issues)
- Trigger cover extraction (Phase 5)

---

## Phase 5: Cover Extraction

**Purpose:** Extract and cache cover images for new files. Existing logic mostly preserved.

### Process

1. Query files needing covers:
   ```sql
   SELECT id FROM ComicFile
   WHERE libraryId = ? AND status = 'indexed' AND coverHash IS NULL
   ```

2. Process in batches of 20 files (matches current `batchExtractCovers`)

3. For each batch (parallel, concurrency 4-6):
   - Extract first image from archive
   - Generate thumbnail using Sharp
   - Write to cover cache (`~/.helixio/cache/covers/`)
   - Update `ComicFile.coverHash`

4. After file covers complete, update series covers:
   - For each series with new files: call `recalculateSeriesCover(seriesId)`
   - Uses existing fallback logic: API > User-selected > First issue

### Parallelism

I/O and CPU bound (archive extraction + Sharp). Concurrency limited to avoid memory pressure from image processing.

### Progress Updates

- "Extracting covers: 500/2,150"
- "Covers complete: 2,150 extracted"

### Unchanged from Current

- Cover cache location and format
- `batchExtractCovers` implementation
- Series cover resolution logic

---

## Implementation Plan

### Files to Modify

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `seriesNameRaw` field to `ComicFile` |
| `library-scan-queue.service.ts` | Replace parallel scan with sequential, implement 5 phases |
| `scanner.service.ts` | Simplify to Phase 1 (discovery) only |
| `series-matcher.service.ts` | Remove race condition retry logic (no longer needed) |
| `library-scan-job.service.ts` | Update job stages to match new phases |

### Files Unchanged

| File | Reason |
|------|--------|
| `cover.service.ts` | Phase 5 reuses existing logic |
| `metadata-cache.service.ts` | Phase 2 reuses for ComicInfo extraction |
| `series/series-crud.service.ts` | Series creation logic unchanged |
| `filename-parser.service.ts` | Regex parsing unchanged |
| `metadata-approval/*` | Wizard remains separate |

### Migration

1. Add `seriesNameRaw` column to `ComicFile` table
2. Backfill existing files: set `seriesNameRaw` from `FileMetadata.series` or derive from folder
3. Deploy new scanner code
4. Existing files with `seriesId` already set won't be reprocessed

---

## Performance Characteristics

### Memory Usage

| Current | Redesigned |
|---------|------------|
| O(n) - all files in memory | O(batch) - constant ~100 files |
| 100k files = 200MB+ | 100k files = ~2MB |

### Time Complexity

| Phase | Parallelism | Expected Duration (10k files, 500 series) |
|-------|-------------|-------------------------------------------|
| Discovery | Sequential traversal | ~10-30s |
| Metadata Extraction | Parallel (8x) | ~2-5 min |
| Series Creation | Sequential | ~1-2s |
| File Linking | Parallel (8x) | ~10-30s |
| Cover Extraction | Parallel (4x) | ~5-10 min |

Total: Similar to current (~10-15 min for 10k files), but with guaranteed correctness.

### Comparison to Current

- **Discovery**: Similar (already streams)
- **Metadata**: Similar (already batched)
- **Series + Linking**: Slower due to sequential series creation, but eliminates all race conditions
- **Covers**: Same

The sequential series creation adds ~1-2 seconds for typical libraries. This is negligible compared to the minutes spent on I/O-bound phases.

---

## Testing Strategy

### Unit Tests

1. Phase 1: Idempotent file discovery (skip existing, detect orphans)
2. Phase 2: ComicInfo extraction with fallback hierarchy
3. Phase 3: Sequential series creation (no duplicates)
4. Phase 4: Correct file-to-series linking

### Integration Tests

1. Full scan of library with mixed metadata (some ComicInfo, some folder-only)
2. Interrupted scan recovery (kill mid-phase, restart)
3. Large library simulation (10k+ files)

### Regression Tests

1. Verify no duplicate series created (the original bug)
2. Verify all files linked to correct series
3. Verify series metadata from first file (alphabetically)
