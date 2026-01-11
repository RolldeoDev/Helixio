// Load environment variables FIRST, before any other imports
import './env.js';

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';

// Middleware
import { requireAdmin } from './middleware/auth.middleware.js';

// Services
import { ensureAppDirectories, getAllPaths } from './services/app-paths.service.js';
import {
  initializeConfig,
  loadConfig,
  updateConfig,
  setApiKey,
  getApiKey,
  getApiKeySource,
  isApiKeyReadOnly,
  updateMetadataSettings,
  updateCacheSettings,
  getMangaClassificationSettings,
  updateMangaClassificationSettings,
  getComicClassificationSettings,
  updateComicClassificationSettings,
  isFileRenamingEnabled,
  setFileRenamingEnabled,
  type ApiKeys,
} from './services/config.service.js';
import { checkApiAvailability as checkMetronAvailability } from './services/metron.service.js';
import { checkApiAvailability as checkComicVineAvailability } from './services/comicvine.service.js';
import {
  initializeDatabase,
  closeDatabase,
  getDatabaseStats,
  getDatabase,
} from './services/database.service.js';
import { initializeRedis, closeRedis, cacheService } from './services/cache/index.js';

// Routes
import libraryRoutes from './routes/library.routes.js';
import filesRoutes from './routes/files.routes.js';
import archiveRoutes from './routes/archive.routes.js';
import coversRoutes from './routes/covers.routes.js';
import metadataRoutes from './routes/metadata.routes.js';
import searchRoutes from './routes/search.routes.js';
import parsingRoutes from './routes/parsing.routes.js';
import batchRoutes from './routes/batch.routes.js';
import rollbackRoutes from './routes/rollback.routes.js';
import filesystemRoutes from './routes/filesystem.routes.js';
import metadataApprovalRoutes from './routes/metadata-approval.routes.js';
import metadataJobRoutes from './routes/metadata-job.routes.js';
import cacheRoutes from './routes/cache.routes.js';
import readingProgressRoutes from './routes/reading-progress.routes.js';
import readerSettingsRoutes from './routes/reader-settings.routes.js';
import readerPresetRoutes from './routes/reader-preset.routes.js';
import readingQueueRoutes from './routes/reading-queue.routes.js';
import readingHistoryRoutes from './routes/reading-history.routes.js';
import authRoutes from './routes/auth.routes.js';
import opdsRoutes from './routes/opds.routes.js';
import trackerRoutes from './routes/tracker.routes.js';
import syncRoutes from './routes/sync.routes.js';
import sharedListsRoutes from './routes/shared-lists.routes.js';
import recommendationsRoutes from './routes/recommendations.routes.js';
import seriesRoutes from './routes/series.routes.js';
import themesRoutes from './routes/themes.routes.js';
import statsRoutes from './routes/stats.routes.js';
import achievementsRoutes from './routes/achievements.routes.js';
import descriptionRoutes from './routes/description.routes.js';
import tagsRoutes from './routes/tags.routes.js';
import collectionsRoutes from './routes/collections.routes.js';
import libraryScanRoutes from './routes/library-scan.routes.js';
import factoryResetRoutes from './routes/factory-reset.routes.js';
import issueMetadataRoutes from './routes/issue-metadata.routes.js';
import downloadsRoutes from './routes/downloads.routes.js';
import globalSearchRoutes from './routes/global-search.routes.js';
import templatesRoutes from './routes/templates.routes.js';
import userDataRoutes from './routes/user-data.routes.js';
import externalRatingsRoutes from './routes/external-ratings.routes.js';
import externalReviewsRoutes from './routes/external-reviews.routes.js';
import filterPresetsRoutes from './routes/filter-presets.routes.js';
import apiKeysRoutes from './routes/api-keys.routes.js';
import jobsRoutes from './routes/jobs.routes.js';

