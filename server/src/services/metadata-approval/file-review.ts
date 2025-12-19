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
import { issueToFieldChanges, metronIssueToFieldChanges } from './field-changes.js';
import type {
  ApprovalSession,
  FileChange,
  ProgressCallback,
  MetadataSource,
} from './types.js';

const logger = createServiceLogger('metadata-approval-file-review');

// =============================================================================
// File Change Preparation
// =============================================================================

/**
 * Prepare file changes after all series are approved
 *
 * Optimizations:
 * - Uses batch DB queries for file lookups instead of individual queries
 * - Uses cached issue data directly (with credits) instead of individual getIssue() calls
 *   This reduces API calls from N+2 to just 2 (paginated batch requests)
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

    // Get cached issues from the issue matching series
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

    progress(`Matching ${group.fileIds.length} files to issues`, 'Analyzing filenames...');

    for (let i = 0; i < group.fileIds.length; i++) {
      const fileId = group.fileIds[i]!;
      const filename = group.filenames[i]!;
      const parsedData = group.parsedFiles[fileId];

      const { issue, confidence } = matchFileToIssue(filename, cachedIssues.issues, parsedData);

      const parseSource = parsedData?.number ? 'parsed' : 'regex';
      const parsedNumber = parsedData?.number || parseFilenameToQuery(filename).issueNumber || '?';

      if (issue && confidence >= 0.5) {
        matchedCount++;
        const fullIssue = issueMap.get(issue.id) || issue;

        const fields =
          issueSource.source === 'comicvine'
            ? await issueToFieldChanges(
                fileId,
                fullIssue as comicVine.ComicVineIssue,
                metadataSource
              )
            : await metronIssueToFieldChanges(
                fileId,
                fullIssue as Parameters<typeof metronIssueToFieldChanges>[1],
                metadataSource
              );

        const confidencePercent = Math.round(confidence * 100);
        progress(
          `Matched: "${filename.length > 40 ? filename.slice(0, 40) + '...' : filename}"`,
          `-> Issue #${getIssueNumber(issue)} (${confidencePercent}% confidence, ${parseSource} #${parsedNumber})`
        );

        fileChanges.push({
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
          fields,
          status: 'matched',
        });
      } else {
        unmatchedCount++;
        let bestGuess: FileChange['matchedIssue'] = null;
        const bestConfidence = 0;

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
          matchConfidence: bestConfidence,
          fields: {},
          status: 'unmatched',
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
