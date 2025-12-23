/**
 * Metadata Fetch Logger Service
 *
 * Tracks and logs the metadata retrieval process with detailed step-by-step
 * progress information. Provides visibility into:
 * - What API calls are going out
 * - What responses are received
 * - Progress through the retrieval steps
 *
 * Steps in the metadata fetch process:
 * 1. PARSING - Parse filename to extract search query
 * 2. SEARCHING - Query external sources (ComicVine, Metron)
 * 3. SCORING - Calculate confidence scores for matches
 * 4. ORGANIZING - Sort and select best matches
 * 5. FETCHING - Fetch full metadata from selected source
 * 6. APPLYING - Write metadata to file
 */

import { EventEmitter } from 'events';
import { LRUCache } from './lru-cache.service.js';

// =============================================================================
// Types
// =============================================================================

export type MetadataFetchStep =
  | 'parsing'
  | 'searching'
  | 'scoring'
  | 'organizing'
  | 'fetching'
  | 'applying'
  | 'complete'
  | 'error';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface MetadataFetchLogEntry {
  timestamp: Date;
  sessionId: string;
  step: MetadataFetchStep;
  level: LogLevel;
  message: string;
  details?: Record<string, unknown>;
  /** Progress within the current step (0-100) */
  stepProgress?: number;
  /** Overall progress (0-100) */
  overallProgress?: number;
  /** Duration of the step in ms (when step completes) */
  duration?: number;
}

export interface MetadataFetchSession {
  id: string;
  fileId?: string;
  filename?: string;
  startedAt: Date;
  completedAt?: Date;
  currentStep: MetadataFetchStep;
  status: 'in_progress' | 'completed' | 'error';
  logs: MetadataFetchLogEntry[];
  /** Summary of what was done */
  summary?: {
    filesParsed: number;
    sourcesSearched: string[];
    resultsFound: number;
    bestMatchConfidence?: number;
    appliedSource?: string;
    errors: string[];
  };
}

export interface APICallLog {
  source: 'comicvine' | 'metron' | 'gcd' | 'anthropic' | 'anilist' | 'mal' | 'jikan';
  endpoint: string;
  method: string;
  params?: Record<string, string>;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'pending' | 'success' | 'error' | 'rate_limited';
  responseSize?: number;
  resultCount?: number;
  error?: string;
  retryCount?: number;
}

// =============================================================================
// Step Weights for Progress Calculation
// =============================================================================

const STEP_WEIGHTS: Record<MetadataFetchStep, number> = {
  parsing: 5,
  searching: 40,
  scoring: 10,
  organizing: 5,
  fetching: 30,
  applying: 10,
  complete: 0,
  error: 0,
};

const STEP_ORDER: MetadataFetchStep[] = [
  'parsing',
  'searching',
  'scoring',
  'organizing',
  'fetching',
  'applying',
  'complete',
];

// =============================================================================
// Logger Class
// =============================================================================

class MetadataFetchLoggerClass extends EventEmitter {
  // LRU caches with bounded size and automatic expiration
  private sessions = new LRUCache<MetadataFetchSession>({
    maxSize: 200, // Max 200 logging sessions
    defaultTTL: 30 * 60 * 1000, // 30 minutes
  });
  private apiCalls = new LRUCache<APICallLog[]>({
    maxSize: 200, // Max 200 API call logs
    defaultTTL: 30 * 60 * 1000, // 30 minutes
  });
  private maxSessionAge = 30 * 60 * 1000; // 30 minutes (for reference)

