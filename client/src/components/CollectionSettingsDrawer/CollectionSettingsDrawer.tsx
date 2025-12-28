/**
 * CollectionSettingsDrawer Component
 *
 * A slide-out drawer for managing collection settings including:
 * - General: Name, description, icon, color
 * - Appearance: Cover source selection
 * - Display: Promotion toggle, metadata overrides
 * - Items: Manage, remove, reorder collection items
 *
 * Uses React Portal to render at document body level.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Collection } from '../../contexts/CollectionsContext';
import {
  CollectionItem,
  getCoverUrl,
  getApiCoverUrl,
  getSeriesCoverUrl,
  getCollectionCoverPreviewUrl,
  uploadCollectionCover,
  setCollectionCoverFromUrl,
  getCollectionDescriptionGenerationStatus,
  generateCollectionDescription,
} from '../../services/api.service';
import {
  type SmartFilter,
  type SmartFilterGroup,
  type SmartScope,
} from '../../services/api/series';
import {
  useRefreshSmartCollection,
  useConvertToSmartCollection,
  useConvertToRegularCollection,
  useSmartCollectionOverrides,
} from '../../hooks/queries/useCollections';
import './CollectionSettingsDrawer.css';

type TabId = 'general' | 'appearance' | 'display' | 'items' | 'smart';

interface CollectionSettingsDrawerProps {
  collection: Collection | null;
  collectionItems: CollectionItem[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: CollectionUpdates) => Promise<void>;
  onRemoveItems: (itemIds: string[]) => Promise<void>;
  onReorderItems: (orderedItemIds: string[]) => Promise<void>;
}

export interface CollectionUpdates {
  name?: string;
  deck?: string;
  description?: string;
  coverType?: 'auto' | 'series' | 'issue' | 'custom';
  coverSeriesId?: string | null;
  coverFileId?: string | null;
  overridePublisher?: string | null;
  overrideStartYear?: number | null;
  overrideEndYear?: number | null;
  overrideGenres?: string | null;
  isPromoted?: boolean;
  // Lock flags
  lockName?: boolean;
  lockDeck?: boolean;
  lockDescription?: boolean;
  lockPublisher?: boolean;
  lockStartYear?: boolean;
  lockEndYear?: boolean;
  lockGenres?: boolean;
  // New fields
  rating?: number | null;
  notes?: string | null;
  visibility?: 'public' | 'private' | 'unlisted';
  readingMode?: 'single' | 'double' | 'webtoon' | null;
}

// Visibility options
const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private', description: 'Only you can see this collection' },
  { value: 'unlisted', label: 'Unlisted', description: 'Anyone with the link can view' },
  { value: 'public', label: 'Public', description: 'Visible to all users' },
] as const;

// Reading mode options
const READING_MODE_OPTIONS = [
  { value: null, label: 'Default', description: 'Use reader default settings' },
  { value: 'single', label: 'Single Page', description: 'One page at a time' },
  { value: 'double', label: 'Double Page', description: 'Two pages side by side' },
  { value: 'webtoon', label: 'Webtoon', description: 'Continuous vertical scroll' },
] as const;

export function CollectionSettingsDrawer({
  collection,
  collectionItems,
  isOpen,
  onClose,
  onSave,
  onRemoveItems,
  onReorderItems,
}: CollectionSettingsDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [deck, setDeck] = useState('');
  const [description, setDescription] = useState('');
  const [coverType, setCoverType] = useState<'auto' | 'series' | 'issue' | 'custom'>('auto');
  const [coverSeriesId, setCoverSeriesId] = useState<string | null>(null);
  const [coverFileId, setCoverFileId] = useState<string | null>(null);
  const [customCoverHash, setCustomCoverHash] = useState<string | null>(null);
  const [customCoverUrl, setCustomCoverUrl] = useState('');
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [overridePublisher, setOverridePublisher] = useState('');
  const [overrideStartYear, setOverrideStartYear] = useState('');
  const [overrideEndYear, setOverrideEndYear] = useState('');
  const [overrideGenres, setOverrideGenres] = useState('');
  const [isPromoted, setIsPromoted] = useState(false);

  // Lock state
  const [lockName, setLockName] = useState(false);
  const [lockDeck, setLockDeck] = useState(false);
  const [lockDescription, setLockDescription] = useState(false);
  const [lockPublisher, setLockPublisher] = useState(false);
  const [lockStartYear, setLockStartYear] = useState(false);
  const [lockEndYear, setLockEndYear] = useState(false);
  const [lockGenres, setLockGenres] = useState(false);

  // New fields state
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'unlisted'>('private');
  const [readingMode, setReadingMode] = useState<'single' | 'double' | 'webtoon' | null>(null);

  // Items state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState<CollectionItem[]>([]);

  // LLM Description Generation State
  const [isLLMAvailable, setIsLLMAvailable] = useState<boolean | null>(null);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [showGenerateConfirmDialog, setShowGenerateConfirmDialog] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Smart Collection State
  const [isSmartEnabled, setIsSmartEnabled] = useState(false);
  const [smartScope, setSmartScope] = useState<SmartScope>('series');
  const [smartFilter, setSmartFilter] = useState<SmartFilter>({
    id: 'root',
    rootOperator: 'AND',
    groups: [],
  });
  const [smartError, setSmartError] = useState<string | null>(null);
  const [showDisableSmartConfirm, setShowDisableSmartConfirm] = useState(false);

  // Smart Collection Mutations
  const refreshSmartMutation = useRefreshSmartCollection();
  const convertToSmartMutation = useConvertToSmartCollection();
  const convertToRegularMutation = useConvertToRegularCollection();

  // Fetch smart collection overrides when viewing a smart collection
  const { data: smartOverrides } = useSmartCollectionOverrides(
    collection?.isSmart ? collection.id : undefined
  );

  // Initialize form state when collection changes
  useEffect(() => {
    if (collection) {
      setName(collection.name);
      setDeck(collection.deck || '');
      setDescription(collection.description || '');
      setCoverType((collection.coverType as 'auto' | 'series' | 'issue' | 'custom') || 'auto');
      setCoverSeriesId(collection.coverSeriesId || null);
      setCoverFileId(collection.coverFileId || null);
      setCustomCoverHash(collection.coverHash || null);
      setCustomCoverUrl('');
      setUploadError(null);
      setOverridePublisher(collection.overridePublisher || '');
      setOverrideStartYear(collection.overrideStartYear?.toString() || '');
      setOverrideEndYear(collection.overrideEndYear?.toString() || '');
      setOverrideGenres(collection.overrideGenres || '');
      setIsPromoted(collection.isPromoted || false);
      // Lock states
      setLockName(collection.lockName || false);
      setLockDeck(collection.lockDeck || false);
      setLockDescription(collection.lockDescription || false);
      setLockPublisher(collection.lockPublisher || false);
      setLockStartYear(collection.lockStartYear || false);
      setLockEndYear(collection.lockEndYear || false);
      setLockGenres(collection.lockGenres || false);
      // New fields
      setRating(collection.rating ?? null);
      setNotes(collection.notes || '');
      setVisibility(collection.visibility || 'private');
      setReadingMode(collection.readingMode || null);
      // Smart collection state
      setIsSmartEnabled(collection.isSmart || false);
      setSmartScope((collection.smartScope as SmartScope) || 'series');
      if (collection.filterDefinition) {
        try {
          setSmartFilter(JSON.parse(collection.filterDefinition));
        } catch {
          setSmartFilter({ id: 'root', rootOperator: 'AND', groups: [] });
        }
      } else {
        setSmartFilter({ id: 'root', rootOperator: 'AND', groups: [] });
      }
      setSmartError(null);
      setHasChanges(false);
    }
  }, [collection]);

  // Sync local items with prop
  useEffect(() => {
    setLocalItems(collectionItems);
  }, [collectionItems]);

  // Check LLM availability on mount
  useEffect(() => {
    let mounted = true;

    const checkLLMAvailability = async () => {
      try {
        const status = await getCollectionDescriptionGenerationStatus();
        if (mounted) {
          setIsLLMAvailable(status.available);
        }
      } catch {
        if (mounted) {
          setIsLLMAvailable(false);
        }
      }
    };

    checkLLMAvailability();

    return () => {
      mounted = false;
    };
  }, []);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node) && isOpen) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Mark changes when form values change - simplified with explicit call
  const markChanged = useCallback(() => {
    setHasChanges(true);
  }, []);

  // Handle file upload for custom cover
  const handleFileUpload = useCallback(async (file: File) => {
    if (!collection) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setUploadError('Invalid file type. Please use JPEG, PNG, WebP, or GIF.');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File too large. Maximum size is 10MB.');
      return;
    }

    setIsUploadingCover(true);
    setUploadError(null);

    try {
      const result = await uploadCollectionCover(collection.id, file);
      setCustomCoverHash(result.coverHash);
      setCoverType('custom');
      markChanged();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload cover');
    } finally {
      setIsUploadingCover(false);
    }
  }, [collection, markChanged]);

  // Handle URL submission for custom cover
  const handleUrlSubmit = useCallback(async () => {
    if (!collection || !customCoverUrl.trim()) return;

    // Validate URL format
    try {
      new URL(customCoverUrl);
    } catch {
      setUploadError('Please enter a valid URL');
      return;
    }

    setIsUploadingCover(true);
    setUploadError(null);

    try {
      const result = await setCollectionCoverFromUrl(collection.id, customCoverUrl);
      setCustomCoverHash(result.coverHash);
      setCoverType('custom');
      setCustomCoverUrl('');
      markChanged();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to set cover from URL');
    } finally {
      setIsUploadingCover(false);
    }
  }, [collection, customCoverUrl, markChanged]);

  // Handle file drag and drop
  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  }, []);

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0 && files[0]) {
      handleFileUpload(files[0]);
    }
  }, [handleFileUpload]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && files[0]) {
      handleFileUpload(files[0]);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [handleFileUpload]);

  // Perform the actual generation
  const performGenerateDescription = useCallback(async () => {
    if (!collection) return;

    setShowGenerateConfirmDialog(false);
    setIsGeneratingDescription(true);
    setGenerateError(null);

    try {
      const result = await generateCollectionDescription(collection.id);

      // Update form state with generated content - only for unlocked fields
      let appliedCount = 0;
      if (result.deck && !lockDeck) {
        setDeck(result.deck);
        appliedCount++;
      }
      if (result.description && !lockDescription) {
        setDescription(result.description);
        appliedCount++;
      }

      if (appliedCount > 0) {
        markChanged();
      } else {
        setGenerateError('All target fields are locked. Unlock them first.');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate description';
      setGenerateError(errorMsg);
    } finally {
      setIsGeneratingDescription(false);
    }
  }, [collection, markChanged, lockDeck, lockDescription]);

  // Handle generate description button click
  const handleGenerateDescriptionClick = useCallback(() => {
    // Check if there's existing unlocked content to overwrite
    const hasUnlockedDeckContent = deck && !lockDeck;
    const hasUnlockedDescriptionContent = description && !lockDescription;
    if (hasUnlockedDeckContent || hasUnlockedDescriptionContent) {
      setShowGenerateConfirmDialog(true);
    } else {
      performGenerateDescription();
    }
  }, [deck, description, lockDeck, lockDescription, performGenerateDescription]);

  // Cancel generation confirmation
  const handleGenerateConfirmCancel = useCallback(() => {
    setShowGenerateConfirmDialog(false);
  }, []);

  // Save handler
  const handleSave = async () => {
    if (!collection) return;

    setIsSaving(true);
    try {
      const updates: CollectionUpdates = {
        name: name !== collection.name ? name : undefined,
        deck: deck !== (collection.deck || '') ? deck || undefined : undefined,
        description: description !== (collection.description || '') ? description || undefined : undefined,
        coverType: coverType !== collection.coverType ? coverType : undefined,
        coverSeriesId: coverSeriesId !== collection.coverSeriesId ? coverSeriesId : undefined,
        coverFileId: coverFileId !== collection.coverFileId ? coverFileId : undefined,
        overridePublisher: overridePublisher !== (collection.overridePublisher || '') ? (overridePublisher || null) : undefined,
        overrideStartYear: overrideStartYear !== (collection.overrideStartYear?.toString() || '')
          ? (overrideStartYear ? parseInt(overrideStartYear) : null)
          : undefined,
        overrideEndYear: overrideEndYear !== (collection.overrideEndYear?.toString() || '')
          ? (overrideEndYear ? parseInt(overrideEndYear) : null)
          : undefined,
        overrideGenres: overrideGenres !== (collection.overrideGenres || '') ? (overrideGenres || null) : undefined,
        isPromoted: isPromoted !== (collection.isPromoted || false) ? isPromoted : undefined,
        // Lock flags
        lockName: lockName !== (collection.lockName || false) ? lockName : undefined,
        lockDeck: lockDeck !== (collection.lockDeck || false) ? lockDeck : undefined,
        lockDescription: lockDescription !== (collection.lockDescription || false) ? lockDescription : undefined,
        lockPublisher: lockPublisher !== (collection.lockPublisher || false) ? lockPublisher : undefined,
        lockStartYear: lockStartYear !== (collection.lockStartYear || false) ? lockStartYear : undefined,
        lockEndYear: lockEndYear !== (collection.lockEndYear || false) ? lockEndYear : undefined,
        lockGenres: lockGenres !== (collection.lockGenres || false) ? lockGenres : undefined,
        // New fields
        rating: rating !== (collection.rating ?? null) ? rating : undefined,
        notes: notes !== (collection.notes || '') ? (notes || null) : undefined,
        visibility: visibility !== (collection.visibility || 'private') ? visibility : undefined,
        readingMode: readingMode !== (collection.readingMode || null) ? readingMode : undefined,
      };

      // Remove undefined values
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      ) as CollectionUpdates;

      if (Object.keys(cleanUpdates).length > 0) {
        await onSave(cleanUpdates);
      }

      setHasChanges(false);
    } catch (err) {
      console.error('Failed to save collection settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Item removal
  const handleRemoveSelected = async () => {
    if (selectedItems.size === 0) return;

    const confirmed = confirm(`Remove ${selectedItems.size} item${selectedItems.size > 1 ? 's' : ''} from this collection?`);
    if (!confirmed) return;

    await onRemoveItems(Array.from(selectedItems));
    setSelectedItems(new Set());
  };

  const handleRemoveItem = async (itemId: string) => {
    const confirmed = confirm('Remove this item from the collection?');
    if (!confirmed) return;

    await onRemoveItems([itemId]);
    setSelectedItems((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetItemId: string) => {
    e.preventDefault();

    if (!draggedItem || draggedItem === targetItemId) {
      setDraggedItem(null);
      return;
    }

    const draggedIndex = localItems.findIndex((item) => item.id === draggedItem);
    const targetIndex = localItems.findIndex((item) => item.id === targetItemId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedItem(null);
      return;
    }

    // Reorder locally first for immediate feedback
    const newItems = [...localItems];
    const removed = newItems.splice(draggedIndex, 1)[0];
    if (!removed) {
      setDraggedItem(null);
      return;
    }
    newItems.splice(targetIndex, 0, removed);
    setLocalItems(newItems);

    // Save to backend
    await onReorderItems(newItems.map((item) => item.id));
    setDraggedItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === localItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(localItems.map((item) => item.id)));
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Get unique series from items for cover selection
  const seriesInCollection = localItems
    .filter((item) => item.seriesId && item.series)
    .map((item) => item.series!)
    .filter((series, index, self) =>
      self.findIndex((s) => s.id === series.id) === index
    );

  // Get cover preview URL
  const getCoverPreviewUrl = (): string | null => {
    if (coverType === 'series' && coverSeriesId) {
      return getSeriesCoverUrl(coverSeriesId);
    }
    if (coverType === 'issue' && coverFileId) {
      return getCoverUrl(coverFileId);
    }
    if (coverType === 'custom' && customCoverHash) {
      return getApiCoverUrl(customCoverHash);
    }
    return null;
  };

  if (!collection) return null;

  const portalTarget = document.body;

  const tabs: { id: TabId; label: string; icon?: React.ReactNode }[] = [
    { id: 'general', label: 'General' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'display', label: 'Display' },
    { id: 'items', label: `Items (${localItems.length})` },
    // Smart tab only for non-system collections
    ...(!collection.isSystem ? [{
      id: 'smart' as TabId,
      label: collection.isSmart ? 'Smart' : 'Smart',
      icon: collection.isSmart ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
      ) : null,
    }] : []),
  ];

  return createPortal(
    <div className={`drawer-overlay collection-settings-overlay ${isOpen ? 'open' : ''}`}>
      <div ref={drawerRef} className={`collection-settings-drawer ${isOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title-section">
            <h2 className="drawer-title">Collection Settings</h2>
            <span className="drawer-subtitle">{collection.name}</span>
          </div>
          <button className="drawer-close" onClick={onClose} title="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="drawer-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`drawer-tab ${activeTab === tab.id ? 'active' : ''} ${tab.icon ? 'has-icon' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon && <span className="tab-icon">{tab.icon}</span>}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="drawer-content">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="tab-content">
              {/* Name with lock */}
              <div className="form-group">
                <div className="label-with-lock">
                  <label htmlFor="collection-name">Name</label>
                  {!collection.isSystem && (
                    <button
                      type="button"
                      className={`lock-toggle ${lockName ? 'locked' : ''}`}
                      onClick={() => { setLockName(!lockName); markChanged(); }}
                      title={lockName ? 'Unlock field' : 'Lock field'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {lockName ? (
                          <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                        ) : (
                          <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 9.9-1" />
                        )}
                      </svg>
                    </button>
                  )}
                </div>
                <input
                  id="collection-name"
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); markChanged(); }}
                  disabled={collection.isSystem || lockName}
                />
                {collection.isSystem && (
                  <span className="form-hint">System collections cannot be renamed</span>
                )}
                {lockName && !collection.isSystem && (
                  <span className="form-hint">Field is locked. Click the lock icon to edit.</span>
                )}
              </div>

              {/* Tagline with lock */}
              <div className="form-group">
                <div className="label-with-lock">
                  <label htmlFor="collection-deck">Tagline</label>
                  <button
                    type="button"
                    className={`lock-toggle ${lockDeck ? 'locked' : ''}`}
                    onClick={() => { setLockDeck(!lockDeck); markChanged(); }}
                    title={lockDeck ? 'Unlock field' : 'Lock field'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {lockDeck ? (
                        <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                      ) : (
                        <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 9.9-1" />
                      )}
                    </svg>
                  </button>
                </div>
                <input
                  id="collection-deck"
                  type="text"
                  value={deck}
                  onChange={(e) => { setDeck(e.target.value); markChanged(); }}
                  placeholder="A short tagline for this collection..."
                  disabled={lockDeck}
                />
                <span className="form-hint">A brief summary shown under the collection title</span>
              </div>

              {/* Description with lock */}
              <div className="form-group">
                <div className="label-with-lock">
                  <label htmlFor="collection-description">Description</label>
                  <button
                    type="button"
                    className={`lock-toggle ${lockDescription ? 'locked' : ''}`}
                    onClick={() => { setLockDescription(!lockDescription); markChanged(); }}
                    title={lockDescription ? 'Unlock field' : 'Lock field'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {lockDescription ? (
                        <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                      ) : (
                        <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 9.9-1" />
                      )}
                    </svg>
                  </button>
                </div>
                <textarea
                  id="collection-description"
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); markChanged(); }}
                  rows={3}
                  placeholder="Add a description..."
                  disabled={lockDescription}
                />
              </div>

              {/* LLM Description Generator */}
              {isLLMAvailable && (
                <div className="form-group generate-description-section">
                  <button
                    type="button"
                    className="generate-description-btn"
                    onClick={handleGenerateDescriptionClick}
                    disabled={isGeneratingDescription || localItems.length === 0 || (lockDeck && lockDescription)}
                  >
                    {isGeneratingDescription ? (
                      <>
                        <span className="spinner-small" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </svg>
                        Generate Description
                      </>
                    )}
                  </button>
                  {localItems.length === 0 && (
                    <span className="form-hint">Add items to the collection first</span>
                  )}
                  {(lockDeck && lockDescription) && (
                    <span className="form-hint">Unlock tagline or description to generate</span>
                  )}
                  {generateError && (
                    <div className="generation-error">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{generateError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Rating */}
              <div className="form-group">
                <label>Rating</label>
                <div className="star-rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`star-btn ${rating && rating >= star ? 'filled' : ''}`}
                      onClick={() => { setRating(rating === star ? null : star); markChanged(); }}
                      title={rating === star ? 'Clear rating' : `Rate ${star} star${star > 1 ? 's' : ''}`}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill={rating && rating >= star ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </button>
                  ))}
                  {rating && (
                    <button
                      type="button"
                      className="clear-rating-btn"
                      onClick={() => { setRating(null); markChanged(); }}
                      title="Clear rating"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="form-group">
                <label htmlFor="collection-notes">Private Notes</label>
                <textarea
                  id="collection-notes"
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); markChanged(); }}
                  rows={2}
                  placeholder="Personal notes about this collection..."
                />
                <span className="form-hint">Only visible to you</span>
              </div>
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="tab-content">
              <div className="form-group">
                <label>Cover Source</label>
                <div className="cover-type-options">
                  {(['auto', 'series', 'issue', 'custom'] as const).map((type) => (
                    <label key={type} className="radio-option">
                      <input
                        type="radio"
                        name="coverType"
                        value={type}
                        checked={coverType === type}
                        onChange={() => { setCoverType(type); markChanged(); }}
                      />
                      <span className="radio-label">
                        {type === 'auto' && 'Auto (Mosaic)'}
                        {type === 'series' && 'Series Cover'}
                        {type === 'issue' && 'Issue Cover'}
                        {type === 'custom' && 'Custom'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="cover-preview-section">
                <label>Preview</label>
                <div className="cover-preview">
                  {coverType === 'auto' ? (
                    /* Use server-generated mosaic preview */
                    <div className="cover-preview-image">
                      {seriesInCollection.length > 0 ? (
                        <img
                          src={getCollectionCoverPreviewUrl(collection.id)}
                          alt={`${collection.name} mosaic preview`}
                        />
                      ) : (
                        <div className="no-cover-placeholder">
                          <span>Add series for mosaic</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="cover-preview-image">
                      {getCoverPreviewUrl() ? (
                        <img src={getCoverPreviewUrl()!} alt="Cover preview" />
                      ) : (
                        <div className="no-cover-placeholder">
                          <span>
                            {coverType === 'series' && 'Select a series'}
                            {coverType === 'issue' && 'Select an issue'}
                            {coverType === 'custom' && 'Upload or enter URL'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {coverType === 'series' && seriesInCollection.length > 0 && (
                <div className="form-group">
                  <label htmlFor="cover-series">Select Series</label>
                  <select
                    id="cover-series"
                    value={coverSeriesId || ''}
                    onChange={(e) => { setCoverSeriesId(e.target.value || null); markChanged(); }}
                  >
                    <option value="">Choose a series...</option>
                    {seriesInCollection.map((series) => (
                      <option key={series.id} value={series.id}>
                        {series.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {coverType === 'issue' && localItems.filter((i) => i.fileId).length > 0 && (
                <div className="form-group">
                  <label htmlFor="cover-issue">Select Issue</label>
                  <select
                    id="cover-issue"
                    value={coverFileId || ''}
                    onChange={(e) => { setCoverFileId(e.target.value || null); markChanged(); }}
                  >
                    <option value="">Choose an issue...</option>
                    {localItems
                      .filter((item) => item.fileId && item.file)
                      .map((item) => (
                        <option key={item.fileId} value={item.fileId!}>
                          {item.file!.filename}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {coverType === 'custom' && (
                <div className="custom-cover-section">
                  {/* File Upload Zone */}
                  <div className="form-group">
                    <label>Upload Image</label>
                    <div
                      className={`upload-dropzone ${isDraggingFile ? 'dragging' : ''} ${isUploadingCover ? 'uploading' : ''}`}
                      onDragOver={handleFileDragOver}
                      onDragLeave={handleFileDragLeave}
                      onDrop={handleFileDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleFileInputChange}
                        style={{ display: 'none' }}
                      />
                      {isUploadingCover ? (
                        <div className="upload-loading">
                          <svg className="spinner" viewBox="0 0 24 24" width="24" height="24">
                            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeLinecap="round" />
                          </svg>
                          <span>Uploading...</span>
                        </div>
                      ) : (
                        <>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          <span>Drop an image here or click to browse</span>
                          <span className="upload-hint">JPEG, PNG, WebP, GIF (max 10MB)</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* URL Input */}
                  <div className="form-group">
                    <label htmlFor="cover-url">Or enter image URL</label>
                    <div className="url-input-group">
                      <input
                        id="cover-url"
                        type="url"
                        value={customCoverUrl}
                        onChange={(e) => setCustomCoverUrl(e.target.value)}
                        placeholder="https://example.com/cover.jpg"
                        disabled={isUploadingCover}
                      />
                      <button
                        type="button"
                        className="url-submit-btn"
                        onClick={handleUrlSubmit}
                        disabled={!customCoverUrl.trim() || isUploadingCover}
                      >
                        {isUploadingCover ? 'Loading...' : 'Apply'}
                      </button>
                    </div>
                  </div>

                  {/* Error Message */}
                  {uploadError && (
                    <div className="upload-error">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{uploadError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Display Tab */}
          {activeTab === 'display' && (
            <div className="tab-content">
              {/* Visibility */}
              <div className="form-group">
                <label htmlFor="collection-visibility">Visibility</label>
                <select
                  id="collection-visibility"
                  value={visibility}
                  onChange={(e) => { setVisibility(e.target.value as 'public' | 'private' | 'unlisted'); markChanged(); }}
                >
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="form-hint">
                  {VISIBILITY_OPTIONS.find(o => o.value === visibility)?.description}
                </span>
              </div>

              {/* Reading Mode */}
              <div className="form-group">
                <label htmlFor="collection-reading-mode">Preferred Reading Mode</label>
                <select
                  id="collection-reading-mode"
                  value={readingMode || ''}
                  onChange={(e) => { setReadingMode(e.target.value as 'single' | 'double' | 'webtoon' | null || null); markChanged(); }}
                >
                  {READING_MODE_OPTIONS.map((opt) => (
                    <option key={opt.value || 'default'} value={opt.value || ''}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="form-hint">
                  {READING_MODE_OPTIONS.find(o => o.value === readingMode)?.description || READING_MODE_OPTIONS[0].description}
                </span>
              </div>

              {/* Tags (inherited from child series) */}
              <div className="form-group">
                <label>Tags</label>
                {collection.derivedTags ? (
                  <div className="derived-tags-display">
                    {collection.derivedTags.split(',').map((tag, idx) => (
                      <span key={idx} className="derived-tag-pill">
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="no-tags-message">No tags from child series</div>
                )}
                <span className="form-hint">
                  Tags are automatically inherited from series in this collection
                </span>
              </div>

              <div className="form-group">
                <div className="toggle-row">
                  <div className="toggle-info">
                    <label>Show on Series Page</label>
                    <span className="form-hint">
                      When enabled, this collection appears alongside series on the main browse page.
                    </span>
                  </div>
                  <button
                    className={`toggle-switch ${isPromoted ? 'active' : ''}`}
                    onClick={() => { setIsPromoted(!isPromoted); markChanged(); }}
                    type="button"
                  >
                    <span className="toggle-slider" />
                  </button>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h4>Metadata Overrides</h4>
                  <span className="form-hint">Override auto-derived values when promoted</span>
                </div>

                {/* Publisher with lock */}
                <div className="form-group">
                  <div className="input-with-reset">
                    <div className="label-with-lock">
                      <label htmlFor="override-publisher">Publisher</label>
                      <button
                        type="button"
                        className={`lock-toggle ${lockPublisher ? 'locked' : ''}`}
                        onClick={() => { setLockPublisher(!lockPublisher); markChanged(); }}
                        title={lockPublisher ? 'Unlock field' : 'Lock field'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          {lockPublisher ? (
                            <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                          ) : (
                            <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 9.9-1" />
                          )}
                        </svg>
                      </button>
                    </div>
                    <button
                      className="reset-btn"
                      onClick={() => { setOverridePublisher(''); markChanged(); }}
                      disabled={!overridePublisher || lockPublisher}
                      title="Reset to auto"
                    >
                      Reset
                    </button>
                  </div>
                  <input
                    id="override-publisher"
                    type="text"
                    value={overridePublisher}
                    onChange={(e) => { setOverridePublisher(e.target.value); markChanged(); }}
                    placeholder={collection.derivedPublisher || 'Auto-derived'}
                    disabled={lockPublisher}
                  />
                </div>

                <div className="form-row">
                  {/* Start Year with lock */}
                  <div className="form-group">
                    <div className="input-with-reset">
                      <div className="label-with-lock">
                        <label htmlFor="override-start-year">Start Year</label>
                        <button
                          type="button"
                          className={`lock-toggle ${lockStartYear ? 'locked' : ''}`}
                          onClick={() => { setLockStartYear(!lockStartYear); markChanged(); }}
                          title={lockStartYear ? 'Unlock field' : 'Lock field'}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {lockStartYear ? (
                              <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                            ) : (
                              <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 9.9-1" />
                            )}
                          </svg>
                        </button>
                      </div>
                      <button
                        className="reset-btn"
                        onClick={() => { setOverrideStartYear(''); markChanged(); }}
                        disabled={!overrideStartYear || lockStartYear}
                        title="Reset to auto"
                      >
                        Reset
                      </button>
                    </div>
                    <input
                      id="override-start-year"
                      type="number"
                      value={overrideStartYear}
                      onChange={(e) => { setOverrideStartYear(e.target.value); markChanged(); }}
                      placeholder={collection.derivedStartYear?.toString() || 'Auto'}
                      min="1900"
                      max="2100"
                      disabled={lockStartYear}
                    />
                  </div>

                  {/* End Year with lock */}
                  <div className="form-group">
                    <div className="input-with-reset">
                      <div className="label-with-lock">
                        <label htmlFor="override-end-year">End Year</label>
                        <button
                          type="button"
                          className={`lock-toggle ${lockEndYear ? 'locked' : ''}`}
                          onClick={() => { setLockEndYear(!lockEndYear); markChanged(); }}
                          title={lockEndYear ? 'Unlock field' : 'Lock field'}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {lockEndYear ? (
                              <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                            ) : (
                              <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 9.9-1" />
                            )}
                          </svg>
                        </button>
                      </div>
                      <button
                        className="reset-btn"
                        onClick={() => { setOverrideEndYear(''); markChanged(); }}
                        disabled={!overrideEndYear || lockEndYear}
                        title="Reset to auto"
                      >
                        Reset
                      </button>
                    </div>
                    <input
                      id="override-end-year"
                      type="number"
                      value={overrideEndYear}
                      onChange={(e) => { setOverrideEndYear(e.target.value); markChanged(); }}
                      placeholder={collection.derivedEndYear?.toString() || 'Auto'}
                      min="1900"
                      max="2100"
                      disabled={lockEndYear}
                    />
                  </div>
                </div>

                {/* Genres with lock */}
                <div className="form-group">
                  <div className="input-with-reset">
                    <div className="label-with-lock">
                      <label htmlFor="override-genres">Genres</label>
                      <button
                        type="button"
                        className={`lock-toggle ${lockGenres ? 'locked' : ''}`}
                        onClick={() => { setLockGenres(!lockGenres); markChanged(); }}
                        title={lockGenres ? 'Unlock field' : 'Lock field'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          {lockGenres ? (
                            <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                          ) : (
                            <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 9.9-1" />
                          )}
                        </svg>
                      </button>
                    </div>
                    <button
                      className="reset-btn"
                      onClick={() => { setOverrideGenres(''); markChanged(); }}
                      disabled={!overrideGenres || lockGenres}
                      title="Reset to auto"
                    >
                      Reset
                    </button>
                  </div>
                  <input
                    id="override-genres"
                    type="text"
                    value={overrideGenres}
                    onChange={(e) => { setOverrideGenres(e.target.value); markChanged(); }}
                    placeholder={collection.derivedGenres || 'Comma-separated genres'}
                    disabled={lockGenres}
                  />
                  <span className="form-hint">Separate genres with commas</span>
                </div>
              </div>
            </div>
          )}

          {/* Items Tab */}
          {activeTab === 'items' && (
            <div className="tab-content items-tab">
              <div className="items-toolbar">
                <label className="select-all">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === localItems.length && localItems.length > 0}
                    onChange={toggleSelectAll}
                  />
                  <span>Select All</span>
                </label>
                <button
                  className="remove-selected-btn"
                  onClick={handleRemoveSelected}
                  disabled={selectedItems.size === 0}
                >
                  Remove Selected ({selectedItems.size})
                </button>
              </div>

              <div className="items-list">
                {localItems.length === 0 ? (
                  <div className="items-empty">
                    <p>This collection is empty.</p>
                    <span className="form-hint">Add items from series or issue detail pages.</span>
                  </div>
                ) : (
                  localItems.map((item) => {
                    const isSeries = !!item.seriesId && item.series;
                    const isFile = !!item.fileId && item.file;
                    const title = isSeries
                      ? item.series!.name
                      : isFile
                      ? item.file!.filename.replace(/\.(cbz|cbr|cb7|pdf)$/i, '')
                      : 'Unknown';

                    const coverUrl = isSeries
                      ? (item.series!.coverHash
                          ? getApiCoverUrl(item.series!.coverHash)
                          : item.series!.coverFileId
                            ? getCoverUrl(item.series!.coverFileId)
                            : item.series!.firstIssueId
                              ? getCoverUrl(item.series!.firstIssueId, item.series!.firstIssueCoverHash)
                              : null)
                      : isFile
                      ? getCoverUrl(item.fileId!)
                      : null;

                    return (
                      <div
                        key={item.id}
                        className={`item-row ${draggedItem === item.id ? 'dragging' : ''} ${selectedItems.has(item.id) ? 'selected' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, item.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="drag-handle" title="Drag to reorder">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="9" cy="6" r="1.5" />
                            <circle cx="15" cy="6" r="1.5" />
                            <circle cx="9" cy="12" r="1.5" />
                            <circle cx="15" cy="12" r="1.5" />
                            <circle cx="9" cy="18" r="1.5" />
                            <circle cx="15" cy="18" r="1.5" />
                          </svg>
                        </div>

                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={() => toggleItemSelection(item.id)}
                          onClick={(e) => e.stopPropagation()}
                        />

                        <div className="item-cover-thumb">
                          {coverUrl ? (
                            <img src={coverUrl} alt={title} />
                          ) : (
                            <div className="no-cover">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                              </svg>
                            </div>
                          )}
                        </div>

                        <div className="item-info">
                          <span className="item-title">{title}</span>
                          <span className={`item-type ${isSeries ? 'series' : 'issue'}`}>
                            {isSeries ? 'Series' : 'Issue'}
                          </span>
                        </div>

                        <button
                          className="item-remove-btn"
                          onClick={() => handleRemoveItem(item.id)}
                          title="Remove from collection"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Smart Tab */}
          {activeTab === 'smart' && !collection.isSystem && (
            <div className="tab-content smart-tab">
              {/* Smart Collection Toggle */}
              <div className="form-group">
                <div className="toggle-row">
                  <div className="toggle-info">
                    <label>Smart Collection</label>
                    <span className="form-hint">
                      Automatically populate this collection based on filter criteria.
                      {collection.isSmart && collection.lastEvaluatedAt && (
                        <span className="last-evaluated">
                          {' '}Last updated: {new Date(collection.lastEvaluatedAt).toLocaleString()}
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    className={`toggle-switch ${isSmartEnabled ? 'active' : ''}`}
                    onClick={() => {
                      if (isSmartEnabled && collection.isSmart) {
                        // Show confirmation when disabling
                        setShowDisableSmartConfirm(true);
                      } else {
                        setIsSmartEnabled(!isSmartEnabled);
                        markChanged();
                      }
                    }}
                    type="button"
                    disabled={convertToSmartMutation.isPending || convertToRegularMutation.isPending}
                  >
                    <span className="toggle-slider" />
                  </button>
                </div>
              </div>

              {/* Smart Collection Settings (only show when enabled) */}
              {isSmartEnabled && (
                <>
                  {/* Scope Selector */}
                  <div className="form-group">
                    <label>Match Scope</label>
                    <div className="scope-options">
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="smartScope"
                          value="series"
                          checked={smartScope === 'series'}
                          onChange={() => { setSmartScope('series'); markChanged(); }}
                        />
                        <span className="radio-label">
                          <strong>Series</strong>
                          <span className="radio-description">Match criteria against series metadata</span>
                        </span>
                      </label>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="smartScope"
                          value="files"
                          checked={smartScope === 'files'}
                          onChange={() => { setSmartScope('files'); markChanged(); }}
                        />
                        <span className="radio-label">
                          <strong>Issues</strong>
                          <span className="radio-description">Match criteria against individual issue metadata</span>
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Filter Builder */}
                  <div className="form-group filter-builder-section">
                    <div className="section-header">
                      <label>Filter Criteria</label>
                      <div className="filter-actions">
                        <select
                          value={smartFilter.rootOperator}
                          onChange={(e) => {
                            setSmartFilter(prev => ({
                              ...prev,
                              rootOperator: e.target.value as 'AND' | 'OR'
                            }));
                            markChanged();
                          }}
                          className="operator-select"
                        >
                          <option value="AND">Match ALL groups</option>
                          <option value="OR">Match ANY group</option>
                        </select>
                        <button
                          type="button"
                          className="btn-small add-group-btn"
                          onClick={() => {
                            const newGroup: SmartFilterGroup = {
                              id: `group-${Date.now()}`,
                              operator: 'AND',
                              conditions: [{
                                id: `cond-${Date.now()}`,
                                field: 'name',
                                comparison: 'contains',
                                value: ''
                              }]
                            };
                            setSmartFilter(prev => ({
                              ...prev,
                              groups: [...prev.groups, newGroup]
                            }));
                            markChanged();
                          }}
                        >
                          + Add Group
                        </button>
                      </div>
                    </div>

                    {smartFilter.groups.length === 0 ? (
                      <div className="no-filters-message">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                        </svg>
                        <p>No filter criteria defined.</p>
                        <span>Add a filter group to define which items should be included in this collection.</span>
                      </div>
                    ) : (
                      <div className="filter-groups">
                        {smartFilter.groups.map((group, groupIndex) => (
                          <div key={group.id} className="filter-group">
                            <div className="group-header">
                              <span className="group-label">
                                {groupIndex > 0 && (
                                  <span className="connector">{smartFilter.rootOperator}</span>
                                )}
                                Group {groupIndex + 1}
                              </span>
                              <div className="group-controls">
                                <select
                                  value={group.operator}
                                  onChange={(e) => {
                                    setSmartFilter(prev => ({
                                      ...prev,
                                      groups: prev.groups.map((g, i) =>
                                        i === groupIndex ? { ...g, operator: e.target.value as 'AND' | 'OR' } : g
                                      )
                                    }));
                                    markChanged();
                                  }}
                                  className="operator-select-small"
                                >
                                  <option value="AND">ALL</option>
                                  <option value="OR">ANY</option>
                                </select>
                                <button
                                  type="button"
                                  className="remove-group-btn"
                                  onClick={() => {
                                    setSmartFilter(prev => ({
                                      ...prev,
                                      groups: prev.groups.filter((_, i) => i !== groupIndex)
                                    }));
                                    markChanged();
                                  }}
                                  title="Remove group"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            <div className="group-conditions">
                              {group.conditions.map((condition, condIndex) => (
                                <div key={condition.id} className="condition-row">
                                  {condIndex > 0 && (
                                    <span className="condition-connector">{group.operator}</span>
                                  )}
                                  <select
                                    value={condition.field}
                                    onChange={(e) => {
                                      setSmartFilter(prev => ({
                                        ...prev,
                                        groups: prev.groups.map((g, gi) =>
                                          gi === groupIndex ? {
                                            ...g,
                                            conditions: g.conditions.map((c, ci) =>
                                              ci === condIndex ? { ...c, field: e.target.value, value: '', value2: undefined } : c
                                            )
                                          } : g
                                        )
                                      }));
                                      markChanged();
                                    }}
                                    className="field-select"
                                  >
                                    <optgroup label="Text Fields">
                                      <option value="name">Name</option>
                                      <option value="publisher">Publisher</option>
                                      <option value="writer">Writer</option>
                                      <option value="penciller">Penciller</option>
                                      <option value="genres">Genres</option>
                                      <option value="tags">Tags</option>
                                      <option value="summary">Summary</option>
                                    </optgroup>
                                    <optgroup label="Numeric Fields">
                                      <option value="startYear">Start Year</option>
                                      <option value="issueCount">Issue Count</option>
                                      <option value="rating">Rating</option>
                                      <option value="pageCount">Page Count</option>
                                    </optgroup>
                                    <optgroup label="Status Fields">
                                      <option value="readStatus">Read Status</option>
                                      <option value="type">Type</option>
                                      <option value="ageRating">Age Rating</option>
                                    </optgroup>
                                    <optgroup label="Date Fields">
                                      <option value="dateAdded">Date Added</option>
                                      <option value="lastReadAt">Last Read</option>
                                    </optgroup>
                                  </select>

                                  <select
                                    value={condition.comparison}
                                    onChange={(e) => {
                                      setSmartFilter(prev => ({
                                        ...prev,
                                        groups: prev.groups.map((g, gi) =>
                                          gi === groupIndex ? {
                                            ...g,
                                            conditions: g.conditions.map((c, ci) =>
                                              ci === condIndex ? { ...c, comparison: e.target.value } : c
                                            )
                                          } : g
                                        )
                                      }));
                                      markChanged();
                                    }}
                                    className="comparison-select"
                                  >
                                    {['name', 'publisher', 'writer', 'penciller', 'genres', 'tags', 'summary'].includes(condition.field) && (
                                      <>
                                        <option value="contains">contains</option>
                                        <option value="notContains">doesn't contain</option>
                                        <option value="equals">equals</option>
                                        <option value="notEquals">doesn't equal</option>
                                        <option value="startsWith">starts with</option>
                                        <option value="endsWith">ends with</option>
                                        <option value="regex">matches regex</option>
                                        <option value="isEmpty">is empty</option>
                                        <option value="isNotEmpty">is not empty</option>
                                      </>
                                    )}
                                    {['startYear', 'issueCount', 'rating', 'pageCount'].includes(condition.field) && (
                                      <>
                                        <option value="equals">equals</option>
                                        <option value="notEquals">doesn't equal</option>
                                        <option value="greaterThan">greater than</option>
                                        <option value="lessThan">less than</option>
                                        <option value="greaterOrEqual">greater or equal</option>
                                        <option value="lessOrEqual">less or equal</option>
                                        <option value="between">between</option>
                                      </>
                                    )}
                                    {condition.field === 'readStatus' && (
                                      <>
                                        <option value="equals">is</option>
                                        <option value="notEquals">is not</option>
                                      </>
                                    )}
                                    {['type', 'ageRating'].includes(condition.field) && (
                                      <>
                                        <option value="equals">is</option>
                                        <option value="notEquals">is not</option>
                                      </>
                                    )}
                                    {['dateAdded', 'lastReadAt'].includes(condition.field) && (
                                      <>
                                        <option value="inLast">in the last</option>
                                        <option value="notInLast">not in the last</option>
                                        <option value="before">before</option>
                                        <option value="after">after</option>
                                        <option value="between">between</option>
                                      </>
                                    )}
                                  </select>

                                  {/* Value input - varies by field type */}
                                  {!['isEmpty', 'isNotEmpty'].includes(condition.comparison) && (
                                    <>
                                      {condition.field === 'readStatus' ? (
                                        <select
                                          value={condition.value}
                                          onChange={(e) => {
                                            setSmartFilter(prev => ({
                                              ...prev,
                                              groups: prev.groups.map((g, gi) =>
                                                gi === groupIndex ? {
                                                  ...g,
                                                  conditions: g.conditions.map((c, ci) =>
                                                    ci === condIndex ? { ...c, value: e.target.value } : c
                                                  )
                                                } : g
                                              )
                                            }));
                                            markChanged();
                                          }}
                                          className="value-select"
                                        >
                                          <option value="">Select...</option>
                                          <option value="unread">Unread</option>
                                          <option value="reading">Reading</option>
                                          <option value="completed">Completed</option>
                                        </select>
                                      ) : condition.field === 'type' ? (
                                        <select
                                          value={condition.value}
                                          onChange={(e) => {
                                            setSmartFilter(prev => ({
                                              ...prev,
                                              groups: prev.groups.map((g, gi) =>
                                                gi === groupIndex ? {
                                                  ...g,
                                                  conditions: g.conditions.map((c, ci) =>
                                                    ci === condIndex ? { ...c, value: e.target.value } : c
                                                  )
                                                } : g
                                              )
                                            }));
                                            markChanged();
                                          }}
                                          className="value-select"
                                        >
                                          <option value="">Select...</option>
                                          <option value="western">Western</option>
                                          <option value="manga">Manga</option>
                                        </select>
                                      ) : ['inLast', 'notInLast'].includes(condition.comparison) ? (
                                        <div className="date-relative-input">
                                          <input
                                            type="number"
                                            value={condition.value}
                                            onChange={(e) => {
                                              setSmartFilter(prev => ({
                                                ...prev,
                                                groups: prev.groups.map((g, gi) =>
                                                  gi === groupIndex ? {
                                                    ...g,
                                                    conditions: g.conditions.map((c, ci) =>
                                                      ci === condIndex ? { ...c, value: e.target.value } : c
                                                    )
                                                  } : g
                                                )
                                              }));
                                              markChanged();
                                            }}
                                            placeholder="7"
                                            min="1"
                                            className="value-input-small"
                                          />
                                          <select
                                            value={condition.value2 || 'days'}
                                            onChange={(e) => {
                                              setSmartFilter(prev => ({
                                                ...prev,
                                                groups: prev.groups.map((g, gi) =>
                                                  gi === groupIndex ? {
                                                    ...g,
                                                    conditions: g.conditions.map((c, ci) =>
                                                      ci === condIndex ? { ...c, value2: e.target.value } : c
                                                    )
                                                  } : g
                                                )
                                              }));
                                              markChanged();
                                            }}
                                            className="unit-select"
                                          >
                                            <option value="days">days</option>
                                            <option value="weeks">weeks</option>
                                            <option value="months">months</option>
                                            <option value="years">years</option>
                                          </select>
                                        </div>
                                      ) : condition.comparison === 'between' ? (
                                        <div className="between-inputs">
                                          <input
                                            type={['startYear', 'issueCount', 'rating', 'pageCount'].includes(condition.field) ? 'number' : 'date'}
                                            value={condition.value}
                                            onChange={(e) => {
                                              setSmartFilter(prev => ({
                                                ...prev,
                                                groups: prev.groups.map((g, gi) =>
                                                  gi === groupIndex ? {
                                                    ...g,
                                                    conditions: g.conditions.map((c, ci) =>
                                                      ci === condIndex ? { ...c, value: e.target.value } : c
                                                    )
                                                  } : g
                                                )
                                              }));
                                              markChanged();
                                            }}
                                            placeholder="From"
                                            className="value-input-small"
                                          />
                                          <span className="between-separator">and</span>
                                          <input
                                            type={['startYear', 'issueCount', 'rating', 'pageCount'].includes(condition.field) ? 'number' : 'date'}
                                            value={condition.value2 || ''}
                                            onChange={(e) => {
                                              setSmartFilter(prev => ({
                                                ...prev,
                                                groups: prev.groups.map((g, gi) =>
                                                  gi === groupIndex ? {
                                                    ...g,
                                                    conditions: g.conditions.map((c, ci) =>
                                                      ci === condIndex ? { ...c, value2: e.target.value } : c
                                                    )
                                                  } : g
                                                )
                                              }));
                                              markChanged();
                                            }}
                                            placeholder="To"
                                            className="value-input-small"
                                          />
                                        </div>
                                      ) : (
                                        <input
                                          type={['startYear', 'issueCount', 'rating', 'pageCount'].includes(condition.field) ? 'number' : ['before', 'after'].includes(condition.comparison) ? 'date' : 'text'}
                                          value={condition.value}
                                          onChange={(e) => {
                                            setSmartFilter(prev => ({
                                              ...prev,
                                              groups: prev.groups.map((g, gi) =>
                                                gi === groupIndex ? {
                                                  ...g,
                                                  conditions: g.conditions.map((c, ci) =>
                                                    ci === condIndex ? { ...c, value: e.target.value } : c
                                                  )
                                                } : g
                                              )
                                            }));
                                            markChanged();
                                          }}
                                          placeholder="Value..."
                                          className="value-input"
                                        />
                                      )}
                                    </>
                                  )}

                                  <button
                                    type="button"
                                    className="remove-condition-btn"
                                    onClick={() => {
                                      setSmartFilter(prev => ({
                                        ...prev,
                                        groups: prev.groups.map((g, gi) =>
                                          gi === groupIndex ? {
                                            ...g,
                                            conditions: g.conditions.filter((_, ci) => ci !== condIndex)
                                          } : g
                                        ).filter(g => g.conditions.length > 0)
                                      }));
                                      markChanged();
                                    }}
                                    title="Remove condition"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M18 6L6 18M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ))}

                              <button
                                type="button"
                                className="add-condition-btn"
                                onClick={() => {
                                  setSmartFilter(prev => ({
                                    ...prev,
                                    groups: prev.groups.map((g, gi) =>
                                      gi === groupIndex ? {
                                        ...g,
                                        conditions: [...g.conditions, {
                                          id: `cond-${Date.now()}`,
                                          field: 'name',
                                          comparison: 'contains',
                                          value: ''
                                        }]
                                      } : g
                                    )
                                  }));
                                  markChanged();
                                }}
                              >
                                + Add Condition
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="smart-actions">
                    {collection.isSmart && (
                      <button
                        type="button"
                        className="refresh-smart-btn"
                        onClick={async () => {
                          try {
                            setSmartError(null);
                            const result = await refreshSmartMutation.mutateAsync(collection.id);
                            // Show success feedback
                            setSmartError(`Refreshed: ${result.added} added, ${result.removed} removed`);
                            setTimeout(() => setSmartError(null), 3000);
                          } catch (err) {
                            setSmartError(err instanceof Error ? err.message : 'Failed to refresh');
                          }
                        }}
                        disabled={refreshSmartMutation.isPending}
                      >
                        {refreshSmartMutation.isPending ? (
                          <>
                            <span className="spinner-small" />
                            Refreshing...
                          </>
                        ) : (
                          <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M23 4v6h-6M1 20v-6h6" />
                              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                            Refresh Now
                          </>
                        )}
                      </button>
                    )}

                    {!collection.isSmart && smartFilter.groups.length > 0 && (
                      <button
                        type="button"
                        className="btn-primary apply-smart-btn"
                        onClick={async () => {
                          try {
                            setSmartError(null);
                            const result = await convertToSmartMutation.mutateAsync({
                              collectionId: collection.id,
                              filter: smartFilter,
                              scope: smartScope,
                            });
                            setSmartError(`Smart collection created: ${result.added} items added`);
                            setTimeout(() => setSmartError(null), 3000);
                          } catch (err) {
                            setSmartError(err instanceof Error ? err.message : 'Failed to convert');
                          }
                        }}
                        disabled={convertToSmartMutation.isPending}
                      >
                        {convertToSmartMutation.isPending ? 'Converting...' : 'Enable Smart Collection'}
                      </button>
                    )}
                  </div>

                  {smartError && (
                    <div className={`smart-feedback ${smartError.startsWith('Refreshed') || smartError.startsWith('Smart collection created') ? 'success' : 'error'}`}>
                      {smartError}
                    </div>
                  )}

                  {/* Whitelist/Blacklist Section */}
                  {collection.isSmart && smartOverrides && (
                    <div className="overrides-section">
                      <div className="form-section">
                        <div className="section-header">
                          <h4>Manual Overrides</h4>
                          <span className="form-hint">Items manually included or excluded from automatic filtering</span>
                        </div>

                        {/* Whitelist */}
                        <div className="override-list">
                          <label className="override-label">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                              <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            Always Include ({smartOverrides.whitelist.length})
                          </label>
                          {smartOverrides.whitelist.length === 0 ? (
                            <span className="empty-override">No items manually included</span>
                          ) : (
                            <div className="override-items">
                              {smartOverrides.whitelist.slice(0, 5).map((item, idx) => (
                                <span key={idx} className="override-item whitelist">
                                  {item.seriesId ? 'Series' : 'Issue'} #{idx + 1}
                                </span>
                              ))}
                              {smartOverrides.whitelist.length > 5 && (
                                <span className="override-more">+{smartOverrides.whitelist.length - 5} more</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Blacklist */}
                        <div className="override-list">
                          <label className="override-label">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                            </svg>
                            Always Exclude ({smartOverrides.blacklist.length})
                          </label>
                          {smartOverrides.blacklist.length === 0 ? (
                            <span className="empty-override">No items manually excluded</span>
                          ) : (
                            <div className="override-items">
                              {smartOverrides.blacklist.slice(0, 5).map((item, idx) => (
                                <span key={idx} className="override-item blacklist">
                                  {item.seriesId ? 'Series' : 'Issue'} #{idx + 1}
                                </span>
                              ))}
                              {smartOverrides.blacklist.length > 5 && (
                                <span className="override-more">+{smartOverrides.blacklist.length - 5} more</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="drawer-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Generate Description Confirmation Dialog */}
        {showGenerateConfirmDialog && (
          <div className="confirm-dialog-overlay" onClick={handleGenerateConfirmCancel}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Replace Existing Content?</h3>
              <p>
                This collection already has a description or tagline. Generating a new one will replace the existing content.
              </p>
              <div className="confirm-dialog-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleGenerateConfirmCancel}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={performGenerateDescription}
                >
                  Replace
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Disable Smart Collection Confirmation Dialog */}
        {showDisableSmartConfirm && (
          <div className="confirm-dialog-overlay" onClick={() => setShowDisableSmartConfirm(false)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Disable Smart Collection?</h3>
              <p>
                This will convert the collection back to a regular collection. The current items will remain,
                but automatic updates based on filter criteria will stop. Manual overrides (whitelist/blacklist)
                will be preserved but inactive.
              </p>
              <div className="confirm-dialog-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowDisableSmartConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={async () => {
                    setShowDisableSmartConfirm(false);
                    try {
                      setSmartError(null);
                      await convertToRegularMutation.mutateAsync(collection.id);
                      setIsSmartEnabled(false);
                      setSmartError('Smart collection disabled');
                      setTimeout(() => setSmartError(null), 3000);
                    } catch (err) {
                      setSmartError(err instanceof Error ? err.message : 'Failed to disable');
                    }
                  }}
                  disabled={convertToRegularMutation.isPending}
                >
                  {convertToRegularMutation.isPending ? 'Disabling...' : 'Disable Smart'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    portalTarget
  );
}
