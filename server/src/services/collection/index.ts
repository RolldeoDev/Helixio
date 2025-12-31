/**
 * Collection Service
 *
 * Barrel export for all collection-related services.
 * Re-exports all types and functions from the split modules.
 */

// =============================================================================
// Types
// =============================================================================

export * from './collection.types.js';

// =============================================================================
// CRUD Operations
// =============================================================================

export {
  ensureSystemCollections,
  getSystemCollection,
  getCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
} from './collection-crud.service.js';

// =============================================================================
// Item Management
// =============================================================================

export {
  addItemsToCollection,
  removeItemsFromCollection,
  reorderItems,
  getCollectionsForItem,
  isInCollection,
  isInSystemCollection,
  toggleSystemCollection,
  bulkToggleSystemCollection,
  getUnavailableItemCount,
  removeUnavailableItems,
  markFileItemsUnavailable,
  markSeriesItemsUnavailable,
  restoreSeriesItems,
} from './collection-items.service.js';

// =============================================================================
// Mosaic Cover Operations
// =============================================================================

export {
  pendingMosaicJobs,
  scheduleMosaicRegeneration,
  regenerateCollectionMosaic,
  regenerateMosaicSync,
  getFirst4SeriesIds,
  checkAndScheduleMosaicRegeneration,
  onSeriesCoverChanged,
} from './collection-mosaic.service.js';

// =============================================================================
// Metadata Operations
// =============================================================================

export {
  onSeriesMetadataChanged,
  getPromotedCollections,
  getPromotedCollectionsForGrid,
  toggleCollectionPromotion,
  recalculateCollectionMetadata,
  updateCollectionCover,
  setCollectionCoverHash,
  updateCollectionMetadata,
  getCollectionReadingProgress,
  getCollectionExpanded,
  linkCollectionToPreset,
  unlinkCollectionFromPreset,
} from './collection-metadata.service.js';
