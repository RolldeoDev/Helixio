/**
 * Issue Metadata Routes
 *
 * API endpoints for individual issue metadata fetching and application.
 */

import { Router } from 'express';
import {
  searchIssueMetadata,
  fetchIssueById,
  previewIssueChanges,
  applyIssueMetadata,
  type MetadataSource,
  type IssueMetadata,
} from '../services/issue-metadata-fetch.service.js';

const router = Router();

/**
 * POST /api/files/:fileId/issue-metadata/search
 * Search for issue metadata using existing file data and series context.
 */
router.post('/:fileId/issue-metadata/search', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { query, source } = req.body as {
      query?: string;
      source?: MetadataSource;
    };

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    const result = await searchIssueMetadata(fileId, { query, source });
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error searching issue metadata:', message);
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/files/:fileId/issue-metadata/fetch
 * Fetch full metadata for a specific issue by source and ID.
 */
router.post('/:fileId/issue-metadata/fetch', async (req, res) => {
  try {
    const { source, issueId } = req.body as {
      source: MetadataSource;
      issueId: string;
    };

    if (!source || !issueId) {
      return res.status(400).json({ error: 'Source and issue ID are required' });
    }

    const metadata = await fetchIssueById(source, issueId);
    if (!metadata) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    return res.json({ metadata });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error fetching issue metadata:', message);
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/files/:fileId/issue-metadata/preview
 * Generate a preview of changes for an issue.
 */
router.post('/:fileId/issue-metadata/preview', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { metadata, source, issueId } = req.body as {
      metadata: IssueMetadata;
      source: MetadataSource;
      issueId: string;
    };

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    if (!metadata || !source || !issueId) {
      return res.status(400).json({ error: 'Metadata, source, and issue ID are required' });
    }

    const preview = await previewIssueChanges(fileId, metadata, source, issueId);
    return res.json(preview);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error generating preview:', message);
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/files/:fileId/issue-metadata/apply
 * Apply selected metadata changes to a file.
 */
router.post('/:fileId/issue-metadata/apply', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { metadata, source, issueId, selectedFields, coverAction } = req.body as {
      metadata: IssueMetadata;
      source: MetadataSource;
      issueId: string;
      selectedFields: string[];
      coverAction?: 'keep' | 'download' | 'replace';
    };

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    if (!metadata || !source || !issueId || !selectedFields) {
      return res.status(400).json({
        error: 'Metadata, source, issue ID, and selected fields are required',
      });
    }

    const result = await applyIssueMetadata(fileId, metadata, selectedFields, {
      source,
      issueId,
      coverAction,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error applying issue metadata:', message);
    return res.status(500).json({ error: message });
  }
});

export default router;
