/**
 * Server-Sent Events Service
 *
 * Provides SSE streaming for real-time job progress updates.
 * Replaces polling for better performance and user experience.
 */

import { Response } from 'express';
import { jobQueueLogger } from './logger.service.js';

// =============================================================================
// Types
// =============================================================================

export interface SSEClient {
  id: string;
  res: Response;
  jobId: string;
  channels: Set<string>;
  connectedAt: Date;
}

export interface SSEEvent {
  type: string;
  data: unknown;
}

// =============================================================================
// Client Registry
// =============================================================================

const clients: Map<string, SSEClient> = new Map();

// =============================================================================
// SSE Setup
// =============================================================================

/**
 * Initialize an SSE connection for a specific job
 */
export function initializeSSE(res: Response, jobId: string): string {
  // Generate unique client ID
  const clientId = `${jobId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  // Create client record
  const client: SSEClient = {
    id: clientId,
    res,
    jobId,
    channels: new Set(['metadata']), // All clients auto-subscribe to metadata channel
    connectedAt: new Date(),
  };

  clients.set(clientId, client);

  jobQueueLogger.debug({
    clientId,
    jobId,
    totalClients: clients.size,
  }, `SSE client connected for job ${jobId}`);

  // Send initial connection event
  sendEventToClient(client, {
    type: 'connected',
    data: { clientId, jobId },
  });

  // Set up ping interval to keep connection alive
  const pingInterval = setInterval(() => {
    if (clients.has(clientId)) {
      sendEventToClient(client, { type: 'ping', data: { timestamp: Date.now() } });
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  // Handle client disconnect
  res.on('close', () => {
    clearInterval(pingInterval);
    clients.delete(clientId);
    jobQueueLogger.debug({
      clientId,
      jobId,
      totalClients: clients.size,
    }, `SSE client disconnected from job ${jobId}`);
  });

  return clientId;
}

// =============================================================================
// Event Sending
// =============================================================================

/**
 * Send an event to a specific client
 */
function sendEventToClient(client: SSEClient, event: SSEEvent): boolean {
  try {
    const data = JSON.stringify(event.data);
    client.res.write(`event: ${event.type}\n`);
    client.res.write(`data: ${data}\n\n`);
    return true;
  } catch (error) {
    jobQueueLogger.error({
      clientId: client.id,
      error,
    }, 'Failed to send SSE event');
    // Remove failed client
    clients.delete(client.id);
    return false;
  }
}

/**
 * Broadcast an event to all clients watching a specific job
 */
export function broadcastToJob(jobId: string, event: SSEEvent): number {
  let sentCount = 0;

  for (const client of clients.values()) {
    if (client.jobId === jobId) {
      if (sendEventToClient(client, event)) {
        sentCount++;
      }
    }
  }

  return sentCount;
}

/**
 * Broadcast an event to all clients subscribed to a channel
 */
export function broadcastToChannel(channel: string, event: SSEEvent): number {
  let sentCount = 0;

  for (const client of clients.values()) {
    if (client.channels.has(channel)) {
      if (sendEventToClient(client, event)) {
        sentCount++;
      }
    }
  }

  return sentCount;
}

/**
 * Broadcast an event to all connected clients
 */
export function broadcastToAll(event: SSEEvent): number {
  let sentCount = 0;

  for (const client of clients.values()) {
    if (sendEventToClient(client, event)) {
      sentCount++;
    }
  }

  return sentCount;
}

/**
 * Send job progress update
 */
export function sendJobProgress(
  jobId: string,
  status: string,
  progress: {
    current: number;
    total: number;
    message?: string;
    detail?: string;
  }
): number {
  return broadcastToJob(jobId, {
    type: 'progress',
    data: {
      jobId,
      status,
      ...progress,
      timestamp: Date.now(),
    },
  });
}

/**
 * Send job status change
 */
export function sendJobStatusChange(
  jobId: string,
  status: string,
  data?: unknown
): number {
  return broadcastToJob(jobId, {
    type: 'status',
    data: {
      jobId,
      status,
      ...((data && typeof data === 'object') ? data : {}),
      timestamp: Date.now(),
    },
  });
}

/**
 * Send job completion event
 */
export function sendJobComplete(jobId: string, result: unknown): number {
  return broadcastToJob(jobId, {
    type: 'complete',
    data: {
      jobId,
      result,
      timestamp: Date.now(),
    },
  });
}

/**
 * Send job error event
 */
export function sendJobError(jobId: string, error: string): number {
  return broadcastToJob(jobId, {
    type: 'error',
    data: {
      jobId,
      error,
      timestamp: Date.now(),
    },
  });
}

/**
 * Send job log entry
 */
export function sendJobLog(
  jobId: string,
  log: {
    step: string;
    message: string;
    detail?: string;
    type: 'info' | 'success' | 'warning' | 'error';
  }
): number {
  return broadcastToJob(jobId, {
    type: 'log',
    data: {
      jobId,
      ...log,
      timestamp: Date.now(),
    },
  });
}

// =============================================================================
// Client Management
// =============================================================================

/**
 * Get number of clients watching a specific job
 */
export function getClientCountForJob(jobId: string): number {
  let count = 0;
  for (const client of clients.values()) {
    if (client.jobId === jobId) {
      count++;
    }
  }
  return count;
}

/**
 * Get total number of connected clients
 */
export function getTotalClientCount(): number {
  return clients.size;
}

/**
 * Check if a job has any connected clients
 */
export function hasClientsForJob(jobId: string): boolean {
  for (const client of clients.values()) {
    if (client.jobId === jobId) {
      return true;
    }
  }
  return false;
}

/**
 * Disconnect all clients for a specific job
 */
export function disconnectJobClients(jobId: string): number {
  let count = 0;
  for (const [clientId, client] of clients.entries()) {
    if (client.jobId === jobId) {
      client.res.end();
      clients.delete(clientId);
      count++;
    }
  }
  return count;
}

// =============================================================================
// Export
// =============================================================================

// =============================================================================
// Metadata Events
// =============================================================================

/**
 * Send metadata change event to all clients
 */
export function sendMetadataChange(
  changeType: 'file' | 'series' | 'batch',
  data: {
    fileIds?: string[];
    seriesIds?: string[];
    action: 'updated' | 'created' | 'deleted' | 'linked' | 'unlinked';
  }
): number {
  return broadcastToChannel('metadata', {
    type: 'metadata-change',
    data: {
      changeType,
      ...data,
      timestamp: Date.now(),
    },
  });
}

/**
 * Send series refresh event (tells client to refetch series data)
 */
export function sendSeriesRefresh(seriesIds: string[]): number {
  return broadcastToChannel('metadata', {
    type: 'series-refresh',
    data: {
      seriesIds,
      timestamp: Date.now(),
    },
  });
}

/**
 * Send file refresh event (tells client to refetch file data)
 */
export function sendFileRefresh(fileIds: string[]): number {
  return broadcastToChannel('metadata', {
    type: 'file-refresh',
    data: {
      fileIds,
      timestamp: Date.now(),
    },
  });
}

export const SSE = {
  initialize: initializeSSE,
  broadcastToJob,
  broadcastToChannel,
  broadcastToAll,
  sendProgress: sendJobProgress,
  sendStatusChange: sendJobStatusChange,
  sendComplete: sendJobComplete,
  sendError: sendJobError,
  sendLog: sendJobLog,
  sendMetadataChange,
  sendSeriesRefresh,
  sendFileRefresh,
  getClientCount: getClientCountForJob,
  getTotalClients: getTotalClientCount,
  hasClients: hasClientsForJob,
  disconnectClients: disconnectJobClients,
};

export default SSE;
