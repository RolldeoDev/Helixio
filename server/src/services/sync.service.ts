/**
 * Sync Service
 *
 * Handles cloud sync functionality for reading progress and settings
 * across multiple devices.
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export type SyncEntityType = 'progress' | 'bookmark' | 'annotation' | 'settings';

export interface SyncChange {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  changeType: 'create' | 'update' | 'delete';
  changeData: Record<string, any>;
  version: number;
  timestamp: Date;
}

export interface SyncPullResult {
  changes: SyncChange[];
  currentVersion: number;
  hasMore: boolean;
}

export interface SyncPushResult {
  success: boolean;
  newVersion: number;
  conflicts?: SyncChange[];
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string | null;
  lastSyncAt: Date;
  syncVersion: number;
}

// =============================================================================
// Device Registration
// =============================================================================

export async function registerDevice(
  userId: string,
  deviceId: string,
  deviceName?: string
): Promise<DeviceInfo> {
  const device = await prisma.syncToken.upsert({
    where: { userId_deviceId: { userId, deviceId } },
    create: {
      userId,
      deviceId,
      deviceName,
      syncVersion: 0,
    },
    update: {
      deviceName,
      lastSyncAt: new Date(),
    },
  });

  return {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    lastSyncAt: device.lastSyncAt,
    syncVersion: device.syncVersion,
  };
}

export async function getDevices(userId: string): Promise<DeviceInfo[]> {
  const devices = await prisma.syncToken.findMany({
    where: { userId },
    orderBy: { lastSyncAt: 'desc' },
  });

  return devices.map((d) => ({
    deviceId: d.deviceId,
    deviceName: d.deviceName,
    lastSyncAt: d.lastSyncAt,
    syncVersion: d.syncVersion,
  }));
}

export async function removeDevice(userId: string, deviceId: string): Promise<void> {
  await prisma.syncToken.deleteMany({
    where: { userId, deviceId },
  });
}

// =============================================================================
// Sync Operations
// =============================================================================

export async function pullChanges(
  userId: string,
  deviceId: string,
  sinceVersion: number,
  limit: number = 100
): Promise<SyncPullResult> {
  // Get current max version
  const latestChange = await prisma.syncChange.findFirst({
    where: { userId },
    orderBy: { version: 'desc' },
  });

  const currentVersion = latestChange?.version || 0;

  // Get changes since the given version
  const changes = await prisma.syncChange.findMany({
    where: {
      userId,
      version: { gt: sinceVersion },
    },
    orderBy: { version: 'asc' },
    take: limit + 1, // Get one extra to check if there are more
  });

  const hasMore = changes.length > limit;
  const resultChanges = hasMore ? changes.slice(0, limit) : changes;

  // Update device's last sync
  await prisma.syncToken.update({
    where: { userId_deviceId: { userId, deviceId } },
    data: {
      lastSyncAt: new Date(),
      syncVersion: resultChanges.length > 0 ? resultChanges[resultChanges.length - 1]!.version : sinceVersion,
    },
  });

  return {
    changes: resultChanges.map((c) => ({
      id: c.id,
      entityType: c.entityType as SyncEntityType,
      entityId: c.entityId,
      changeType: c.changeType as 'create' | 'update' | 'delete',
      changeData: JSON.parse(c.changeData),
      version: c.version,
      timestamp: c.timestamp,
    })),
    currentVersion,
    hasMore,
  };
}

export async function pushChanges(
  userId: string,
  deviceId: string,
  changes: Array<{
    entityType: SyncEntityType;
    entityId: string;
    changeType: 'create' | 'update' | 'delete';
    changeData: Record<string, any>;
  }>,
  expectedVersion: number
): Promise<SyncPushResult> {
  // Get current version
  const latestChange = await prisma.syncChange.findFirst({
    where: { userId },
    orderBy: { version: 'desc' },
  });

  const currentVersion = latestChange?.version || 0;

  // Check for conflicts (if someone else pushed changes after our expected version)
  if (currentVersion > expectedVersion) {
    // Get conflicting changes
    const conflicts = await prisma.syncChange.findMany({
      where: {
        userId,
        version: { gt: expectedVersion },
      },
      orderBy: { version: 'asc' },
    });

    return {
      success: false,
      newVersion: currentVersion,
      conflicts: conflicts.map((c) => ({
        id: c.id,
        entityType: c.entityType as SyncEntityType,
        entityId: c.entityId,
        changeType: c.changeType as 'create' | 'update' | 'delete',
        changeData: JSON.parse(c.changeData),
        version: c.version,
        timestamp: c.timestamp,
      })),
    };
  }

  // Apply changes
  let newVersion = currentVersion;

  for (const change of changes) {
    newVersion++;

    await prisma.syncChange.create({
      data: {
        entityType: change.entityType,
        entityId: change.entityId,
        changeType: change.changeType,
        changeData: JSON.stringify(change.changeData),
        version: newVersion,
        userId,
      },
    });

    // Apply the change to the actual data
    await applyChange(userId, change);
  }

  // Update device's sync version
  await prisma.syncToken.update({
    where: { userId_deviceId: { userId, deviceId } },
    data: {
      lastSyncAt: new Date(),
      syncVersion: newVersion,
    },
  });

  return {
    success: true,
    newVersion,
  };
}

// =============================================================================
// Apply Changes to Data
// =============================================================================

async function applyChange(
  userId: string,
  change: {
    entityType: SyncEntityType;
    entityId: string;
    changeType: 'create' | 'update' | 'delete';
    changeData: Record<string, any>;
  }
): Promise<void> {
  switch (change.entityType) {
    case 'progress':
      await applyProgressChange(userId, change);
      break;

    // Other entity types would be handled here
    // For now, we store them for sync but don't apply them server-side
    default:
      break;
  }
}

async function applyProgressChange(
  userId: string,
  change: {
    entityId: string;
    changeType: 'create' | 'update' | 'delete';
    changeData: Record<string, any>;
  }
): Promise<void> {
  const fileId = change.entityId;

  switch (change.changeType) {
    case 'create':
    case 'update':
      await prisma.userReadingProgress.upsert({
        where: { userId_fileId: { userId, fileId } },
        create: {
          userId,
          fileId,
          currentPage: change.changeData.currentPage || 0,
          totalPages: change.changeData.totalPages || 0,
          completed: change.changeData.completed || false,
          rating: change.changeData.rating,
        },
        update: {
          currentPage: change.changeData.currentPage,
          totalPages: change.changeData.totalPages,
          completed: change.changeData.completed,
          rating: change.changeData.rating,
        },
      });
      break;

    case 'delete':
      await prisma.userReadingProgress.deleteMany({
        where: { userId, fileId },
      });
      break;
  }
}

// =============================================================================
// Get Full State (for initial sync)
// =============================================================================

export async function getFullState(userId: string): Promise<{
  progress: Array<{
    fileId: string;
    currentPage: number;
    totalPages: number;
    completed: boolean;
    rating: number | null;
    lastReadAt: Date;
  }>;
  version: number;
}> {
  const [progress, latestChange] = await Promise.all([
    prisma.userReadingProgress.findMany({
      where: { userId },
    }),
    prisma.syncChange.findFirst({
      where: { userId },
      orderBy: { version: 'desc' },
    }),
  ]);

  return {
    progress: progress.map((p) => ({
      fileId: p.fileId,
      currentPage: p.currentPage,
      totalPages: p.totalPages,
      completed: p.completed,
      rating: p.rating,
      lastReadAt: p.lastReadAt,
    })),
    version: latestChange?.version || 0,
  };
}

// =============================================================================
// Generate Device ID
// =============================================================================

export function generateDeviceId(): string {
  return crypto.randomBytes(16).toString('hex');
}

// =============================================================================
// Cleanup Old Changes
// =============================================================================

export async function cleanupOldChanges(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - maxAge);

  // Get minimum version still needed by any device
  const oldestDevice = await prisma.syncToken.findFirst({
    orderBy: { syncVersion: 'asc' },
  });

  const minVersion = oldestDevice?.syncVersion || 0;

  // Delete changes older than maxAge AND with version less than what any device needs
  const result = await prisma.syncChange.deleteMany({
    where: {
      AND: [
        { timestamp: { lt: cutoff } },
        { version: { lt: minVersion } },
      ],
    },
  });

  return result.count;
}
