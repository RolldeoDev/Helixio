/**
 * Metadata Approval - Session Creation
 *
 * Handles creating new approval sessions with file grouping and LLM parsing.
 */

import { randomUUID } from 'crypto';
import { dirname } from 'path';
import { getDatabase } from '../database.service.js';
import { createServiceLogger } from '../logger.service.js';
import { parseFilenameToQuery } from '../metadata-search.service.js';
import { isLLMAvailable, parseFilenamesBatch, type ParsedFileMetadata } from '../llm.service.js';
import {
  readSeriesJson,
  readMixedSeriesCache,
  type SeriesMetadata,
  type MixedSeriesCache,
  type CachedSeriesMatch,
} from '../series-metadata.service.js';
import { SESSION_TTL_MS, setSession } from './session-store.js';
import { searchForCurrentSeries } from './series-approval.js';
import { prepareFileChanges } from './file-review.js';
import { normalizeSeriesName } from './helpers.js';
import type {
  ApprovalSession,
  CreateSessionOptions,
  SeriesGroup,
  ParsedFileData,
  ProgressCallback,
  SeriesMatch,
} from './types.js';

const logger = createServiceLogger('metadata-approval-session');

// =============================================================================
// LLM Parsing
// =============================================================================

import type { LibraryType } from '../metadata-search.service.js';

/**
 * Parse files using LLM for intelligent name cleanup
 */
async function parseFilesWithLLM(
  files: Array<{ id: string; filename: string; folderPath?: string }>,
  options: { onProgress?: ProgressCallback; libraryType?: LibraryType } = {}
): Promise<Map<string, ParsedFileMetadata>> {
  const { onProgress, libraryType } = options;
  const progress = onProgress || (() => {});
  const parsedMap = new Map<string, ParsedFileMetadata>();

  if (!isLLMAvailable()) {
    progress('LLM not available', 'Falling back to regex parsing');
    return parsedMap;
  }

  const typeLabel = libraryType === 'manga' ? 'manga' : 'comic';
  progress('Using LLM to parse filenames', `Processing ${files.length} ${typeLabel} files with Claude`);

  const filesToParse = files.map((f) => ({
    filename: f.filename,
    folderPath: f.folderPath,
  }));

  const result = await parseFilenamesBatch(filesToParse, { libraryType });

  if (!result.success) {
    progress('LLM parsing failed', result.error || 'Unknown error');
    return parsedMap;
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const parsed = result.results[i];
    if (parsed && !parsed.error) {
      parsedMap.set(file.id, parsed);
      progress(
        `LLM parsed: ${file.filename}`,
        `Series: "${parsed.series || 'Unknown'}"${parsed.number ? ` #${parsed.number}` : ''}`
      );
    }
  }

  progress(`LLM parsed ${parsedMap.size} files`, `${result.totalTokens || 0} tokens used`);
  return parsedMap;
}

// =============================================================================
// Session Creation
// =============================================================================

/**
 * Create a new approval session
 */
export async function createSession(
  fileIds: string[],
  options: CreateSessionOptions = {}
): Promise<ApprovalSession> {
  return createSessionWithProgress(fileIds, options);
}

/**
 * Create a new approval session with progress callbacks for real-time updates
 */
