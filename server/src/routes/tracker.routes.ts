/**
 * Tracker Routes
 *
 * Handles integration with external tracking services (AniList, MyAnimeList).
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import * as trackerService from '../services/tracker.service.js';
import { logError } from '../services/logger.service.js';

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

// =============================================================================
// Configuration
// =============================================================================

// These would typically come from environment variables
const TRACKER_CONFIGS: Record<trackerService.TrackerService, trackerService.TrackerConfig | null> = {
  anilist: process.env.ANILIST_CLIENT_ID
    ? {
        clientId: process.env.ANILIST_CLIENT_ID,
        clientSecret: process.env.ANILIST_CLIENT_SECRET,
        redirectUri: process.env.ANILIST_REDIRECT_URI || 'http://localhost:3000/settings/trackers/anilist/callback',
      }
    : null,
  myanimelist: process.env.MAL_CLIENT_ID
    ? {
        clientId: process.env.MAL_CLIENT_ID,
        clientSecret: process.env.MAL_CLIENT_SECRET,
        redirectUri: process.env.MAL_REDIRECT_URI || 'http://localhost:3000/settings/trackers/mal/callback',
      }
    : null,
  kitsu: null, // Not implemented yet
};

// =============================================================================
// Status & Configuration
// =============================================================================

/**
 * Get tracker configuration status
 * GET /api/trackers
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const trackers = await Promise.all(
      (['anilist', 'myanimelist'] as trackerService.TrackerService[]).map(async (service) => {
        const config = TRACKER_CONFIGS[service];
        const token = await trackerService.getTrackerToken(userId, service);

        return {
          service,
          configured: !!config,
          connected: !!token,
          expiresAt: token?.expiresAt,
        };
      })
    );

    res.json({ trackers });
  } catch (error) {
    logError('tracker', error, { action: 'get-trackers' });
    res.status(500).json({ error: 'Failed to get tracker status' });
  }
});

// =============================================================================
// AniList
// =============================================================================

/**
 * Get AniList auth URL
 * GET /api/trackers/anilist/auth
 */
