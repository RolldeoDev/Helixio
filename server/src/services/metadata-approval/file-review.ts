/**
 * Metadata Approval - File Review
 *
 * Handles the file-level review workflow (Phase 2).
 */

import { getDatabase } from '../database.service.js';
import { createServiceLogger } from '../logger.service.js';
import { parseFilenameToQuery } from '../metadata-search.service.js';
import { SeriesCache, type CachedIssuesData } from '../series-cache.service.js';
import * as comicVine from '../comicvine.service.js';
import { getSession, setSession } from './session-store.js';
import { matchFileToIssue, getIssueNumber, getIssueTitle } from './helpers.js';
import { issueToFieldChanges, metronIssueToFieldChanges, mangaChapterToFieldChanges, generateRenameField, type MangaChapterOptions, type ComicClassificationOptions, type FieldChangesResult } from './field-changes.js';
import { getComicClassificationSettings } from '../config.service.js';
import { classifyMangaFile, type MangaClassificationResult } from '../manga-classification.service.js';
import { getMangaClassificationSettings } from '../config.service.js';
import type {
  ApprovalSession,
  FileChange,
  ProgressCallback,
  MetadataSource,
  SeriesMatch,
  ParsedFileData,
} from './types.js';

const logger = createServiceLogger('metadata-approval-file-review');

// =============================================================================
// Manga Source Handling
// =============================================================================

/** Manga sources that don't provide per-chapter metadata */
const MANGA_SOURCES: MetadataSource[] = ['anilist', 'mal'];

/**
 * Check if a source is a manga source (no per-chapter API data)
 */
function isMangaSource(source: MetadataSource): boolean {
  return MANGA_SOURCES.includes(source);
}

/**
 * Prepare file changes for manga sources (chapter-only mode)
 *
 * For AniList/MAL, we don't have per-chapter metadata from the API.
 * Instead, we use the chapter number parsed from the filename and
 * apply series-level metadata only.
 *
 * Also applies smart chapter/volume classification based on page count.
 */
