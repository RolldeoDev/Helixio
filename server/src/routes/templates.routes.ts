/**
 * Filename Templates Routes
 *
 * API endpoints for filename template management:
 * - CRUD operations for templates
 * - Template validation and preview
 * - Active template management
 * - Token autocomplete data
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { logError, logInfo } from '../services/logger.service.js';
import {
  getTemplates,
  getTemplateById,
  getActiveTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setActiveTemplate,
  ensureDefaultTemplate,
  getTemplatesForLibrary,
  duplicateTemplate,
  resetToGlobalDefault,
} from '../services/template-manager.service.js';
import {
  validateTemplate,
  getAvailableTokens,
  getTokensByCategory,
} from '../services/template-parser.service.js';
import {
  previewTemplate,
  resolveTemplateString,
  createSampleContext,
  type ResolverContext,
} from '../services/template-resolver.service.js';
import { getDatabase } from '../services/database.service.js';

const router = Router();

// All template routes require authentication
router.use(requireAuth);

// =============================================================================
// Template CRUD
// =============================================================================

/**
 * GET /api/templates
 * Get all templates, optionally filtered by library
 *
 * Query params:
 *   - libraryId: Filter by library ID (use 'global' for global templates only)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { libraryId } = req.query;

    let templates;
    if (libraryId === 'global') {
      templates = await getTemplates(null);
    } else if (libraryId) {
      templates = await getTemplates(libraryId as string);
    } else {
      templates = await getTemplates();
    }

    res.json({ templates });
  } catch (error) {
    logError('templates.routes', error, { operation: 'getTemplates' });
    res.status(500).json({
      error: 'Failed to get templates',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/templates/tokens
 * Get available tokens for template autocomplete
 */
