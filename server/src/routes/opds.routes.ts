/**
 * OPDS Routes
 *
 * Provides OPDS catalog feeds for third-party comic readers.
 * Compatible with apps like Chunky, Panels, Librera, etc.
 */

import { Router, Request, Response } from 'express';
import * as opdsService from '../services/opds.service.js';
import { opdsAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Apply OPDS authentication to all routes
router.use(opdsAuth);

/**
 * Helper to get base URL for OPDS links
 */
function getBaseUrl(req: Request): string {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${protocol}://${host}`;
}

/**
 * Send XML response with proper content type
 */
function sendXml(res: Response, xml: string, type: string = 'application/atom+xml'): void {
  res.set('Content-Type', `${type}; charset=utf-8`);
  res.send(xml);
}

// =============================================================================
// Catalog Navigation
// =============================================================================

/**
 * Root catalog feed
 * GET /opds
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const baseUrl = getBaseUrl(req);
    const xml = await opdsService.generateRootFeed(baseUrl);
    sendXml(res, xml);
  } catch (error) {
    console.error('OPDS root feed error:', error);
    res.status(500).send('Failed to generate catalog');
  }
});

/**
 * OpenSearch description
 * GET /opds/search.xml
 */
router.get('/search.xml', (req: Request, res: Response) => {
  try {
    const baseUrl = getBaseUrl(req);
    const xml = opdsService.generateOpenSearchDescription(baseUrl);
    sendXml(res, xml, 'application/opensearchdescription+xml');
  } catch (error) {
    console.error('OPDS search description error:', error);
    res.status(500).send('Failed to generate search description');
  }
});

/**
 * Search results feed
 * GET /opds/search?q=query
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string) || 1;

    if (!query.trim()) {
      res.status(400).send('Search query required');
      return;
    }

    const baseUrl = getBaseUrl(req);
    const xml = await opdsService.generateSearchFeed(baseUrl, query, page);
    sendXml(res, xml);
  } catch (error) {
    console.error('OPDS search error:', error);
    res.status(500).send('Search failed');
  }
});

// =============================================================================
// Acquisition Feeds
// =============================================================================

/**
 * All comics feed
 * GET /opds/all
 */
router.get('/all', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const baseUrl = getBaseUrl(req);
    const xml = await opdsService.generateAllComicsFeed(baseUrl, page);
    sendXml(res, xml);
  } catch (error) {
    console.error('OPDS all feed error:', error);
    res.status(500).send('Failed to generate feed');
  }
});

/**
 * Recently added feed
 * GET /opds/recent
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const baseUrl = getBaseUrl(req);
    const xml = await opdsService.generateRecentFeed(baseUrl, limit);
    sendXml(res, xml);
  } catch (error) {
    console.error('OPDS recent feed error:', error);
    res.status(500).send('Failed to generate feed');
  }
});

// =============================================================================
// Series Navigation
// =============================================================================

/**
 * Series list feed
 * GET /opds/series
 */
router.get('/series', async (req: Request, res: Response) => {
  try {
    const baseUrl = getBaseUrl(req);
    const xml = await opdsService.generateSeriesListFeed(baseUrl);
    sendXml(res, xml);
  } catch (error) {
    console.error('OPDS series list error:', error);
    res.status(500).send('Failed to generate feed');
  }
});

/**
 * Series comics feed
 * GET /opds/series/:series
 */
router.get('/series/:series', async (req: Request, res: Response) => {
  try {
    const series = req.params.series;
    if (!series) {
      res.status(400).send('Series parameter required');
      return;
    }
    const baseUrl = getBaseUrl(req);
    const xml = await opdsService.generateSeriesFeed(baseUrl, decodeURIComponent(series));
    sendXml(res, xml);
  } catch (error) {
    console.error('OPDS series feed error:', error);
    res.status(500).send('Failed to generate feed');
  }
});

// =============================================================================
// Publisher Navigation
// =============================================================================

/**
 * Publisher list feed
 * GET /opds/publishers
 */
router.get('/publishers', async (req: Request, res: Response) => {
  try {
    const baseUrl = getBaseUrl(req);
    const xml = await opdsService.generatePublisherListFeed(baseUrl);
    sendXml(res, xml);
  } catch (error) {
    console.error('OPDS publisher list error:', error);
    res.status(500).send('Failed to generate feed');
  }
});

/**
 * Publisher comics feed
 * GET /opds/publishers/:publisher
 */
router.get('/publishers/:publisher', async (req: Request, res: Response) => {
  try {
    const publisher = req.params.publisher;
    if (!publisher) {
      res.status(400).send('Publisher parameter required');
      return;
    }
    const baseUrl = getBaseUrl(req);
    const xml = await opdsService.generatePublisherFeed(baseUrl, decodeURIComponent(publisher));
    sendXml(res, xml);
  } catch (error) {
    console.error('OPDS publisher feed error:', error);
    res.status(500).send('Failed to generate feed');
  }
});

// =============================================================================
// Library Navigation
// =============================================================================

/**
 * Library comics feed
 * GET /opds/library/:libraryId
 */
router.get('/library/:libraryId', async (req: Request, res: Response) => {
  try {
    const libraryId = req.params.libraryId;
    if (!libraryId) {
      res.status(400).send('Library ID required');
      return;
    }
    const page = parseInt(req.query.page as string) || 1;
    const baseUrl = getBaseUrl(req);
    const xml = await opdsService.generateLibraryFeed(baseUrl, libraryId, page);
    sendXml(res, xml);
  } catch (error) {
    console.error('OPDS library feed error:', error);
    if (error instanceof Error && error.message === 'Library not found') {
      res.status(404).send('Library not found');
    } else {
      res.status(500).send('Failed to generate feed');
    }
  }
});

export default router;