  /**
   * Create a new logging session for a metadata fetch operation.
   */
  createSession(options: { fileId?: string; filename?: string } = {}): string {
    const sessionId = `mf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const session: MetadataFetchSession = {
      id: sessionId,
      fileId: options.fileId,
      filename: options.filename,
      startedAt: new Date(),
      currentStep: 'parsing',
      status: 'in_progress',
      logs: [],
      summary: {
        filesParsed: 0,
        sourcesSearched: [],
        resultsFound: 0,
        errors: [],
      },
    };

    this.sessions.set(sessionId, session);
    this.apiCalls.set(sessionId, []);

    this.log(sessionId, 'info', 'parsing', 'Starting metadata fetch session', {
      fileId: options.fileId,
      filename: options.filename,
    });

    // Clean up old sessions periodically
    this.cleanupOldSessions();

    return sessionId;
  }

  /**
   * Log a message for a session.
   */
  log(
    sessionId: string,
    level: LogLevel,
    step: MetadataFetchStep,
    message: string,
    details?: Record<string, unknown>
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Update current step if different
    if (step !== session.currentStep && step !== 'error') {
      session.currentStep = step;
    }

    const entry: MetadataFetchLogEntry = {
      timestamp: new Date(),
      sessionId,
      step,
      level,
      message,
      details,
      overallProgress: this.calculateOverallProgress(session, step),
    };

    session.logs.push(entry);

    // Emit event for real-time listeners
    this.emit('log', entry);
    this.emit(`log:${sessionId}`, entry);

    // Also emit step change events
    if (step !== session.currentStep) {
      this.emit('stepChange', { sessionId, step, previousStep: session.currentStep });
    }
  }

  /**
   * Log the start of an API call.
   */
  logAPICallStart(
    sessionId: string,
    source: 'comicvine' | 'metron' | 'gcd' | 'anthropic' | 'anilist' | 'mal' | 'jikan',
    endpoint: string,
    params?: Record<string, string>
  ): string {
    const callId = `api_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const apiCall: APICallLog = {
      source,
      endpoint,
      method: 'GET',
      params,
      startTime: new Date(),
      status: 'pending',
      retryCount: 0,
    };

    const calls = this.apiCalls.get(sessionId) || [];
    calls.push(apiCall);
    this.apiCalls.set(sessionId, calls);

    // Build a clean URL for display (without API key)
    const cleanParams = { ...params };
    delete cleanParams.api_key;
    const paramStr = Object.entries(cleanParams)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    this.log(sessionId, 'debug', 'searching', `API Call: ${source.toUpperCase()} ${endpoint}`, {
      source,
      endpoint,
      params: cleanParams,
      url: `${endpoint}${paramStr ? '?' + paramStr : ''}`,
    });

    this.emit('apiCall', { sessionId, callId, apiCall });

    return callId;
  }

  /**
   * Log the completion of an API call.
   */
  logAPICallEnd(
    sessionId: string,
    source: 'comicvine' | 'metron' | 'gcd' | 'anthropic' | 'anilist' | 'mal' | 'jikan',
    endpoint: string,
    result: {
      success: boolean;
      resultCount?: number;
      error?: string;
      retried?: boolean;
    }
  ): void {
    const calls = this.apiCalls.get(sessionId);
    if (!calls) return;

    // Find the matching pending call
    const call = [...calls].reverse().find(
      (c) => c.source === source && c.endpoint === endpoint && c.status === 'pending'
    );

    if (call) {
      call.endTime = new Date();
      call.duration = call.endTime.getTime() - call.startTime.getTime();
      call.status = result.success ? 'success' : result.error?.includes('Rate limit') ? 'rate_limited' : 'error';
      call.resultCount = result.resultCount;
      call.error = result.error;
      if (result.retried) {
        call.retryCount = (call.retryCount || 0) + 1;
      }
    }

    const session = this.sessions.get(sessionId);
    if (session?.summary && result.success) {
      if (!session.summary.sourcesSearched.includes(source)) {
        session.summary.sourcesSearched.push(source);
      }
      session.summary.resultsFound += result.resultCount || 0;
    }

    if (result.success) {
      this.log(sessionId, 'info', 'searching', `API Response: ${source.toUpperCase()} returned ${result.resultCount || 0} results`, {
        source,
        endpoint,
        resultCount: result.resultCount,
        duration: call?.duration,
      });
    } else {
      this.log(sessionId, 'warn', 'searching', `API Error: ${source.toUpperCase()} - ${result.error}`, {
        source,
        endpoint,
        error: result.error,
        duration: call?.duration,
      });
    }

    this.emit('apiCallComplete', { sessionId, call });
  }

  /**
   * Log parsing step.
   */
  logParsing(
    sessionId: string,
    filename: string,
    result: { series?: string; issueNumber?: string; year?: number; publisher?: string }
  ): void {
    const session = this.sessions.get(sessionId);
    if (session?.summary) {
      session.summary.filesParsed++;
    }

    this.log(sessionId, 'info', 'parsing', `Parsed filename: "${filename}"`, {
      filename,
      extractedQuery: result,
      success: !!result.series,
    });
  }

  /**
   * Log scoring step.
   */
  logScoring(
    sessionId: string,
    matchCount: number,
    topScore: number,
    source: string
  ): void {
    const session = this.sessions.get(sessionId);
    if (session?.summary) {
      session.summary.bestMatchConfidence = topScore;
    }

    this.log(sessionId, 'info', 'scoring', `Scored ${matchCount} results. Best match: ${(topScore * 100).toFixed(1)}% (${source})`, {
      matchCount,
      topScore,
      topScorePercent: `${(topScore * 100).toFixed(1)}%`,
      source,
    });
  }

  /**
   * Log organizing step.
   */
  logOrganizing(
    sessionId: string,
    totalResults: number,
    issueMatches: number,
    seriesMatches: number
  ): void {
    this.log(sessionId, 'info', 'organizing', `Organized ${totalResults} results: ${issueMatches} issues, ${seriesMatches} series`, {
      totalResults,
      issueMatches,
      seriesMatches,
    });
  }