// Services for startup tasks
import { markInterruptedBatches } from './services/batch.service.js';
import { cleanupOldOperationLogs } from './services/rollback.service.js';
import { recoverInterruptedJobs } from './services/job-queue.service.js';
import { cleanupExpiredJobs } from './services/metadata-job.service.js';
import { initializeScanQueue, shutdownScanQueue } from './services/library-scan-queue.service.js';
import { cleanupOldScanJobs } from './services/library-scan-job.service.js';
import { startStatsScheduler, stopStatsScheduler } from './services/stats-scheduler.service.js';
import { startSimilarityScheduler, stopSimilarityScheduler } from './services/similarity/index.js';
import { startSmartCollectionProcessor, stopSmartCollectionProcessor } from './services/smart-collection-dirty.service.js';
import { startRatingSyncScheduler, stopRatingSyncScheduler } from './services/rating-sync-scheduler.service.js';
import { startPageCacheScheduler, stopPageCacheScheduler } from './services/page-cache-scheduler.service.js';
import { ensureBundledPresets } from './services/reader-preset.service.js';
import { runDownloadCleanup } from './services/download.service.js';
import { startCoverWorker, stopCoverWorker, closeCoverQueue } from './services/queue/cover-worker.js';
import { initializeBullBoard, getBullBoardRouter } from './routes/bullboard.routes.js';
import { logger, logError } from './services/logger.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// =============================================================================
// Middleware
// =============================================================================

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

// HTTP compression for JSON responses (60-70% bandwidth reduction)
app.use(compression({
  threshold: 1024, // Only compress responses > 1KB
  level: 4, // Balanced speed vs compression (1-9)
  filter: (req, res) => {
    const type = res.getHeader('content-type') as string;
    // Compress JSON, text, XML, JavaScript, and SVG
    return /json|text|xml|javascript|svg/.test(type || '');
  },
}));

app.use(express.json());
app.use(cookieParser());

// Configure JSON serialization to handle BigInt values (e.g., file sizes > 2GB)
app.set('json replacer', (_key: string, value: unknown) => {
  if (typeof value === 'bigint') {
    // Convert to string to preserve precision for values > Number.MAX_SAFE_INTEGER
    return value.toString();
  }
  return value;
});

// =============================================================================
// API Routes
// =============================================================================

// Health check endpoint
app.get('/api/health', async (_req, res) => {
  try {
    const stats = await getDatabaseStats();
    const cacheHealth = cacheService.getHealth();
    const cacheStats = await cacheService.getStats();
    res.json({
      status: 'ok',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      database: stats,
      cache: {
        health: cacheHealth,
        stats: cacheStats,
      },
    });
  } catch {
    res.json({
      status: 'ok',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      database: null,
    });
  }
});

// Get application paths (for debugging)
app.get('/api/paths', (_req, res) => {
  res.json(getAllPaths());
});

// Get configuration (excluding API keys)
app.get('/api/config', (_req, res) => {
  const config = loadConfig();
  // Don't expose API keys in the response, but show sources
  const safeConfig = {
    ...config,
    apiKeys: {
      comicVine: getApiKey('comicVine') ? '***configured***' : undefined,
      anthropic: getApiKey('anthropic') ? '***configured***' : undefined,
      metronUsername: getApiKey('metronUsername') ? '***configured***' : undefined,
      metronPassword: getApiKey('metronPassword') ? '***configured***' : undefined,
      gcdEmail: getApiKey('gcdEmail') ? '***configured***' : undefined,
      gcdPassword: getApiKey('gcdPassword') ? '***configured***' : undefined,
    },
    // Show credential sources for debugging
    credentialSources: {
      comicVine: getApiKeySource('comicVine'),
      anthropic: getApiKeySource('anthropic'),
      metronUsername: getApiKeySource('metronUsername'),
      metronPassword: getApiKeySource('metronPassword'),
      gcdEmail: getApiKeySource('gcdEmail'),
      gcdPassword: getApiKeySource('gcdPassword'),
    },
  };
  res.json(safeConfig);
});

// Get API keys (actual values for settings UI)
// Requires admin auth - these are sensitive credentials
app.get('/api/config/api-keys', requireAdmin, (_req, res) => {
  const keys: (keyof ApiKeys)[] = [
    'comicVine',
    'anthropic',
    'metronUsername',
    'metronPassword',
    'gcdEmail',
    'gcdPassword',
  ];

  const result: Record<string, { value: string; source: string; readOnly: boolean }> = {};
  for (const key of keys) {
    result[key] = {
      value: getApiKey(key) || '',
      source: getApiKeySource(key),
      readOnly: isApiKeyReadOnly(key),
    };
  }

  res.json(result);
});

