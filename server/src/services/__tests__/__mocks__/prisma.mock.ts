/**
 * Prisma Mock Factory
 *
 * Provides mock database client for isolated unit testing.
 * All methods are mocked with vi.fn() for easy assertion and customization.
 */

import { vi } from 'vitest';

/**
 * Create a mock Prisma client with all commonly used methods.
 */
export function createMockPrismaClient() {
  return {
    library: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'lib-1', ...args.data })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    comicFile: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'file-1', ...args.data })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    series: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'series-1', ...args.data })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    fileMetadata: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'meta-1', ...args.data })),
      upsert: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'meta-1', ...args.create })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    operationLog: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'log-1', ...args.data })),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    batchOperation: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'batch-1', ...args.data })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    metadataJob: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'job-1', ...args.data })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    crossSourceMapping: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'map-1', ...args.data })),
      upsert: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'map-1', ...args.create })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    seriesSourceMapping: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'ssm-1', ...args.data })),
      upsert: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'ssm-1', ...args.create })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    duplicateGroup: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'dup-1', ...args.data })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    seriesProgress: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'prog-1', ...args.data })),
      upsert: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'prog-1', ...args.create })),
      delete: vi.fn().mockResolvedValue({}),
    },
    collectionItem: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'col-item-1', ...args.data })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'user-1', ...args.data })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      count: vi.fn().mockResolvedValue(0),
    },
    session: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'session-1', ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn().mockImplementation((fn) => fn({} as any)),
  };
}

export type MockPrismaClient = ReturnType<typeof createMockPrismaClient>;

/**
 * Create a mock library record.
 */
export function createMockLibrary(overrides: Partial<{
  id: string;
  name: string;
  rootPath: string;
  createdAt: Date;
  updatedAt: Date;
  lastScannedAt: Date | null;
}> = {}) {
  return {
    id: 'lib-1',
    name: 'Test Library',
    rootPath: '/comics',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    lastScannedAt: null,
    ...overrides,
  };
}

/**
 * Create a mock comic file record.
 */
export function createMockComicFile(overrides: Partial<{
  id: string;
  libraryId: string;
  seriesId: string | null;
  path: string;
  relativePath: string;
  filename: string;
  extension: string;
  size: number;
  hash: string | null;
  status: string;
  modifiedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: 'file-1',
    libraryId: 'lib-1',
    seriesId: null,
    path: '/comics/Batman/Batman 001.cbz',
    relativePath: 'Batman/Batman 001.cbz',
    filename: 'Batman 001.cbz',
    extension: 'cbz',
    size: 50000000,
    hash: 'abc123',
    status: 'indexed',
    modifiedAt: new Date('2024-01-01'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock series record.
 */
export function createMockSeriesRecord(overrides: Partial<{
  id: string;
  name: string;
  publisher: string | null;
  startYear: number | null;
  issueCount: number | null;
  comicVineId: string | null;
  metronId: string | null;
  summary: string | null;
  lockedFields: string | null;
  aliases: string | null;
  fieldSources: string | null;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: 'series-1',
    name: 'Batman',
    publisher: 'DC Comics',
    startYear: 2011,
    issueCount: 52,
    comicVineId: null,
    metronId: null,
    summary: null,
    lockedFields: null,
    aliases: null,
    fieldSources: null,
    type: 'western',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock file metadata record.
 */
export function createMockFileMetadata(overrides: Partial<{
  id: string;
  fileId: string;
  series: string | null;
  number: string | null;
  title: string | null;
  publisher: string | null;
  year: number | null;
  month: number | null;
  writer: string | null;
  penciller: string | null;
  summary: string | null;
}> = {}) {
  return {
    id: 'meta-1',
    fileId: 'file-1',
    series: 'Batman',
    number: '1',
    title: 'The Court of Owls',
    publisher: 'DC Comics',
    year: 2011,
    month: 9,
    writer: 'Scott Snyder',
    penciller: 'Greg Capullo',
    summary: 'Batman discovers the Court of Owls',
    ...overrides,
  };
}

/**
 * Create a mock batch operation record.
 */
export function createMockBatchOperation(overrides: Partial<{
  id: string;
  type: string;
  status: string;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
}> = {}) {
  return {
    id: 'batch-1',
    type: 'conversion',
    status: 'pending',
    totalItems: 10,
    processedItems: 0,
    failedItems: 0,
    startedAt: new Date('2024-01-01'),
    completedAt: null,
    error: null,
    ...overrides,
  };
}