  /**
   * Log fetching full metadata.
   */
  logFetching(
    sessionId: string,
    source: string,
    sourceId: string,
    type: 'issue' | 'series'
  ): void {
    this.log(sessionId, 'info', 'fetching', `Fetching full ${type} metadata from ${source.toUpperCase()} (ID: ${sourceId})`, {
      source,
      sourceId,
      type,
    });
  }

  /**
   * Log applying metadata.
   */
  logApplying(
    sessionId: string,
    fileId: string,
    source: string,
    fieldsApplied: string[]
  ): void {
    const session = this.sessions.get(sessionId);
    if (session?.summary) {
      session.summary.appliedSource = source;
    }

    this.log(sessionId, 'info', 'applying', `Applied metadata from ${source.toUpperCase()} to file`, {
      fileId,
      source,
      fieldsApplied,
      fieldCount: fieldsApplied.length,
    });
  }

  /**
   * Complete a session successfully.
   */
  completeSession(sessionId: string, summary?: Partial<MetadataFetchSession['summary']>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'completed';
    session.completedAt = new Date();
    session.currentStep = 'complete';

    if (summary) {
      session.summary = { ...session.summary!, ...summary };
    }

    const duration = session.completedAt.getTime() - session.startedAt.getTime();

    this.log(sessionId, 'info', 'complete', `Metadata fetch completed in ${duration}ms`, {
      duration,
      summary: session.summary,
    });

    this.emit('sessionComplete', { sessionId, session });
  }

  /**
   * Mark a session as errored.
   */
  errorSession(sessionId: string, error: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'error';
    session.completedAt = new Date();

    if (session.summary) {
      session.summary.errors.push(error);
    }

    this.log(sessionId, 'error', 'error', `Metadata fetch failed: ${error}`, {
      error,
    });

    this.emit('sessionError', { sessionId, error });
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): MetadataFetchSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get API calls for a session.
   */
  getAPICalls(sessionId: string): APICallLog[] {
    return this.apiCalls.get(sessionId) || [];
  }

  /**
   * Get all active sessions.
   */
  getActiveSessions(): MetadataFetchSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === 'in_progress');
  }

  /**
   * Get recent sessions.
   */
  getRecentSessions(limit: number = 20): MetadataFetchSession[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Calculate overall progress percentage.
   */
  private calculateOverallProgress(session: MetadataFetchSession, currentStep: MetadataFetchStep): number {
    const stepIndex = STEP_ORDER.indexOf(currentStep);
    if (stepIndex === -1) return 0;

    // Sum weights of completed steps
    let progress = 0;
    for (let i = 0; i < stepIndex; i++) {
      progress += STEP_WEIGHTS[STEP_ORDER[i]!]!;
    }

    return Math.min(100, progress);
  }

  /**
   * Clean up old sessions to prevent memory leaks.
   */
  private cleanupOldSessions(): void {
    const cutoff = Date.now() - this.maxSessionAge;

    const sessionsToDelete: string[] = [];
    this.sessions.forEach((session, sessionId) => {
      if (session.startedAt.getTime() < cutoff && session.status !== 'in_progress') {
        sessionsToDelete.push(sessionId);
      }
    });

    for (const sessionId of sessionsToDelete) {
      this.sessions.delete(sessionId);
      this.apiCalls.delete(sessionId);
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const MetadataFetchLogger = new MetadataFetchLoggerClass();

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a log entry for display.
 */
export function formatLogEntry(entry: MetadataFetchLogEntry): string {
  const time = entry.timestamp.toISOString().slice(11, 23);
  const step = entry.step.toUpperCase().padEnd(10);
  const level = entry.level.toUpperCase().padEnd(5);

  return `[${time}] [${step}] [${level}] ${entry.message}`;
}

/**
 * Get step display name.
 */
export function getStepDisplayName(step: MetadataFetchStep): string {
  const names: Record<MetadataFetchStep, string> = {
    parsing: 'Parsing Filename',
    searching: 'Searching Sources',
    scoring: 'Scoring Results',
    organizing: 'Organizing Matches',
    fetching: 'Fetching Metadata',
    applying: 'Applying to File',
    complete: 'Complete',
    error: 'Error',
  };
  return names[step];
}

/**
 * Get step number (1-based).
 */
export function getStepNumber(step: MetadataFetchStep): number {
  const index = STEP_ORDER.indexOf(step);
  return index === -1 ? 0 : index + 1;
}

/**
 * Get total number of steps.
 */
export function getTotalSteps(): number {
  return STEP_ORDER.length - 1; // Exclude 'complete'
}