router.get('/anilist/auth', async (_req: Request, res: Response) => {
  try {
    const config = TRACKER_CONFIGS.anilist;
    if (!config) {
      res.status(400).json({ error: 'AniList not configured' });
      return;
    }

    const url = await trackerService.anilistGetAuthUrl(config);
    res.json({ url });
  } catch (error) {
    logError('tracker', error, { action: 'anilist-auth-url' });
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

/**
 * Exchange AniList auth code for token
 * POST /api/trackers/anilist/callback
 */
router.post('/anilist/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const config = TRACKER_CONFIGS.anilist;

    if (!config) {
      res.status(400).json({ error: 'AniList not configured' });
      return;
    }

    if (!code) {
      res.status(400).json({ error: 'Authorization code required' });
      return;
    }

    const token = await trackerService.anilistExchangeCode(code, config);
    const user = await trackerService.anilistGetUser(token.accessToken);

    await trackerService.saveTrackerToken(req.user!.id, 'anilist', token);

    res.json({
      success: true,
      user,
      expiresAt: token.expiresAt,
    });
  } catch (error) {
    logError('tracker', error, { action: 'anilist-callback' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to connect AniList',
    });
  }
});

/**
 * Disconnect AniList
 * DELETE /api/trackers/anilist
 */
router.delete('/anilist', async (req: Request, res: Response) => {
  try {
    await trackerService.deleteTrackerToken(req.user!.id, 'anilist');
    res.json({ success: true });
  } catch (error) {
    logError('tracker', error, { action: 'anilist-disconnect' });
    res.status(500).json({ error: 'Failed to disconnect AniList' });
  }
});

/**
 * Search AniList manga
 * GET /api/trackers/anilist/search?q=query
 */
router.get('/anilist/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: 'Search query required' });
      return;
    }

    const token = await trackerService.getTrackerToken(req.user!.id, 'anilist');
    if (!token) {
      res.status(401).json({ error: 'AniList not connected' });
      return;
    }

    const results = await trackerService.anilistSearchManga(query, token.accessToken);
    res.json({ results });
  } catch (error) {
    logError('tracker', error, { action: 'anilist-search' });
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Get AniList entry for manga
 * GET /api/trackers/anilist/manga/:mangaId
 */
router.get('/anilist/manga/:mangaId', async (req: Request, res: Response) => {
  try {
    const mangaId = req.params.mangaId;
    if (!mangaId) {
      res.status(400).json({ error: 'Manga ID required' });
      return;
    }
    const token = await trackerService.getTrackerToken(req.user!.id, 'anilist');
    if (!token) {
      res.status(401).json({ error: 'AniList not connected' });
      return;
    }

    const entry = await trackerService.anilistGetEntry(mangaId, token.accessToken);
    res.json({ entry });
  } catch (error) {
    logError('tracker', error, { action: 'anilist-get-entry' });
    res.status(500).json({ error: 'Failed to get entry' });
  }
});

/**
 * Update AniList entry
 * PATCH /api/trackers/anilist/manga/:mangaId
 */
router.patch('/anilist/manga/:mangaId', async (req: Request, res: Response) => {
  try {
    const mangaId = req.params.mangaId;
    if (!mangaId) {
      res.status(400).json({ error: 'Manga ID required' });
      return;
    }

    const token = await trackerService.getTrackerToken(req.user!.id, 'anilist');
    if (!token) {
      res.status(401).json({ error: 'AniList not connected' });
      return;
    }

    const entry = await trackerService.anilistUpdateEntry(
      mangaId,
      req.body,
      token.accessToken
    );

    res.json({ entry });
  } catch (error) {
    logError('tracker', error, { action: 'anilist-update-entry' });
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// =============================================================================
// MyAnimeList
// =============================================================================

/**
 * Get MAL auth URL
 * GET /api/trackers/mal/auth
 */
router.get('/mal/auth', async (_req: Request, res: Response) => {
  try {
    const config = TRACKER_CONFIGS.myanimelist;
    if (!config) {
      res.status(400).json({ error: 'MyAnimeList not configured' });
      return;
    }

    const url = await trackerService.malGetAuthUrl(config);
    res.json({ url });
  } catch (error) {
    logError('tracker', error, { action: 'mal-auth-url' });
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

/**
 * Exchange MAL auth code for token
 * POST /api/trackers/mal/callback
 */
router.post('/mal/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.body; // state contains code_verifier
    const config = TRACKER_CONFIGS.myanimelist;

    if (!config) {
      res.status(400).json({ error: 'MyAnimeList not configured' });
      return;
    }

    if (!code || !state) {
      res.status(400).json({ error: 'Authorization code and state required' });
      return;
    }

    const token = await trackerService.malExchangeCode(code, state, config);
    const user = await trackerService.malGetUser(token.accessToken);

    await trackerService.saveTrackerToken(req.user!.id, 'myanimelist', token);

    res.json({
      success: true,
      user,
      expiresAt: token.expiresAt,
    });
  } catch (error) {
    logError('tracker', error, { action: 'mal-callback' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to connect MyAnimeList',
    });
  }
});

/**
 * Disconnect MAL
 * DELETE /api/trackers/mal
 */
router.delete('/mal', async (req: Request, res: Response) => {
  try {
    await trackerService.deleteTrackerToken(req.user!.id, 'myanimelist');
    res.json({ success: true });
  } catch (error) {
    logError('tracker', error, { action: 'mal-disconnect' });
    res.status(500).json({ error: 'Failed to disconnect MyAnimeList' });
  }
});

/**
 * Search MAL manga
 * GET /api/trackers/mal/search?q=query
 */
router.get('/mal/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: 'Search query required' });
      return;
    }

    const token = await trackerService.getTrackerToken(req.user!.id, 'myanimelist');
    if (!token) {
      res.status(401).json({ error: 'MyAnimeList not connected' });
      return;
    }

    const results = await trackerService.malSearchManga(query, token.accessToken);
    res.json({ results });
  } catch (error) {
    logError('tracker', error, { action: 'mal-search' });
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Get MAL entry for manga
 * GET /api/trackers/mal/manga/:mangaId
 */
router.get('/mal/manga/:mangaId', async (req: Request, res: Response) => {
  try {
    const mangaId = req.params.mangaId;
    if (!mangaId) {
      res.status(400).json({ error: 'Manga ID required' });
      return;
    }

    const token = await trackerService.getTrackerToken(req.user!.id, 'myanimelist');
    if (!token) {
      res.status(401).json({ error: 'MyAnimeList not connected' });
      return;
    }

    const entry = await trackerService.malGetEntry(mangaId, token.accessToken);
    res.json({ entry });
  } catch (error) {
    logError('tracker', error, { action: 'mal-get-entry' });
    res.status(500).json({ error: 'Failed to get entry' });
  }
});

/**
 * Update MAL entry
 * PATCH /api/trackers/mal/manga/:mangaId
 */
router.patch('/mal/manga/:mangaId', async (req: Request, res: Response) => {
  try {
    const mangaId = req.params.mangaId;
    if (!mangaId) {
      res.status(400).json({ error: 'Manga ID required' });
      return;
    }

    const token = await trackerService.getTrackerToken(req.user!.id, 'myanimelist');
    if (!token) {
      res.status(401).json({ error: 'MyAnimeList not connected' });
      return;
    }

    const entry = await trackerService.malUpdateEntry(
      mangaId,
      req.body,
      token.accessToken
    );

    res.json({ entry });
  } catch (error) {
    logError('tracker', error, { action: 'mal-update-entry' });
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// =============================================================================
// Series Mappings
// =============================================================================

/**
 * Get tracker mapping for a series
 * GET /api/trackers/mapping/:series
 */
router.get('/mapping/:series', async (req: Request, res: Response) => {
  try {
    const seriesParam = req.params.series;
    if (!seriesParam) {
      res.status(400).json({ error: 'Series parameter required' });
      return;
    }
    const series = decodeURIComponent(seriesParam);
    const service = req.query.service as trackerService.TrackerService;

    if (!service || !['anilist', 'myanimelist'].includes(service)) {
      res.status(400).json({ error: 'Valid service required (anilist or myanimelist)' });
      return;
    }

    const mapping = await trackerService.getTrackerMapping(series, service);
    res.json({ mapping });
  } catch (error) {
    logError('tracker', error, { action: 'get-mapping' });
    res.status(500).json({ error: 'Failed to get mapping' });
  }
});

/**
 * Set tracker mapping for a series
 * PUT /api/trackers/mapping/:series
 */
router.put('/mapping/:series', async (req: Request, res: Response) => {
  try {
    const seriesParam = req.params.series;
    if (!seriesParam) {
      res.status(400).json({ error: 'Series parameter required' });
      return;
    }
    const series = decodeURIComponent(seriesParam);
    const { service, externalId, externalTitle } = req.body;

    if (!service || !['anilist', 'myanimelist'].includes(service)) {
      res.status(400).json({ error: 'Valid service required (anilist or myanimelist)' });
      return;
    }

    if (!externalId) {
      res.status(400).json({ error: 'External ID required' });
      return;
    }

    await trackerService.setTrackerMapping(series, service, externalId, externalTitle);
    res.json({ success: true });
  } catch (error) {
    logError('tracker', error, { action: 'set-mapping' });
    res.status(500).json({ error: 'Failed to set mapping' });
  }
});

/**
 * Delete tracker mapping for a series
 * DELETE /api/trackers/mapping/:series
 */
router.delete('/mapping/:series', async (req: Request, res: Response) => {
  try {
    const seriesParam = req.params.series;
    if (!seriesParam) {
      res.status(400).json({ error: 'Series parameter required' });
      return;
    }
    const series = decodeURIComponent(seriesParam);
    const service = req.query.service as trackerService.TrackerService;

    if (!service || !['anilist', 'myanimelist'].includes(service)) {
      res.status(400).json({ error: 'Valid service required (anilist or myanimelist)' });
      return;
    }

    await trackerService.deleteTrackerMapping(series, service);
    res.json({ success: true });
  } catch (error) {
    logError('tracker', error, { action: 'delete-mapping' });
    res.status(500).json({ error: 'Failed to delete mapping' });
  }
});

export default router;
