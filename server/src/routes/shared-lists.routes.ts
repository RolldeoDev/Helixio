/**
 * Shared Reading Lists Routes
 *
 * Handles shared reading lists between users.
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import * as crypto from 'crypto';
import { logError } from '../services/logger.service.js';

const router = Router();
const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

interface ListItem {
  fileId: string;
  order: number;
  notes?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function generateShareCode(): string {
  return crypto.randomBytes(8).toString('hex');
}

function parseItems(itemsJson: string): ListItem[] {
  try {
    return JSON.parse(itemsJson);
  } catch {
    return [];
  }
}

// =============================================================================
// User's Lists
// =============================================================================

/**
 * Get user's reading lists
 * GET /api/lists
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const lists = await prisma.sharedReadingList.findMany({
      where: { ownerId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      lists: lists.map((list) => ({
        id: list.id,
        name: list.name,
        description: list.description,
        isPublic: list.isPublic,
        shareCode: list.shareCode,
        itemCount: parseItems(list.items).length,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
      })),
    });
  } catch (error) {
    logError('shared-lists', error, { action: 'get-lists' });
    res.status(500).json({ error: 'Failed to get lists' });
  }
});

/**
 * Create a reading list
 * POST /api/lists
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, description, isPublic, items } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ error: 'Name required' });
      return;
    }

    const list = await prisma.sharedReadingList.create({
      data: {
        ownerId: req.user!.id,
        name: name.trim(),
        description: description?.trim(),
        isPublic: isPublic || false,
        shareCode: isPublic ? null : generateShareCode(),
        items: JSON.stringify(items || []),
      },
    });

    res.status(201).json({
      list: {
        id: list.id,
        name: list.name,
        description: list.description,
        isPublic: list.isPublic,
        shareCode: list.shareCode,
        items: parseItems(list.items),
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
      },
    });
  } catch (error) {
    logError('shared-lists', error, { action: 'create-list' });
    res.status(500).json({ error: 'Failed to create list' });
  }
});

/**
 * Get a specific list (owned by user)
 * GET /api/lists/:listId
 */
router.get('/:listId', requireAuth, async (req: Request, res: Response) => {
  try {
    const list = await prisma.sharedReadingList.findFirst({
      where: {
        id: req.params.listId,
        ownerId: req.user!.id,
      },
    });

    if (!list) {
      res.status(404).json({ error: 'List not found' });
      return;
    }

    res.json({
      list: {
        id: list.id,
        name: list.name,
        description: list.description,
        isPublic: list.isPublic,
        shareCode: list.shareCode,
        items: parseItems(list.items),
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
      },
    });
  } catch (error) {
    logError('shared-lists', error, { action: 'get-list' });
    res.status(500).json({ error: 'Failed to get list' });
  }
});

/**
 * Update a reading list
 * PATCH /api/lists/:listId
 */
router.patch('/:listId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, description, isPublic, items } = req.body;

    // Verify ownership
    const existing = await prisma.sharedReadingList.findFirst({
      where: {
        id: req.params.listId,
        ownerId: req.user!.id,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'List not found' });
      return;
    }

    const updateData: any = {};

    if (name !== undefined) {
      updateData.name = name.trim();
    }
    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }
    if (isPublic !== undefined) {
      updateData.isPublic = isPublic;
      // Generate share code if making private
      if (!isPublic && !existing.shareCode) {
        updateData.shareCode = generateShareCode();
      }
    }
    if (items !== undefined) {
      updateData.items = JSON.stringify(items);
    }

    const list = await prisma.sharedReadingList.update({
      where: { id: req.params.listId },
      data: updateData,
    });

    res.json({
      list: {
        id: list.id,
        name: list.name,
        description: list.description,
        isPublic: list.isPublic,
        shareCode: list.shareCode,
        items: parseItems(list.items),
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
      },
    });
  } catch (error) {
    logError('shared-lists', error, { action: 'update-list' });
    res.status(500).json({ error: 'Failed to update list' });
  }
});

/**
 * Delete a reading list
 * DELETE /api/lists/:listId
 */
router.delete('/:listId', requireAuth, async (req: Request, res: Response) => {
  try {
    // Verify ownership
    const existing = await prisma.sharedReadingList.findFirst({
      where: {
        id: req.params.listId,
        ownerId: req.user!.id,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'List not found' });
      return;
    }

    await prisma.sharedReadingList.delete({
      where: { id: req.params.listId },
    });

    res.json({ success: true });
  } catch (error) {
    logError('shared-lists', error, { action: 'delete-list' });
    res.status(500).json({ error: 'Failed to delete list' });
  }
});

/**
 * Regenerate share code
 * POST /api/lists/:listId/regenerate-code
 */
router.post('/:listId/regenerate-code', requireAuth, async (req: Request, res: Response) => {
  try {
    // Verify ownership
    const existing = await prisma.sharedReadingList.findFirst({
      where: {
        id: req.params.listId,
        ownerId: req.user!.id,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'List not found' });
      return;
    }

    const list = await prisma.sharedReadingList.update({
      where: { id: req.params.listId },
      data: { shareCode: generateShareCode() },
    });

    res.json({ shareCode: list.shareCode });
  } catch (error) {
    logError('shared-lists', error, { action: 'regenerate-code' });
    res.status(500).json({ error: 'Failed to regenerate share code' });
  }
});

// =============================================================================
// Shared List Access
// =============================================================================

/**
 * Get a shared list by share code
 * GET /api/lists/shared/:shareCode
 */
router.get('/shared/:shareCode', optionalAuth, async (req: Request, res: Response) => {
  try {
    const list = await prisma.sharedReadingList.findFirst({
      where: {
        shareCode: req.params.shareCode,
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            profilePrivate: true,
          },
        },
      },
    });

    if (!list) {
      res.status(404).json({ error: 'List not found' });
      return;
    }

    // Don't show private profile info
    const ownerInfo = list.owner.profilePrivate
      ? { username: list.owner.username }
      : {
          username: list.owner.username,
          displayName: list.owner.displayName,
          avatarUrl: list.owner.avatarUrl,
        };

    res.json({
      list: {
        id: list.id,
        name: list.name,
        description: list.description,
        items: parseItems(list.items),
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
      },
      owner: ownerInfo,
      isOwner: req.user?.id === list.ownerId,
    });
  } catch (error) {
    logError('shared-lists', error, { action: 'get-shared-list' });
    res.status(500).json({ error: 'Failed to get list' });
  }
});

/**
 * Get public lists (browse)
 * GET /api/lists/public
 */
router.get('/browse/public', optionalAuth, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
    const skip = (page - 1) * pageSize;

    const [lists, total] = await Promise.all([
      prisma.sharedReadingList.findMany({
        where: { isPublic: true },
        include: {
          owner: {
            select: {
              username: true,
              displayName: true,
              avatarUrl: true,
              profilePrivate: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.sharedReadingList.count({ where: { isPublic: true } }),
    ]);

    res.json({
      lists: lists.map((list) => ({
        id: list.id,
        name: list.name,
        description: list.description,
        itemCount: parseItems(list.items).length,
        updatedAt: list.updatedAt,
        owner: list.owner.profilePrivate
          ? { username: list.owner.username }
          : {
              username: list.owner.username,
              displayName: list.owner.displayName,
              avatarUrl: list.owner.avatarUrl,
            },
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logError('shared-lists', error, { action: 'browse-public-lists' });
    res.status(500).json({ error: 'Failed to browse lists' });
  }
});

export default router;