// Update API keys
// Requires admin auth. Keys set via environment variables cannot be overwritten.
app.put('/api/config/api-keys', requireAdmin, (req, res) => {
  try {
    const { comicVine, anthropic, metronUsername, metronPassword, gcdEmail, gcdPassword } =
      req.body as {
        comicVine?: string;
        anthropic?: string;
        metronUsername?: string;
        metronPassword?: string;
        gcdEmail?: string;
        gcdPassword?: string;
      };

    const updates: { key: keyof ApiKeys; value: string }[] = [];
    const skipped: string[] = [];

    // Helper to update key if not read-only
    const tryUpdate = (key: keyof ApiKeys, value: string | undefined) => {
      if (value === undefined) return;
      if (isApiKeyReadOnly(key)) {
        skipped.push(key);
      } else {
        setApiKey(key, value);
        updates.push({ key, value: value ? '***' : '' });
      }
    };

    tryUpdate('comicVine', comicVine);
    tryUpdate('anthropic', anthropic);
    tryUpdate('metronUsername', metronUsername);
    tryUpdate('metronPassword', metronPassword);
    tryUpdate('gcdEmail', gcdEmail);
    tryUpdate('gcdPassword', gcdPassword);

    if (skipped.length > 0) {
      res.json({
        success: true,
        message: `API keys updated. Note: ${skipped.join(', ')} were skipped because they are set via environment variables.`,
        updated: updates.map((u) => u.key),
        skipped,
      });
    } else {
      res.json({
        success: true,
        message: 'API keys updated',
        updated: updates.map((u) => u.key),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Test Metron credentials
// Accepts optional username/password in body to test unsaved credentials
app.post('/api/config/test-metron', async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };

    // Use provided credentials or fall back to saved config
    const testUsername = username || getApiKey('metronUsername');
    const testPassword = password || getApiKey('metronPassword');

    if (!testUsername || !testPassword) {
      res.status(401).json({ success: false, error: 'Username and password are required' });
      return;
    }

    // Make a direct test request to Metron API
    const authString = Buffer.from(`${testUsername}:${testPassword}`).toString('base64');
    const response = await fetch('https://metron.cloud/api/publisher/?page_size=1', {
      headers: {
        'Authorization': `Basic ${authString}`,
        'User-Agent': 'Helixio/0.1.0 (Comic Book Management Tool)',
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      res.json({ success: true, message: 'Metron credentials are valid' });
    } else if (response.status === 401) {
      res.status(401).json({ success: false, error: 'Invalid username or password' });
    } else {
      res.status(response.status).json({ success: false, error: `API returned status ${response.status}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// Test ComicVine API key
// Accepts optional apiKey in body to test unsaved credentials
app.post('/api/config/test-comicvine', async (req, res) => {
  try {
    const { apiKey } = req.body as { apiKey?: string };

    // Use provided API key or fall back to saved config
    const testApiKey = apiKey || getApiKey('comicVine');

    if (!testApiKey) {
      res.status(401).json({ success: false, error: 'API key is required' });
      return;
    }

    // Make a direct test request to ComicVine API
    const url = `https://comicvine.gamespot.com/api/publishers/?api_key=${testApiKey}&format=json&limit=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Helixio/0.1.0 (Comic Book Management Tool)',
      },
    });

    if (response.ok) {
      const data = await response.json() as { error?: string; status_code?: number };
      if (data.status_code === 1) {
        res.json({ success: true, message: 'ComicVine API key is valid' });
      } else {
        res.status(401).json({ success: false, error: data.error || 'API key validation failed' });
      }
    } else {
      res.status(response.status).json({ success: false, error: `API returned status ${response.status}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// Test Anthropic API key
// Accepts optional apiKey in body to test unsaved credentials
app.post('/api/config/test-anthropic', async (req, res) => {
  try {
    const { apiKey } = req.body as { apiKey?: string };

    // Use provided API key or fall back to saved config
    const testApiKey = apiKey || getApiKey('anthropic');

    if (!testApiKey) {
      res.status(401).json({ success: false, error: 'API key is required' });
      return;
    }

    // Make a minimal test request to Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': testApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      }),
    });

    if (response.ok) {
      res.json({ success: true, message: 'Anthropic API key is valid' });
    } else {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || 'API key validation failed';
      res.status(401).json({ success: false, error: errorMessage });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// Update metadata settings
app.put('/api/config/metadata', requireAdmin, (req, res) => {
  try {
    const { primarySource, rateLimitLevel } = req.body as {
      primarySource?: 'comicvine' | 'metron';
      rateLimitLevel?: number;
    };

    updateMetadataSettings({
      ...(primarySource && { primarySource }),
      ...(rateLimitLevel && { rateLimitLevel }),
    });

    res.json({ success: true, message: 'Metadata settings updated' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Update cache settings
app.put('/api/config/cache', requireAdmin, (req, res) => {
  try {
    const { coverCacheSizeMb } = req.body as { coverCacheSizeMb?: number };

    updateCacheSettings({
      ...(coverCacheSizeMb && { coverCacheSizeMb }),
    });

    res.json({ success: true, message: 'Cache settings updated' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Update general settings (from Settings UI)
app.put('/api/config/settings', requireAdmin, (req, res) => {
  try {
    const {
      metadataSourcePriority,
      rateLimitAggressiveness,
      coverCacheSizeMB,
      autoMatchThreshold,
      autoApplyHighConfidence,
    } = req.body as {
      metadataSourcePriority?: string[];
      rateLimitAggressiveness?: number;
      coverCacheSizeMB?: number;
      autoMatchThreshold?: number;
      autoApplyHighConfidence?: boolean;
    };

    // Update metadata settings
    updateMetadataSettings({
      ...(metadataSourcePriority && { sourcePriority: metadataSourcePriority as ('comicvine' | 'metron' | 'gcd' | 'anilist' | 'mal')[] }),
      ...(rateLimitAggressiveness !== undefined && { rateLimitLevel: rateLimitAggressiveness }),
      ...(autoMatchThreshold !== undefined && { autoMatchThreshold }),
      ...(autoApplyHighConfidence !== undefined && { autoApplyHighConfidence }),
    });

    // Update cache settings
    if (coverCacheSizeMB !== undefined) {
      updateCacheSettings({ coverCacheSizeMb: coverCacheSizeMB });
    }

    res.json({ success: true, message: 'Settings updated' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Get manga classification settings
app.get('/api/config/manga-classification', (_req, res) => {
  try {
    const settings = getMangaClassificationSettings();
    res.json(settings);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Update manga classification settings
app.put('/api/config/manga-classification', requireAdmin, (req, res) => {
  try {
    const { enabled, volumePageThreshold, filenameOverridesPageCount } = req.body as {
      enabled?: boolean;
      volumePageThreshold?: number;
      filenameOverridesPageCount?: boolean;
    };

    updateMangaClassificationSettings({
      ...(enabled !== undefined && { enabled }),
      ...(volumePageThreshold !== undefined && { volumePageThreshold }),
      ...(filenameOverridesPageCount !== undefined && { filenameOverridesPageCount }),
    });

    res.json({ success: true, message: 'Manga classification settings updated' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Get comic (Western) classification settings
app.get('/api/config/comic-classification', (_req, res) => {
  try {
    const settings = getComicClassificationSettings();
    res.json(settings);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Update comic (Western) classification settings
app.put('/api/config/comic-classification', requireAdmin, (req, res) => {
  try {
    const { enabled, issuePageThreshold, omnibusPageThreshold, filenameOverridesPageCount } = req.body as {
      enabled?: boolean;
      issuePageThreshold?: number;
      omnibusPageThreshold?: number;
      filenameOverridesPageCount?: boolean;
    };

    updateComicClassificationSettings({
      ...(enabled !== undefined && { enabled }),
      ...(issuePageThreshold !== undefined && { issuePageThreshold }),
      ...(omnibusPageThreshold !== undefined && { omnibusPageThreshold }),
      ...(filenameOverridesPageCount !== undefined && { filenameOverridesPageCount }),
    });

    res.json({ success: true, message: 'Comic classification settings updated' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Get file renaming enabled setting
app.get('/api/config/file-renaming', (_req, res) => {
  res.json({ enabled: isFileRenamingEnabled() });
});

// Update file renaming enabled setting
app.put('/api/config/file-renaming', requireAdmin, (req, res) => {
  try {
    const { enabled } = req.body as { enabled?: boolean };

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }

    setFileRenamingEnabled(enabled);

    res.json({
      success: true,
      message: `File renaming ${enabled ? 'enabled' : 'disabled'}`,
      enabled,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Update full config
app.put('/api/config', requireAdmin, (req, res) => {
  try {
    const updates = req.body;
    const updated = updateConfig(updates);

    // Return safe config (hide API keys)
    const safeConfig = {
      ...updated,
      apiKeys: {
        comicVine: updated.apiKeys.comicVine ? '***configured***' : undefined,
        anthropic: updated.apiKeys.anthropic ? '***configured***' : undefined,
      },
    };

    res.json(safeConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Register routes
app.use('/api/libraries', libraryRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/archives', archiveRoutes);
app.use('/api/covers', coversRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/search', globalSearchRoutes);  // Global search bar endpoint
app.use('/api/parsing', parsingRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/rollback', rollbackRoutes);
app.use('/api/filesystem', filesystemRoutes);
app.use('/api/metadata-approval', metadataApprovalRoutes);
app.use('/api/metadata-jobs', metadataJobRoutes);
app.use('/api/cache', cacheRoutes);
app.use('/api/reading-progress', readingProgressRoutes);
app.use('/api/reader-settings', readerSettingsRoutes);
app.use('/api/reader-presets', readerPresetRoutes);
app.use('/api/reading-queue', readingQueueRoutes);
app.use('/api/reading-history', readingHistoryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/trackers', trackerRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/lists', sharedListsRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/themes', themesRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/description', descriptionRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/libraries', libraryScanRoutes);  // Library scan routes (mounted on /api/libraries for /scan/full endpoints)
app.use('/api/factory-reset', factoryResetRoutes);
app.use('/api/files', issueMetadataRoutes);  // Issue metadata routes (mounted on /api/files for /:fileId/issue-metadata endpoints)
app.use('/api/downloads', downloadsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/user-data', userDataRoutes);
app.use('/api/external-ratings', externalRatingsRoutes);
app.use('/api/external-reviews', externalReviewsRoutes);
app.use('/api/filter-presets', filterPresetsRoutes);
app.use('/api/api-keys', apiKeysRoutes);
app.use('/api/jobs', jobsRoutes);

// BullBoard dashboard (admin only)
// Note: Initialized after queue workers start
app.use('/api/admin/queues', requireAdmin, getBullBoardRouter());

// OPDS routes (at root level, not under /api)
app.use('/opds', opdsRoutes);

// =============================================================================
// Static Files (Production)
// =============================================================================

if (process.env.NODE_ENV === 'production') {
  const clientDistPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDistPath));

  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// =============================================================================
// Server Startup
// =============================================================================

async function startServer(): Promise<void> {
  try {
    // Initialize application directories
    logger.info('Initializing application directories...');
    ensureAppDirectories();

    // Initialize configuration
    logger.info('Loading configuration...');
    const config = initializeConfig();
    logger.info({ version: config.version }, 'Configuration loaded');

    // Initialize database
    logger.info('Connecting to database...');
    await initializeDatabase();

    // Initialize Redis cache (L2)
    // This is non-blocking - if Redis fails, the app continues with L1 cache only
    logger.info('Initializing Redis cache...');
    await initializeRedis();

    // Ensure bundled reader presets exist (Western, Manga, Webtoon)
    logger.info('Initializing reader presets...');
    await ensureBundledPresets();

    // One-time migration: Apply Manga preset to existing manga libraries without reader settings
    try {
      const db = getDatabase();
      const mangaLibraries = await db.library.findMany({ where: { type: 'manga' } });
      const mangaPreset = await db.readerPreset.findFirst({
        where: { name: 'Manga', isBundled: true },
      });
      if (mangaPreset && mangaLibraries.length > 0) {
        const { applyPresetToLibrary } = await import('./services/reader-settings.service.js');
        const { extractSettingsFromPreset } = await import('./services/reader-preset.service.js');
        let migrated = 0;
        for (const lib of mangaLibraries) {
          const existingSettings = await db.libraryReaderSettings.findUnique({
            where: { libraryId: lib.id },
          });
          if (!existingSettings) {
            const settings = extractSettingsFromPreset(mangaPreset as Parameters<typeof extractSettingsFromPreset>[0]);
            await applyPresetToLibrary(lib.id, mangaPreset.id, mangaPreset.name, settings);
            migrated++;
          }
        }
        if (migrated > 0) {
          logger.info({ count: migrated }, 'Applied Manga preset to existing manga libraries');
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to migrate manga libraries to Manga preset');
    }

    // Startup tasks
    logger.info('Running startup tasks...');
    const interruptedBatches = await markInterruptedBatches();
    if (interruptedBatches > 0) {
      logger.info({ count: interruptedBatches }, 'Found interrupted batches - marked as paused');
    }

    const cleanedLogs = await cleanupOldOperationLogs();
    if (cleanedLogs > 0) {
      logger.info({ count: cleanedLogs }, 'Cleaned up old operation logs');
    }

    // Clean up expired metadata jobs before recovering interrupted ones
    await cleanupExpiredJobs();

    // Recover interrupted metadata jobs
    await recoverInterruptedJobs();

    // Start BullMQ workers
    logger.info('Starting BullMQ workers...');
    startCoverWorker();
    // Scan worker is started by initializeScanQueue()

    // Initialize library scan queue and recover interrupted scans
    await initializeScanQueue();
    await cleanupOldScanJobs();

    // Initialize BullBoard dashboard (after workers are started)
    initializeBullBoard();

    // Clean up expired/stale download jobs
    const downloadCleanup = await runDownloadCleanup();
    if (downloadCleanup.expired + downloadCleanup.stale + downloadCleanup.orphaned > 0) {
      logger.info({ expired: downloadCleanup.expired, stale: downloadCleanup.stale, orphaned: downloadCleanup.orphaned }, 'Cleaned up downloads');
    }

    // Schedule hourly download cleanup
    setInterval(async () => {
      try {
        await runDownloadCleanup();
      } catch (err) {
        logError('server', err, { action: 'scheduled-download-cleanup' });
      }
    }, 60 * 60 * 1000); // Every hour

    // Start stats scheduler for background stat computation
    startStatsScheduler();

    // Start similarity scheduler for recommendation engine
    startSimilarityScheduler();

    // Start rating sync scheduler for external ratings
    startRatingSyncScheduler();

    // Start page cache scheduler for cleaning expired page caches
    startPageCacheScheduler();

    // Start smart collection processor for auto-refreshing smart collections
    startSmartCollectionProcessor();

    // Queue mosaic generation for promoted collections with coverType='auto' and no coverHash
    // This runs after everything else so it doesn't delay startup
    setTimeout(async () => {
      try {
        const { scheduleMosaicRegeneration } = await import('./services/collection/index.js');
        const db = getDatabase();
        const collectionsNeedingMosaic = await db.collection.findMany({
          where: {
            isPromoted: true,
            coverType: 'auto',
            coverHash: null,
          },
          select: { id: true, name: true },
        });
        if (collectionsNeedingMosaic.length > 0) {
          logger.info({ count: collectionsNeedingMosaic.length }, 'Scheduling mosaic generation for collections');
          for (const collection of collectionsNeedingMosaic) {
            scheduleMosaicRegeneration(collection.id);
          }
        }
      } catch (err) {
        logError('server', err, { action: 'startup-mosaic-generation' });
      }
    }, 2000); // Delay 2s after startup

    // Backfill resolved covers for series that don't have them yet
    setTimeout(async () => {
      try {
        const { recalculateAllSeriesCovers } = await import('./services/cover.service.js');
        const db = getDatabase();

        // Check if any series need resolved covers
        const seriesWithoutResolvedCover = await db.series.count({
          where: {
            resolvedCoverSource: null,
          },
        });

        if (seriesWithoutResolvedCover > 0) {
          logger.info({ count: seriesWithoutResolvedCover }, 'Backfilling resolved covers for series');
          const result = await recalculateAllSeriesCovers();
          logger.info({ processed: result.processed, errors: result.errors }, 'Completed resolved cover backfill');
        }
      } catch (err) {
        logError('server', err, { action: 'startup-resolved-cover-backfill' });
      }
    }, 3000); // Delay 3s after startup

    // Get initial stats
    const stats = await getDatabaseStats();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info({ port: PORT, libraries: stats.libraries, files: stats.files }, 'Helixio server started');
      // Keep the visual banner for console visibility during development
      if (process.env.NODE_ENV !== 'production') {
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🗃️  Helixio - Comic Book Management                     ║
║                                                           ║
║   Server running at: http://localhost:${PORT}               ║
║   API endpoint:      http://localhost:${PORT}/api           ║
║                                                           ║
║   Database: ${stats.libraries} libraries, ${stats.files} files             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        `);
      }

      // Open browser in development mode
      if (process.env.NODE_ENV !== 'production' && process.env.NO_OPEN !== 'true') {
        setTimeout(() => {
          open(CLIENT_URL).catch(() => {
            logger.info({ url: CLIENT_URL }, 'Open in your browser to access the application');
          });
        }, 2000);
      }
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down gracefully...');

      // Stop stats scheduler
      stopStatsScheduler();

      // Stop similarity scheduler
      stopSimilarityScheduler();

      // Stop rating sync scheduler
      stopRatingSyncScheduler();

      // Stop page cache scheduler
      stopPageCacheScheduler();

      // Stop smart collection processor
      stopSmartCollectionProcessor();

      // Stop BullMQ workers and queues
      logger.info('Stopping BullMQ workers...');
      await stopCoverWorker();
      await closeCoverQueue();
      await shutdownScanQueue();
      logger.info('BullMQ workers stopped');

      server.close(async () => {
        logger.info('HTTP server closed');
        await closeRedis();
        await closeDatabase();
        logger.info('Goodbye!');
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logError('server', error, { action: 'startup' });
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;
