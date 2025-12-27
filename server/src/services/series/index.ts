/**
 * Series Service
 *
 * Barrel export for all series-related services.
 * Re-exports all types and functions from the split modules.
 */

// Re-export all types
export * from './series.types.js';

// Re-export CRUD operations
export * from './series-crud.service.js';

// Re-export lookup/search operations
export * from './series-lookup.service.js';

// Re-export merge/duplicate operations
export * from './series-merge.service.js';

// Re-export progress tracking operations
export * from './series-progress.service.js';
