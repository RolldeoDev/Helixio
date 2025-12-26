/**
 * Logger Service
 *
 * Structured logging with Pino.
 * Replaces console.log/error throughout the codebase.
 *
 * Log Levels:
 * - fatal: Application crash
 * - error: Error conditions
 * - warn: Warning conditions
 * - info: Informational messages (default)
 * - debug: Debug information
 * - trace: Very detailed tracing
 */

import pino from 'pino';

// =============================================================================
// Configuration
// =============================================================================

const isDevelopment = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// =============================================================================
// Logger Instance
// =============================================================================

export const logger = pino({
  level: logLevel,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    app: 'helixio',
  },
});

// =============================================================================
// Child Loggers for Services
// =============================================================================

/**
 * Create a child logger with service context
 */
export function createServiceLogger(service: string) {
  return logger.child({ service });
}

// Pre-configured service loggers
export const archiveLogger = createServiceLogger('archive');
export const conversionLogger = createServiceLogger('conversion');
export const scannerLogger = createServiceLogger('scanner');
export const metadataLogger = createServiceLogger('metadata');
export const comicvineLogger = createServiceLogger('comicvine');
export const batchLogger = createServiceLogger('batch');
export const jobQueueLogger = createServiceLogger('job-queue');
export const scanQueueLogger = createServiceLogger('scan-queue');
export const readerLogger = createServiceLogger('reader');
export const configLogger = createServiceLogger('config');
export const databaseLogger = createServiceLogger('database');
export const downloadLogger = createServiceLogger('download');

// =============================================================================
// Express Middleware Logger
// =============================================================================

/**
 * Express request logging middleware
 */
export function requestLogger() {
  const httpLogger = createServiceLogger('http');

  return (req: { method: string; url: string; ip?: string }, res: { statusCode: number; on: (event: string, cb: () => void) => void }, next: () => void) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

      httpLogger[level]({
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration,
      }, `${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
    });

    next();
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Log an error with context
 */
export function logError(context: string, error: unknown, metadata?: Record<string, unknown>) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  logger.error({
    context,
    error: errorMessage,
    stack,
    ...metadata,
  }, `[${context}] ${errorMessage}`);
}

/**
 * Log a warning with context
 */
export function logWarn(context: string, message: string, metadata?: Record<string, unknown>) {
  logger.warn({
    context,
    ...metadata,
  }, `[${context}] ${message}`);
}

/**
 * Log info with context
 */
export function logInfo(context: string, message: string, metadata?: Record<string, unknown>) {
  logger.info({
    context,
    ...metadata,
  }, `[${context}] ${message}`);
}

/**
 * Log debug with context
 */
export function logDebug(context: string, message: string, metadata?: Record<string, unknown>) {
  logger.debug({
    context,
    ...metadata,
  }, `[${context}] ${message}`);
}

export default logger;
