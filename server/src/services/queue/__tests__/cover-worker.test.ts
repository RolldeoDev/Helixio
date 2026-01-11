/**
 * Cover Worker Tests
 *
 * Tests for BullMQ cover extraction worker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Worker, Job, Queue } from 'bullmq';

// =============================================================================
// Module Mocks
// =============================================================================

// Track mock instances
let mockWorkerInstance: any = null;
let mockQueueInstance: any = null;

// Mock BullMQ
vi.mock('bullmq', () => {
  return {
    Worker: vi.fn().mockImplementation(function (queueName, processor, options) {
      mockWorkerInstance = {
        queueName,
        processor,
        options,
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      };
      return mockWorkerInstance;
    }),
    Queue: vi.fn().mockImplementation(function (queueName, options) {
      mockQueueInstance = {
        queueName,
        options,
        add: vi.fn().mockResolvedValue({ id: 'job-1', data: {} }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      return mockQueueInstance;
    }),
    Job: vi.fn(),
  };
});

// Mock cover.service
const mockBatchExtractCovers = vi.fn().mockResolvedValue({
  totalJobs: 1,
  successfulJobs: 1,
  failedJobs: 0,
  coversCached: 5,
});

vi.mock('../../cover.service.js', () => ({
  batchExtractCovers: mockBatchExtractCovers,
}));

// Mock database service
const mockCoverJob = {
  id: 'job-1',
  status: 'queued',
  libraryId: 'lib-1',
  folderPath: '/comics/Batman',
  fileIds: '["file-1", "file-2"]',
  priority: 'normal',
  filesProcessed: 0,
  filesTotal: 2,
  coversCached: 0,
  createdAt: new Date(),
  queuedAt: new Date(),
  startedAt: null,
  completedAt: null,
  error: null,
};

const mockDb = {
  coverJob: {
    findUnique: vi.fn().mockResolvedValue(mockCoverJob),
    update: vi.fn().mockImplementation((args) =>
      Promise.resolve({ ...mockCoverJob, ...args.data })
    ),
  },
};

vi.mock('../../database.service.js', () => ({
  getDatabase: vi.fn(() => mockDb),
  getWriteDatabase: vi.fn(() => mockDb),
}));

// Mock SSE service
const mockSendCoverProgress = vi.fn();

vi.mock('../../sse.service.js', () => ({
  sendCoverProgress: mockSendCoverProgress,
}));

// Mock logger
vi.mock('../../logger.service.js', () => ({
  jobQueueLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  scannerLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
const {
  startCoverWorker,
  stopCoverWorker,
  addCoverJob,
  getCoverQueue,
  closeCoverQueue,
  setCoverWorkerLowPriorityMode,
} = await import('../cover-worker.js');

// =============================================================================
// Tests
// =============================================================================

describe('Cover Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await stopCoverWorker();
    await closeCoverQueue();
  });

  describe('Worker Lifecycle', () => {
    it('should start the cover worker', () => {
      startCoverWorker();

      expect(Worker).toHaveBeenCalledWith(
        'helixio-cover-extraction',
        expect.any(Function),
        expect.objectContaining({
          connection: expect.any(Object),
          concurrency: 8,
        })
      );
    });

    it('should not start worker if already running', () => {
      startCoverWorker();
      const firstCallCount = (Worker as any).mock.calls.length;

      startCoverWorker();
      const secondCallCount = (Worker as any).mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should stop the cover worker', async () => {
      startCoverWorker();

      await stopCoverWorker();

      expect(mockWorkerInstance.close).toHaveBeenCalled();
    });

    it('should handle stop when worker is not running', async () => {
      await expect(stopCoverWorker()).resolves.not.toThrow();
    });
  });

  describe('Queue Operations', () => {
    it('should add a cover job to the queue', async () => {
      const jobData = {
        jobId: 'job-1',
        libraryId: 'lib-1',
        folderPath: '/comics/Batman',
        fileIds: ['file-1', 'file-2'],
        priority: 'normal' as const,
      };

      await addCoverJob(jobData);

      expect(Queue).toHaveBeenCalledWith(
        'helixio-cover-extraction',
        expect.objectContaining({
          connection: expect.any(Object),
        })
      );

      // Verify queue.add was called with correct job data
      expect(mockQueueInstance.add).toHaveBeenCalled();
      const callArgs = (mockQueueInstance.add as any).mock.calls[0];
      expect(callArgs[0]).toBe('extract-covers');
      expect(callArgs[1]).toMatchObject({
        jobId: 'job-1',
        libraryId: 'lib-1',
        folderPath: '/comics/Batman',
        fileIds: ['file-1', 'file-2'],
        priority: 'normal',
      });
    });

    it('should close the queue', async () => {
      getCoverQueue(); // Initialize queue

      await closeCoverQueue();

      expect(mockQueueInstance.close).toHaveBeenCalled();
    });
  });

  describe('Low Priority Mode', () => {
    it('should allow setting low priority mode', () => {
      startCoverWorker();

      // Function should not throw
      expect(() => setCoverWorkerLowPriorityMode(true)).not.toThrow();
      expect(() => setCoverWorkerLowPriorityMode(false)).not.toThrow();

      // Note: BullMQ doesn't support dynamic concurrency changes at runtime
      // This is a known limitation documented in the worker.
      // The mode can be set but won't affect running workers until restart.
    });
  });

  describe('Job Processing', () => {
    it('should delegate to batchExtractCovers', async () => {
      // Start worker to capture processor function
      startCoverWorker();
      const processorFn = mockWorkerInstance.processor;

      // Create mock job
      const mockJob = {
        data: {
          jobId: 'job-1',
          libraryId: 'lib-1',
          folderPath: '/comics/Batman',
          fileIds: ['file-1', 'file-2'],
          priority: 'normal',
        },
        attemptsMade: 0,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      } as unknown as Job;

      // Process job
      await processorFn(mockJob);

      // Verify batchExtractCovers was called with fileIds and progress callback
      expect(mockBatchExtractCovers).toHaveBeenCalledWith(
        ['file-1', 'file-2'],
        expect.any(Function)
      );

      // Verify database was updated
      expect(mockDb.coverJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: 'processing',
          startedAt: expect.any(Date),
        }),
      });
    });

    it('should send SSE progress updates', async () => {
      startCoverWorker();
      const processorFn = mockWorkerInstance.processor;

      const mockJob = {
        data: {
          jobId: 'job-1',
          libraryId: 'lib-1',
          folderPath: '/comics/Batman',
          fileIds: ['file-1', 'file-2'],
          priority: 'normal',
        },
        attemptsMade: 0,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      } as unknown as Job;

      await processorFn(mockJob);

      // Verify SSE progress was sent (libraryId is first param, progress object is second)
      expect(mockSendCoverProgress).toHaveBeenCalledWith(
        'lib-1',
        expect.objectContaining({
          jobId: 'job-1',
          folderPath: '/comics/Batman',
          status: 'processing',
          coversExtracted: 0,
          totalFiles: 2,
          retryCount: 0,
        })
      );
    });

    it('should handle job failure', async () => {
      mockBatchExtractCovers.mockRejectedValueOnce(new Error('Extraction failed'));

      startCoverWorker();
      const processorFn = mockWorkerInstance.processor;

      const mockJob = {
        data: {
          jobId: 'job-1',
          libraryId: 'lib-1',
          folderPath: '/comics/Batman',
          fileIds: ['file-1', 'file-2'],
          priority: 'normal',
        },
        attemptsMade: 0,
        opts: {
          attempts: 3,
        },
        updateProgress: vi.fn().mockResolvedValue(undefined),
      } as unknown as Job;

      await expect(processorFn(mockJob)).rejects.toThrow('Extraction failed');

      // Verify database was updated with retry info
      expect(mockDb.coverJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          retryCount: 1,
          errorMessage: 'Extraction failed',
        }),
      });
    });
  });
});
