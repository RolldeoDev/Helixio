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
import {
  isMetadataGeneratorAvailable,
  generateSeriesMetadata,
  generateIssueMetadata,
  type MetadataGenerationContext,
  type IssueMetadataGenerationContext,
} from '../services/metadata-generator.service.js';
import {
  isCollectionDescriptionGeneratorAvailable,
  generateCollectionDescription,
} from '../services/collection-description-generator.service.js';
import { getLLMModel } from '../services/config.service.js';
import {
  sendSuccess,
  sendBadRequest,
  sendNotFound,
  asyncHandler,
} from '../middleware/response.middleware.js';
import { createServiceLogger } from '../services/logger.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

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
router.post('/series/:id/generate-description', requireAuth, asyncHandler(async (req: Request, res: Response) => {
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
// Series Metadata Generation (Enhanced)
// =============================================================================

/**
 * POST /api/series/:id/generate-metadata
 * Generate comprehensive metadata for a series using LLM with optional web search
 *
 * Body: { useWebSearch?: boolean, generateEntities?: boolean }
 * Returns: { metadata: GeneratedMetadata, webSearchUsed: boolean, tokensUsed?: number }
 */
router.post('/series/:id/generate-metadata', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const seriesId = req.params.id!;
  const { useWebSearch, generateEntities } = req.body as { useWebSearch?: boolean; generateEntities?: boolean };

  // Check if LLM is available
  if (!isMetadataGeneratorAvailable()) {
    sendBadRequest(res, 'LLM metadata generation is not available. Please configure an Anthropic API key.');
    return;
  }

  // Fetch series from database
  const db = getDatabase();
  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    sendNotFound(res, 'Series not found');
    return;
  }

  // Build context for generation
  const context: MetadataGenerationContext = {
    name: series.name,
    publisher: series.publisher,
    startYear: series.startYear,
    endYear: series.endYear,
    volume: series.volume,
    type: series.type as 'western' | 'manga',
    existingGenres: series.genres,
    existingTags: series.tags,
    existingSummary: series.summary,
    existingDeck: series.deck,
    existingAgeRating: series.ageRating,
    // Include existing entity data for context when generating entities
    existingCharacters: series.characters,
    existingTeams: series.teams,
    existingLocations: series.locations,
  };

  logger.info({ seriesId, useWebSearch, generateEntities }, `Generating metadata for series: ${series.name}`);

  // Generate metadata
  const result = await generateSeriesMetadata(context, { useWebSearch, generateEntities });

  if (!result.success) {
    logger.error({ seriesId, error: result.error }, `Failed to generate metadata for series: ${series.name}`);
    sendBadRequest(res, result.error || 'Failed to generate metadata');
    return;
  }

  logger.info(
    { seriesId, tokensUsed: result.tokensUsed, webSearchUsed: result.webSearchUsed, generateEntities },
    `Generated metadata for series: ${series.name}`
  );

  sendSuccess(res, {
    metadata: result.metadata,
    webSearchUsed: result.webSearchUsed,
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
router.post('/files/:id/generate-summary', requireAuth, asyncHandler(async (req: Request, res: Response) => {
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

// =============================================================================
// Issue Metadata Generation (Enhanced)
// =============================================================================

/**
 * POST /api/files/:id/generate-metadata
 * Generate comprehensive metadata for an issue using LLM with optional web search
 *
 * Body: { useWebSearch?: boolean }
 * Returns: { metadata: GeneratedIssueMetadata, webSearchUsed: boolean, tokensUsed?: number }
 */
router.post('/files/:id/generate-metadata', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const fileId = req.params.id!;
  const { useWebSearch } = req.body as { useWebSearch?: boolean };

  // Check if LLM is available
  if (!isMetadataGeneratorAvailable()) {
    sendBadRequest(res, 'LLM metadata generation is not available. Please configure an Anthropic API key.');
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
  const context: IssueMetadataGenerationContext = {
    seriesName: file.series?.name || file.metadata?.series || file.filename,
    issueNumber: file.metadata?.number,
    issueTitle: file.metadata?.title,
    publisher: file.series?.publisher || file.metadata?.publisher,
    year: file.metadata?.year,
    writer: file.metadata?.writer,
    penciller: file.metadata?.penciller,
    type: file.series?.type as 'western' | 'manga' | undefined,
    // Existing metadata for context
    existingSummary: file.metadata?.summary,
    existingAgeRating: file.metadata?.ageRating,
    existingGenres: file.metadata?.genre,
    existingTags: file.metadata?.tags,
    existingCharacters: file.metadata?.characters,
    existingTeams: file.metadata?.teams,
    existingLocations: file.metadata?.locations,
  };

  const issueLabel = context.issueNumber
    ? `${context.seriesName} #${context.issueNumber}`
    : context.seriesName;

  logger.info({ fileId, useWebSearch }, `Generating metadata for issue: ${issueLabel}`);

  // Generate metadata
  const result = await generateIssueMetadata(context, { useWebSearch });

  if (!result.success) {
    logger.error({ fileId, error: result.error }, `Failed to generate metadata for issue: ${issueLabel}`);
    sendBadRequest(res, result.error || 'Failed to generate metadata');
    return;
  }

  logger.info(
    { fileId, tokensUsed: result.tokensUsed, webSearchUsed: result.webSearchUsed },
    `Generated metadata for issue: ${issueLabel}`
  );

  sendSuccess(res, {
    metadata: result.metadata,
    webSearchUsed: result.webSearchUsed,
    tokensUsed: result.tokensUsed,
  });
}));

// =============================================================================
// Collection Description Generation
// =============================================================================

/**
 * GET /api/description/collection/status
 * Check if LLM-based collection description generation is available
 */
router.get('/collection/status', (_req: Request, res: Response) => {
  const available = isCollectionDescriptionGeneratorAvailable();
  const model = available ? getLLMModel() : null;

  sendSuccess(res, {
    available,
    model,
  });
});

/**
 * POST /api/description/collection/:id/generate
 * Generate a description for a collection using LLM
 *
 * Returns: { description: string, deck: string, tokensUsed?: number }
 */
router.post('/collection/:id/generate', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const collectionId = req.params.id!;
  const userId = req.user!.id;

  // Check if LLM is available
  if (!isCollectionDescriptionGeneratorAvailable()) {
    sendBadRequest(res, 'LLM description generation is not available. Please configure an Anthropic API key.');
    return;
  }

  logger.info({ collectionId, userId }, 'Generating description for collection');

  // Generate description
  const result = await generateCollectionDescription(collectionId, userId);

  if (!result.success) {
    logger.error({ collectionId, error: result.error }, 'Failed to generate collection description');
    sendBadRequest(res, result.error || 'Failed to generate description');
    return;
  }

  logger.info({ collectionId, tokensUsed: result.tokensUsed }, 'Generated collection description');

  sendSuccess(res, {
    description: result.description,
    deck: result.deck,
    tokensUsed: result.tokensUsed,
  });
}));

export default router;
