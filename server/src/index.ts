import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';

// Services
import { ensureAppDirectories, getAllPaths } from './services/app-paths.service.js';
import {
  initializeConfig,
  loadConfig,
  updateConfig,
  setApiKey,
  getApiKey,
  updateMetadataSettings,
  updateCacheSettings,
  getMangaClassificationSettings,
  updateMangaClassificationSettings,
  getComicClassificationSettings,
  updateComicClassificationSettings,
} from './services/config.service.js';
import { checkApiAvailability as checkMetronAvailability } from './services/metron.service.js';
import { checkApiAvailability as checkComicVineAvailability } from './services/comicvine.service.js';
import {
  initializeDatabase,
  closeDatabase,
  getDatabaseStats,
} from './services/database.service.js';

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

// Services for startup tasks
import { markInterruptedBatches } from './services/batch.service.js';
import { cleanupOldOperationLogs } from './services/rollback.service.js';
import { recoverInterruptedJobs } from './services/job-queue.service.js';
import { cleanupExpiredJobs } from './services/metadata-job.service.js';
import { initializeScanQueue } from './services/library-scan-queue.service.js';
import { cleanupOldScanJobs } from './services/library-scan-job.service.js';
import { startStatsScheduler, stopStatsScheduler } from './services/stats-scheduler.service.js';
import { ensureBundledPresets } from './services/reader-preset.service.js';
import { runDownloadCleanup } from './services/download.service.js';

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
app.use(express.json());
app.use(cookieParser());

// =============================================================================
// API Routes
// =============================================================================

// Health check endpoint
app.get('/api/health', async (_req, res) => {
  try {
    const stats = await getDatabaseStats();
    res.json({
      status: 'ok',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      database: stats,
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
  // Don't expose API keys in the response
  const safeConfig = {
    ...config,
    apiKeys: {
      comicVine: config.apiKeys.comicVine ? '***configured***' : undefined,
      anthropic: config.apiKeys.anthropic ? '***configured***' : undefined,
    },
  };
  res.json(safeConfig);
});

// Get API keys (actual values for settings UI - this is a local app)
app.get('/api/config/api-keys', (_req, res) => {
  const config = loadConfig();
  res.json({
    comicVine: config.apiKeys.comicVine || '',
    anthropic: config.apiKeys.anthropic || '',
    metronUsername: config.apiKeys.metronUsername || '',
    metronPassword: config.apiKeys.metronPassword || '',
  });
});

// Update API keys
app.put('/api/config/api-keys', (req, res) => {
  try {
    const { comicVine, anthropic, metronUsername, metronPassword } = req.body as {
      comicVine?: string;
      anthropic?: string;
      metronUsername?: string;
      metronPassword?: string;
    };

    if (comicVine !== undefined) {
      setApiKey('comicVine', comicVine);
    }
    if (anthropic !== undefined) {
      setApiKey('anthropic', anthropic);
    }
    if (metronUsername !== undefined) {
      setApiKey('metronUsername', metronUsername);
    }
    if (metronPassword !== undefined) {
      setApiKey('metronPassword', metronPassword);
    }

    res.json({ success: true, message: 'API keys updated' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Test Metron credentials
app.post('/api/config/test-metron', async (_req, res) => {
  try {
    const result = await checkMetronAvailability();
    if (result.available) {
      res.json({ success: true, message: 'Metron credentials are valid' });
    } else {
      res.status(401).json({ success: false, error: result.error || 'Authentication failed' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// Test ComicVine API key
app.post('/api/config/test-comicvine', async (_req, res) => {
  try {
    const result = await checkComicVineAvailability();
    if (result.available) {
      res.json({ success: true, message: 'ComicVine API key is valid' });
    } else {
      res.status(401).json({ success: false, error: result.error || 'API key validation failed' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// Test Anthropic API key
app.post('/api/config/test-anthropic', async (_req, res) => {
  try {
    const apiKey = getApiKey('anthropic');
    if (!apiKey) {
      res.status(401).json({ success: false, error: 'API key not configured' });
      return;
    }

    // Make a minimal test request to Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
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
app.put('/api/config/metadata', (req, res) => {
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
app.put('/api/config/cache', (req, res) => {
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
app.put('/api/config/settings', (req, res) => {
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
app.put('/api/config/manga-classification', (req, res) => {
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
app.put('/api/config/comic-classification', (req, res) => {
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

// Update full config
app.put('/api/config', (req, res) => {
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
    console.log('Initializing application directories...');
    ensureAppDirectories();

    // Initialize configuration
    console.log('Loading configuration...');
    const config = initializeConfig();
    console.log(`Configuration loaded (version ${config.version})`);

    // Initialize database
    console.log('Connecting to database...');
    await initializeDatabase();

    // Ensure bundled reader presets exist (Western, Manga, Webtoon)
    console.log('Initializing reader presets...');
    await ensureBundledPresets();

    // Startup tasks
    console.log('Running startup tasks...');
    const interruptedBatches = await markInterruptedBatches();
    if (interruptedBatches > 0) {
      console.log(`Found ${interruptedBatches} interrupted batch(es) - marked as paused`);
    }

    const cleanedLogs = await cleanupOldOperationLogs();
    if (cleanedLogs > 0) {
      console.log(`Cleaned up ${cleanedLogs} old operation log(s)`);
    }

    // Clean up expired metadata jobs before recovering interrupted ones
    await cleanupExpiredJobs();

    // Recover interrupted metadata jobs
    await recoverInterruptedJobs();

    // Initialize library scan queue and recover interrupted scans
    await initializeScanQueue();
    await cleanupOldScanJobs();

    // Clean up expired/stale download jobs
    const downloadCleanup = await runDownloadCleanup();
    if (downloadCleanup.expired + downloadCleanup.stale + downloadCleanup.orphaned > 0) {
      console.log(`Cleaned up downloads: ${downloadCleanup.expired} expired, ${downloadCleanup.stale} stale, ${downloadCleanup.orphaned} orphaned`);
    }

    // Schedule hourly download cleanup
    setInterval(async () => {
      try {
        await runDownloadCleanup();
      } catch (err) {
        console.error('Error during scheduled download cleanup:', err);
      }
    }, 60 * 60 * 1000); // Every hour

    // Start stats scheduler for background stat computation
    startStatsScheduler();

    // Get initial stats
    const stats = await getDatabaseStats();

    // Start HTTP server
    const server = app.listen(PORT, () => {
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

      // Open browser in development mode
      if (process.env.NODE_ENV !== 'production' && process.env.NO_OPEN !== 'true') {
        setTimeout(() => {
          open(CLIENT_URL).catch(() => {
            console.log(`Open ${CLIENT_URL} in your browser to access the application.`);
          });
        }, 2000);
      }
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);

      // Stop stats scheduler
      stopStatsScheduler();

      server.close(async () => {
        console.log('HTTP server closed');
        await closeDatabase();
        console.log('Goodbye!');
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;
