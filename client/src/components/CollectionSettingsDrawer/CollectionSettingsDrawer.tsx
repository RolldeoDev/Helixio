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
} from '../../services/api.service';
import './CollectionSettingsDrawer.css';

type TabId = 'general' | 'appearance' | 'display' | 'items';

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
  iconName?: string;
  color?: string;
  coverType?: 'auto' | 'series' | 'issue' | 'custom';
  coverSeriesId?: string | null;
  coverFileId?: string | null;
  overridePublisher?: string | null;
  overrideStartYear?: number | null;
  overrideEndYear?: number | null;
  overrideGenres?: string | null;
  isPromoted?: boolean;
}

// Icon options for collections
const ICON_OPTIONS = [
  { id: 'folder', label: 'Folder', icon: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
  { id: 'heart', label: 'Heart', icon: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' },
  { id: 'bookmark', label: 'Bookmark', icon: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' },
  { id: 'star', label: 'Star', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
  { id: 'tag', label: 'Tag', icon: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01' },
  { id: 'fire', label: 'Fire', icon: 'M12 2c.5.5 1.5 2 1.5 4s-1 3-2.5 4c1.5-1 2.5-2.5 2.5-4.5 0-1-.5-2-1.5-3.5zm-3 6c1 1 1.5 2 1.5 3.5s-.5 2.5-1.5 3.5c2-1 3-2.5 3-4.5 0-1.5-.5-2.5-1.5-3.5zM6 12c1 1 1.5 2.5 1.5 4s-.5 3-1.5 4c3-2 4.5-4 4.5-6.5 0-2-.75-3.5-2-5z' },
  { id: 'zap', label: 'Lightning', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  { id: 'crown', label: 'Crown', icon: 'M2 17l2-4 4 2 4-6 4 6 4-2 2 4v3H2v-3z' },
  { id: 'trophy', label: 'Trophy', icon: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6 M18 9h1.5a2.5 2.5 0 0 0 0-5H18 M4 22h16 M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22 M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22 M18 2H6v7a6 6 0 0 0 12 0V2z' },
  { id: 'book', label: 'Book', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M4 19.5A2.5 2.5 0 0 0 6.5 22H20 M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z' },
  { id: 'archive', label: 'Archive', icon: 'M21 8v13H3V8 M1 3h22v5H1z M10 12h4' },
  { id: 'layers', label: 'Stack', icon: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5' },
];

// Color options for collections
const COLOR_OPTIONS = [
  { id: 'default', label: 'Default', value: null },
  { id: 'red', label: 'Red', value: '#ef4444' },
  { id: 'orange', label: 'Orange', value: '#f97316' },
  { id: 'amber', label: 'Amber', value: '#f59e0b' },
  { id: 'yellow', label: 'Yellow', value: '#eab308' },
  { id: 'lime', label: 'Lime', value: '#84cc16' },
  { id: 'green', label: 'Green', value: '#22c55e' },
  { id: 'teal', label: 'Teal', value: '#14b8a6' },
  { id: 'cyan', label: 'Cyan', value: '#06b6d4' },
  { id: 'blue', label: 'Blue', value: '#3b82f6' },
  { id: 'indigo', label: 'Indigo', value: '#6366f1' },
  { id: 'violet', label: 'Violet', value: '#8b5cf6' },
  { id: 'purple', label: 'Purple', value: '#a855f7' },
  { id: 'pink', label: 'Pink', value: '#ec4899' },
  { id: 'rose', label: 'Rose', value: '#f43f5e' },
];

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
  const [iconName, setIconName] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
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

  // Items state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState<CollectionItem[]>([]);

  // Initialize form state when collection changes
  useEffect(() => {
    if (collection) {
      setName(collection.name);
      setDeck(collection.deck || '');
      setDescription(collection.description || '');
      setIconName(collection.iconName || null);
      setColor(collection.color || null);
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
      setHasChanges(false);
    }
  }, [collection]);

  // Sync local items with prop
  useEffect(() => {
    setLocalItems(collectionItems);
  }, [collectionItems]);

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

  // Save handler
  const handleSave = async () => {
    if (!collection) return;

    setIsSaving(true);
    try {
      const updates: CollectionUpdates = {
        name: name !== collection.name ? name : undefined,
        deck: deck !== (collection.deck || '') ? deck || undefined : undefined,
        description: description !== (collection.description || '') ? description || undefined : undefined,
        iconName: iconName !== collection.iconName ? iconName || undefined : undefined,
        color: color !== collection.color ? color || undefined : undefined,
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

  const tabs: { id: TabId; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'display', label: 'Display' },
    { id: 'items', label: `Items (${localItems.length})` },
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
              className={`drawer-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="drawer-content">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="tab-content">
              <div className="form-group">
                <label htmlFor="collection-name">Name</label>
                <input
                  id="collection-name"
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); markChanged(); }}
                  disabled={collection.isSystem}
                />
                {collection.isSystem && (
                  <span className="form-hint">System collections cannot be renamed</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="collection-deck">Tagline</label>
                <input
                  id="collection-deck"
                  type="text"
                  value={deck}
                  onChange={(e) => { setDeck(e.target.value); markChanged(); }}
                  placeholder="A short tagline for this collection..."
                />
                <span className="form-hint">A brief summary shown under the collection title</span>
              </div>

              <div className="form-group">
                <label htmlFor="collection-description">Description</label>
                <textarea
                  id="collection-description"
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); markChanged(); }}
                  rows={3}
                  placeholder="Add a description..."
                />
              </div>

              <div className="form-group">
                <label>Icon</label>
                <div className="icon-picker">
                  {ICON_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      className={`icon-option ${iconName === option.id ? 'selected' : ''}`}
                      onClick={() => { setIconName(option.id); markChanged(); }}
                      title={option.label}
                      disabled={collection.isSystem}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d={option.icon} />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Color</label>
                <div className="color-picker">
                  {COLOR_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      className={`color-option ${color === option.value ? 'selected' : ''} ${option.id === 'default' ? 'default' : ''}`}
                      onClick={() => { setColor(option.value); markChanged(); }}
                      title={option.label}
                      style={option.value ? { backgroundColor: option.value } : undefined}
                      disabled={collection.isSystem}
                    >
                      {option.id === 'default' && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M4.93 4.93l14.14 14.14" />
                        </svg>
                      )}
                      {color === option.value && option.id !== 'default' && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
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

                <div className="form-group">
                  <div className="input-with-reset">
                    <label htmlFor="override-publisher">Publisher</label>
                    <button
                      className="reset-btn"
                      onClick={() => { setOverridePublisher(''); markChanged(); }}
                      disabled={!overridePublisher}
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
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <div className="input-with-reset">
                      <label htmlFor="override-start-year">Start Year</label>
                      <button
                        className="reset-btn"
                        onClick={() => { setOverrideStartYear(''); markChanged(); }}
                        disabled={!overrideStartYear}
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
                    />
                  </div>

                  <div className="form-group">
                    <div className="input-with-reset">
                      <label htmlFor="override-end-year">End Year</label>
                      <button
                        className="reset-btn"
                        onClick={() => { setOverrideEndYear(''); markChanged(); }}
                        disabled={!overrideEndYear}
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
                    />
                  </div>
                </div>

                <div className="form-group">
                  <div className="input-with-reset">
                    <label htmlFor="override-genres">Genres</label>
                    <button
                      className="reset-btn"
                      onClick={() => { setOverrideGenres(''); markChanged(); }}
                      disabled={!overrideGenres}
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
                              ? getCoverUrl(item.series!.firstIssueId)
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
      </div>
    </div>,
    portalTarget
  );
}