async function prepareMangaFileChanges(
  group: {
    displayName: string;
    fileIds: string[];
    filenames: string[];
    parsedFiles: Record<string, ParsedFileData>;
    selectedSeries: SeriesMatch;
  },
  libraryId: string | undefined,
  onProgress?: ProgressCallback
): Promise<FileChange[]> {
  const progress = onProgress || (() => {});
  const prisma = getDatabase();
  const fileChanges: FileChange[] = [];
  const classificationSettings = getMangaClassificationSettings();

  const metadataSource = group.selectedSeries;

  progress(
    `Processing manga: "${group.displayName}"`,
    `Using chapter numbers from filenames (${metadataSource.source} provides series metadata only)`
  );

  // Fetch page counts and file paths for all files
  const filesWithMetadata = await prisma.comicFile.findMany({
    where: { id: { in: group.fileIds } },
    select: {
      id: true,
      path: true,
      metadata: { select: { pageCount: true } },
    },
  });
  const pageCountMap = new Map<string, number>();
  const filePathMap = new Map<string, string>();
  for (const file of filesWithMetadata) {
    if (file.metadata?.pageCount) {
      pageCountMap.set(file.id, file.metadata.pageCount);
    }
    filePathMap.set(file.id, file.path);
  }

  for (let i = 0; i < group.fileIds.length; i++) {
    const fileId = group.fileIds[i]!;
    const filename = group.filenames[i]!;
    const parsedData = group.parsedFiles[fileId];
    const pageCount = pageCountMap.get(fileId) || 0;

    // STEP 1: Run classification FIRST to extract volume/chapter from filename
    // This handles patterns like "v05" that parseFilenameToQuery misses
    let classification: MangaClassificationResult | undefined;
    if (classificationSettings.enabled) {
      classification = classifyMangaFile(filename, pageCount, classificationSettings);
    }

    // STEP 2: Get match number from multiple sources (volume OR chapter)
    // Priority: classification result > LLM parsed data > regex fallback
    const matchNumber =
      classification?.primaryNumber ||           // From classification (handles v05, v5c12, etc.)
      parsedData?.volume ||                      // LLM parsed volume
      parsedData?.chapter ||                     // LLM parsed chapter
      parsedData?.number ||                      // LLM parsed generic number
      parseFilenameToQuery(filename).issueNumber; // Regex fallback

    if (matchNumber) {
      // STEP 3: Matched - use classification type or default
      const contentType = classification?.contentType || 'chapter';
      const isVolume = contentType === 'volume';

      // Create field changes using series-level metadata + parsed number
      const options: MangaChapterOptions = {
        classification,
        pageCount,
        filename,
      };

      const { fields, proposedMetadata } = await mangaChapterToFieldChanges(
        fileId,
        matchNumber,
        metadataSource,
        options
      );

      // Generate rename preview if we have library context
      // Use complete proposedMetadata (not just changed fields) for accurate preview
      const filePath = filePathMap.get(fileId);
      if (libraryId && filePath) {
        const renameField = await generateRenameField(proposedMetadata, {
          libraryId,
          filePath,
          series: {
            name: metadataSource.name,
            publisher: metadataSource.publisher ?? undefined,
            startYear: metadataSource.startYear,
            issueCount: metadataSource.issueCount,
          },
        });

        if (renameField) {
          fields.rename = renameField;
        }
      }

      // Determine display label based on classification or content type
      const displayLabel = classification?.displayTitle ||
        (isVolume ? `Volume ${matchNumber}` : `Chapter ${matchNumber}`);

      progress(
        `Matched: "${filename.length > 40 ? filename.slice(0, 40) + '...' : filename}"`,
        `-> ${displayLabel} (parsed from filename)`
      );

      fileChanges.push({
        fileId,
        filename,
        matchedIssue: {
          source: metadataSource.source,
          sourceId: `${isVolume ? 'volume' : 'chapter'}-${matchNumber}`, // Virtual ID for volume/chapter
          number: matchNumber,
          title: classification?.displayTitle,
          coverDate: undefined,
        },
        matchConfidence: classification?.confidence || 0.9,
        fields,
        status: 'matched',
      });
    } else {
      progress(
        `Unmatched: "${filename.length > 40 ? filename.slice(0, 40) + '...' : filename}"`,
        'No volume or chapter number detected in filename'
      );

      fileChanges.push({
        fileId,
        filename,
        matchedIssue: null,
        matchConfidence: 0,
        fields: {},
        status: 'unmatched',
      });
    }
  }

  const matchedCount = fileChanges.filter((f) => f.status === 'matched').length;
  const unmatchedCount = fileChanges.filter((f) => f.status === 'unmatched').length;
  progress(
    `Manga "${group.displayName}" complete`,
    `${matchedCount} matched, ${unmatchedCount} unmatched`
  );

  return fileChanges;
}

// =============================================================================
// File Change Preparation
// =============================================================================

/**
 * Check if an issue from the bulk endpoint has credit data.
 * ComicVine's bulk /issues/ endpoint may not return credit fields even when requested.
 */
function issueHasCredits(issue: comicVine.ComicVineIssue): boolean {
  return !!(
    (issue.person_credits && issue.person_credits.length > 0) ||
    (issue.character_credits && issue.character_credits.length > 0) ||
    (issue.team_credits && issue.team_credits.length > 0) ||
    (issue.location_credits && issue.location_credits.length > 0) ||
    (issue.story_arc_credits && issue.story_arc_credits.length > 0)
  );
}

/**
 * Fetch full issue details from API to get complete metadata including credits.
 * ComicVine's bulk /issues/ endpoint often doesn't return credit fields, so we fetch
 * individual issues to get person_credits, character_credits, team_credits, etc.
 *
 * Optimization: Only fetches issues that don't already have credit data from bulk.
 *
 * @param issueIds - Array of issue IDs that need fetching
 * @param existingIssueMap - Map of issues from bulk endpoint (to check for existing credits)
 * @param source - Metadata source (comicvine, metron, etc.)
 * @param onProgress - Progress callback
 * @returns Map of issueId -> full issue data
 */