export async function createSessionWithProgress(
  fileIds: string[],
  optionsOrProgress?: CreateSessionOptions | ProgressCallback,
  onProgressParam?: ProgressCallback
): Promise<ApprovalSession> {
  // Handle overloaded parameters for backward compatibility
  let options: CreateSessionOptions = {};
  let onProgress: ProgressCallback | undefined;

  if (typeof optionsOrProgress === 'function') {
    onProgress = optionsOrProgress;
  } else if (optionsOrProgress) {
    options = optionsOrProgress;
    onProgress = onProgressParam;
  }

  const prisma = getDatabase();
  const progress = onProgress || (() => {});
  const useLLMCleanup = options.useLLMCleanup ?? false;
  const excludeFileIds = options.excludeFileIds ?? [];
  const mixedSeries = options.mixedSeries ?? false;

  // Filter out excluded files (already-indexed files the user chose to skip)
  let filteredFileIds = fileIds;
  if (excludeFileIds.length > 0) {
    const excludeSet = new Set(excludeFileIds);
    filteredFileIds = fileIds.filter((id) => !excludeSet.has(id));
    progress(
      `Excluding ${excludeFileIds.length} already-indexed file(s)`,
      `Processing ${filteredFileIds.length} of ${fileIds.length} selected files`
    );
  }

  if (filteredFileIds.length === 0) {
    throw new Error('No files to process after exclusions');
  }

  progress('Starting metadata approval session', `Processing ${filteredFileIds.length} files`);

  // Fetch file info with series and library relationship
  progress('Loading file information from database');
  const files = await prisma.comicFile.findMany({
    where: { id: { in: filteredFileIds } },
    select: {
      id: true,
      filename: true,
      path: true,
      seriesId: true,
      libraryId: true,
      library: {
        select: {
          id: true,
          type: true,
        },
      },
      series: {
        select: {
          id: true,
          name: true,
          startYear: true,
          endYear: true,
          publisher: true,
          issueCount: true,
          summary: true,
          deck: true,
          comicVineId: true,
          metronId: true,
        },
      },
    },
  });
  progress(`Loaded ${files.length} files`, 'Ready to parse filenames');

  // Determine library type from files (all files should belong to the same library typically)
  const firstFile = files[0];
  const libraryId = firstFile?.libraryId;
  const libraryType = (firstFile?.library?.type as 'western' | 'manga') || 'western';

  if (libraryType === 'manga') {
    progress('Library type: Manga', 'AniList and MAL will be prioritized for metadata search');
  }

  // Build a map of series with external IDs for quick lookup
  const seriesWithExternalIds = new Map<
    string,
    {
      id: string;
      name: string;
      startYear: number | null;
      endYear: number | null;
      publisher: string | null;
      issueCount: number | null;
      summary: string | null;
      deck: string | null;
      comicVineId: string | null;
      metronId: string | null;
    }
  >();
  for (const file of files) {
    if (file.series && (file.series.comicVineId || file.series.metronId)) {
      seriesWithExternalIds.set(file.series.id, file.series);
    }
  }

  if (seriesWithExternalIds.size > 0) {
    progress(
      `Found ${seriesWithExternalIds.size} series with existing metadata IDs`,
      'Issues in these series will be auto-matched'
    );
  }

  // Parse with LLM if enabled
  let llmParsedFiles = new Map<string, ParsedFileMetadata>();
  if (useLLMCleanup) {
    const filesWithFolders = files.map((f) => ({
      id: f.id,
      filename: f.filename,
      folderPath: f.path.split('/').slice(0, -1).join('/'),
    }));
    // Pass library type to LLM for manga-specific parsing
    llmParsedFiles = await parseFilesWithLLM(filesWithFolders, {
      onProgress: progress,
      libraryType: libraryType === 'manga' ? 'manga' : 'western',
    });
  }

  // ==========================================================================
  // Check for existing series.json files in folders (skip if mixedSeries mode)
  // ==========================================================================

  const folderToFiles = new Map<string, typeof files>();
  for (const file of files) {
    const folderPath = dirname(file.path);
    const existing = folderToFiles.get(folderPath);
    if (existing) {
      existing.push(file);
    } else {
      folderToFiles.set(folderPath, [file]);
    }
  }

  const folderSeriesCache = new Map<string, SeriesMetadata | null>();
  const folderMixedCache = new Map<string, MixedSeriesCache | null>();
  let foldersWithSeriesJson = 0;
  let foldersWithMixedCache = 0;

  if (mixedSeries) {
    progress('Mixed series mode enabled', 'Checking for cached series mappings');
    // In mixed series mode, ignore series.json but check for mixed series cache
    for (const folderPath of folderToFiles.keys()) {
      folderSeriesCache.set(folderPath, null);

      // Check for mixed series cache
      const mixedCacheResult = await readMixedSeriesCache(folderPath);
      if (mixedCacheResult.success && mixedCacheResult.cache) {
        folderMixedCache.set(folderPath, mixedCacheResult.cache);
        foldersWithMixedCache++;
      } else {
        folderMixedCache.set(folderPath, null);
      }
    }

    if (foldersWithMixedCache > 0) {
      progress(
        `Found ${foldersWithMixedCache} folder(s) with cached series mappings`,
        'Previously approved series will be reused'
      );
    }
  } else {
    progress('Checking for existing series.json files');
    for (const folderPath of folderToFiles.keys()) {
      const result = await readSeriesJson(folderPath);
      if (result.success && result.metadata) {
        folderSeriesCache.set(folderPath, result.metadata);
        foldersWithSeriesJson++;
      } else {
        folderSeriesCache.set(folderPath, null);
      }
    }

    if (foldersWithSeriesJson > 0) {
      progress(
        `Found ${foldersWithSeriesJson} folder(s) with series.json`,
        'Will skip series search for these'
      );
    }
  }

  // ==========================================================================
  // Group files by series (using series.json when available)
  // ==========================================================================

  progress('Parsing filenames and detecting series');

  const pendingGroups = new Map<
    string,
    {
      query: { series?: string; issueNumber?: string; year?: number };
      fileIds: string[];
      filenames: string[];
      parsedFiles: Record<string, ParsedFileData>;
    }
  >();

  const preApprovedGroups: SeriesGroup[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const folderPath = dirname(file.path);
    const existingSeriesJson = folderSeriesCache.get(folderPath);

    const llmParsed = llmParsedFiles.get(file.id);
    let parsedData: ParsedFileData;

    if (llmParsed && llmParsed.series) {
      parsedData = {
        series: llmParsed.series,
        number: llmParsed.number?.toString(),
        year: llmParsed.year,
        // Include manga-specific fields from LLM parsing
        volume: llmParsed.volume,
        chapter: llmParsed.chapter,
        contentType: llmParsed.contentType,
      };
    } else {
      const query = parseFilenameToQuery(file.filename);
      parsedData = {
        series: query.series,
        number: query.issueNumber,
        year: query.year,
      };
    }

    if (existingSeriesJson) {
      let folderGroup = preApprovedGroups.find((g) =>
        g.fileIds.some((fid) => {
          const f = files.find((ff) => ff.id === fid);
          return f && dirname(f.path) === folderPath;
        })
      );

      if (!folderGroup) {
        const seriesMatch: SeriesMatch = {
          source: existingSeriesJson.comicVineSeriesId ? 'comicvine' : 'metron',
          sourceId: existingSeriesJson.comicVineSeriesId || existingSeriesJson.metronSeriesId || '',
          name: existingSeriesJson.seriesName,
          startYear: existingSeriesJson.startYear,
          endYear: existingSeriesJson.endYear,
          publisher: existingSeriesJson.publisher,
          issueCount: existingSeriesJson.issueCount,
          description: existingSeriesJson.summary || existingSeriesJson.deck,
          coverUrl: existingSeriesJson.coverUrl,
          confidence: 1.0,
          url: existingSeriesJson.siteUrl,
        };

        // Check if there's a separate issue matching series stored
        let issueMatchingSeriesMatch: SeriesMatch | null = null;
        if (existingSeriesJson.issueMatchingSeriesName) {
          const issueMatchSource = existingSeriesJson.issueMatchingComicVineId ? 'comicvine' : 'metron';
          const issueMatchSourceId =
            existingSeriesJson.issueMatchingComicVineId || existingSeriesJson.issueMatchingMetronId || '';

          if (issueMatchSourceId) {
            issueMatchingSeriesMatch = {
              source: issueMatchSource,
              sourceId: issueMatchSourceId,
              name: existingSeriesJson.issueMatchingSeriesName,
              startYear: existingSeriesJson.issueMatchingStartYear,
              publisher: existingSeriesJson.issueMatchingPublisher,
              issueCount: existingSeriesJson.issueMatchingIssueCount,
              confidence: 1.0,
            };
          }
        }

        folderGroup = {
          query: { series: existingSeriesJson.seriesName, year: existingSeriesJson.startYear },
          displayName: existingSeriesJson.seriesName,
          fileIds: [],
          filenames: [],
          parsedFiles: {},
          searchResults: [seriesMatch],
          selectedSeries: seriesMatch,
          issueMatchingSeries: issueMatchingSeriesMatch,
          status: 'approved',
          preApprovedFromSeriesJson: true,
        };
        preApprovedGroups.push(folderGroup);

        const issueMatchNote = issueMatchingSeriesMatch
          ? ` (issues: "${issueMatchingSeriesMatch.name}")`
          : '';
        progress(
          `Using series.json: "${existingSeriesJson.seriesName}"${issueMatchNote}`,
          `Folder: ${folderPath.split('/').pop()}`
        );
      }

      folderGroup.fileIds.push(file.id);
      folderGroup.filenames.push(file.filename);
      folderGroup.parsedFiles[file.id] = parsedData;
    } else {
      const query = llmParsed?.series
        ? { series: llmParsed.series, issueNumber: llmParsed.number?.toString(), year: llmParsed.year }
        : parseFilenameToQuery(file.filename);

      const seriesKey = normalizeSeriesName(query.series || file.filename);

      const detectedSeries = query.series || 'Unknown';
      const issueNum = query.issueNumber || '?';
      const parseSource = llmParsed?.series ? '(LLM)' : '(regex)';

      // Check if file belongs to a series with existing external IDs in the database
      const dbSeries = file.seriesId ? seriesWithExternalIds.get(file.seriesId) : null;

      if (dbSeries) {
        // Pre-approve using database series with external ID
        const externalId = dbSeries.comicVineId || dbSeries.metronId || '';
        const source: 'comicvine' | 'metron' = dbSeries.comicVineId ? 'comicvine' : 'metron';

        progress(
          `Parsing: ${file.filename}`,
          `Using existing series: "${dbSeries.name}" #${issueNum} (from database)`
        );

        // Find or create a pre-approved group for this database series
        let dbGroup = preApprovedGroups.find(
          (g) => g.selectedSeries?.sourceId === externalId && g.preApprovedFromDatabase === true
        );

        if (!dbGroup) {
          // Convert database series to SeriesMatch
          const seriesMatch: SeriesMatch = {
            source,
            sourceId: externalId,
            name: dbSeries.name,
            startYear: dbSeries.startYear ?? undefined,
            endYear: dbSeries.endYear ?? undefined,
            publisher: dbSeries.publisher ?? undefined,
            issueCount: dbSeries.issueCount ?? undefined,
            description: dbSeries.summary || dbSeries.deck || undefined,
            confidence: 1.0,
          };

          dbGroup = {
            query: { series: dbSeries.name, year: dbSeries.startYear ?? undefined },
            displayName: dbSeries.name,
            fileIds: [],
            filenames: [],
            parsedFiles: {},
            searchResults: [seriesMatch],
            selectedSeries: seriesMatch,
            issueMatchingSeries: null,
            status: 'approved',
            preApprovedFromDatabase: true, // Mark as pre-approved from database series
          };
          preApprovedGroups.push(dbGroup);

          progress(
            `Using database series: "${dbSeries.name}"`,
            `Source: ${source} (${externalId})`
          );
        }

        dbGroup.fileIds.push(file.id);
        dbGroup.filenames.push(file.filename);
        dbGroup.parsedFiles[file.id] = parsedData;
      } else {
        // Check if we have a cached series mapping for this series name (in mixed series mode)
        const mixedCache = folderMixedCache.get(folderPath);
        const cachedSeriesMatch = mixedCache?.seriesMappings[seriesKey];

        if (cachedSeriesMatch) {
          // Pre-approve using cached series mapping
          progress(`Parsing: ${file.filename}`, `Using cached series: "${cachedSeriesMatch.name}" #${issueNum}`);

          // Find or create a pre-approved group for this cached series
          let cachedGroup = preApprovedGroups.find(
            (g) => g.selectedSeries?.sourceId === cachedSeriesMatch.sourceId
          );

          if (!cachedGroup) {
            // Convert cached match to SeriesMatch
            const seriesMatch: SeriesMatch = {
              source: cachedSeriesMatch.source,
              sourceId: cachedSeriesMatch.sourceId,
              name: cachedSeriesMatch.name,
              startYear: cachedSeriesMatch.startYear,
              endYear: cachedSeriesMatch.endYear,
              publisher: cachedSeriesMatch.publisher,
              issueCount: cachedSeriesMatch.issueCount,
              description: cachedSeriesMatch.description,
              coverUrl: cachedSeriesMatch.coverUrl,
              url: cachedSeriesMatch.url,
              confidence: 1.0,
            };

            cachedGroup = {
              query: { series: cachedSeriesMatch.name, year: cachedSeriesMatch.startYear },
              displayName: cachedSeriesMatch.name,
              fileIds: [],
              filenames: [],
              parsedFiles: {},
              searchResults: [seriesMatch],
              selectedSeries: seriesMatch,
              issueMatchingSeries: null,
              status: 'approved',
              preApprovedFromSeriesJson: true, // Treat as pre-approved (from cache)
            };
            preApprovedGroups.push(cachedGroup);

            progress(
              `Using cached series: "${cachedSeriesMatch.name}"`,
              `Source: ${cachedSeriesMatch.source}`
            );
          }

          cachedGroup.fileIds.push(file.id);
          cachedGroup.filenames.push(file.filename);
          cachedGroup.parsedFiles[file.id] = parsedData;
        } else {
          // No cached series - add to pending groups
          progress(`Parsing: ${file.filename}`, `Detected ${parseSource}: "${detectedSeries}" #${issueNum}`);

          const existing = pendingGroups.get(seriesKey);
          if (existing) {
            existing.fileIds.push(file.id);
            existing.filenames.push(file.filename);
            existing.parsedFiles[file.id] = parsedData;
            if (query.year && !existing.query.year) {
              existing.query.year = query.year;
            }
          } else {
            pendingGroups.set(seriesKey, {
              query,
              fileIds: [file.id],
              filenames: [file.filename],
              parsedFiles: { [file.id]: parsedData },
            });
          }
        }
      }
    }
  }

  const pendingSeriesGroups: SeriesGroup[] = Array.from(pendingGroups.values()).map((group) => ({
    query: group.query,
    displayName: group.query.series || 'Unknown Series',
    fileIds: group.fileIds,
    filenames: group.filenames,
    parsedFiles: group.parsedFiles,
    searchResults: [],
    selectedSeries: null,
    issueMatchingSeries: null,
    status: 'pending' as const,
  }));

  const seriesGroups: SeriesGroup[] = [...preApprovedGroups, ...pendingSeriesGroups];

  progress(
    `Grouped into ${seriesGroups.length} series`,
    `${preApprovedGroups.length} pre-approved, ${pendingSeriesGroups.length} need review`
  );

  for (const group of seriesGroups) {
    let statusNote = '';
    if (group.status === 'approved') {
      if (group.preApprovedFromDatabase) {
        statusNote = '(from database)';
      } else if (group.preApprovedFromSeriesJson) {
        statusNote = '(from series.json)';
      } else {
        statusNote = '(pre-approved)';
      }
    }
    progress(
      `Series: "${group.displayName}" ${statusNote}`,
      `${group.fileIds.length} files${group.query.year ? `, year: ${group.query.year}` : ''}`
    );
  }

  const firstPendingIndex = seriesGroups.findIndex((g) => g.status === 'pending');
  const allPreApproved = firstPendingIndex === -1;

  // Create session
  const now = new Date();
  const session: ApprovalSession = {
    id: randomUUID(),
    status: allPreApproved ? 'file_review' : 'series_approval',
    fileIds: filteredFileIds,
    libraryId,
    libraryType,
    useLLMCleanup,
    options, // Store options for use in applyChanges (e.g., fetchExternalRatings)
    seriesGroups,
    currentSeriesIndex: allPreApproved ? seriesGroups.length : firstPendingIndex,
    fileChanges: [],
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  };

  setSession(session);

  if (allPreApproved) {
    // Determine the source for the message - could be database, series.json, or cache
    const hasDbApproved = seriesGroups.some((g) => g.preApprovedFromDatabase);
    const hasSeriesJsonApproved = seriesGroups.some(
      (g) => g.preApprovedFromSeriesJson && !g.preApprovedFromDatabase
    );
    let sourceNote = 'existing metadata';
    if (hasDbApproved && hasSeriesJsonApproved) {
      sourceNote = 'database and series.json';
    } else if (hasDbApproved) {
      sourceNote = 'database series';
    } else if (mixedSeries) {
      sourceNote = 'cached series mappings';
    } else if (hasSeriesJsonApproved) {
      sourceNote = 'series.json';
    }
    progress(`All series pre-approved from ${sourceNote}`, 'Preparing file changes directly');
    await prepareFileChanges(session, progress);
    progress('Session ready', `${session.fileChanges.length} files to review`);
  } else {
    const firstPendingGroup = seriesGroups[firstPendingIndex]!;
    progress(`Searching for "${firstPendingGroup.displayName}"`, 'Querying metadata sources');
    await searchForCurrentSeries(session, onProgress);
    const resultCount = session.seriesGroups[firstPendingIndex]?.searchResults.length ?? 0;
    progress(`Found ${resultCount} matches`, 'Ready for series approval');
    progress('Session ready', `${pendingSeriesGroups.length} series to review`);
  }

  return session;
}
