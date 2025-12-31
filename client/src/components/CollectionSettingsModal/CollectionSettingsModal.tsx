/**
 * CollectionSettingsModal Component
 *
 * A spacious centered modal for managing collection settings including:
 * - General: Name, description, rating, notes
 * - Appearance: Cover source selection with live preview
 * - Display: Visibility, reading mode, metadata overrides
 * - Items: Grid view with covers for managing collection items
 * - Smart: Filter-based automatic collection management
 *
 * Uses React Portal to render at document body level.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  getReaderPresetsGrouped,
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
import './CollectionSettingsModal.css';

type TabId = 'general' | 'appearance' | 'display' | 'items' | 'smart';

interface CollectionSettingsModalProps {
  collection: Collection | null;
  collectionItems: CollectionItem[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: CollectionUpdates) => Promise<void>;
  onRemoveItems: (itemIds: string[]) => Promise<void>;
  onReorderItems: (orderedItemIds: string[]) => Promise<void>;
  /** Called after smart collection operations (refresh, convert) to notify parent to refetch */
  onRefresh?: () => void;
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
  lockName?: boolean;
  lockDeck?: boolean;
  lockDescription?: boolean;
  lockPublisher?: boolean;
  lockStartYear?: boolean;
  lockEndYear?: boolean;
  lockGenres?: boolean;
  rating?: number | null;
  notes?: string | null;
  visibility?: 'public' | 'private' | 'unlisted';
  readerPresetId?: string | null;
}

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private', description: 'Only you can see this collection' },
  { value: 'unlisted', label: 'Unlisted', description: 'Anyone with the link can view' },
  { value: 'public', label: 'Public', description: 'Visible to all users' },
] as const;