async function fetchFullIssueDetails(
  issueIds: number[],
  existingIssueMap: Map<number, comicVine.ComicVineIssue>,
  source: MetadataSource,
  onProgress?: ProgressCallback
): Promise<Map<number, comicVine.ComicVineIssue>> {
  const progress = onProgress || (() => {});
  const fullIssueMap = new Map<number, comicVine.ComicVineIssue>();

  if (issueIds.length === 0) return fullIssueMap;

  // Check which issues already have credits from the bulk endpoint
  const issuesNeedingFetch: number[] = [];
  for (const issueId of issueIds) {
    const existing = existingIssueMap.get(issueId);
    if (existing && issueHasCredits(existing)) {
      // Already has credit data, use it directly
      fullIssueMap.set(issueId, existing);
    } else {
      // Needs individual fetch to get credits
      issuesNeedingFetch.push(issueId);
    }
  }

  // If all issues already have credits, we're done
  if (issuesNeedingFetch.length === 0) {
    progress('Issue metadata', `All ${issueIds.length} issues have credits from bulk fetch`);
    return fullIssueMap;
  }

  progress(
    'Fetching full issue metadata',
    `${issueIds.length - issuesNeedingFetch.length} have credits, fetching ${issuesNeedingFetch.length} more...`
  );

  // Process in batches to avoid overwhelming the API
  // ComicVine allows up to 200 requests/hour, so we use 10 concurrent with delays
  const BATCH_SIZE = 10;
  const DELAY_BETWEEN_BATCHES_MS = 300;

  for (let i = 0; i < issuesNeedingFetch.length; i += BATCH_SIZE) {
    const batch = issuesNeedingFetch.slice(i, i + BATCH_SIZE);

    // Fetch batch concurrently
    const results = await Promise.all(
      batch.map(async (issueId) => {
        try {
          if (source === 'comicvine') {
            return { id: issueId, data: await comicVine.getIssue(issueId) };
          }
          // For other sources, add similar handling
          return { id: issueId, data: null };
        } catch (err) {
          logger.warn({ issueId, error: err }, 'Failed to fetch full issue details');
          return { id: issueId, data: null };
        }
      })
    );

    // Store results
    for (const result of results) {
      if (result.data) {
        fullIssueMap.set(result.id, result.data);
      }
    }

    const completed = Math.min(i + BATCH_SIZE, issuesNeedingFetch.length);
    progress(
      'Fetching full issue metadata',
      `${completed} of ${issuesNeedingFetch.length} issues (credits, characters, etc.)`
    );

    // Add delay between batches to respect rate limits (except for last batch)
    if (i + BATCH_SIZE < issuesNeedingFetch.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  progress('Issue metadata fetch complete', `Retrieved full details for ${fullIssueMap.size} issues`);
  return fullIssueMap;
}

/**
 * Prepare file changes after all series are approved
 *
 * Uses batch queries and cached issue data for initial matching, then fetches
 * full issue details to get complete metadata including credits.
 */
export async function prepareFileChanges(
  session: ApprovalSession,
  onProgress?: ProgressCallback
): Promise<void> {
  const progress = onProgress || (() => {});
  const prisma = getDatabase();
  const fileChanges: FileChange[] = [];
  const totalGroups = session.seriesGroups.filter((g) => g.status === 'approved').length;
  let processedGroups = 0;

  progress('Preparing file changes', `Processing ${totalGroups} approved series`);

  for (const group of session.seriesGroups) {
    if (group.status !== 'approved' || !group.selectedSeries) {
      // Skip skipped groups - files remain unchanged
      // Batch lookup all files in this group
      const files = await prisma.comicFile.findMany({
        where: { id: { in: group.fileIds } },
        select: { id: true, filename: true },
      });
      const fileMap = new Map(files.map((f) => [f.id, f.filename]));

      for (const fileId of group.fileIds) {
        const filename = fileMap.get(fileId);
        if (filename) {
          fileChanges.push({
            fileId,
            filename,
            matchedIssue: null,
            matchConfidence: 0,
            fields: {},
            status: 'rejected',
          });
        }
      }
      continue;
    }

    // Determine which series to use for issue matching
    const issueSource = group.issueMatchingSeries || group.selectedSeries;
    const metadataSource = group.selectedSeries;

    processedGroups++;
    progress(
      `Processing: "${group.displayName}"`,
      `Series ${processedGroups}/${totalGroups} - ${group.fileIds.length} files`
    );

    // Check if this is a manga source (no per-chapter API data)
    if (isMangaSource(metadataSource.source)) {
      // Use manga-specific handling (chapter-only mode)
      const mangaChanges = await prepareMangaFileChanges(
        {
          displayName: group.displayName,
          fileIds: group.fileIds,
          filenames: group.filenames,
          parsedFiles: group.parsedFiles,
          selectedSeries: metadataSource,
        },
        session.libraryId,
        progress
      );
      fileChanges.push(...mangaChanges);
      continue;
    }

    // Get cached issues from the issue matching series (Western comics flow)
    progress(`Fetching issues for "${issueSource.name}"`, 'Checking cache...');
    const fetchStartTime = Date.now();
    const cachedIssues = await SeriesCache.getOrFetchIssues(
      issueSource.source,
      issueSource.sourceId
    );
    const fetchDuration = Date.now() - fetchStartTime;

    if (!cachedIssues) {
      progress(
        `No issues found for "${issueSource.name}"`,
        'All files in this series will be unmatched'
      );
      const files = await prisma.comicFile.findMany({
        where: { id: { in: group.fileIds } },
        select: { id: true, filename: true },
      });
      const fileMap = new Map(files.map((f) => [f.id, f.filename]));

      for (const fileId of group.fileIds) {
        const filename = fileMap.get(fileId);
        if (filename) {
          fileChanges.push({
            fileId,
            filename,
            matchedIssue: null,
            matchConfidence: 0,
            fields: {},
            status: 'unmatched',
          });
        }
      }
      continue;
    }

    const cacheStatus = fetchDuration < 100 ? 'cache hit' : 'fetched from API';
    progress(
      `Loaded ${cachedIssues.issues.length} issues (${cacheStatus})`,
      `${fetchDuration}ms - Source: ${issueSource.source}`
    );

    const issueMap = new Map(cachedIssues.issues.map((iss) => [iss.id, iss]));
    let matchedCount = 0;
    let unmatchedCount = 0;

    // Fetch page counts and file paths for all files
    const comicClassificationSettings = getComicClassificationSettings();
    const pageCountMap = new Map<string, number>();
    const filePathMap = new Map<string, string>();

    const filesWithMetadata = await prisma.comicFile.findMany({
      where: { id: { in: group.fileIds } },
      select: { id: true, path: true, metadata: { select: { pageCount: true } } },
    });
    for (const file of filesWithMetadata) {
      filePathMap.set(file.id, file.path);
      if (file.metadata?.pageCount) {
        pageCountMap.set(file.id, file.metadata.pageCount);
      }
    }

    progress(`Matching ${group.fileIds.length} files to issues`, 'Analyzing filenames...');

    // Phase 1: Match files to issues using cached data (fast)
    interface PendingMatch {
      fileId: string;
      filename: string;
      filePath: string;
      issue: (typeof cachedIssues.issues)[0];
      confidence: number;
      parseSource: string;
      parsedNumber: string;
      pageCount: number;
    }
    const pendingMatches: PendingMatch[] = [];

    for (let i = 0; i < group.fileIds.length; i++) {
      const fileId = group.fileIds[i]!;
      const filename = group.filenames[i]!;
      const parsedData = group.parsedFiles[fileId];

      const { issue, confidence } = matchFileToIssue(filename, cachedIssues.issues, parsedData);

      const parseSource = parsedData?.number ? 'parsed' : 'regex';
      const parsedNumber = parsedData?.number || parseFilenameToQuery(filename).issueNumber || '?';
      const pageCount = pageCountMap.get(fileId) || 0;

      if (issue && confidence >= 0.5) {
        matchedCount++;
        const filePath = filePathMap.get(fileId) || '';
        pendingMatches.push({
          fileId,
          filename,
          filePath,
          issue,
          confidence,
          parseSource,
          parsedNumber,
          pageCount,
        });

        const confidencePercent = Math.round(confidence * 100);
        progress(
          `Matched: "${filename.length > 40 ? filename.slice(0, 40) + '...' : filename}"`,
          `-> Issue #${getIssueNumber(issue)} (${confidencePercent}% confidence, ${parseSource} #${parsedNumber})`
        );
      } else {
        unmatchedCount++;
        let bestGuess: FileChange['matchedIssue'] = null;

        const issueNumberStr = parsedData?.number || parseFilenameToQuery(filename).issueNumber;
        if (issueNumberStr) {
          const numInt = parseInt(issueNumberStr.replace(/^#/, '').trim(), 10);
          if (!isNaN(numInt)) {
            for (const iss of cachedIssues.issues) {
              const issNum = parseInt(getIssueNumber(iss), 10);
              if (!isNaN(issNum) && issNum === numInt) {
                bestGuess = {
                  source: issueSource.source,
                  sourceId: String(iss.id),
                  number: getIssueNumber(iss),
                  title: getIssueTitle(iss),
                  coverDate: iss.cover_date,
                };
                break;
              }
            }
          }
        }

        const reason =
          parsedNumber === '?'
            ? 'no issue number detected'
            : `#${parsedNumber} not found in ${cachedIssues.issues.length} issues`;
        progress(
          `Unmatched: "${filename.length > 40 ? filename.slice(0, 40) + '...' : filename}"`,
          reason
        );

        fileChanges.push({
          fileId,
          filename,
          matchedIssue: bestGuess,
          matchConfidence: 0,
          fields: {},
          status: 'unmatched',
        });
      }
    }

    // Phase 2: Fetch full issue details for all matched files (to get credits, characters, etc.)
    // ComicVine's bulk /issues/ endpoint may not return these fields
    if (pendingMatches.length > 0 && issueSource.source === 'comicvine') {
      const uniqueIssueIds = [...new Set(pendingMatches.map((m) => m.issue.id))];
      const fullIssueMap = await fetchFullIssueDetails(uniqueIssueIds, issueMap as Map<number, comicVine.ComicVineIssue>, issueSource.source, progress);

      // Phase 3: Build field changes using full issue data
      progress('Building field changes', `Processing ${pendingMatches.length} matched files...`);

      for (const match of pendingMatches) {
        const fullIssue = fullIssueMap.get(match.issue.id) || (match.issue as comicVine.ComicVineIssue);
        const classificationOptions: ComicClassificationOptions = {
          filename: match.filename,
          pageCount: match.pageCount,
        };

        const { fields, proposedMetadata } = await issueToFieldChanges(
          match.fileId,
          fullIssue,
          metadataSource,
          classificationOptions
        );

        // Generate rename preview if we have library context
        // Use complete proposedMetadata (not just changed fields) for accurate preview
        if (session.libraryId && match.filePath) {
          const renameField = await generateRenameField(proposedMetadata, {
            libraryId: session.libraryId,
            filePath: match.filePath,
            series: {
              name: metadataSource.name,
              publisher: metadataSource.publisher ?? undefined,
              startYear: metadataSource.startYear,
              issueCount: metadataSource.issueCount,
            },
          });

          if (renameField) {
            fields.rename = renameField;
          }
        }

        fileChanges.push({
          fileId: match.fileId,
          filename: match.filename,
          matchedIssue: {
            source: issueSource.source,
            sourceId: String(match.issue.id),
            number: getIssueNumber(match.issue),
            title: getIssueTitle(match.issue),
            coverDate: match.issue.cover_date,
          },
          matchConfidence: match.confidence,
          fields,
          status: 'matched',
        });
      }
    } else if (pendingMatches.length > 0) {
      // Non-ComicVine source (Metron, etc.) - use cached data directly
      for (const match of pendingMatches) {
        const fullIssue = issueMap.get(match.issue.id) || match.issue;
        const classificationOptions: ComicClassificationOptions = {
          filename: match.filename,
          pageCount: match.pageCount,
        };

        const { fields, proposedMetadata } = await metronIssueToFieldChanges(
          match.fileId,
          fullIssue as Parameters<typeof metronIssueToFieldChanges>[1],
          metadataSource,
          classificationOptions
        );

        // Generate rename preview if we have library context
        // Use complete proposedMetadata (not just changed fields) for accurate preview
        if (session.libraryId && match.filePath) {
          const renameField = await generateRenameField(proposedMetadata, {
            libraryId: session.libraryId,
            filePath: match.filePath,
            series: {
              name: metadataSource.name,
              publisher: metadataSource.publisher ?? undefined,
              startYear: metadataSource.startYear,
              issueCount: metadataSource.issueCount,
            },
          });

          if (renameField) {
            fields.rename = renameField;
          }
        }

        fileChanges.push({
          fileId: match.fileId,
          filename: match.filename,
          matchedIssue: {
            source: issueSource.source,
            sourceId: String(match.issue.id),
            number: getIssueNumber(match.issue),
            title: getIssueTitle(match.issue),
            coverDate: match.issue.cover_date,
          },
          matchConfidence: match.confidence,
          fields,
          status: 'matched',
        });
      }
    }

    progress(
      `Series "${group.displayName}" complete`,
      `${matchedCount} matched, ${unmatchedCount} unmatched`
    );
  }

  const totalMatched = fileChanges.filter((f) => f.status === 'matched').length;
  const totalUnmatched = fileChanges.filter((f) => f.status === 'unmatched').length;
  progress(
    'File matching complete',
    `${totalMatched} matched, ${totalUnmatched} unmatched out of ${fileChanges.length} files`
  );

  session.fileChanges = fileChanges;
  setSession(session);
}

// =============================================================================
// File Review Actions
// =============================================================================

/**
 * Get available issues for manual selection for a file
 */
export async function getAvailableIssuesForFile(
  sessionId: string,
  fileId: string
): Promise<{
  seriesName: string;
  source: MetadataSource;
  sourceId: string;
  issues: CachedIssuesData['issues'];
  totalCount: number;
  currentMatchedIssueId: string | null;
}> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const fileChange = session.fileChanges.find((fc) => fc.fileId === fileId);
  if (!fileChange) throw new Error('File not found in session');

  const seriesGroup = session.seriesGroups.find((g) => g.fileIds.includes(fileId));
  if (!seriesGroup) throw new Error('Series group not found for file');

  const issueSource = seriesGroup.issueMatchingSeries || seriesGroup.selectedSeries;
  if (!issueSource) throw new Error('No series selected for this group');

  const cachedIssues = await SeriesCache.getOrFetchIssues(issueSource.source, issueSource.sourceId);

  if (!cachedIssues) {
    return {
      seriesName: issueSource.name,
      source: issueSource.source,
      sourceId: issueSource.sourceId,
      issues: [],
      totalCount: 0,
      currentMatchedIssueId: fileChange.matchedIssue?.sourceId || null,
    };
  }

  return {
    seriesName: issueSource.name,
    source: issueSource.source,
    sourceId: issueSource.sourceId,
    issues: cachedIssues.issues,
    totalCount: cachedIssues.issues.length,
    currentMatchedIssueId: fileChange.matchedIssue?.sourceId || null,
  };
}

/**
 * Manually select an issue for a file
 */
export async function manualSelectIssue(
  sessionId: string,
  fileId: string,
  issueSource: MetadataSource,
  issueId: string
): Promise<FileChange> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const fileChange = session.fileChanges.find((fc) => fc.fileId === fileId);
  if (!fileChange) throw new Error('File not found in session');

  // Fetch full issue details
  const issue = await comicVine.getIssue(parseInt(issueId, 10));
  if (!issue) throw new Error('Issue not found');

  const seriesGroup = session.seriesGroups.find(
    (g) => g.selectedSeries?.source === issueSource && g.fileIds.includes(fileId)
  );

  if (!seriesGroup?.selectedSeries) {
    throw new Error('Series not found for this file');
  }

  fileChange.matchedIssue = {
    source: issueSource,
    sourceId: issueId,
    number: issue.issue_number,
    title: issue.name,
    coverDate: issue.cover_date,
  };
  fileChange.matchConfidence = 1.0;
  const { fields } = await issueToFieldChanges(fileId, issue, seriesGroup.selectedSeries);
  fileChange.fields = fields;
  fileChange.status = 'manual';

  session.updatedAt = new Date();
  setSession(session);

  return fileChange;
}

/**
 * Update field approvals for a file
 */
export function updateFieldApprovals(
  sessionId: string,
  fileId: string,
  fieldUpdates: Record<string, { approved?: boolean; editedValue?: string | number }>
): FileChange {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const fileChange = session.fileChanges.find((fc) => fc.fileId === fileId);
  if (!fileChange) throw new Error('File not found in session');

  for (const [field, update] of Object.entries(fieldUpdates)) {
    const fieldChange = fileChange.fields[field];
    if (fieldChange) {
      if (update.approved !== undefined) {
        fieldChange.approved = update.approved;
      }
      if (update.editedValue !== undefined) {
        fieldChange.edited = true;
        fieldChange.editedValue = update.editedValue;
      }
    }
  }

  session.updatedAt = new Date();
  setSession(session);

  return fileChange;
}

/**
 * Reject an entire file (no changes will be applied)
 */
export function rejectFile(sessionId: string, fileId: string): FileChange {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const fileChange = session.fileChanges.find((fc) => fc.fileId === fileId);
  if (!fileChange) throw new Error('File not found in session');

  fileChange.status = 'rejected';
  session.updatedAt = new Date();
  setSession(session);

  return fileChange;
}

/**
 * Accept all files (mark all as approved)
 */
export function acceptAllFiles(sessionId: string): void {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  for (const fileChange of session.fileChanges) {
    if (fileChange.status === 'rejected') {
      fileChange.status = fileChange.matchedIssue ? 'matched' : 'unmatched';
    }
    for (const field of Object.values(fileChange.fields)) {
      field.approved = true;
    }
  }

  session.updatedAt = new Date();
  setSession(session);
}

/**
 * Reject all files
 */
export function rejectAllFiles(sessionId: string): void {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  for (const fileChange of session.fileChanges) {
    fileChange.status = 'rejected';
  }

  session.updatedAt = new Date();
  setSession(session);
}

/**
 * Move a file from one series group to another
 *
 * This allows users to correct grouping mistakes during the approval workflow.
 * The file will be re-matched against the target series' issues.
 */
export async function moveFileToSeriesGroup(
  sessionId: string,
  fileId: string,
  targetSeriesGroupIndex: number
): Promise<FileChange> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  // Find the source series group
  const sourceGroupIndex = session.seriesGroups.findIndex((g) => g.fileIds.includes(fileId));
  if (sourceGroupIndex === -1) throw new Error('File not found in any series group');

  // Validate target group
  if (targetSeriesGroupIndex < 0 || targetSeriesGroupIndex >= session.seriesGroups.length) {
    throw new Error('Invalid target series group index');
  }
  if (targetSeriesGroupIndex === sourceGroupIndex) {
    throw new Error('File is already in this series group');
  }

  const sourceGroup = session.seriesGroups[sourceGroupIndex]!;
  const targetGroup = session.seriesGroups[targetSeriesGroupIndex]!;

  // Get the file's index in the source group
  const fileIndex = sourceGroup.fileIds.indexOf(fileId);
  const filename = sourceGroup.filenames[fileIndex]!;
  const parsedData = sourceGroup.parsedFiles[fileId];

  // Remove from source group
  sourceGroup.fileIds.splice(fileIndex, 1);
  sourceGroup.filenames.splice(fileIndex, 1);
  delete sourceGroup.parsedFiles[fileId];

  // Add to target group
  targetGroup.fileIds.push(fileId);
  targetGroup.filenames.push(filename);
  if (parsedData) {
    targetGroup.parsedFiles[fileId] = parsedData;
  }

  // Find and update the file change
  const fileChangeIndex = session.fileChanges.findIndex((fc) => fc.fileId === fileId);

  // If target group has a selected series, re-match the file
  if (targetGroup.status === 'approved' && targetGroup.selectedSeries) {
    const issueSource = targetGroup.issueMatchingSeries || targetGroup.selectedSeries;
    const metadataSource = targetGroup.selectedSeries;

    // Check if this is a manga source
    if (isMangaSource(metadataSource.source)) {
      // Manga handling - use chapter number from filename
      const chapterNumber = parsedData?.number || parseFilenameToQuery(filename).issueNumber;

      if (chapterNumber) {
        const { fields } = await mangaChapterToFieldChanges(fileId, chapterNumber, metadataSource, {
          filename,
          pageCount: 0,
        });

        const newFileChange: FileChange = {
          fileId,
          filename,
          matchedIssue: {
            source: metadataSource.source,
            sourceId: `chapter-${chapterNumber}`,
            number: chapterNumber,
            title: undefined,
            coverDate: undefined,
          },
          matchConfidence: 0.9,
          fields,
          status: 'matched',
        };

        if (fileChangeIndex !== -1) {
          session.fileChanges[fileChangeIndex] = newFileChange;
        } else {
          session.fileChanges.push(newFileChange);
        }

        session.updatedAt = new Date();
        setSession(session);
        return newFileChange;
      }
    } else {
      // Western comics - match against cached issues
      const cachedIssues = await SeriesCache.getOrFetchIssues(issueSource.source, issueSource.sourceId);

      if (cachedIssues && cachedIssues.issues.length > 0) {
        const { issue, confidence } = matchFileToIssue(filename, cachedIssues.issues, parsedData);

        if (issue && confidence >= 0.5) {
          // Get full issue details for ComicVine
          let fullIssue = issue;
          if (issueSource.source === 'comicvine') {
            try {
              const fetchedIssue = await comicVine.getIssue(issue.id);
              if (fetchedIssue) fullIssue = fetchedIssue as typeof issue;
            } catch {
              // Use cached issue if fetch fails
            }
          }

          const result = issueSource.source === 'comicvine'
            ? await issueToFieldChanges(fileId, fullIssue as comicVine.ComicVineIssue, metadataSource)
            : await metronIssueToFieldChanges(
                fileId,
                fullIssue as Parameters<typeof metronIssueToFieldChanges>[1],
                metadataSource
              );

          const newFileChange: FileChange = {
            fileId,
            filename,
            matchedIssue: {
              source: issueSource.source,
              sourceId: String(issue.id),
              number: getIssueNumber(issue),
              title: getIssueTitle(issue),
              coverDate: issue.cover_date,
            },
            matchConfidence: confidence,
            fields: result.fields,
            status: 'matched',
          };

          if (fileChangeIndex !== -1) {
            session.fileChanges[fileChangeIndex] = newFileChange;
          } else {
            session.fileChanges.push(newFileChange);
          }

          session.updatedAt = new Date();
          setSession(session);
          return newFileChange;
        }
      }
    }

    // No match found - mark as unmatched in new group
    const newFileChange: FileChange = {
      fileId,
      filename,
      matchedIssue: null,
      matchConfidence: 0,
      fields: {},
      status: 'unmatched',
    };

    if (fileChangeIndex !== -1) {
      session.fileChanges[fileChangeIndex] = newFileChange;
    } else {
      session.fileChanges.push(newFileChange);
    }

    session.updatedAt = new Date();
    setSession(session);
    return newFileChange;
  }

  // Target group not approved yet - mark file as pending (will be matched when group is approved)
  const pendingFileChange: FileChange = {
    fileId,
    filename,
    matchedIssue: null,
    matchConfidence: 0,
    fields: {},
    status: 'unmatched',
  };

  if (fileChangeIndex !== -1) {
    session.fileChanges[fileChangeIndex] = pendingFileChange;
  } else {
    session.fileChanges.push(pendingFileChange);
  }

  session.updatedAt = new Date();
  setSession(session);
  return pendingFileChange;
}

/**
 * Regenerate the rename preview for a file based on updated field values.
 *
 * This is used when the user edits fields that affect the rename template (like title, number, etc.)
 * and we need to re-calculate what the new filename would be.
 */
export async function regenerateRenamePreview(
  sessionId: string,
  fileId: string,
  fieldValues: Record<string, string | number | null>
): Promise<import('./types.js').FieldChange | null> {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const fileChange = session.fileChanges.find((fc) => fc.fileId === fileId);
  if (!fileChange) throw new Error('File not found in session');

  const seriesGroup = session.seriesGroups.find((g) => g.fileIds.includes(fileId));
  if (!seriesGroup?.selectedSeries) {
    return null; // No series context for rename
  }

  const prisma = getDatabase();
  const file = await prisma.comicFile.findUnique({
    where: { id: fileId },
    select: { path: true, libraryId: true },
  });

  if (!file || !session.libraryId) {
    return null;
  }

  // Build proposed metadata by merging current field values with the new edits
  // Start with existing fields from the fileChange
  const proposedMetadata: Record<string, string | number | null> = {};

  for (const [key, fieldData] of Object.entries(fileChange.fields)) {
    if (key === 'rename') continue; // Skip rename field itself

    // Use editedValue if edited, otherwise proposed, otherwise current
    if (fieldData.edited && fieldData.editedValue !== undefined) {
      proposedMetadata[key] = fieldData.editedValue;
    } else if (fieldData.proposed !== null && fieldData.proposed !== undefined) {
      proposedMetadata[key] = fieldData.proposed;
    } else {
      proposedMetadata[key] = fieldData.current;
    }
  }

  // Apply the new field values on top
  for (const [key, value] of Object.entries(fieldValues)) {
    proposedMetadata[key] = value;
  }

  // Generate rename preview using the updated metadata
  const renameField = await generateRenameField(proposedMetadata, {
    libraryId: session.libraryId,
    filePath: file.path,
    series: {
      name: seriesGroup.selectedSeries.name,
      publisher: seriesGroup.selectedSeries.publisher ?? undefined,
      startYear: seriesGroup.selectedSeries.startYear,
      issueCount: seriesGroup.selectedSeries.issueCount,
    },
  });

  // Update the session with the new rename field if it changed
  if (renameField) {
    fileChange.fields.rename = renameField;
    session.updatedAt = new Date();
    setSession(session);
  } else if (fileChange.fields.rename) {
    // No rename needed anymore - remove the field
    delete fileChange.fields.rename;
    session.updatedAt = new Date();
    setSession(session);
  }

  return renameField;
}