router.get('/tokens', async (_req: Request, res: Response) => {
  try {
    const tokens = getAvailableTokens();
    const byCategory = getTokensByCategory();

    res.json({
      tokens,
      byCategory,
    });
  } catch (error) {
    logError('templates.routes', error, { operation: 'getTokens' });
    res.status(500).json({
      error: 'Failed to get tokens',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/templates/active
 * Get the active template for a scope
 *
 * Query params:
 *   - libraryId: Get active template for library (falls back to global)
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const { libraryId } = req.query;

    const template = await getActiveTemplate(libraryId as string | undefined);

    if (!template) {
      // This shouldn't happen as ensureDefaultTemplate is called
      const defaultTemplate = await ensureDefaultTemplate();
      res.json({ template: defaultTemplate });
      return;
    }

    res.json({ template });
  } catch (error) {
    logError('templates.routes', error, { operation: 'getActiveTemplate' });
    res.status(500).json({
      error: 'Failed to get active template',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/templates/library/:libraryId
 * Get templates for a specific library, including inherited global templates
 */
router.get('/library/:libraryId', async (req: Request, res: Response) => {
  try {
    const { libraryId } = req.params;

    const result = await getTemplatesForLibrary(libraryId!);

    res.json(result);
  } catch (error) {
    logError('templates.routes', error, { operation: 'getTemplatesForLibrary' });
    res.status(500).json({
      error: 'Failed to get library templates',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/templates/:id
 * Get a template by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const template = await getTemplateById(id!);

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json({ template });
  } catch (error) {
    logError('templates.routes', error, { operation: 'getTemplateById' });
    res.status(500).json({
      error: 'Failed to get template',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/templates
 * Create a new template
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      libraryId,
      name,
      description,
      filePattern,
      folderSegments,
      characterRules,
      isActive,
      sortOrder,
    } = req.body;

    if (!name || !filePattern) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'name and filePattern are required',
      });
      return;
    }

    const template = await createTemplate({
      libraryId: libraryId || null,
      name,
      description,
      filePattern,
      folderSegments,
      characterRules,
      isActive,
      sortOrder,
    });

    logInfo('templates.routes', 'Created template', { templateId: template.id, name });

    res.status(201).json({ template });
  } catch (error) {
    logError('templates.routes', error, { operation: 'createTemplate' });
    res.status(400).json({
      error: 'Failed to create template',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/templates/validate
 * Validate a template pattern without saving
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { filePattern, folderSegments } = req.body;

    if (!filePattern) {
      res.status(400).json({
        error: 'Missing required field',
        message: 'filePattern is required',
      });
      return;
    }

    // Validate file pattern
    const fileValidation = validateTemplate(filePattern);

    // Validate folder segments if provided
    const segmentValidations = (folderSegments || []).map((segment: string, index: number) => ({
      index,
      segment,
      ...validateTemplate(segment),
    }));

    const allValid = fileValidation.valid &&
      segmentValidations.every((v: { valid: boolean }) => v.valid);

    res.json({
      valid: allValid,
      filePattern: fileValidation,
      folderSegments: segmentValidations,
    });
  } catch (error) {
    logError('templates.routes', error, { operation: 'validateTemplate' });
    res.status(500).json({
      error: 'Failed to validate template',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/templates/preview
 * Preview a template with sample or real file data
 */
router.post('/preview', async (req: Request, res: Response) => {
  try {
    const { filePattern, folderSegments, fileId, sampleData } = req.body;

    if (!filePattern) {
      res.status(400).json({
        error: 'Missing required field',
        message: 'filePattern is required',
      });
      return;
    }

    let context: ResolverContext;

    if (fileId) {
      // Use real file data
      const prisma = getDatabase();
      const file = await prisma.comicFile.findUnique({
        where: { id: fileId },
        include: {
          metadata: true,
          series: true,
        },
      });

      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      context = {
        comicInfo: file.metadata ? {
          Series: file.metadata.series || undefined,
          Title: file.metadata.title || undefined,
          Number: file.metadata.number || undefined,
          Volume: file.metadata.volume || undefined,
          Year: file.metadata.year || undefined,
          Month: file.metadata.month || undefined,
          Day: file.metadata.day || undefined,
          Publisher: file.metadata.publisher || undefined,
          Imprint: file.metadata.imprint || undefined,
          Writer: file.metadata.writer || undefined,
          Penciller: file.metadata.penciller || undefined,
          Inker: file.metadata.inker || undefined,
          Colorist: file.metadata.colorist || undefined,
          Letterer: file.metadata.letterer || undefined,
          CoverArtist: file.metadata.coverArtist || undefined,
          Editor: file.metadata.editor || undefined,
          StoryArc: file.metadata.storyArc || undefined,
          Genre: file.metadata.genre || undefined,
          Format: file.metadata.format || undefined,
          AgeRating: file.metadata.ageRating || undefined,
          PageCount: file.metadata.pageCount || undefined,
          LanguageISO: file.metadata.languageISO || undefined,
          Count: file.metadata.count || undefined,
        } : {},
        series: file.series ? {
          name: file.series.name,
          publisher: file.series.publisher || undefined,
          startYear: file.series.startYear || undefined,
          endYear: file.series.endYear || undefined,
          volume: file.series.volume || undefined,
          issueCount: file.series.issueCount || undefined,
        } : undefined,
        fileMetadata: file.metadata ? {
          issueNumberSort: file.metadata.issueNumberSort || undefined,
          contentType: file.metadata.contentType || undefined,
          parsedVolume: file.metadata.parsedVolume || undefined,
          parsedChapter: file.metadata.parsedChapter || undefined,
        } : undefined,
        file: {
          filename: file.filename,
          extension: file.extension,
          path: file.path,
        },
      };
    } else if (sampleData) {
      // Use provided sample data
      context = {
        comicInfo: sampleData,
        file: {
          filename: sampleData.filename || 'sample.cbz',
          extension: sampleData.extension || '.cbz',
        },
      };
    } else {
      // Use default sample context
      context = createSampleContext();
    }

    // Resolve the template
    const fileResult = resolveTemplateString(filePattern, context);

    // Resolve folder segments if provided
    const segmentResults = (folderSegments || []).map((segment: string) =>
      resolveTemplateString(segment, context)
    );

    res.json({
      filename: fileResult,
      folderSegments: segmentResults,
      context: {
        series: context.comicInfo.Series,
        number: context.comicInfo.Number,
        title: context.comicInfo.Title,
        year: context.comicInfo.Year,
      },
    });
  } catch (error) {
    logError('templates.routes', error, { operation: 'previewTemplate' });
    res.status(500).json({
      error: 'Failed to preview template',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/templates/:id
 * Update an existing template
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      filePattern,
      folderSegments,
      characterRules,
      isActive,
      sortOrder,
    } = req.body;

    const template = await updateTemplate(id!, {
      name,
      description,
      filePattern,
      folderSegments,
      characterRules,
      isActive,
      sortOrder,
    });

    logInfo('templates.routes', 'Updated template', { templateId: id! });

    res.json({ template });
  } catch (error) {
    logError('templates.routes', error, { operation: 'updateTemplate' });
    res.status(400).json({
      error: 'Failed to update template',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/templates/:id/activate
 * Set a template as the active template for its scope
 */
router.put('/:id/activate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const template = await setActiveTemplate(id!);

    logInfo('templates.routes', 'Activated template', { templateId: id! });

    res.json({ template });
  } catch (error) {
    logError('templates.routes', error, { operation: 'setActiveTemplate' });
    res.status(400).json({
      error: 'Failed to activate template',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/templates/:id/duplicate
 * Duplicate a template to another scope
 */
router.post('/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { libraryId, name } = req.body;

    const template = await duplicateTemplate(id!, libraryId || null, name);

    logInfo('templates.routes', 'Duplicated template', {
      sourceId: id,
      newId: template.id,
    });

    res.status(201).json({ template });
  } catch (error) {
    logError('templates.routes', error, { operation: 'duplicateTemplate' });
    res.status(400).json({
      error: 'Failed to duplicate template',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/templates/:id
 * Delete a template
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await deleteTemplate(id!);

    logInfo('templates.routes', 'Deleted template', { templateId: id! });

    res.status(204).send();
  } catch (error) {
    logError('templates.routes', error, { operation: 'deleteTemplate' });
    res.status(400).json({
      error: 'Failed to delete template',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/templates/library/:libraryId
 * Reset a library to use global templates
 */
router.delete('/library/:libraryId', async (req: Request, res: Response) => {
  try {
    const { libraryId } = req.params;

    await resetToGlobalDefault(libraryId!);

    logInfo('templates.routes', 'Reset library to global template', { libraryId: libraryId! });

    res.status(204).send();
  } catch (error) {
    logError('templates.routes', error, { operation: 'resetToGlobalDefault' });
    res.status(400).json({
      error: 'Failed to reset library templates',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
