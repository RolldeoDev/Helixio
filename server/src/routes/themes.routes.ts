/**
 * Theme Routes
 * Handles external theme loading, import, export, and hot reload via SSE
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import chokidar, { FSWatcher } from 'chokidar';
import multer, { FileFilterCallback } from 'multer';
import JSZip from 'jszip';

const router = Router();

// Themes directory path
const THEMES_DIR = path.join(os.homedir(), '.helixio', 'themes');

// In-memory store for enabled/disabled state
const themeStates: Map<string, boolean> = new Map();

// SSE clients for hot reload
const sseClients: Set<Response> = new Set();

// File watcher instance
let watcher: FSWatcher | null = null;

// Configure multer for zip uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
  ) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are allowed'));
    }
  },
});

// Ensure themes directory exists
function ensureThemesDir(): void {
  if (!fs.existsSync(THEMES_DIR)) {
    fs.mkdirSync(THEMES_DIR, { recursive: true });
  }
}

// Parse theme metadata from CSS comments or JSON file
interface ThemeMetadata {
  id: string;
  name: string;
  description: string;
  scheme: 'light' | 'dark';
  author?: string;
}

function parseThemeMetadata(themeId: string): ThemeMetadata {
  // Check for JSON metadata file first
  const jsonPath = path.join(THEMES_DIR, `${themeId}.json`);
  if (fs.existsSync(jsonPath)) {
    try {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        id: themeId,
        name: parsed.name || themeId,
        description: parsed.description || '',
        scheme: parsed.scheme || 'dark',
        author: parsed.author,
      };
    } catch {
      // Fall through to CSS parsing
    }
  }

  // Parse from CSS comments
  const cssPath = path.join(THEMES_DIR, `${themeId}.css`);
  if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, 'utf-8');
    const nameMatch = css.match(/@theme-name:\s*(.+)/i) || css.match(/Theme:\s*(.+)/i);
    const descMatch = css.match(/@theme-description:\s*(.+)/i);
    const schemeMatch = css.match(/@theme-scheme:\s*(light|dark)/i) || css.match(/Scheme:\s*(light|dark)/i);
    const authorMatch = css.match(/@theme-author:\s*(.+)/i);

    return {
      id: themeId,
      name: nameMatch?.[1]?.trim() || themeId,
      description: descMatch?.[1]?.trim() || '',
      scheme: (schemeMatch?.[1]?.toLowerCase() as 'light' | 'dark') || 'dark',
      author: authorMatch?.[1]?.trim(),
    };
  }

  return {
    id: themeId,
    name: themeId,
    description: '',
    scheme: 'dark',
  };
}

// Load all external themes
interface ExternalTheme extends ThemeMetadata {
  css: string;
  enabled: boolean;
  filePath: string;
}

function loadAllThemes(): ExternalTheme[] {
  ensureThemesDir();

  const themes: ExternalTheme[] = [];
  const cssFiles = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith('.css'));

  for (const file of cssFiles) {
    const themeId = path.basename(file, '.css');
    const cssPath = path.join(THEMES_DIR, file);
    const css = fs.readFileSync(cssPath, 'utf-8');
    const metadata = parseThemeMetadata(themeId);

    themes.push({
      ...metadata,
      css,
      enabled: themeStates.get(themeId) ?? true,
      filePath: cssPath,
    });
  }

  return themes;
}

// Broadcast theme updates to all SSE clients
function broadcastThemeUpdate(): void {
  const themes = loadAllThemes();
  const data = JSON.stringify(themes);

  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Initialize file watcher
function initWatcher(): void {
  if (watcher) return;

  ensureThemesDir();

  watcher = chokidar.watch(THEMES_DIR, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  watcher.on('all', (event, filePath) => {
    if (filePath.endsWith('.css') || filePath.endsWith('.json')) {
      console.log(`Theme file ${event}: ${path.basename(filePath)}`);
      broadcastThemeUpdate();
    }
  });

  console.log(`Watching for theme changes in ${THEMES_DIR}`);
}

// Start watcher on first request
router.use((_req, _res, next) => {
  if (!watcher) {
    initWatcher();
  }
  next();
});

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/themes/external
 * List all external themes
 */
