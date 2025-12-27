/**
 * API Service
 *
 * @deprecated Import from './api' instead.
 * This file is maintained for backward compatibility.
 *
 * The API has been split into domain-specific modules:
 * - ./api/shared.ts    - HTTP helpers, constants, and base types
 * - ./api/libraries.ts - Library management and scanning
 * - ./api/files.ts     - File operations and covers
 * - ./api/archives.ts  - Archive and ComicInfo operations
 * - ./api/batch.ts     - Batch operations and rollback
 * - ./api/metadata.ts  - Metadata fetch, approval, and jobs
 * - ./api/reading.ts   - Reading progress, queue, history, and presets
 * - ./api/series.ts    - Series, collections, stats, and achievements
 */

export * from './api';
