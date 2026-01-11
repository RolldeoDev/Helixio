/**
 * Cover Batch Manager
 *
 * Batches multiple cover URL requests into single HTTP requests
 * to reduce network overhead during scroll.
 *
 * Features:
 * - Collects requests for 50ms window
 * - Sends batch request with up to 100 fileIds
 * - Returns individual promises that resolve from batch response
 * - Automatic fallback to individual requests on batch failure
 * - Request deduplication (same fileId = same promise)
 */

import { API_BASE } from './api/shared';

// =============================================================================
// Types
// =============================================================================

interface CoverBatchResponse {
  covers: Record<string, { url: string; hash: string | null }>;
}

interface PendingRequest {
  fileId: string;
  resolve: (url: string) => void;
  reject: (error: Error) => void;
}

// =============================================================================
// Batch Manager Class
// =============================================================================

class CoverBatchManager {
  private pendingRequests = new Map<string, Promise<string>>();
  private batchQueue: PendingRequest[] = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private processingBatch = false; // Prevents concurrent batch processing

  private readonly BATCH_DELAY = 50; // ms - collect requests for 50ms
  private readonly MAX_BATCH_SIZE = 100; // Maximum files per batch

  /**
   * Request a cover URL for a file.
   * Returns a promise that resolves to the cover URL.
   * Automatically batches requests made within 50ms window.
   */
  requestCover(fileId: string, coverVersion?: string | null): Promise<string> {
    // Check if request already pending (deduplication)
    const existing = this.pendingRequests.get(fileId);
    if (existing) {
      return existing;
    }

    // Create new promise for this request
    const promise = new Promise<string>((resolve, reject) => {
      this.batchQueue.push({ fileId, resolve, reject });
      this.scheduleBatch();
    });

    // Store promise for deduplication
    this.pendingRequests.set(fileId, promise);

    // Clean up after resolution
    promise.finally(() => {
      this.pendingRequests.delete(fileId);
    });

    // If coverVersion provided, append it to URL when resolved
    if (coverVersion) {
      return promise.then((url) => `${url}?v=${encodeURIComponent(coverVersion)}`);
    }

    return promise;
  }

  /**
   * Schedule batch processing.
   * Batches are sent after BATCH_DELAY ms or when MAX_BATCH_SIZE is reached.
   */
  private scheduleBatch() {
    // If batch is full, process immediately
    if (this.batchQueue.length >= this.MAX_BATCH_SIZE) {
      this.processBatch();
      return;
    }

    // Otherwise schedule processing after delay
    if (this.batchTimeout !== null) {
      return; // Already scheduled
    }

    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.BATCH_DELAY);
  }

  /**
   * Process the current batch queue.
   * Sends batch request and resolves individual promises.
   * Protected against concurrent execution.
   */
  private async processBatch() {
    // Prevent concurrent batch processing
    if (this.processingBatch) {
      return;
    }

    this.processingBatch = true;

    try {
      // Clear timeout
      if (this.batchTimeout !== null) {
        clearTimeout(this.batchTimeout);
        this.batchTimeout = null;
      }

      // Nothing to process
      if (this.batchQueue.length === 0) {
        return;
      }

      // Take current batch (up to MAX_BATCH_SIZE)
      const batch = this.batchQueue.splice(0, this.MAX_BATCH_SIZE);
      const fileIds = batch.map((req) => req.fileId);

      try {
        // Send batch request
        const response = await fetch(`${API_BASE}/covers/batch/files`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fileIds }),
        });

        if (!response.ok) {
          throw new Error(`Batch request failed: ${response.status} ${response.statusText}`);
        }

        const data: CoverBatchResponse = await response.json();

        // Resolve individual promises with URLs from batch response
        batch.forEach(({ fileId, resolve }) => {
          const coverData = data.covers[fileId];
          if (coverData?.url) {
            resolve(coverData.url);
          } else {
            // Fallback: use individual cover URL
            resolve(`/api/covers/${fileId}`);
          }
        });
      } catch (error) {
        // Batch failed - fall back to individual cover URLs
        console.warn('Cover batch request failed, using individual URLs:', error);
        batch.forEach(({ fileId, resolve }) => {
          resolve(`/api/covers/${fileId}`);
        });
      }
    } finally {
      // Reset processing flag
      this.processingBatch = false;

      // Process remaining queue if any
      if (this.batchQueue.length > 0) {
        this.scheduleBatch();
      }
    }
  }

  /**
   * Clear all pending requests (useful for cleanup/testing).
   */
  clear() {
    if (this.batchTimeout !== null) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    this.batchQueue = [];
    this.pendingRequests.clear();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const coverBatchManager = new CoverBatchManager();

// Export class for testing
export { CoverBatchManager };