router.get('/external', (_req, res) => {
  try {
    const themes = loadAllThemes();
    res.json(themes);
  } catch (err) {
    console.error('Failed to load themes:', err);
    res.status(500).json({ error: 'Failed to load themes' });
  }
});

/**
 * GET /api/themes/watch
 * Server-Sent Events for theme hot reload
 */
router.get('/watch', (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial themes
  try {
    const themes = loadAllThemes();
    res.write(`data: ${JSON.stringify(themes)}\n\n`);
  } catch {
    res.write(`data: []\n\n`);
  }

  // Add client to set
  sseClients.add(res);

  // Keep connection alive
  const keepAlive = setInterval(() => {
    try {
      res.write(':keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 30000);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

/**
 * DELETE /api/themes/external/:themeId
 * Delete an external theme
 */
router.delete('/external/:themeId', (req, res): void => {
  try {
    const { themeId } = req.params;
    const cssPath = path.join(THEMES_DIR, `${themeId}.css`);
    const jsonPath = path.join(THEMES_DIR, `${themeId}.json`);

    if (!fs.existsSync(cssPath)) {
      res.status(404).json({ error: 'Theme not found' });
      return;
    }

    // Delete CSS file
    fs.unlinkSync(cssPath);

    // Delete JSON metadata if exists
    if (fs.existsSync(jsonPath)) {
      fs.unlinkSync(jsonPath);
    }

    // Remove from state map
    themeStates.delete(themeId);

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete theme:', err);
    res.status(500).json({ error: 'Failed to delete theme' });
  }
});

/**
 * POST /api/themes/import
 * Import a theme from a zip file
 */
router.post('/import', upload.single('theme'), async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const zip = await JSZip.loadAsync(file.buffer);

    // Look for theme.json and theme.css
    const metadataFile = zip.file('theme.json');
    const cssFile = zip.file('theme.css');

    if (!metadataFile || !cssFile) {
      res.status(400).json({ error: 'Invalid theme package: missing theme.json or theme.css' });
      return;
    }

    // Parse metadata
    const metadataContent = await metadataFile.async('string');
    const metadata = JSON.parse(metadataContent);

    if (!metadata.id || !metadata.name) {
      res.status(400).json({ error: 'Invalid theme package: missing required metadata' });
      return;
    }

    // Sanitize theme ID (alphanumeric and dashes only)
    const safeId = metadata.id.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

    // Parse CSS
    const css = await cssFile.async('string');

    // Ensure directory exists
    ensureThemesDir();

    // Write files
    fs.writeFileSync(path.join(THEMES_DIR, `${safeId}.json`), JSON.stringify(metadata, null, 2));
    fs.writeFileSync(path.join(THEMES_DIR, `${safeId}.css`), css);

    // Enable by default
    themeStates.set(safeId, true);

    res.json({ success: true, themeId: safeId });
  } catch (err) {
    console.error('Failed to import theme:', err);
    res.status(500).json({ error: 'Failed to import theme' });
  }
});

/**
 * PATCH /api/themes/external/:themeId/enable
 * Enable an external theme
 */
router.patch('/external/:themeId/enable', (req, res) => {
  const { themeId } = req.params;
  themeStates.set(themeId, true);
  broadcastThemeUpdate();
  res.json({ success: true });
});

/**
 * PATCH /api/themes/external/:themeId/disable
 * Disable an external theme
 */
router.patch('/external/:themeId/disable', (req, res) => {
  const { themeId } = req.params;
  themeStates.set(themeId, false);
  broadcastThemeUpdate();
  res.json({ success: true });
});

export default router;
