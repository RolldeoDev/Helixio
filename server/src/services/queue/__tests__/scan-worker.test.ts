/**
 * Scan Worker Tests
 *
 * Tests for BullMQ library scan worker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Worker, Job } from 'bullmq';

// =============================================================================
// Module Mocks
// =============================================================================

// Track mock instances
let mockWorkerInstance: any = null;

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
    Job: vi.fn(),
  };
});

// Mock scanner service
const mockOrchestrateScan = vi.fn().mockResolvedValue({
  filesCreated: 10,
  filesUpdated: 5,
  filesOrphaned: 2,
  seriesCreated: 3,
  elapsedMs: 5000,
});

vi.mock('../../scanner.service.js', () => ({
  orchestrateScan: mockOrchestrateScan,
}));

// Mock library scan job service
const mockScanJob = {
  id: 'scan-job-1',
  libraryId: 'lib-1',
  status: 'queued',
  stage: 'queued',
  options: { forceFullScan: false },
  createdAt: new Date(),
};

const mockGetScanJob = vi.fn().mockResolvedValue(mockScanJob);
const mockUpdateScanJobStatus = vi.fn().mockResolvedValue(undefined);
const mockUpdateScanJobProgress = vi.fn().mockResolvedValue(undefined);
const mockAddScanJobLog = vi.fn().mockResolvedValue(undefined);
const mockFailScanJob = vi.fn().mockResolvedValue(undefined);

vi.mock('../../library-scan-job.service.js', () => ({
  getScanJob: mockGetScanJob,
  updateScanJobStatus: mockUpdateScanJobStatus,
  updateScanJobProgress: mockUpdateScanJobProgress,
  addScanJobLog: mockAddScanJobLog,
  failScanJob: mockFailScanJob,
}));

// Mock cover job queue service
const mockSetCoverQueueLowPriorityMode = vi.fn();

vi.mock('../../cover-job-queue.service.js', () => ({
  setCoverQueueLowPriorityMode: mockSetCoverQueueLowPriorityMode,
}));

// Mock memory cache service
const mockMemoryCache = {
  setScanActive: vi.fn(),
};

vi.mock('../../memory-cache.service.js', () => ({
  memoryCache: mockMemoryCache,
}));

// Mock logger
vi.mock('../../logger.service.js', () => ({
  scanQueueLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks
const { startScanWorker, stopScanWorker } = await import('../scan-worker.js');

// =============================================================================
// Tests
// =============================================================================

describe('Scan Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await stopScanWorker();
  });

  describe('Worker Lifecycle', () => {
    it('should start the scan worker', () => {
      startScanWorker();

      expect(Worker).toHaveBeenCalledWith(
        'helixio-library-scan',
        expect.any(Function),
        expect.objectContaining({
          connection: expect.any(Object),
          concurrency: 1, // Sequential processing
        })
      );
    });

    it('should not start worker if already running', () => {
      startScanWorker();
      const firstCallCount = (Worker as any).mock.calls.length;

      startScanWorker();
      const secondCallCount = (Worker as any).mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should stop the scan worker', async () => {
      startScanWorker();

      await stopScanWorker();

      expect(mockWorkerInstance.close).toHaveBeenCalled();
    });

    it('should handle stop when worker is not running', async () => {
      await expect(stopScanWorker()).resolves.not.toThrow();
    });
  });

  describe('Job Processing', () => {
    it('should process a scan job successfully', async () => {
      startScanWorker();
      const processorFn = mockWorkerInstance.processor;

      const mockJob = {
        data: {
          scanJobId: 'scan-job-1',
          libraryId: 'lib-1',
          libraryPath: '/comics',
          forceFullScan: false,
        },
        updateProgress: vi.fn().mockResolvedValue(undefined),
        processedOn: Date.now(),
      } as unknown as Job;

      await processorFn(mockJob);

      // Verify scan job was fetched
      expect(mockGetScanJob).toHaveBeenCalledWith('scan-job-1');

      // Verify cache state was set
      expect(mockMemoryCache.setScanActive).toHaveBeenCalledWith(true);
      expect(mockSetCoverQueueLowPriorityMode).toHaveBeenCalledWith(true);

      // Verify orchestrateScan was called
      expect(mockOrchestrateScan).toHaveBeenCalledWith(
        'lib-1',
        expect.objectContaining({
          forceFullScan: false,
          abortSignal: expect.any(AbortSignal),
          onProgress: expect.any(Function),
        })
      );

      // Verify status was updated
      expect(mockUpdateScanJobStatus).toHaveBeenCalledWith(
        'scan-job-1',
        'discovering',
        'discovering'
      );

      expect(mockUpdateScanJobStatus).toHaveBeenCalledWith(
        'scan-job-1',
        'complete',
        'complete'
      );

      // Verify success log was added
      expect(mockAddScanJobLog).toHaveBeenCalledWith(
        'scan-job-1',
        'complete',
        'Library scan completed successfully',
        expect.any(String),
        'success'
      );

      // Verify cache state was restored
      expect(mockMemoryCache.setScanActive).toHaveBeenCalledWith(false);
      expect(mockSetCoverQueueLowPriorityMode).toHaveBeenCalledWith(false);
    });

    it('should update progress during scan', async () => {
      let progressCallback: any;

      mockOrchestrateScan.mockImplementation(async (_libraryId, options) => {
        progressCallback = options.onProgress;
        // Simulate progress updates
        await progressCallback({
          phase: 'enumerating',
          foldersComplete: 10,
          foldersTotal: 100,
          currentFolder: '/comics/Batman',
          filesCreated: 5,
          filesUpdated: 3,
          filesOrphaned: 1,
          seriesCreated: 2,
          coverJobsComplete: 0,
        });

        await progressCallback({
          phase: 'processing',
          foldersComplete: 50,
          foldersTotal: 100,
          currentFolder: '/comics/Superman',
          filesCreated: 25,
          filesUpdated: 15,
          filesOrphaned: 5,
          seriesCreated: 10,
          coverJobsComplete: 20,
        });

        return {
          filesCreated: 50,
          filesUpdated: 30,
          filesOrphaned: 10,
          seriesCreated: 20,
          elapsedMs: 10000,
        };
      });

      startScanWorker();
      const processorFn = mockWorkerInstance.processor;

      const mockJob = {
        data: {
          scanJobId: 'scan-job-1',
          libraryId: 'lib-1',
          libraryPath: '/comics',
          forceFullScan: false,
        },
        updateProgress: vi.fn().mockResolvedValue(undefined),
        processedOn: Date.now(),
      } as unknown as Job;

      await processorFn(mockJob);

      // Verify BullMQ progress was updated
      expect(mockJob.updateProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          current: 10,
          total: 100,
          message: expect.stringContaining('Phase: enumerating'),
        })
      );

      expect(mockJob.updateProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          current: 50,
          total: 100,
          message: expect.stringContaining('Phase: processing'),
        })
      );

      // Verify database progress was updated
      expect(mockUpdateScanJobProgress).toHaveBeenCalledWith(
        'scan-job-1',
        expect.objectContaining({
          discoveredFiles: 100,
          indexedFiles: expect.any(Number),
          seriesCreated: expect.any(Number),
        })
      );

      // Verify status transitions
      expect(mockUpdateScanJobStatus).toHaveBeenCalledWith(
        'scan-job-1',
        'discovering',
        'discovering'
      );

      expect(mockUpdateScanJobStatus).toHaveBeenCalledWith(
        'scan-job-1',
        'indexing',
        'indexing'
      );
    });

    it('should handle scan job failure', async () => {
      mockOrchestrateScan.mockRejectedValueOnce(new Error('Scan failed'));

      startScanWorker();
      const processorFn = mockWorkerInstance.processor;

      const mockJob = {
        data: {
          scanJobId: 'scan-job-1',
          libraryId: 'lib-1',
          libraryPath: '/comics',
          forceFullScan: false,
        },
        updateProgress: vi.fn().mockResolvedValue(undefined),
        processedOn: Date.now(),
      } as unknown as Job;

      await expect(processorFn(mockJob)).rejects.toThrow('Scan failed');

      // Verify job was failed
      expect(mockFailScanJob).toHaveBeenCalledWith('scan-job-1', 'Scan failed');

      // Verify cache state was restored
      expect(mockMemoryCache.setScanActive).toHaveBeenCalledWith(false);
      expect(mockSetCoverQueueLowPriorityMode).toHaveBeenCalledWith(false);
    });

    it('should handle scan cancellation', async () => {
      mockOrchestrateScan.mockRejectedValueOnce(new Error('Scan aborted'));

      startScanWorker();
      const processorFn = mockWorkerInstance.processor;

      const mockJob = {
        data: {
          scanJobId: 'scan-job-1',
          libraryId: 'lib-1',
          libraryPath: '/comics',
          forceFullScan: false,
        },
        updateProgress: vi.fn().mockResolvedValue(undefined),
        processedOn: Date.now(),
      } as unknown as Job;

      await processorFn(mockJob);

      // Verify status was set to cancelled
      expect(mockUpdateScanJobStatus).toHaveBeenCalledWith('scan-job-1', 'cancelled');

      // Verify cancellation log was added
      expect(mockAddScanJobLog).toHaveBeenCalledWith(
        'scan-job-1',
        'cancelled',
        'Scan cancelled by user',
        undefined,
        'warning'
      );

      // Verify cache state was restored
      expect(mockMemoryCache.setScanActive).toHaveBeenCalledWith(false);
      expect(mockSetCoverQueueLowPriorityMode).toHaveBeenCalledWith(false);
    });

    it('should throw error if scan job not found in database', async () => {
      mockGetScanJob.mockResolvedValueOnce(null);

      startScanWorker();
      const processorFn = mockWorkerInstance.processor;

      const mockJob = {
        data: {
          scanJobId: 'missing-job',
          libraryId: 'lib-1',
          libraryPath: '/comics',
          forceFullScan: false,
        },
        updateProgress: vi.fn().mockResolvedValue(undefined),
        processedOn: Date.now(),
      } as unknown as Job;

      await expect(processorFn(mockJob)).rejects.toThrow(
        'Scan job missing-job not found in database'
      );
    });
  });

  describe('Event Handlers', () => {
    it('should register event handlers on worker', () => {
      startScanWorker();

      expect(mockWorkerInstance.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockWorkerInstance.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockWorkerInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });
});