export function CollectionSettingsModal({
  collection,
  collectionItems,
  isOpen,
  onClose,
  onSave,
  onRemoveItems,
  onReorderItems,
  onRefresh,
}: CollectionSettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
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
  const [readerPresetId, setReaderPresetId] = useState<string | null>(null);

  // Reader presets state
  const [readerPresets, setReaderPresets] = useState<{
    bundled: Array<{ id: string; name: string; description: string | null }>;
    system: Array<{ id: string; name: string; description: string | null }>;
    user: Array<{ id: string; name: string; description: string | null }>;
  } | null>(null);

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
      setLockName(collection.lockName || false);
      setLockDeck(collection.lockDeck || false);
      setLockDescription(collection.lockDescription || false);
      setLockPublisher(collection.lockPublisher || false);
      setLockStartYear(collection.lockStartYear || false);
      setLockEndYear(collection.lockEndYear || false);
      setLockGenres(collection.lockGenres || false);
      setRating(collection.rating ?? null);
      setNotes(collection.notes || '');
      setVisibility(collection.visibility || 'private');
      setReaderPresetId(collection.readerPresetId || null);
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

  useEffect(() => {
    setLocalItems(collectionItems);
  }, [collectionItems]);

  useEffect(() => {
    let mounted = true;
    const checkLLMAvailability = async () => {
      try {
        const status = await getCollectionDescriptionGenerationStatus();
        if (mounted) setIsLLMAvailable(status.available);
      } catch {
        if (mounted) setIsLLMAvailable(false);
      }
    };
    checkLLMAvailability();
    return () => { mounted = false; };
  }, []);

  // Fetch reader presets
  useEffect(() => {
    let mounted = true;
    const fetchPresets = async () => {
      try {
        const presets = await getReaderPresetsGrouped();
        if (mounted) setReaderPresets(presets);
      } catch {
        // Ignore errors, presets are optional
      }
    };
    fetchPresets();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const markChanged = useCallback(() => setHasChanges(true), []);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!collection) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setUploadError('Invalid file type. Please use JPEG, PNG, WebP, or GIF.');
      return;
    }
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

  const handleUrlSubmit = useCallback(async () => {
    if (!collection || !customCoverUrl.trim()) return;
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

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && files[0]) {
      handleFileUpload(files[0]);
    }
    e.target.value = '';
  }, [handleFileUpload]);

  const performGenerateDescription = useCallback(async () => {
    if (!collection) return;
    setShowGenerateConfirmDialog(false);
    setIsGeneratingDescription(true);
    setGenerateError(null);
    try {
      const result = await generateCollectionDescription(collection.id);
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
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate description');
    } finally {
      setIsGeneratingDescription(false);
    }
  }, [collection, markChanged, lockDeck, lockDescription]);

  const handleGenerateDescriptionClick = useCallback(() => {
    const hasUnlockedDeckContent = deck && !lockDeck;
    const hasUnlockedDescriptionContent = description && !lockDescription;
    if (hasUnlockedDeckContent || hasUnlockedDescriptionContent) {
      setShowGenerateConfirmDialog(true);
    } else {
      performGenerateDescription();
    }
  }, [deck, description, lockDeck, lockDescription, performGenerateDescription]);

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
        lockName: lockName !== (collection.lockName || false) ? lockName : undefined,
        lockDeck: lockDeck !== (collection.lockDeck || false) ? lockDeck : undefined,
        lockDescription: lockDescription !== (collection.lockDescription || false) ? lockDescription : undefined,
        lockPublisher: lockPublisher !== (collection.lockPublisher || false) ? lockPublisher : undefined,
        lockStartYear: lockStartYear !== (collection.lockStartYear || false) ? lockStartYear : undefined,
        lockEndYear: lockEndYear !== (collection.lockEndYear || false) ? lockEndYear : undefined,
        lockGenres: lockGenres !== (collection.lockGenres || false) ? lockGenres : undefined,
        rating: rating !== (collection.rating ?? null) ? rating : undefined,
        notes: notes !== (collection.notes || '') ? (notes || null) : undefined,
        visibility: visibility !== (collection.visibility || 'private') ? visibility : undefined,
        readerPresetId: readerPresetId !== (collection.readerPresetId || null) ? readerPresetId : undefined,
      };
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
    const newItems = [...localItems];
    const removed = newItems.splice(draggedIndex, 1)[0];
    if (!removed) {
      setDraggedItem(null);
      return;
    }
    newItems.splice(targetIndex, 0, removed);
    setLocalItems(newItems);
    await onReorderItems(newItems.map((item) => item.id));
    setDraggedItem(null);
  };

  const handleDragEnd = () => setDraggedItem(null);

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
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const seriesInCollection = useMemo(() => localItems
    .filter((item) => item.seriesId && item.series)
    .map((item) => item.series!)
    .filter((series, index, self) =>
      self.findIndex((s) => s.id === series.id) === index
    ), [localItems]);

  const getCoverPreviewUrl = useCallback((): string | null => {
    if (coverType === 'series' && coverSeriesId) return getSeriesCoverUrl(coverSeriesId);
    if (coverType === 'issue' && coverFileId) return getCoverUrl(coverFileId);
    if (coverType === 'custom' && customCoverHash) return getApiCoverUrl(customCoverHash);
    return null;
  }, [coverType, coverSeriesId, coverFileId, customCoverHash]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!collection) return null;

  const tabs: { id: TabId; label: string; count?: number; icon?: React.ReactNode }[] = [
    { id: 'general', label: 'General' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'display', label: 'Display' },
    { id: 'items', label: 'Items', count: localItems.length },
    ...(!collection.isSystem ? [{
      id: 'smart' as TabId,
      label: 'Smart',
      icon: collection.isSmart ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
      ) : null,
    }] : []),
  ];

  return createPortal(
    <div
      className={`csm-overlay ${isOpen ? 'csm-overlay--open' : ''}`}
      onClick={handleOverlayClick}
    >
      <div
        ref={modalRef}
        className={`csm-modal ${isOpen ? 'csm-modal--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="csm-title"
      >
        {/* Header */}
        <header className="csm-header">
          <div className="csm-header__content">
            <div className="csm-header__title-group">
              <h2 id="csm-title" className="csm-header__title">Collection Settings</h2>
              <span className="csm-header__subtitle">{collection.name}</span>
            </div>
            <button
              className="csm-header__close"
              onClick={onClose}
              title="Close"
              aria-label="Close modal"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab Bar */}
          <nav className="csm-tabs" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`csm-tab ${activeTab === tab.id ? 'csm-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon && <span className="csm-tab__icon">{tab.icon}</span>}
                <span className="csm-tab__label">{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="csm-tab__count">{tab.count}</span>
                )}
              </button>
            ))}
          </nav>
        </header>

        {/* Content */}
        <main className="csm-content">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="csm-tab-content csm-tab-content--general">
              <div className="csm-form-section">
                {/* Name */}
                <div className="csm-field">
                  <div className="csm-field__header">
                    <label htmlFor="csm-name" className="csm-field__label">Name</label>
                    {!collection.isSystem && (
                      <button
                        type="button"
                        className={`csm-lock ${lockName ? 'csm-lock--locked' : ''}`}
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
                    id="csm-name"
                    type="text"
                    className="csm-input"
                    value={name}
                    onChange={(e) => { setName(e.target.value); markChanged(); }}
                    disabled={collection.isSystem || lockName}
                  />
                  {collection.isSystem && (
                    <span className="csm-field__hint">System collections cannot be renamed</span>
                  )}
                </div>

                {/* Tagline */}
                <div className="csm-field">
                  <div className="csm-field__header">
                    <label htmlFor="csm-deck" className="csm-field__label">Tagline</label>
                    <button
                      type="button"
                      className={`csm-lock ${lockDeck ? 'csm-lock--locked' : ''}`}
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
                    id="csm-deck"
                    type="text"
                    className="csm-input"
                    value={deck}
                    onChange={(e) => { setDeck(e.target.value); markChanged(); }}
                    placeholder="A short tagline for this collection..."
                    disabled={lockDeck}
                  />
                  <span className="csm-field__hint">A brief summary shown under the collection title</span>
                </div>

                {/* Description */}
                <div className="csm-field">
                  <div className="csm-field__header">
                    <label htmlFor="csm-description" className="csm-field__label">Description</label>
                    <button
                      type="button"
                      className={`csm-lock ${lockDescription ? 'csm-lock--locked' : ''}`}
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
                    id="csm-description"
                    className="csm-textarea"
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); markChanged(); }}
                    rows={4}
                    placeholder="Add a description..."
                    disabled={lockDescription}
                  />
                </div>

                {/* AI Description Generator */}
                {isLLMAvailable && (
                  <div className="csm-ai-generate">
                    <button
                      type="button"
                      className="csm-btn csm-btn--secondary csm-btn--ai"
                      onClick={handleGenerateDescriptionClick}
                      disabled={isGeneratingDescription || localItems.length === 0 || (lockDeck && lockDescription)}
                    >
                      {isGeneratingDescription ? (
                        <>
                          <span className="csm-spinner" />
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
                      <span className="csm-field__hint">Add items to the collection first</span>
                    )}
                    {generateError && (
                      <div className="csm-error">
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
              </div>

              <div className="csm-form-section">
                {/* Rating */}
                <div className="csm-field">
                  <label className="csm-field__label">Rating</label>
                  <div className="csm-rating">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        className={`csm-rating__star ${rating && rating >= star ? 'csm-rating__star--filled' : ''}`}
                        onClick={() => { setRating(rating === star ? null : star); markChanged(); }}
                        title={rating === star ? 'Clear rating' : `Rate ${star} star${star > 1 ? 's' : ''}`}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill={rating && rating >= star ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </button>
                    ))}
                    {rating && (
                      <button
                        type="button"
                        className="csm-btn csm-btn--ghost csm-btn--small"
                        onClick={() => { setRating(null); markChanged(); }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div className="csm-field">
                  <label htmlFor="csm-notes" className="csm-field__label">Private Notes</label>
                  <textarea
                    id="csm-notes"
                    className="csm-textarea csm-textarea--small"
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); markChanged(); }}
                    rows={3}
                    placeholder="Personal notes about this collection..."
                  />
                  <span className="csm-field__hint">Only visible to you</span>
                </div>
              </div>
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="csm-tab-content csm-tab-content--appearance">
              <div className="csm-appearance-layout">
                <div className="csm-appearance-controls">
                  <div className="csm-field">
                    <label className="csm-field__label">Cover Source</label>
                    <div className="csm-radio-group">
                      {(['auto', 'series', 'issue', 'custom'] as const).map((type) => (
                        <label key={type} className="csm-radio">
                          <input
                            type="radio"
                            name="coverType"
                            value={type}
                            checked={coverType === type}
                            onChange={() => { setCoverType(type); markChanged(); }}
                          />
                          <span className="csm-radio__indicator" />
                          <span className="csm-radio__label">
                            {type === 'auto' && 'Auto (Mosaic)'}
                            {type === 'series' && 'Series Cover'}
                            {type === 'issue' && 'Issue Cover'}
                            {type === 'custom' && 'Custom'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {coverType === 'series' && seriesInCollection.length > 0 && (
                    <div className="csm-field">
                      <label htmlFor="csm-cover-series" className="csm-field__label">Select Series</label>
                      <select
                        id="csm-cover-series"
                        className="csm-select"
                        value={coverSeriesId || ''}
                        onChange={(e) => { setCoverSeriesId(e.target.value || null); markChanged(); }}
                      >
                        <option value="">Choose a series...</option>
                        {seriesInCollection.map((series) => (
                          <option key={series.id} value={series.id}>{series.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {coverType === 'issue' && localItems.filter((i) => i.fileId).length > 0 && (
                    <div className="csm-field">
                      <label htmlFor="csm-cover-issue" className="csm-field__label">Select Issue</label>
                      <select
                        id="csm-cover-issue"
                        className="csm-select"
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
                    <div className="csm-custom-cover">
                      <div className="csm-field">
                        <label className="csm-field__label">Upload Image</label>
                        <div
                          className={`csm-dropzone ${isDraggingFile ? 'csm-dropzone--dragging' : ''} ${isUploadingCover ? 'csm-dropzone--uploading' : ''}`}
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
                            <div className="csm-dropzone__loading">
                              <span className="csm-spinner csm-spinner--large" />
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
                              <span className="csm-dropzone__hint">JPEG, PNG, WebP, GIF (max 10MB)</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="csm-field">
                        <label htmlFor="csm-cover-url" className="csm-field__label">Or enter image URL</label>
                        <div className="csm-url-input">
                          <input
                            id="csm-cover-url"
                            type="url"
                            className="csm-input"
                            value={customCoverUrl}
                            onChange={(e) => setCustomCoverUrl(e.target.value)}
                            placeholder="https://example.com/cover.jpg"
                            disabled={isUploadingCover}
                          />
                          <button
                            type="button"
                            className="csm-btn csm-btn--secondary"
                            onClick={handleUrlSubmit}
                            disabled={!customCoverUrl.trim() || isUploadingCover}
                          >
                            Apply
                          </button>
                        </div>
                      </div>

                      {uploadError && (
                        <div className="csm-error">
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

                <div className="csm-appearance-preview">
                  <label className="csm-field__label">Preview</label>
                  <div className="csm-cover-preview">
                    {coverType === 'auto' ? (
                      seriesInCollection.length > 0 ? (
                        <img
                          src={getCollectionCoverPreviewUrl(collection.id)}
                          alt={`${collection.name} mosaic preview`}
                        />
                      ) : (
                        <div className="csm-cover-preview__placeholder">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="3" width="7" height="7" rx="1" />
                            <rect x="3" y="14" width="7" height="7" rx="1" />
                            <rect x="14" y="14" width="7" height="7" rx="1" />
                          </svg>
                          <span>Add series for mosaic</span>
                        </div>
                      )
                    ) : (
                      getCoverPreviewUrl() ? (
                        <img src={getCoverPreviewUrl()!} alt="Cover preview" />
                      ) : (
                        <div className="csm-cover-preview__placeholder">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="M21 15l-5-5L5 21" />
                          </svg>
                          <span>
                            {coverType === 'series' && 'Select a series'}
                            {coverType === 'issue' && 'Select an issue'}
                            {coverType === 'custom' && 'Upload or enter URL'}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Display Tab */}
          {activeTab === 'display' && (
            <div className="csm-tab-content csm-tab-content--display">
              <div className="csm-form-section">
                <div className="csm-field-row">
                  <div className="csm-field">
                    <label htmlFor="csm-visibility" className="csm-field__label">Visibility</label>
                    <select
                      id="csm-visibility"
                      className="csm-select"
                      value={visibility}
                      onChange={(e) => { setVisibility(e.target.value as 'public' | 'private' | 'unlisted'); markChanged(); }}
                    >
                      {VISIBILITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <span className="csm-field__hint">
                      {VISIBILITY_OPTIONS.find(o => o.value === visibility)?.description}
                    </span>
                  </div>

                  <div className="csm-field">
                    <label htmlFor="csm-reader-preset" className="csm-field__label">Preferred Reading Preset</label>
                    <select
                      id="csm-reader-preset"
                      className="csm-select"
                      value={readerPresetId || ''}
                      onChange={(e) => { setReaderPresetId(e.target.value || null); markChanged(); }}
                    >
                      <option value="">Use Inherited Settings</option>
                      {readerPresets?.bundled && readerPresets.bundled.length > 0 && (
                        <optgroup label="Bundled">
                          {readerPresets.bundled.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {readerPresets?.system && readerPresets.system.length > 0 && (
                        <optgroup label="System">
                          {readerPresets.system.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {readerPresets?.user && readerPresets.user.length > 0 && (
                        <optgroup label="My Presets">
                          {readerPresets.user.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <span className="csm-field__hint">
                      {readerPresetId
                        ? (() => {
                            const allPresets = [...(readerPresets?.bundled || []), ...(readerPresets?.system || []), ...(readerPresets?.user || [])];
                            const selectedPreset = allPresets.find(p => p.id === readerPresetId);
                            return selectedPreset?.description || selectedPreset?.name || 'Selected preset';
                          })()
                        : 'Use global or library reader settings'}
                    </span>
                  </div>
                </div>

                <div className="csm-field">
                  <label className="csm-field__label">Tags</label>
                  {collection.derivedTags ? (
                    <div className="csm-tags">
                      {collection.derivedTags.split(',').map((tag, idx) => (
                        <span key={idx} className="csm-tag">{tag.trim()}</span>
                      ))}
                    </div>
                  ) : (
                    <div className="csm-empty-state csm-empty-state--small">No tags from child series</div>
                  )}
                  <span className="csm-field__hint">Tags are automatically inherited from series in this collection</span>
                </div>

                <div className="csm-toggle-field">
                  <div className="csm-toggle-field__info">
                    <label className="csm-field__label">Show on Series Page</label>
                    <span className="csm-field__hint">
                      When enabled, this collection appears alongside series on the main browse page.
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`csm-toggle ${isPromoted ? 'csm-toggle--active' : ''}`}
                    onClick={() => { setIsPromoted(!isPromoted); markChanged(); }}
                    role="switch"
                    aria-checked={isPromoted}
                  >
                    <span className="csm-toggle__slider" />
                  </button>
                </div>
              </div>

              <div className="csm-form-section">
                <div className="csm-section-header">
                  <h3 className="csm-section-title">Metadata Overrides</h3>
                  <span className="csm-field__hint">Override auto-derived values when promoted</span>
                </div>

                <div className="csm-field">
                  <div className="csm-field__header csm-field__header--with-reset">
                    <div className="csm-field__header">
                      <label htmlFor="csm-publisher" className="csm-field__label">Publisher</label>
                      <button
                        type="button"
                        className={`csm-lock ${lockPublisher ? 'csm-lock--locked' : ''}`}
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
                      type="button"
                      className="csm-btn csm-btn--ghost csm-btn--small"
                      onClick={() => { setOverridePublisher(''); markChanged(); }}
                      disabled={!overridePublisher || lockPublisher}
                    >
                      Reset
                    </button>
                  </div>
                  <input
                    id="csm-publisher"
                    type="text"
                    className="csm-input"
                    value={overridePublisher}
                    onChange={(e) => { setOverridePublisher(e.target.value); markChanged(); }}
                    placeholder={collection.derivedPublisher || 'Auto-derived'}
                    disabled={lockPublisher}
                  />
                </div>

                <div className="csm-field-row">
                  <div className="csm-field">
                    <div className="csm-field__header csm-field__header--with-reset">
                      <div className="csm-field__header">
                        <label htmlFor="csm-start-year" className="csm-field__label">Start Year</label>
                        <button
                          type="button"
                          className={`csm-lock ${lockStartYear ? 'csm-lock--locked' : ''}`}
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
                        type="button"
                        className="csm-btn csm-btn--ghost csm-btn--small"
                        onClick={() => { setOverrideStartYear(''); markChanged(); }}
                        disabled={!overrideStartYear || lockStartYear}
                      >
                        Reset
                      </button>
                    </div>
                    <input
                      id="csm-start-year"
                      type="number"
                      className="csm-input"
                      value={overrideStartYear}
                      onChange={(e) => { setOverrideStartYear(e.target.value); markChanged(); }}
                      placeholder={collection.derivedStartYear?.toString() || 'Auto'}
                      min="1900"
                      max="2100"
                      disabled={lockStartYear}
                    />
                  </div>

                  <div className="csm-field">
                    <div className="csm-field__header csm-field__header--with-reset">
                      <div className="csm-field__header">
                        <label htmlFor="csm-end-year" className="csm-field__label">End Year</label>
                        <button
                          type="button"
                          className={`csm-lock ${lockEndYear ? 'csm-lock--locked' : ''}`}
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
                        type="button"
                        className="csm-btn csm-btn--ghost csm-btn--small"
                        onClick={() => { setOverrideEndYear(''); markChanged(); }}
                        disabled={!overrideEndYear || lockEndYear}
                      >
                        Reset
                      </button>
                    </div>
                    <input
                      id="csm-end-year"
                      type="number"
                      className="csm-input"
                      value={overrideEndYear}
                      onChange={(e) => { setOverrideEndYear(e.target.value); markChanged(); }}
                      placeholder={collection.derivedEndYear?.toString() || 'Auto'}
                      min="1900"
                      max="2100"
                      disabled={lockEndYear}
                    />
                  </div>
                </div>

                <div className="csm-field">
                  <div className="csm-field__header csm-field__header--with-reset">
                    <div className="csm-field__header">
                      <label htmlFor="csm-genres" className="csm-field__label">Genres</label>
                      <button
                        type="button"
                        className={`csm-lock ${lockGenres ? 'csm-lock--locked' : ''}`}
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
                      type="button"
                      className="csm-btn csm-btn--ghost csm-btn--small"
                      onClick={() => { setOverrideGenres(''); markChanged(); }}
                      disabled={!overrideGenres || lockGenres}
                    >
                      Reset
                    </button>
                  </div>
                  <input
                    id="csm-genres"
                    type="text"
                    className="csm-input"
                    value={overrideGenres}
                    onChange={(e) => { setOverrideGenres(e.target.value); markChanged(); }}
                    placeholder={collection.derivedGenres || 'Comma-separated genres'}
                    disabled={lockGenres}
                  />
                  <span className="csm-field__hint">Separate genres with commas</span>
                </div>
              </div>
            </div>
          )}

          {/* Items Tab */}
          {activeTab === 'items' && (
            <div className="csm-tab-content csm-tab-content--items">
              <div className="csm-items-toolbar">
                <label className="csm-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === localItems.length && localItems.length > 0}
                    onChange={toggleSelectAll}
                  />
                  <span className="csm-checkbox__indicator" />
                  <span className="csm-checkbox__label">Select All</span>
                </label>
                <div className="csm-items-toolbar__actions">
                  {selectedItems.size > 0 && (
                    <span className="csm-items-toolbar__count">{selectedItems.size} selected</span>
                  )}
                  <button
                    type="button"
                    className="csm-btn csm-btn--danger csm-btn--small"
                    onClick={handleRemoveSelected}
                    disabled={selectedItems.size === 0}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Remove Selected
                  </button>
                </div>
              </div>

              {localItems.length === 0 ? (
                <div className="csm-empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                  </svg>
                  <h3>This collection is empty</h3>
                  <p>Add items from series or issue detail pages.</p>
                </div>
              ) : (
                <div className="csm-items-grid">
                  {localItems.map((item) => {
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
                        className={`csm-item-card ${draggedItem === item.id ? 'csm-item-card--dragging' : ''} ${selectedItems.has(item.id) ? 'csm-item-card--selected' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, item.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="csm-item-card__cover">
                          {coverUrl ? (
                            <img src={coverUrl} alt={title} loading="lazy" />
                          ) : (
                            <div className="csm-item-card__placeholder">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                              </svg>
                            </div>
                          )}
                          <span className={`csm-item-card__type ${isSeries ? 'csm-item-card__type--series' : 'csm-item-card__type--issue'}`}>
                            {isSeries ? 'Series' : 'Issue'}
                          </span>
                          <label className="csm-item-card__checkbox" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedItems.has(item.id)}
                              onChange={() => toggleItemSelection(item.id)}
                            />
                            <span className="csm-checkbox__indicator" />
                          </label>
                          <div className="csm-item-card__actions">
                            <button
                              className="csm-item-card__drag"
                              title="Drag to reorder"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="9" cy="6" r="1.5" />
                                <circle cx="15" cy="6" r="1.5" />
                                <circle cx="9" cy="12" r="1.5" />
                                <circle cx="15" cy="12" r="1.5" />
                                <circle cx="9" cy="18" r="1.5" />
                                <circle cx="15" cy="18" r="1.5" />
                              </svg>
                            </button>
                            <button
                              className="csm-item-card__remove"
                              onClick={() => handleRemoveItem(item.id)}
                              title="Remove from collection"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="csm-item-card__info">
                          <span className="csm-item-card__title" title={title}>{title}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Smart Tab */}
          {activeTab === 'smart' && !collection.isSystem && (
            <div className="csm-tab-content csm-tab-content--smart">
              <div className="csm-toggle-field csm-toggle-field--featured">
                <div className="csm-toggle-field__info">
                  <label className="csm-field__label">Smart Collection</label>
                  <span className="csm-field__hint">
                    Automatically populate this collection based on filter criteria.
                    {collection.isSmart && collection.lastEvaluatedAt && (
                      <span className="csm-smart-timestamp">
                        Last updated: {new Date(collection.lastEvaluatedAt).toLocaleString()}
                      </span>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  className={`csm-toggle ${isSmartEnabled ? 'csm-toggle--active' : ''}`}
                  onClick={() => {
                    if (isSmartEnabled && collection.isSmart) {
                      setShowDisableSmartConfirm(true);
                    } else {
                      setIsSmartEnabled(!isSmartEnabled);
                      markChanged();
                    }
                  }}
                  role="switch"
                  aria-checked={isSmartEnabled}
                  disabled={convertToSmartMutation.isPending || convertToRegularMutation.isPending}
                >
                  <span className="csm-toggle__slider" />
                </button>
              </div>

              {isSmartEnabled && (
                <>
                  <div className="csm-form-section">
                    <div className="csm-field">
                      <label className="csm-field__label">Match Scope</label>
                      <div className="csm-radio-group csm-radio-group--horizontal">
                        <label className="csm-radio csm-radio--card">
                          <input
                            type="radio"
                            name="smartScope"
                            value="series"
                            checked={smartScope === 'series'}
                            onChange={() => { setSmartScope('series'); markChanged(); }}
                          />
                          <span className="csm-radio__indicator" />
                          <div className="csm-radio__content">
                            <strong>Series</strong>
                            <span>Match criteria against series metadata</span>
                          </div>
                        </label>
                        <label className="csm-radio csm-radio--card">
                          <input
                            type="radio"
                            name="smartScope"
                            value="files"
                            checked={smartScope === 'files'}
                            onChange={() => { setSmartScope('files'); markChanged(); }}
                          />
                          <span className="csm-radio__indicator" />
                          <div className="csm-radio__content">
                            <strong>Issues</strong>
                            <span>Match criteria against individual issue metadata</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="csm-form-section csm-filter-builder">
                    <div className="csm-section-header">
                      <h3 className="csm-section-title">Filter Criteria</h3>
                      <div className="csm-filter-builder__actions">
                        <select
                          value={smartFilter.rootOperator}
                          onChange={(e) => {
                            setSmartFilter(prev => ({
                              ...prev,
                              rootOperator: e.target.value as 'AND' | 'OR'
                            }));
                            markChanged();
                          }}
                          className="csm-select csm-select--small"
                        >
                          <option value="AND">Match ALL groups</option>
                          <option value="OR">Match ANY group</option>
                        </select>
                        <button
                          type="button"
                          className="csm-btn csm-btn--secondary csm-btn--small"
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
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          Add Group
                        </button>
                      </div>
                    </div>

                    {smartFilter.groups.length === 0 ? (
                      <div className="csm-empty-state csm-empty-state--compact">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                        </svg>
                        <p>No filter criteria defined.</p>
                        <span>Add a filter group to define which items should be included.</span>
                      </div>
                    ) : (
                      <div className="csm-filter-groups">
                        {smartFilter.groups.map((group, groupIndex) => (
                          <div key={group.id} className="csm-filter-group">
                            <div className="csm-filter-group__header">
                              <span className="csm-filter-group__label">
                                {groupIndex > 0 && (
                                  <span className="csm-filter-group__connector">{smartFilter.rootOperator}</span>
                                )}
                                Group {groupIndex + 1}
                              </span>
                              <div className="csm-filter-group__controls">
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
                                  className="csm-select csm-select--tiny"
                                >
                                  <option value="AND">ALL</option>
                                  <option value="OR">ANY</option>
                                </select>
                                <button
                                  type="button"
                                  className="csm-btn csm-btn--ghost csm-btn--icon"
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

                            <div className="csm-filter-group__conditions">
                              {group.conditions.map((condition, condIndex) => (
                                <div key={condition.id} className="csm-condition">
                                  {condIndex > 0 && (
                                    <span className="csm-condition__connector">{group.operator}</span>
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
                                    className="csm-select csm-condition__field"
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
                                    className="csm-select csm-condition__comparison"
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
                                          className="csm-select csm-condition__value"
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
                                          className="csm-select csm-condition__value"
                                        >
                                          <option value="">Select...</option>
                                          <option value="western">Western</option>
                                          <option value="manga">Manga</option>
                                        </select>
                                      ) : ['inLast', 'notInLast'].includes(condition.comparison) ? (
                                        <div className="csm-condition__date-relative">
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
                                            className="csm-input csm-input--small"
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
                                            className="csm-select csm-select--small"
                                          >
                                            <option value="days">days</option>
                                            <option value="weeks">weeks</option>
                                            <option value="months">months</option>
                                            <option value="years">years</option>
                                          </select>
                                        </div>
                                      ) : condition.comparison === 'between' ? (
                                        <div className="csm-condition__between">
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
                                            className="csm-input csm-input--small"
                                          />
                                          <span className="csm-condition__separator">and</span>
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
                                            className="csm-input csm-input--small"
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
                                          className="csm-input csm-condition__value"
                                        />
                                      )}
                                    </>
                                  )}

                                  <button
                                    type="button"
                                    className="csm-btn csm-btn--ghost csm-btn--icon"
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
                                className="csm-btn csm-btn--ghost csm-btn--small csm-filter-group__add-condition"
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
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="12" y1="5" x2="12" y2="19" />
                                  <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                Add Condition
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="csm-smart-actions">
                    {collection.isSmart && (
                      <button
                        type="button"
                        className="csm-btn csm-btn--secondary"
                        onClick={async () => {
                          try {
                            setSmartError(null);
                            const result = await refreshSmartMutation.mutateAsync(collection.id);
                            setSmartError(`Refreshed: ${result.added} added, ${result.removed} removed`);
                            setTimeout(() => setSmartError(null), 3000);
                            // Notify parent to refetch data (cover, items, etc.)
                            onRefresh?.();
                          } catch (err) {
                            setSmartError(err instanceof Error ? err.message : 'Failed to refresh');
                          }
                        }}
                        disabled={refreshSmartMutation.isPending}
                      >
                        {refreshSmartMutation.isPending ? (
                          <>
                            <span className="csm-spinner" />
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
                        className="csm-btn csm-btn--primary"
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
                            // Notify parent to refetch data
                            onRefresh?.();
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
                    <div className={`csm-feedback ${smartError.startsWith('Refreshed') || smartError.startsWith('Smart collection created') ? 'csm-feedback--success' : 'csm-feedback--error'}`}>
                      {smartError}
                    </div>
                  )}

                  {collection.isSmart && smartOverrides && (
                    <div className="csm-form-section csm-overrides">
                      <div className="csm-section-header">
                        <h3 className="csm-section-title">Manual Overrides</h3>
                        <span className="csm-field__hint">Items manually included or excluded from automatic filtering</span>
                      </div>

                      <div className="csm-overrides__list">
                        <div className="csm-override-group">
                          <label className="csm-override-group__label">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                              <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            Always Include ({smartOverrides.whitelist.length})
                          </label>
                          {smartOverrides.whitelist.length === 0 ? (
                            <span className="csm-override-group__empty">No items manually included</span>
                          ) : (
                            <div className="csm-override-group__items">
                              {smartOverrides.whitelist.slice(0, 5).map((item, idx) => (
                                <span key={idx} className="csm-override-item csm-override-item--whitelist">
                                  {item.seriesId ? 'Series' : 'Issue'} #{idx + 1}
                                </span>
                              ))}
                              {smartOverrides.whitelist.length > 5 && (
                                <span className="csm-override-more">+{smartOverrides.whitelist.length - 5} more</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="csm-override-group">
                          <label className="csm-override-group__label">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                            </svg>
                            Always Exclude ({smartOverrides.blacklist.length})
                          </label>
                          {smartOverrides.blacklist.length === 0 ? (
                            <span className="csm-override-group__empty">No items manually excluded</span>
                          ) : (
                            <div className="csm-override-group__items">
                              {smartOverrides.blacklist.slice(0, 5).map((item, idx) => (
                                <span key={idx} className="csm-override-item csm-override-item--blacklist">
                                  {item.seriesId ? 'Series' : 'Issue'} #{idx + 1}
                                </span>
                              ))}
                              {smartOverrides.blacklist.length > 5 && (
                                <span className="csm-override-more">+{smartOverrides.blacklist.length - 5} more</span>
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
        </main>

        {/* Footer */}
        <footer className="csm-footer">
          <button type="button" className="csm-btn csm-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="csm-btn csm-btn--primary"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <>
                <span className="csm-spinner" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </footer>

        {/* Confirmation Dialogs */}
        {showGenerateConfirmDialog && (
          <div className="csm-dialog-overlay" onClick={() => setShowGenerateConfirmDialog(false)}>
            <div className="csm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3 className="csm-dialog__title">Replace Existing Content?</h3>
              <p className="csm-dialog__message">
                This collection already has a description or tagline. Generating a new one will replace the existing content.
              </p>
              <div className="csm-dialog__actions">
                <button
                  type="button"
                  className="csm-btn csm-btn--secondary"
                  onClick={() => setShowGenerateConfirmDialog(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="csm-btn csm-btn--primary"
                  onClick={performGenerateDescription}
                >
                  Replace
                </button>
              </div>
            </div>
          </div>
        )}

        {showDisableSmartConfirm && (
          <div className="csm-dialog-overlay" onClick={() => setShowDisableSmartConfirm(false)}>
            <div className="csm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3 className="csm-dialog__title">Disable Smart Collection?</h3>
              <p className="csm-dialog__message">
                This will convert the collection back to a regular collection. The current items will remain, but automatic updates based on filter criteria will stop.
              </p>
              <div className="csm-dialog__actions">
                <button
                  type="button"
                  className="csm-btn csm-btn--secondary"
                  onClick={() => setShowDisableSmartConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="csm-btn csm-btn--danger"
                  onClick={async () => {
                    setShowDisableSmartConfirm(false);
                    try {
                      setSmartError(null);
                      await convertToRegularMutation.mutateAsync(collection.id);
                      setIsSmartEnabled(false);
                      setSmartError('Smart collection disabled');
                      setTimeout(() => setSmartError(null), 3000);
                      // Notify parent to refetch data
                      onRefresh?.();
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
    document.body
  );
}
