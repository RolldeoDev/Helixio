/**
 * Description Routes
 *
 * API endpoints for LLM-based description generation:
 * - Status check for LLM availability
 * - Series description generation
 * - Issue summary generation
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../services/database.service.js';
import {
  isDescriptionGeneratorAvailable,
  generateSeriesDescription,
  generateIssueSummary,
  type SeriesDescriptionContext,
  type IssueDescriptionContext,
} from '../services/description-generator.service.js';
import { getLLMModel } from '../services/config.service.js';
import {
  sendSuccess,
  sendBadRequest,
  sendNotFound,
  asyncHandler,
} from '../middleware/response.middleware.js';
import { createServiceLogger } from '../services/logger.service.js';

const router = Router();
const logger = createServiceLogger('description-routes');

// =============================================================================
// Status Endpoint
// =============================================================================

/**
 * GET /api/description/status
 * Check if LLM-based description generation is available
 */
router.get('/status', (_req: Request, res: Response) => {
  const available = isDescriptionGeneratorAvailable();
  const model = available ? getLLMModel() : null;

  sendSuccess(res, {
    available,
    model,
  });
});

// =============================================================================
// Series Description Generation
// =============================================================================

/**
 * POST /api/series/:id/generate-description
 * Generate a description for a series using LLM
 *
 * Body: { useWebSearch?: boolean }
 * Returns: { description: string, deck?: string }
 */
router.post('/series/:id/generate-description', asyncHandler(async (req: Request, res: Response) => {
  const seriesId = req.params.id!;
  const { useWebSearch } = req.body as { useWebSearch?: boolean };

  // Check if LLM is available
  if (!isDescriptionGeneratorAvailable()) {
    sendBadRequest(res, 'LLM description generation is not available. Please configure an Anthropic API key.');
    return;
  }

  // Fetch series from database
  const db = getDatabase();
  const series = await db.series.findUnique({
    where: { id: seriesId },
    include: {
      _count: {
        select: { issues: true },
      },
    },
  });

  if (!series) {
    sendNotFound(res, 'Series not found');
    return;
  }

  // Build context for generation
  const context: SeriesDescriptionContext = {
    name: series.name,
    publisher: series.publisher,
    startYear: series.startYear,
    endYear: series.endYear,
    issueCount: series.issueCount || series._count?.issues,
    genres: series.genres,
    characters: series.characters,
    teams: series.teams,
    existingSummary: series.summary,
    existingDeck: series.deck,
  };

  logger.info({ seriesId, useWebSearch }, `Generating description for series: ${series.name}`);

  // Generate description
  const result = await generateSeriesDescription(context, {
    useWebSearch,
  });

  if (!result.success) {
    logger.error({ seriesId, error: result.error }, `Failed to generate description for series: ${series.name}`);
    sendBadRequest(res, result.error || 'Failed to generate description');
    return;
  }

  logger.info({ seriesId, tokensUsed: result.tokensUsed }, `Generated description for series: ${series.name}`);

  sendSuccess(res, {
    description: result.description,
    deck: result.deck,
    tokensUsed: result.tokensUsed,
  });
}));

// =============================================================================
// Issue Summary Generation
// =============================================================================

/**
 * POST /api/files/:id/generate-summary
 * Generate a summary for an individual issue using LLM
 *
 * Body: { useWebSearch?: boolean }
 * Returns: { summary: string }
 */
router.post('/files/:id/generate-summary', asyncHandler(async (req: Request, res: Response) => {
  const fileId = req.params.id!;
  const { useWebSearch } = req.body as { useWebSearch?: boolean };

  // Check if LLM is available
  if (!isDescriptionGeneratorAvailable()) {
    sendBadRequest(res, 'LLM description generation is not available. Please configure an Anthropic API key.');
    return;
  }

  // Fetch file with metadata and series from database
  const db = getDatabase();
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: {
      metadata: true,
      series: true,
    },
  });

  if (!file) {
    sendNotFound(res, 'File not found');
    return;
  }

  // Build context for generation
  const context: IssueDescriptionContext = {
    seriesName: file.series?.name || file.metadata?.series || file.filename,
    issueNumber: file.metadata?.number,
    issueTitle: file.metadata?.title,
    publisher: file.series?.publisher || file.metadata?.publisher,
    year: file.metadata?.year,
    writer: file.metadata?.writer,
    characters: file.metadata?.characters,
    storyArc: file.metadata?.storyArc,
    existingSummary: file.metadata?.summary,
  };

  const issueLabel = context.issueNumber
    ? `${context.seriesName} #${context.issueNumber}`
    : context.seriesName;

  logger.info({ fileId, useWebSearch }, `Generating summary for issue: ${issueLabel}`);

  // Generate summary
  const result = await generateIssueSummary(context, {
    useWebSearch,
  });

  if (!result.success) {
    logger.error({ fileId, error: result.error }, `Failed to generate summary for issue: ${issueLabel}`);
    sendBadRequest(res, result.error || 'Failed to generate summary');
    return;
  }

  logger.info({ fileId, tokensUsed: result.tokensUsed }, `Generated summary for issue: ${issueLabel}`);

  sendSuccess(res, {
    summary: result.description,
    tokensUsed: result.tokensUsed,
  });
}));

export default router;
