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
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue({}),
    },
    operationLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'log-1', ...args.data })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
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
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'col-item-1', addedAt: new Date(), isAvailable: true, ...args.data })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
    },
    collection: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'col-1',
        isSystem: false,
        systemKey: null,
        sortOrder: 0,
        lockName: false,
        lockDeck: false,
        lockDescription: false,
        lockPublisher: false,
        lockStartYear: false,
        lockEndYear: false,
        lockGenres: false,
        rating: null,
        notes: null,
        visibility: 'private',
        readingMode: null,
        tags: null,
        coverType: 'auto',
        coverSeriesId: null,
        coverFileId: null,
        coverHash: null,
        isPromoted: false,
        promotedOrder: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.data,
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    userReadingProgress: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'progress-1', ...args.data })),
      upsert: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'progress-1', ...args.create })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'user-1', ...args.data })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    session: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'session-1', ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    userSession: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'session-1', ...args.data })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    appSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'default', ...args.create })),
    },
    readerPreset: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'preset-1', ...args.data })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    userLibraryAccess: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'ula-1', ...args.create })),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    filenameTemplate: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'template-1',
        libraryId: null,
        name: 'Test Template',
        description: null,
        filePattern: '{Series} - {Number}.{Extension}',
        folderSegments: null,
        characterRules: null,
        isActive: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.data,
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'template-1',
        libraryId: null,
        name: 'Default',
        description: 'Default file naming template',
        filePattern: '{Series} - {Type} {Number:000} - {Title} ({Year|}).{Extension}',
        folderSegments: '[]',
        characterRules: null,
        isActive: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.create,
        ...args.update,
      })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    originalFilename: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'orig-1',
        fileId: args.data.fileId,
        originalFilename: args.data.originalFilename,
        originalPath: args.data.originalPath,
        renameHistory: args.data.renameHistory ?? '[]',
        firstRenamedAt: new Date(),
        lastRenamedAt: new Date(),
        ...args.data,
      })),
      upsert: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'orig-1',
        ...args.create,
        ...args.update,
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id ?? 'orig-1', ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    apiKey: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'key-1',
        userId: args.data.userId,
        name: args.data.name,
        keyPrefix: args.data.keyPrefix ?? 'hlx_test1234',
        keyHash: args.data.keyHash ?? 'mockhash',
        scopes: args.data.scopes ?? '["read:library"]',
        description: args.data.description ?? null,
        libraryIds: args.data.libraryIds ?? null,
        ipWhitelist: args.data.ipWhitelist ?? null,
        expiresAt: args.data.expiresAt ?? null,
        isActive: args.data.isActive ?? true,
        lastUsedAt: null,
        lastUsedIp: null,
        usageCount: 0,
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
        ...args.data,
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    apiKeyUsageLog: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'log-1',
        apiKeyId: args.data.apiKeyId,
        endpoint: args.data.endpoint,
        method: args.data.method,
        statusCode: args.data.statusCode ?? 200,
        ipAddress: args.data.ipAddress ?? null,
        userAgent: args.data.userAgent ?? null,
        createdAt: new Date(),
        ...args.data,
      })),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    smartCollectionDirtyFlag: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'flag-1',
        userId: args.data.userId ?? null,
        seriesId: args.data.seriesId ?? null,
        fileId: args.data.fileId ?? null,
        reason: args.data.reason,
        createdAt: new Date(),
        ...args.data,
      })),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    externalRating: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'rating-1',
        seriesId: args.data.seriesId ?? null,
        fileId: args.data.fileId ?? null,
        source: args.data.source,
        sourceId: args.data.sourceId ?? null,
        ratingType: args.data.ratingType,
        ratingValue: args.data.ratingValue,
        ratingScale: args.data.ratingScale ?? 10,
        originalValue: args.data.originalValue ?? args.data.ratingValue,
        voteCount: args.data.voteCount ?? null,
        reviewCount: args.data.reviewCount ?? null,
        confidence: args.data.confidence ?? 1.0,
        matchMethod: args.data.matchMethod ?? null,
        lastSyncedAt: new Date(),
        expiresAt: args.data.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.data,
      })),
      upsert: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'rating-1',
        ...args.create,
        ...args.update,
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id ?? 'rating-1', ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _avg: { ratingValue: null } }),
    },
    ratingSyncJob: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'job-1',
        type: args.data.type,
        seriesId: args.data.seriesId ?? null,
        libraryId: args.data.libraryId ?? null,
        status: args.data.status ?? 'pending',
        totalItems: args.data.totalItems ?? 0,
        processedItems: args.data.processedItems ?? 0,
        successItems: args.data.successItems ?? 0,
        failedItems: args.data.failedItems ?? 0,
        unmatchedItems: args.data.unmatchedItems ?? 0,
        sources: args.data.sources ?? '[]',
        forceRefresh: args.data.forceRefresh ?? false,
        error: args.data.error ?? null,
        errorDetails: args.data.errorDetails ?? null,
        unmatchedSeries: args.data.unmatchedSeries ?? null,
        createdAt: new Date(),
        startedAt: args.data.startedAt ?? null,
        completedAt: args.data.completedAt ?? null,
        ...args.data,
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    filterPreset: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'preset-1',
        userId: args.data.userId ?? null,
        isGlobal: args.data.isGlobal ?? false,
        name: args.data.name,
        description: args.data.description ?? null,
        icon: args.data.icon ?? null,
        filterDefinition: args.data.filterDefinition,
        schemaVersion: args.data.schemaVersion ?? 1,
        sortBy: args.data.sortBy ?? null,
        sortOrder: args.data.sortOrder ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.data,
      })),
      update: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn().mockImplementation((arg) => {
      // Handle both callback-style and array-style transactions
      if (typeof arg === 'function') {
        return arg({} as any);
      }
      // Array of promises - resolve all
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return Promise.resolve([]);
    }),
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
export function createMockSeries(overrides: Partial<{
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
  isHidden: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return createMockSeriesRecord(overrides);
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
  genres: string | null;
  type: string;
  isHidden: boolean;
  deletedAt: Date | null;
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
    genres: null,
    type: 'western',
    isHidden: false,
    deletedAt: null,
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

/**
 * Create a mock user record.
 */
export function createMockUser(overrides: Partial<{
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  passwordHash: string;
  role: string;
  isActive: boolean;
  profilePrivate: boolean;
  hideReadingStats: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}> = {}) {
  return {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    // This is the hash for password "password123"
    passwordHash: 'mockhash:mockhash',
    role: 'user',
    isActive: true,
    profilePrivate: false,
    hideReadingStats: false,
    createdAt: new Date('2024-01-01'),
    lastLoginAt: null,
    ...overrides,
  };
}

/**
 * Create a mock collection record.
 */
export function createMockCollection(overrides: Partial<{
  id: string;
  userId: string;
  name: string;
  description: string | null;
  deck: string | null;
  isSystem: boolean;
  systemKey: string | null;
  sortOrder: number;
  lockName: boolean;
  lockDeck: boolean;
  lockDescription: boolean;
  lockPublisher: boolean;
  lockStartYear: boolean;
  lockEndYear: boolean;
  lockGenres: boolean;
  rating: number | null;
  notes: string | null;
  visibility: string;
  readingMode: string | null;
  tags: string | null;
  coverType: string;
  coverSeriesId: string | null;
  coverFileId: string | null;
  coverHash: string | null;
  isPromoted: boolean;
  promotedOrder: number | null;
  // Smart collection fields
  isSmart: boolean;
  smartScope: string | null;
  filterDefinition: string | null;
  filterPresetId: string | null;
  lastEvaluatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { items: number };
}> = {}) {
  return {
    id: 'col-1',
    userId: 'user-1',
    name: 'Test Collection',
    description: 'A test collection',
    deck: null,
    isSystem: false,
    systemKey: null,
    sortOrder: 0,
    lockName: false,
    lockDeck: false,
    lockDescription: false,
    lockPublisher: false,
    lockStartYear: false,
    lockEndYear: false,
    lockGenres: false,
    rating: null,
    notes: null,
    visibility: 'private',
    readingMode: null,
    tags: null,
    coverType: 'auto',
    coverSeriesId: null,
    coverFileId: null,
    coverHash: null,
    isPromoted: false,
    promotedOrder: null,
    // Smart collection defaults
    isSmart: false,
    smartScope: null,
    filterDefinition: null,
    filterPresetId: null,
    lastEvaluatedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock collection item record.
 */
export function createMockCollectionItem(overrides: Partial<{
  id: string;
  collectionId: string;
  seriesId: string | null;
  fileId: string | null;
  position: number;
  addedAt: Date;
  notes: string | null;
  isAvailable: boolean;
  // Smart collection override flags
  isWhitelisted: boolean;
  isBlacklisted: boolean;
}> = {}) {
  return {
    id: 'col-item-1',
    collectionId: 'col-1',
    seriesId: null,
    fileId: null,
    position: 0,
    addedAt: new Date('2024-01-01'),
    notes: null,
    isAvailable: true,
    // Smart collection override defaults
    isWhitelisted: false,
    isBlacklisted: false,
    ...overrides,
  };
}

/**
 * Create a mock reader preset record.
 */
export function createMockReaderPreset(overrides: Partial<{
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  userId: string | null;
  isSystem: boolean;
  isBundled: boolean;
  mode: string;
  direction: string;
  scaling: string;
  customWidth: number | null;
  splitting: string;
  background: string;
  brightness: number;
  colorCorrection: string;
  showPageShadow: boolean;
  autoHideUI: boolean;
  preloadCount: number;
  webtoonGap: number;
  webtoonMaxWidth: number;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: 'preset-1',
    name: 'Test Preset',
    description: 'A test preset',
    icon: 'book',
    userId: null,
    isSystem: false,
    isBundled: false,
    mode: 'single',
    direction: 'ltr',
    scaling: 'fitHeight',
    customWidth: null,
    splitting: 'none',
    background: 'black',
    brightness: 100,
    colorCorrection: 'none',
    showPageShadow: true,
    autoHideUI: true,
    preloadCount: 3,
    webtoonGap: 0,
    webtoonMaxWidth: 800,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock user session record.
 */
export function createMockUserSession(overrides: Partial<{
  id: string;
  userId: string;
  token: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  lastActiveAt: Date;
}> = {}) {
  return {
    id: 'session-1',
    userId: 'user-1',
    token: 'mock-token-123',
    userAgent: 'Mozilla/5.0',
    ipAddress: '127.0.0.1',
    createdAt: new Date('2024-01-01'),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    lastActiveAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock user reading progress record.
 */
export function createMockUserReadingProgress(overrides: Partial<{
  id: string;
  userId: string;
  fileId: string;
  currentPage: number;
  totalPages: number;
  completed: boolean;
  lastReadAt: Date;
  bookmarks: string;
  createdAt: Date;
}> = {}) {
  return {
    id: 'progress-1',
    userId: 'user-1',
    fileId: 'file-1',
    currentPage: 1,
    totalPages: 20,
    completed: false,
    lastReadAt: new Date('2024-01-01'),
    bookmarks: '[]',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock operation log record.
 */
export function createMockOperationLog(overrides: Partial<{
  id: string;
  operation: string;
  source: string;
  destination: string | null;
  status: string;
  reversible: boolean;
  metadata: string | null;
  error: string | null;
  batchId: string | null;
  createdAt: Date;
}> = {}) {
  return {
    id: 'log-1',
    operation: 'convert',
    source: '/comics/test.cbr',
    destination: '/comics/test.cbz',
    status: 'success',
    reversible: false,
    metadata: null,
    error: null,
    batchId: null,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock API key record.
 */
export function createMockApiKey(overrides: Partial<{
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string;
  description: string | null;
  libraryIds: string | null;
  ipWhitelist: string | null;
  expiresAt: Date | null;
  isActive: boolean;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  usageCount: number;
  revokedAt: Date | null;
  revokedReason: string | null;
  createdAt: Date;
  user?: { id: string; username: string; role: string; isActive: boolean };
}> = {}) {
  return {
    id: 'key-1',
    userId: 'user-1',
    name: 'Test API Key',
    keyPrefix: 'hlx_test1234',
    keyHash: 'mockhash',
    scopes: '["read:library"]',
    description: null,
    libraryIds: null,
    ipWhitelist: null,
    expiresAt: null,
    isActive: true,
    lastUsedAt: null,
    lastUsedIp: null,
    usageCount: 0,
    revokedAt: null,
    revokedReason: null,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock API key usage log record.
 */
export function createMockApiKeyUsageLog(overrides: Partial<{
  id: string;
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}> = {}) {
  return {
    id: 'log-1',
    apiKeyId: 'key-1',
    endpoint: '/api/test',
    method: 'GET',
    statusCode: 200,
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock external rating record.
 */
export function createMockExternalRating(overrides: Partial<{
  id: string;
  seriesId: string | null;
  fileId: string | null;
  source: string;
  sourceId: string | null;
  ratingType: string;
  ratingValue: number;
  ratingScale: number;
  originalValue: number;
  voteCount: number | null;
  reviewCount: number | null;
  confidence: number;
  matchMethod: string | null;
  lastSyncedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: 'rating-1',
    seriesId: 'series-1',
    fileId: null,
    source: 'comicbookroundup',
    sourceId: 'cbr-123',
    ratingType: 'community',
    ratingValue: 8.5,
    ratingScale: 10,
    originalValue: 8.5,
    voteCount: 150,
    reviewCount: null,
    confidence: 1.0,
    matchMethod: 'name_year',
    lastSyncedAt: new Date('2024-01-01'),
    expiresAt: new Date('2024-01-08'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock rating sync job record.
 */
export function createMockRatingSyncJob(overrides: Partial<{
  id: string;
  type: string;
  seriesId: string | null;
  libraryId: string | null;
  status: string;
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
  unmatchedItems: number;
  sources: string;
  forceRefresh: boolean;
  error: string | null;
  errorDetails: string | null;
  unmatchedSeries: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}> = {}) {
  return {
    id: 'job-1',
    type: 'library',
    seriesId: null,
    libraryId: 'lib-1',
    status: 'pending',
    totalItems: 10,
    processedItems: 0,
    successItems: 0,
    failedItems: 0,
    unmatchedItems: 0,
    sources: '["comicbookroundup"]',
    forceRefresh: false,
    error: null,
    errorDetails: null,
    unmatchedSeries: null,
    createdAt: new Date('2024-01-01'),
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

/**
 * Create a mock filter preset record.
 */
export function createMockFilterPreset(overrides: Partial<{
  id: string;
  userId: string | null;
  isGlobal: boolean;
  name: string;
  description: string | null;
  icon: string | null;
  filterDefinition: string;
  schemaVersion: number;
  sortBy: string | null;
  sortOrder: string | null;
  createdAt: Date;
  updatedAt: Date;
  linkedCollections: Array<{ id: string; name: string; userId: string; _count: { items: number } }>;
}> = {}) {
  return {
    id: 'preset-1',
    userId: 'user-1',
    isGlobal: false,
    name: 'Test Preset',
    description: null,
    icon: null,
    filterDefinition: JSON.stringify({
      id: 'filter-1',
      name: 'Test Preset',
      rootOperator: 'AND',
      groups: [{
        id: 'group-1',
        operator: 'AND',
        conditions: [{
          id: 'cond-1',
          field: 'publisher',
          comparison: 'equals',
          value: 'Marvel',
        }],
      }],
    }),
    schemaVersion: 1,
    sortBy: null,
    sortOrder: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    linkedCollections: [],
    ...overrides,
  };
}
