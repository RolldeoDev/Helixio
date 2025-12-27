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
import { issueToFieldChanges, metronIssueToFieldChanges, mangaChapterToFieldChanges, type MangaChapterOptions, type ComicClassificationOptions } from './field-changes.js';
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

  // Fetch page counts for all files if classification is enabled
  let pageCountMap: Map<string, number> = new Map();
  if (classificationSettings.enabled) {
    const filesWithMetadata = await prisma.comicFile.findMany({
      where: { id: { in: group.fileIds } },
      select: { id: true, metadata: { select: { pageCount: true } } },
    });
    for (const file of filesWithMetadata) {
      if (file.metadata?.pageCount) {
        pageCountMap.set(file.id, file.metadata.pageCount);
      }
    }
  }

  for (let i = 0; i < group.fileIds.length; i++) {
    const fileId = group.fileIds[i]!;
    const filename = group.filenames[i]!;
    const parsedData = group.parsedFiles[fileId];

    // Get chapter number from parsed data or filename
    const chapterNumber = parsedData?.number || parseFilenameToQuery(filename).issueNumber;

    if (chapterNumber) {
      // Get page count for classification
      const pageCount = pageCountMap.get(fileId) || 0;

      // Pre-compute classification if enabled
      let classification: MangaClassificationResult | undefined;
      if (classificationSettings.enabled) {
        classification = classifyMangaFile(filename, pageCount, classificationSettings);
      }

      // Create field changes using series-level metadata + parsed chapter number
      const options: MangaChapterOptions = {
        classification,
        pageCount,
        filename,
      };

      const fields = await mangaChapterToFieldChanges(
        fileId,
        chapterNumber,
        metadataSource,
        options
      );

      // Determine display label based on classification
      const displayLabel = classification
        ? classification.displayTitle
        : `Chapter #${chapterNumber}`;

      progress(
        `Matched: "${filename.length > 40 ? filename.slice(0, 40) + '...' : filename}"`,
        `-> ${displayLabel} (parsed from filename)`
      );

      fileChanges.push({
        fileId,
        filename,
        matchedIssue: {
          source: metadataSource.source,
          sourceId: `chapter-${chapterNumber}`, // Virtual ID for chapter
          number: classification?.primaryNumber || chapterNumber,
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
        'No chapter number detected in filename'
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

    // Fetch page counts for all files if comic classification is enabled
    const comicClassificationSettings = getComicClassificationSettings();
    let pageCountMap: Map<string, number> = new Map();
    if (comicClassificationSettings.enabled) {
      const filesWithMetadata = await prisma.comicFile.findMany({
        where: { id: { in: group.fileIds } },
        select: { id: true, metadata: { select: { pageCount: true } } },
      });
      for (const file of filesWithMetadata) {
        if (file.metadata?.pageCount) {
          pageCountMap.set(file.id, file.metadata.pageCount);
        }
      }
    }

    progress(`Matching ${group.fileIds.length} files to issues`, 'Analyzing filenames...');

    // Phase 1: Match files to issues using cached data (fast)
    interface PendingMatch {
      fileId: string;
      filename: string;
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
        pendingMatches.push({
          fileId,
          filename,
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

        const fields = await issueToFieldChanges(
          match.fileId,
          fullIssue,
          metadataSource,
          classificationOptions
        );

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

        const fields = await metronIssueToFieldChanges(
          match.fileId,
          fullIssue as Parameters<typeof metronIssueToFieldChanges>[1],
          metadataSource,
          classificationOptions
        );

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
  fileChange.fields = await issueToFieldChanges(fileId, issue, seriesGroup.selectedSeries);
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
