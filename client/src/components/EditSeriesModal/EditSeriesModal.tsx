/**
 * EditSeriesModal Component
 *
 * Full-featured modal for editing series metadata with:
 * - Two-column scrollable layout with collapsible sections
 * - Field-level locking to prevent auto-updates
 * - Full cover picker (API, issue selection, custom URL)
 * - Validation and unsaved changes detection
 */

import { useEffect, useCallback, useReducer, useState } from 'react';
import {
  Series,
  SeriesIssue,
  getSeries,
  getSeriesIssues,
  updateSeries,
  getFieldSources,
  lockField,
  unlockField,
  setSeriesCover,
  uploadSeriesCover,
  getApiCoverUrl,
  aggregateSeriesCreators,
  getSeriesCreatorsFromIssues,
  // Metadata fetch imports
  MetadataSource,
  SeriesMetadataPayload,
  MetadataPreviewField,
  fetchSeriesMetadata,
  previewSeriesMetadata,
  applySeriesMetadata,
} from '../../services/api.service';
import { CollapsibleSection } from './CollapsibleSection';
import { FieldWithLock, FieldSource } from './FieldWithLock';
import { TagInput } from './TagInput';
import { SeriesCoverEditorModal } from './SeriesCoverEditorModal';
import { MetadataPreviewModal } from '../MetadataPreviewModal';
import { SeriesMetadataSearchModal } from '../SeriesMetadataSearchModal';
import { MetadataGenerator } from '../MetadataGenerator';
import { RatingStars } from '../RatingStars';
import { useSeriesUserData, useUpdateSeriesUserData } from '../../hooks/queries';
import './EditSeriesModal.css';

// =============================================================================
// Types
// =============================================================================

interface EditSeriesModalProps {
  seriesId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

interface EditSeriesState {
  originalSeries: Series | null;
  editedSeries: Partial<Series>;
  modifiedFields: Set<string>;
  lockedFields: Set<string>;
  fieldSources: Record<string, FieldSource>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  expandedSections: Set<string>;
  issues: SeriesIssue[];
  loadingIssues: boolean;
  validationErrors: Record<string, string>;
  // Metadata fetch state
  fetchingMetadata: boolean;
  showSearchModal: boolean;
  showPreviewModal: boolean;
  showRefetchConfirm: boolean;
  pendingMetadata: SeriesMetadataPayload | null;
  pendingSource: MetadataSource | null;
  pendingExternalId: string | null;
  previewFields: MetadataPreviewField[];
  applyingMetadata: boolean;
  lastFetchedFields: string[];
}

type EditSeriesAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; series: Series; fieldSources: Record<string, FieldSource>; lockedFields: Set<string> }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'LOAD_ISSUES_SUCCESS'; issues: SeriesIssue[] }
  | { type: 'UPDATE_FIELD'; field: keyof Series; value: unknown }
  | { type: 'TOGGLE_LOCK'; field: string; isLocked: boolean }
  | { type: 'RESET_CHANGES' }
  | { type: 'SET_SAVING'; saving: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_VALIDATION_ERRORS'; errors: Record<string, string> }
  | { type: 'CLEAR_VALIDATION_ERROR'; field: string }
  // Metadata fetch actions
  | { type: 'FETCH_METADATA_START' }
  | { type: 'FETCH_METADATA_SUCCESS' }
  | { type: 'FETCH_METADATA_ERROR'; error: string }
  | { type: 'SHOW_REFETCH_CONFIRM' }
  | { type: 'HIDE_REFETCH_CONFIRM' }
  | { type: 'SHOW_SEARCH_MODAL' }
  | { type: 'HIDE_SEARCH_MODAL' }
  | { type: 'SHOW_PREVIEW_MODAL'; metadata: SeriesMetadataPayload; source: MetadataSource; externalId: string; fields: MetadataPreviewField[] }
  | { type: 'HIDE_PREVIEW_MODAL' }
  | { type: 'APPLY_METADATA_START' }
  | { type: 'APPLY_METADATA_SUCCESS'; series: Series; fieldsUpdated: string[] }
  | { type: 'APPLY_METADATA_ERROR'; error: string };

// =============================================================================
// Reducer
// =============================================================================

function editSeriesReducer(state: EditSeriesState, action: EditSeriesAction): EditSeriesState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true, error: null };

    case 'LOAD_SUCCESS':
      return {
        ...state,
        loading: false,
        originalSeries: action.series,
        editedSeries: { ...action.series },
        fieldSources: action.fieldSources,
        lockedFields: action.lockedFields,
        modifiedFields: new Set(),
        validationErrors: {},
      };

    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.error };

    case 'LOAD_ISSUES_SUCCESS':
      return { ...state, loadingIssues: false, issues: action.issues };

    case 'UPDATE_FIELD': {
      const newEditedSeries = { ...state.editedSeries, [action.field]: action.value };
      const newModifiedFields = new Set(state.modifiedFields);

      // Check if value differs from original
      const originalValue = state.originalSeries?.[action.field];
      if (action.value !== originalValue) {
        newModifiedFields.add(action.field);
      } else {
        newModifiedFields.delete(action.field);
      }

      return {
        ...state,
        editedSeries: newEditedSeries,
        modifiedFields: newModifiedFields,
      };
    }

    case 'TOGGLE_LOCK': {
      const newLockedFields = new Set(state.lockedFields);
      if (action.isLocked) {
        newLockedFields.add(action.field);
      } else {
        newLockedFields.delete(action.field);
      }
      return { ...state, lockedFields: newLockedFields };
    }

    case 'RESET_CHANGES':
      return {
        ...state,
        editedSeries: state.originalSeries ? { ...state.originalSeries } : {},
        modifiedFields: new Set(),
        validationErrors: {},
      };

    case 'SET_SAVING':
      return { ...state, saving: action.saving };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'SET_VALIDATION_ERRORS':
      return { ...state, validationErrors: action.errors };

    case 'CLEAR_VALIDATION_ERROR': {
      const newErrors = { ...state.validationErrors };
      delete newErrors[action.field];
      return { ...state, validationErrors: newErrors };
    }

    // Metadata fetch action handlers
    case 'FETCH_METADATA_START':
      return { ...state, fetchingMetadata: true, error: null };

    case 'FETCH_METADATA_SUCCESS':
      return { ...state, fetchingMetadata: false };

    case 'FETCH_METADATA_ERROR':
      return { ...state, fetchingMetadata: false, error: action.error };

    case 'SHOW_REFETCH_CONFIRM':
      return { ...state, showRefetchConfirm: true };

    case 'HIDE_REFETCH_CONFIRM':
      return { ...state, showRefetchConfirm: false };

    case 'SHOW_SEARCH_MODAL':
      return { ...state, showSearchModal: true, fetchingMetadata: false };

    case 'HIDE_SEARCH_MODAL':
      return { ...state, showSearchModal: false };

    case 'SHOW_PREVIEW_MODAL':
      return {
        ...state,
        fetchingMetadata: false,
        showPreviewModal: true,
        pendingMetadata: action.metadata,
        pendingSource: action.source,
        pendingExternalId: action.externalId,
        previewFields: action.fields,
      };

    case 'HIDE_PREVIEW_MODAL':
      return {
        ...state,
        showPreviewModal: false,
        pendingMetadata: null,
        pendingSource: null,
        pendingExternalId: null,
        previewFields: [],
      };

    case 'APPLY_METADATA_START':
      return { ...state, applyingMetadata: true };

    case 'APPLY_METADATA_SUCCESS': {
      // Update series with the new data
      const lockedFields = new Set(
        action.series.lockedFields?.split(',').filter(Boolean) ?? []
      );
      return {
        ...state,
        applyingMetadata: false,
        showPreviewModal: false,
        originalSeries: action.series,
        editedSeries: { ...action.series },
        lockedFields,
        pendingMetadata: null,
        pendingSource: null,
        pendingExternalId: null,
        previewFields: [],
        lastFetchedFields: action.fieldsUpdated,
        modifiedFields: new Set(),
      };
    }

    case 'APPLY_METADATA_ERROR':
      return { ...state, applyingMetadata: false, error: action.error };

    default:
      return state;
  }
}

const initialState: EditSeriesState = {
  originalSeries: null,
  editedSeries: {},
  modifiedFields: new Set(),
  lockedFields: new Set(),
  fieldSources: {},
  loading: true,
  saving: false,
  error: null,
  expandedSections: new Set(['identity']),
  issues: [],
  loadingIssues: true,
  validationErrors: {},
  // Metadata fetch initial state
  fetchingMetadata: false,
  showSearchModal: false,
  showPreviewModal: false,
  showRefetchConfirm: false,
  pendingMetadata: null,
  pendingSource: null,
  pendingExternalId: null,
  previewFields: [],
  applyingMetadata: false,
  lastFetchedFields: [],
};

// =============================================================================
// Constants
// =============================================================================

const AGE_RATING_OPTIONS = [
  { value: 'Everyone', label: 'Everyone' },
  { value: 'Teen', label: 'Teen' },
  { value: 'Teen Plus', label: 'Teen Plus' },
  { value: 'Mature', label: 'Mature' },
  { value: 'Adults Only', label: 'Adults Only' },
  { value: 'Unknown', label: 'Unknown' },
];

const TYPE_OPTIONS = [
  { value: 'western', label: 'Western Comics' },
  { value: 'manga', label: 'Manga' },
];

const SECTION_FIELDS = {
  identity: ['name', 'publisher', 'startYear', 'endYear', 'volume'],
  description: ['summary', 'deck', 'issueCount'],
  classification: ['type', 'ageRating', 'genres', 'tags', 'languageISO'],
  contentEntities: ['characters', 'teams', 'locations', 'storyArcs'],
  creators: ['creators', 'writer', 'penciller', 'inker', 'colorist', 'letterer', 'coverArtist', 'editor'],
  cover: ['coverSource', 'coverFileId', 'coverUrl', 'coverHash'],
  externalIds: ['comicVineId', 'metronId'],
  userData: ['userNotes', 'aliases'],
} as const;

// =============================================================================
// Component
// =============================================================================

export function EditSeriesModal({ seriesId, isOpen, onClose, onSave }: EditSeriesModalProps) {
  const [state, dispatch] = useReducer(editSeriesReducer, initialState);
  const [showCoverModal, setShowCoverModal] = useState(false);

  // User data hooks for per-user rating and notes
  const { data: userDataResponse } = useSeriesUserData(isOpen ? seriesId : undefined);
  const updateUserData = useUpdateSeriesUserData();
  const userData = userDataResponse?.data;

  // =============================================================================
  // Data Loading
  // =============================================================================

  useEffect(() => {
    if (!isOpen || !seriesId) return;

    async function loadData() {
      dispatch({ type: 'LOAD_START' });

      try {
        const [seriesResult, fieldSourcesResult, issuesResult] = await Promise.all([
          getSeries(seriesId),
          getFieldSources(seriesId).catch(() => ({ fieldSources: {} })),
          getSeriesIssues(seriesId, { limit: 100, sortBy: 'number', sortOrder: 'asc' }),
        ]);

        const series = seriesResult.series;
        const lockedFields = new Set(
          series.lockedFields?.split(',').filter(Boolean) ?? []
        );

        dispatch({
          type: 'LOAD_SUCCESS',
          series,
          fieldSources: fieldSourcesResult.fieldSources || {},
          lockedFields,
        });
        dispatch({ type: 'LOAD_ISSUES_SUCCESS', issues: issuesResult.issues });
      } catch (err) {
        dispatch({
          type: 'LOAD_ERROR',
          error: err instanceof Error ? err.message : 'Failed to load series',
        });
      }
    }

    loadData();
  }, [isOpen, seriesId]);

  // =============================================================================
  // Field Handlers
  // =============================================================================

  const handleFieldChange = useCallback(
    (field: keyof Series) => (value: string | number | null) => {
      dispatch({ type: 'UPDATE_FIELD', field, value });
      dispatch({ type: 'CLEAR_VALIDATION_ERROR', field });
    },
    []
  );

  const handleToggleLock = useCallback(
    async (field: string) => {
      const wasLocked = state.lockedFields.has(field);

      // Optimistic update
      dispatch({ type: 'TOGGLE_LOCK', field, isLocked: !wasLocked });

      try {
        if (wasLocked) {
          await unlockField(seriesId, field);
        } else {
          await lockField(seriesId, field);
        }
      } catch (err) {
        // Revert on error
        dispatch({ type: 'TOGGLE_LOCK', field, isLocked: wasLocked });
        dispatch({
          type: 'SET_ERROR',
          error: `Failed to ${wasLocked ? 'unlock' : 'lock'} field`,
        });
      }
    },
    [seriesId, state.lockedFields]
  );

  // =============================================================================
  // Cover Handlers
  // =============================================================================

  // State for uploaded cover preview
  const [uploadedCoverHash, setUploadedCoverHash] = useState<string | null>(null);

  // State for fetching creator roles
  const [fetchingCreators, setFetchingCreators] = useState(false);
  // State for creator source selection ('api' = ComicVine/Metron, 'issues' = local FileMetadata)
  const [creatorSourceSelection, setCreatorSourceSelection] = useState<'api' | 'issues'>(
    (state.originalSeries?.creatorSource as 'api' | 'issues') || 'api'
  );

  const handleCoverChange = useCallback(
    (source: 'api' | 'user' | 'auto', fileId: string | null, url: string | null) => {
      dispatch({ type: 'UPDATE_FIELD', field: 'coverSource', value: source });
      dispatch({ type: 'UPDATE_FIELD', field: 'coverFileId', value: fileId });
      dispatch({ type: 'UPDATE_FIELD', field: 'coverUrl', value: url });
    },
    []
  );

  const handleCoverUpload = useCallback(
    async (file: File) => {
      try {
        const result = await uploadSeriesCover(seriesId, file);
        // Update local state with new cover hash
        setUploadedCoverHash(result.coverHash);
        // Update the series state to reflect the new cover
        dispatch({ type: 'UPDATE_FIELD', field: 'coverSource', value: 'api' });
        dispatch({ type: 'UPDATE_FIELD', field: 'coverHash', value: result.coverHash });
        dispatch({ type: 'UPDATE_FIELD', field: 'coverFileId', value: null });
        dispatch({ type: 'UPDATE_FIELD', field: 'coverUrl', value: null });
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          error: err instanceof Error ? err.message : 'Failed to upload cover',
        });
        throw err; // Re-throw so CoverPicker can handle it
      }
    },
    [seriesId]
  );

  // Get uploaded preview URL
  const uploadedPreviewUrl = uploadedCoverHash ? getApiCoverUrl(uploadedCoverHash) : null;

  // =============================================================================
  // Creator Aggregation Handler
  // =============================================================================

  const handleFetchCreatorRoles = useCallback(async () => {
    if (!seriesId) return;

    // For API source, require external ID
    if (creatorSourceSelection === 'api' && !state.editedSeries.comicVineId) {
      dispatch({
        type: 'SET_ERROR',
        error: 'Series must be linked to ComicVine to fetch from API. Use "Fetch Metadata" first.',
      });
      return;
    }

    setFetchingCreators(true);
    try {
      let creatorsWithRoles: {
        writer?: string[];
        penciller?: string[];
        inker?: string[];
        colorist?: string[];
        letterer?: string[];
        coverArtist?: string[];
        editor?: string[];
      };

      if (creatorSourceSelection === 'api') {
        // Fetch from ComicVine API
        const result = await aggregateSeriesCreators(seriesId);
        creatorsWithRoles = result.creatorsWithRoles;
      } else {
        // Fetch from local issue metadata (FileMetadata/ComicInfo.xml)
        const result = await getSeriesCreatorsFromIssues(seriesId);
        creatorsWithRoles = result.creatorsWithRoles;
      }

      // Update the individual role fields from the aggregated data
      if (creatorsWithRoles.writer?.length) {
        dispatch({ type: 'UPDATE_FIELD', field: 'writer', value: creatorsWithRoles.writer.join(', ') });
      }
      if (creatorsWithRoles.penciller?.length) {
        dispatch({ type: 'UPDATE_FIELD', field: 'penciller', value: creatorsWithRoles.penciller.join(', ') });
      }
      if (creatorsWithRoles.inker?.length) {
        dispatch({ type: 'UPDATE_FIELD', field: 'inker', value: creatorsWithRoles.inker.join(', ') });
      }
      if (creatorsWithRoles.colorist?.length) {
        dispatch({ type: 'UPDATE_FIELD', field: 'colorist', value: creatorsWithRoles.colorist.join(', ') });
      }
      if (creatorsWithRoles.letterer?.length) {
        dispatch({ type: 'UPDATE_FIELD', field: 'letterer', value: creatorsWithRoles.letterer.join(', ') });
      }
      if (creatorsWithRoles.coverArtist?.length) {
        dispatch({ type: 'UPDATE_FIELD', field: 'coverArtist', value: creatorsWithRoles.coverArtist.join(', ') });
      }
      if (creatorsWithRoles.editor?.length) {
        dispatch({ type: 'UPDATE_FIELD', field: 'editor', value: creatorsWithRoles.editor.join(', ') });
      }

      // Update creatorsJson with the structured data - this is what SeriesDetailPage reads
      dispatch({ type: 'UPDATE_FIELD', field: 'creatorsJson', value: JSON.stringify(creatorsWithRoles) });

      // Also update the creatorSource field so it persists
      dispatch({ type: 'UPDATE_FIELD', field: 'creatorSource', value: creatorSourceSelection });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        error: err instanceof Error ? err.message : 'Failed to fetch creator roles',
      });
    } finally {
      setFetchingCreators(false);
    }
  }, [seriesId, state.editedSeries.comicVineId, creatorSourceSelection]);

  // =============================================================================
  // Validation
  // =============================================================================

  const validateSeries = useCallback((): Record<string, string> => {
    const errors: Record<string, string> = {};
    const series = state.editedSeries;

    // Required fields
    if (!series.name?.trim()) {
      errors.name = 'Name is required';
    }

    // Year validation
    if (series.startYear !== null && series.startYear !== undefined) {
      if (series.startYear < 1900 || series.startYear > 2100) {
        errors.startYear = 'Year must be between 1900 and 2100';
      }
    }
    if (series.endYear !== null && series.endYear !== undefined) {
      if (series.endYear < 1900 || series.endYear > 2100) {
        errors.endYear = 'Year must be between 1900 and 2100';
      }
      if (series.startYear && series.endYear < series.startYear) {
        errors.endYear = 'End year cannot be before start year';
      }
    }

    // Volume must be positive
    if (series.volume !== null && series.volume !== undefined && series.volume < 1) {
      errors.volume = 'Volume must be positive';
    }

    // Issue count must be positive
    if (series.issueCount !== null && series.issueCount !== undefined && series.issueCount < 1) {
      errors.issueCount = 'Issue count must be positive';
    }

    return errors;
  }, [state.editedSeries]);

  // =============================================================================
  // Save Handler
  // =============================================================================

  const handleSave = useCallback(async () => {
    const errors = validateSeries();
    if (Object.keys(errors).length > 0) {
      dispatch({ type: 'SET_VALIDATION_ERRORS', errors });
      return;
    }

    dispatch({ type: 'SET_SAVING', saving: true });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      // Build updates object with only modified fields
      const updates: Partial<Series> = {};
      state.modifiedFields.forEach((field) => {
        (updates as Record<string, unknown>)[field] = state.editedSeries[field as keyof Series];
      });

      // Handle cover separately if changed
      const coverChanged =
        state.modifiedFields.has('coverSource') ||
        state.modifiedFields.has('coverFileId') ||
        state.modifiedFields.has('coverUrl');

      if (coverChanged) {
        await setSeriesCover(seriesId, {
          source: state.editedSeries.coverSource,
          fileId: state.editedSeries.coverFileId || undefined,
          url: state.editedSeries.coverUrl || undefined,
        });
        // Remove cover fields from updates since we handled them separately
        delete updates.coverSource;
        delete updates.coverFileId;
        delete updates.coverUrl;
      }

      // Update remaining fields
      if (Object.keys(updates).length > 0) {
        await updateSeries(seriesId, updates);
      }

      onSave?.();
      onClose();
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        error: err instanceof Error ? err.message : 'Failed to save series',
      });
    } finally {
      dispatch({ type: 'SET_SAVING', saving: false });
    }
  }, [seriesId, state.editedSeries, state.modifiedFields, validateSeries, onSave, onClose]);

  // =============================================================================
  // Metadata Fetch Handlers
  // =============================================================================

  const handleFetchMetadata = useCallback(async () => {
    // Check if series already has external ID
    if (state.originalSeries?.comicVineId || state.originalSeries?.metronId) {
      dispatch({ type: 'SHOW_REFETCH_CONFIRM' });
      return;
    }

    // No external ID - go directly to search
    dispatch({ type: 'SHOW_SEARCH_MODAL' });
  }, [state.originalSeries]);

  const handleRefetchConfirm = useCallback(
    async (action: 'refresh' | 'unlink' | 'cancel') => {
      dispatch({ type: 'HIDE_REFETCH_CONFIRM' });

      if (action === 'cancel') return;

      if (action === 'unlink') {
        dispatch({ type: 'SHOW_SEARCH_MODAL' });
        return;
      }

      // Refresh - fetch with existing ID
      dispatch({ type: 'FETCH_METADATA_START' });

      try {
        const result = await fetchSeriesMetadata(seriesId);

        if (result.needsSearch || !result.metadata) {
          dispatch({ type: 'SET_ERROR', error: result.message || 'Failed to fetch metadata' });
          // Auto-fallback to search after a brief delay
          setTimeout(() => {
            dispatch({ type: 'SHOW_SEARCH_MODAL' });
          }, 1500);
          return;
        }

        // Get preview data
        const previewResult = await previewSeriesMetadata(
          seriesId,
          result.metadata,
          result.source!,
          result.externalId!
        );

        dispatch({
          type: 'SHOW_PREVIEW_MODAL',
          metadata: result.metadata,
          source: result.source!,
          externalId: result.externalId!,
          fields: previewResult.preview.fields,
        });
      } catch (err) {
        dispatch({
          type: 'FETCH_METADATA_ERROR',
          error: err instanceof Error ? err.message : 'Failed to fetch metadata',
        });
        // Auto-fallback to search
        setTimeout(() => {
          dispatch({ type: 'SHOW_SEARCH_MODAL' });
        }, 1500);
      }
    },
    [seriesId]
  );

  const handleSearchSelect = useCallback(
    async (source: MetadataSource, externalId: string, metadata: SeriesMetadataPayload) => {
      dispatch({ type: 'HIDE_SEARCH_MODAL' });
      dispatch({ type: 'FETCH_METADATA_START' });

      try {
        // Get preview data to determine which fields to apply
        const previewResult = await previewSeriesMetadata(seriesId, metadata, source, externalId);

        // Auto-select all unlocked fields that have changes
        const fieldsToApply = previewResult.preview.fields
          .filter((field) => !field.isLocked && field.diff !== 'same')
          .map((field) => field.field);

        // Apply metadata automatically
        if (fieldsToApply.length > 0) {
          await applySeriesMetadata(seriesId, {
            metadata,
            source,
            externalId,
            fields: fieldsToApply,
          });
        }

        // Close the modal and trigger refresh
        dispatch({ type: 'FETCH_METADATA_SUCCESS' });
        onSave?.();
        onClose();

        // Refresh the page to show updated metadata
        window.location.reload();
      } catch (err) {
        dispatch({
          type: 'FETCH_METADATA_ERROR',
          error: err instanceof Error ? err.message : 'Failed to apply metadata',
        });
      }
    },
    [seriesId, onSave, onClose]
  );

  const handlePreviewApply = useCallback(
    async (selectedFields: string[]) => {
      if (!state.pendingMetadata || !state.pendingSource) return;

      dispatch({ type: 'APPLY_METADATA_START' });

      try {
        const result = await applySeriesMetadata(seriesId, {
          metadata: state.pendingMetadata,
          source: state.pendingSource,
          externalId: state.pendingExternalId,
          fields: selectedFields,
        });

        dispatch({
          type: 'APPLY_METADATA_SUCCESS',
          series: result.series,
          fieldsUpdated: result.fieldsUpdated,
        });

        // Refresh the page to show updated metadata
        onSave?.();
        onClose();
        window.location.reload();
      } catch (err) {
        dispatch({
          type: 'APPLY_METADATA_ERROR',
          error: err instanceof Error ? err.message : 'Failed to apply metadata',
        });
      }
    },
    [seriesId, state.pendingMetadata, state.pendingSource, state.pendingExternalId, onSave, onClose]
  );

  const handleCloseSearchModal = useCallback(() => {
    dispatch({ type: 'HIDE_SEARCH_MODAL' });
  }, []);

  const handleClosePreviewModal = useCallback(() => {
    dispatch({ type: 'HIDE_PREVIEW_MODAL' });
  }, []);

  // =============================================================================
  // Keyboard Shortcuts
  // =============================================================================

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape') {
        handleClose();
      }
      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!state.saving && hasUnsavedChanges) {
          handleSave();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, state.saving, handleSave]);

  // =============================================================================
  // Close Handler with Unsaved Changes Warning
  // =============================================================================

  const hasUnsavedChanges = state.modifiedFields.size > 0;

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
        return;
      }
    }
    onClose();
  }, [hasUnsavedChanges, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleClose();
      }
    },
    [handleClose]
  );

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET_CHANGES' });
  }, []);

  // =============================================================================
  // Memoized Values
  // =============================================================================

  const series = state.editedSeries;

  const isLocked = useCallback(
    (field: string) => state.lockedFields.has(field),
    [state.lockedFields]
  );

  const getFieldSource = useCallback(
    (field: string): FieldSource | null => state.fieldSources[field] || null,
    [state.fieldSources]
  );

  const countSectionChanges = useCallback(
    (sectionKey: keyof typeof SECTION_FIELDS): number => {
      const fields = SECTION_FIELDS[sectionKey];
      return fields.filter((field) => state.modifiedFields.has(field)).length;
    },
    [state.modifiedFields]
  );

  // Get current cover preview URL
  const getCoverPreviewUrl = useCallback((): string | null => {
    // Priority: uploaded cover hash > custom URL > API cover hash > file cover
    if (uploadedCoverHash) {
      return getApiCoverUrl(uploadedCoverHash);
    }
    if (series.coverUrl) {
      return series.coverUrl;
    }
    if (series.coverHash) {
      return getApiCoverUrl(series.coverHash);
    }
    // For file-based covers, we'd need the file's cover URL
    // This is handled by the CoverPicker component
    return null;
  }, [uploadedCoverHash, series.coverUrl, series.coverHash]);

  const handleEditCoverClick = useCallback(() => {
    setShowCoverModal(true);
  }, []);

  const handleCloseCoverModal = useCallback(() => {
    setShowCoverModal(false);
  }, []);

  // =============================================================================
  // Render
  // =============================================================================

  if (!isOpen) return null;

  return (
    <div className="modal-overlay edit-series-modal-overlay" onClick={handleBackdropClick}>
      <div className="modal-content edit-series-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>Edit Series</h2>
          <div className="header-actions">
            <button
              className="btn btn-secondary fetch-metadata-btn"
              onClick={handleFetchMetadata}
              disabled={state.loading || state.saving || state.fetchingMetadata}
              title="Fetch metadata from ComicVine or Metron"
            >
              {state.fetchingMetadata ? (
                <>
                  <div className="btn-spinner" />
                  Fetching...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 1.333v2.667M8 12v2.667M2.343 4L4.4 5.542M11.6 10.458L13.657 12M1.333 8h2.667M12 8h2.667M2.343 12l2.057-1.542M11.6 5.542L13.657 4"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Fetch Metadata
                </>
              )}
            </button>
            <MetadataGenerator
              seriesId={seriesId}
              seriesName={series.name || ''}
              currentValues={{
                summary: series.summary ?? null,
                deck: series.deck ?? null,
                ageRating: series.ageRating ?? null,
                genres: series.genres ?? null,
                tags: series.tags ?? null,
                startYear: series.startYear ?? null,
                endYear: series.endYear ?? null,
              }}
              onApply={(updates) => {
                Object.entries(updates).forEach(([field, value]) => {
                  dispatch({ type: 'UPDATE_FIELD', field: field as keyof typeof series, value });
                });
              }}
              disabled={state.saving || state.loading}
              compact
            />
            <button className="btn-icon btn-close" onClick={handleClose} title="Close (Esc)">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body edit-series-modal-body">
          {state.loading ? (
            <div className="loading-overlay">
              <div className="spinner" />
              Loading series...
            </div>
          ) : state.error && !state.originalSeries ? (
            <div className="error-message">{state.error}</div>
          ) : (
            <div className="edit-series-sections">
              {/* Error Banner */}
              {state.error && (
                <div className="error-banner">
                  {state.error}
                  <button onClick={() => dispatch({ type: 'SET_ERROR', error: null })}>Dismiss</button>
                </div>
              )}

              {/* Cover Row - Top of modal */}
              <div className="series-cover-row">
                <div className="series-cover-preview">
                  {getCoverPreviewUrl() ? (
                    <img src={getCoverPreviewUrl()!} alt={series.name || 'Series cover'} />
                  ) : (
                    <div className="cover-placeholder">No Cover</div>
                  )}
                  <button
                    type="button"
                    className="btn-edit-cover"
                    onClick={handleEditCoverClick}
                  >
                    Edit Cover
                  </button>
                </div>
                <div className="series-info-fields">
                  <div className="series-info-row">
                    <FieldWithLock
                      fieldName="name"
                      label="Series Name"
                      value={series.name}
                      onChange={handleFieldChange('name')}
                      isLocked={isLocked('name')}
                      onToggleLock={() => handleToggleLock('name')}
                      fieldSource={getFieldSource('name')}
                      isModified={state.modifiedFields.has('name')}
                      required
                      error={state.validationErrors.name}
                    />
                  </div>
                  <div className="series-info-row">
                    <FieldWithLock
                      fieldName="publisher"
                      label="Publisher"
                      value={series.publisher}
                      onChange={handleFieldChange('publisher')}
                      isLocked={isLocked('publisher')}
                      onToggleLock={() => handleToggleLock('publisher')}
                      fieldSource={getFieldSource('publisher')}
                      isModified={state.modifiedFields.has('publisher')}
                    />
                    <FieldWithLock
                      fieldName="startYear"
                      label="Year"
                      type="number"
                      value={series.startYear}
                      onChange={handleFieldChange('startYear')}
                      isLocked={isLocked('startYear')}
                      onToggleLock={() => handleToggleLock('startYear')}
                      fieldSource={getFieldSource('startYear')}
                      isModified={state.modifiedFields.has('startYear')}
                      min={1900}
                      max={2100}
                      placeholder="YYYY"
                      error={state.validationErrors.startYear}
                    />
                  </div>
                </div>
              </div>

              {/* Identity Section */}
              <CollapsibleSection title="Identity" changeCount={countSectionChanges('identity')} defaultExpanded={true}>
                <div className="section-fields two-column">
                  <FieldWithLock
                    fieldName="name"
                    label="Series Name"
                    value={series.name}
                    onChange={handleFieldChange('name')}
                    isLocked={isLocked('name')}
                    onToggleLock={() => handleToggleLock('name')}
                    fieldSource={getFieldSource('name')}
                    isModified={state.modifiedFields.has('name')}
                    required
                    error={state.validationErrors.name}
                    fullWidth
                  />
                  <FieldWithLock
                    fieldName="publisher"
                    label="Publisher"
                    value={series.publisher}
                    onChange={handleFieldChange('publisher')}
                    isLocked={isLocked('publisher')}
                    onToggleLock={() => handleToggleLock('publisher')}
                    fieldSource={getFieldSource('publisher')}
                    isModified={state.modifiedFields.has('publisher')}
                  />
                  <FieldWithLock
                    fieldName="startYear"
                    label="Start Year"
                    type="number"
                    value={series.startYear}
                    onChange={handleFieldChange('startYear')}
                    isLocked={isLocked('startYear')}
                    onToggleLock={() => handleToggleLock('startYear')}
                    fieldSource={getFieldSource('startYear')}
                    isModified={state.modifiedFields.has('startYear')}
                    min={1900}
                    max={2100}
                    placeholder="YYYY"
                    error={state.validationErrors.startYear}
                  />
                  <FieldWithLock
                    fieldName="endYear"
                    label="End Year"
                    type="number"
                    value={series.endYear}
                    onChange={handleFieldChange('endYear')}
                    isLocked={isLocked('endYear')}
                    onToggleLock={() => handleToggleLock('endYear')}
                    fieldSource={getFieldSource('endYear')}
                    isModified={state.modifiedFields.has('endYear')}
                    min={1900}
                    max={2100}
                    placeholder="YYYY (leave empty if ongoing)"
                    error={state.validationErrors.endYear}
                  />
                  <FieldWithLock
                    fieldName="volume"
                    label="Volume"
                    type="number"
                    value={series.volume}
                    onChange={handleFieldChange('volume')}
                    isLocked={isLocked('volume')}
                    onToggleLock={() => handleToggleLock('volume')}
                    fieldSource={getFieldSource('volume')}
                    isModified={state.modifiedFields.has('volume')}
                    min={1}
                    placeholder="Volume number"
                    error={state.validationErrors.volume}
                  />
                </div>
              </CollapsibleSection>

              {/* Description Section */}
              <CollapsibleSection title="Description" changeCount={countSectionChanges('description')} defaultExpanded={false}>
                <div className="section-fields">
                  <FieldWithLock
                    fieldName="summary"
                    label="Summary"
                    type="textarea"
                    value={series.summary}
                    onChange={handleFieldChange('summary')}
                    isLocked={isLocked('summary')}
                    onToggleLock={() => handleToggleLock('summary')}
                    fieldSource={getFieldSource('summary')}
                    isModified={state.modifiedFields.has('summary')}
                    rows={4}
                    placeholder="Full series description..."
                    fullWidth
                  />
                  <FieldWithLock
                    fieldName="deck"
                    label="Deck"
                    value={series.deck}
                    onChange={handleFieldChange('deck')}
                    isLocked={isLocked('deck')}
                    onToggleLock={() => handleToggleLock('deck')}
                    fieldSource={getFieldSource('deck')}
                    isModified={state.modifiedFields.has('deck')}
                    placeholder="Short tagline or description"
                    fullWidth
                  />
                  <FieldWithLock
                    fieldName="issueCount"
                    label="Total Issue Count"
                    type="number"
                    value={series.issueCount}
                    onChange={handleFieldChange('issueCount')}
                    isLocked={isLocked('issueCount')}
                    onToggleLock={() => handleToggleLock('issueCount')}
                    fieldSource={getFieldSource('issueCount')}
                    isModified={state.modifiedFields.has('issueCount')}
                    min={1}
                    placeholder="Known total from API"
                    error={state.validationErrors.issueCount}
                  />
                </div>
              </CollapsibleSection>

              {/* Classification Section */}
              <CollapsibleSection title="Classification" changeCount={countSectionChanges('classification')} defaultExpanded={false}>
                <div className="section-fields two-column">
                  <FieldWithLock
                    fieldName="type"
                    label="Type"
                    type="select"
                    value={series.type}
                    onChange={handleFieldChange('type')}
                    isLocked={isLocked('type')}
                    onToggleLock={() => handleToggleLock('type')}
                    fieldSource={getFieldSource('type')}
                    isModified={state.modifiedFields.has('type')}
                    options={TYPE_OPTIONS}
                  />
                  <FieldWithLock
                    fieldName="ageRating"
                    label="Age Rating"
                    type="select"
                    value={series.ageRating}
                    onChange={handleFieldChange('ageRating')}
                    isLocked={isLocked('ageRating')}
                    onToggleLock={() => handleToggleLock('ageRating')}
                    fieldSource={getFieldSource('ageRating')}
                    isModified={state.modifiedFields.has('ageRating')}
                    options={AGE_RATING_OPTIONS}
                    placeholder="Select rating..."
                  />
                  <TagInput
                    fieldName="genres"
                    label="Genres"
                    value={series.genres}
                    onChange={handleFieldChange('genres')}
                    isLocked={isLocked('genres')}
                    onToggleLock={() => handleToggleLock('genres')}
                    fieldSource={getFieldSource('genres')}
                    isModified={state.modifiedFields.has('genres')}
                    placeholder="Add genres..."
                    autocompleteField="genres"
                  />
                  <TagInput
                    fieldName="tags"
                    label="Tags"
                    value={series.tags}
                    onChange={handleFieldChange('tags')}
                    isLocked={isLocked('tags')}
                    onToggleLock={() => handleToggleLock('tags')}
                    fieldSource={getFieldSource('tags')}
                    isModified={state.modifiedFields.has('tags')}
                    placeholder="Add tags..."
                    autocompleteField="tags"
                  />
                  <FieldWithLock
                    fieldName="languageISO"
                    label="Language"
                    value={series.languageISO}
                    onChange={handleFieldChange('languageISO')}
                    isLocked={isLocked('languageISO')}
                    onToggleLock={() => handleToggleLock('languageISO')}
                    fieldSource={getFieldSource('languageISO')}
                    isModified={state.modifiedFields.has('languageISO')}
                    placeholder="ISO code (e.g., en, ja)"
                  />
                </div>
              </CollapsibleSection>

              {/* Content Entities Section */}
              <CollapsibleSection title="Content Entities" changeCount={countSectionChanges('contentEntities')} defaultExpanded={false}>
                <div className="section-fields two-column">
                  <TagInput
                    fieldName="characters"
                    label="Characters"
                    value={series.characters}
                    onChange={handleFieldChange('characters')}
                    isLocked={isLocked('characters')}
                    onToggleLock={() => handleToggleLock('characters')}
                    fieldSource={getFieldSource('characters')}
                    isModified={state.modifiedFields.has('characters')}
                    placeholder="Add characters..."
                    autocompleteField="characters"
                  />
                  <TagInput
                    fieldName="teams"
                    label="Teams"
                    value={series.teams}
                    onChange={handleFieldChange('teams')}
                    isLocked={isLocked('teams')}
                    onToggleLock={() => handleToggleLock('teams')}
                    fieldSource={getFieldSource('teams')}
                    isModified={state.modifiedFields.has('teams')}
                    placeholder="Add teams..."
                    autocompleteField="teams"
                  />
                  <TagInput
                    fieldName="locations"
                    label="Locations"
                    value={series.locations}
                    onChange={handleFieldChange('locations')}
                    isLocked={isLocked('locations')}
                    onToggleLock={() => handleToggleLock('locations')}
                    fieldSource={getFieldSource('locations')}
                    isModified={state.modifiedFields.has('locations')}
                    placeholder="Add locations..."
                    autocompleteField="locations"
                  />
                  <TagInput
                    fieldName="storyArcs"
                    label="Story Arcs"
                    value={series.storyArcs}
                    onChange={handleFieldChange('storyArcs')}
                    isLocked={isLocked('storyArcs')}
                    onToggleLock={() => handleToggleLock('storyArcs')}
                    fieldSource={getFieldSource('storyArcs')}
                    isModified={state.modifiedFields.has('storyArcs')}
                    placeholder="Add story arcs..."
                    autocompleteField="storyArcs"
                  />
                </div>
              </CollapsibleSection>

              {/* Creators Section */}
              <CollapsibleSection title="Creators" changeCount={countSectionChanges('creators')} defaultExpanded={false}>
                {/* Creator Source Selector and Fetch Button */}
                <div className="section-action-row creator-source-row">
                  <div className="creator-source-selector">
                    <span className="creator-source-label">Source:</span>
                    <div className="creator-source-toggle">
                      <button
                        type="button"
                        className={`creator-source-option ${creatorSourceSelection === 'api' ? 'active' : ''}`}
                        onClick={() => setCreatorSourceSelection('api')}
                        disabled={fetchingCreators}
                      >
                        API
                      </button>
                      <button
                        type="button"
                        className={`creator-source-option ${creatorSourceSelection === 'issues' ? 'active' : ''}`}
                        onClick={() => setCreatorSourceSelection('issues')}
                        disabled={fetchingCreators}
                      >
                        Issue Data
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleFetchCreatorRoles}
                    disabled={fetchingCreators}
                  >
                    {fetchingCreators ? 'Fetching...' : 'Fetch Creator Roles'}
                  </button>
                  <span className="section-action-hint">
                    {creatorSourceSelection === 'api'
                      ? 'Aggregates from ComicVine issue data'
                      : 'Aggregates from local ComicInfo.xml files'}
                  </span>
                </div>
                <div className="section-fields two-column">
                  <TagInput
                    fieldName="creators"
                    label="Creators (General)"
                    value={series.creators}
                    onChange={handleFieldChange('creators')}
                    isLocked={isLocked('creators')}
                    onToggleLock={() => handleToggleLock('creators')}
                    fieldSource={getFieldSource('creators')}
                    isModified={state.modifiedFields.has('creators')}
                    placeholder="Add creators..."
                    autocompleteField="creators"
                    fullWidth
                  />
                  <TagInput
                    fieldName="writer"
                    label="Writers"
                    value={series.writer}
                    onChange={handleFieldChange('writer')}
                    isLocked={isLocked('writer')}
                    onToggleLock={() => handleToggleLock('writer')}
                    fieldSource={getFieldSource('writer')}
                    isModified={state.modifiedFields.has('writer')}
                    placeholder="Add writers..."
                    autocompleteField="writers"
                  />
                  <TagInput
                    fieldName="penciller"
                    label="Pencillers"
                    value={series.penciller}
                    onChange={handleFieldChange('penciller')}
                    isLocked={isLocked('penciller')}
                    onToggleLock={() => handleToggleLock('penciller')}
                    fieldSource={getFieldSource('penciller')}
                    isModified={state.modifiedFields.has('penciller')}
                    placeholder="Add pencillers..."
                    autocompleteField="pencillers"
                  />
                  <TagInput
                    fieldName="inker"
                    label="Inkers"
                    value={series.inker}
                    onChange={handleFieldChange('inker')}
                    isLocked={isLocked('inker')}
                    onToggleLock={() => handleToggleLock('inker')}
                    fieldSource={getFieldSource('inker')}
                    isModified={state.modifiedFields.has('inker')}
                    placeholder="Add inkers..."
                    autocompleteField="inkers"
                  />
                  <TagInput
                    fieldName="colorist"
                    label="Colorists"
                    value={series.colorist}
                    onChange={handleFieldChange('colorist')}
                    isLocked={isLocked('colorist')}
                    onToggleLock={() => handleToggleLock('colorist')}
                    fieldSource={getFieldSource('colorist')}
                    isModified={state.modifiedFields.has('colorist')}
                    placeholder="Add colorists..."
                    autocompleteField="colorists"
                  />
                  <TagInput
                    fieldName="letterer"
                    label="Letterers"
                    value={series.letterer}
                    onChange={handleFieldChange('letterer')}
                    isLocked={isLocked('letterer')}
                    onToggleLock={() => handleToggleLock('letterer')}
                    fieldSource={getFieldSource('letterer')}
                    isModified={state.modifiedFields.has('letterer')}
                    placeholder="Add letterers..."
                    autocompleteField="letterers"
                  />
                  <TagInput
                    fieldName="coverArtist"
                    label="Cover Artists"
                    value={series.coverArtist}
                    onChange={handleFieldChange('coverArtist')}
                    isLocked={isLocked('coverArtist')}
                    onToggleLock={() => handleToggleLock('coverArtist')}
                    fieldSource={getFieldSource('coverArtist')}
                    isModified={state.modifiedFields.has('coverArtist')}
                    placeholder="Add cover artists..."
                    autocompleteField="coverArtists"
                  />
                  <TagInput
                    fieldName="editor"
                    label="Editors"
                    value={series.editor}
                    onChange={handleFieldChange('editor')}
                    isLocked={isLocked('editor')}
                    onToggleLock={() => handleToggleLock('editor')}
                    fieldSource={getFieldSource('editor')}
                    isModified={state.modifiedFields.has('editor')}
                    placeholder="Add editors..."
                    autocompleteField="editors"
                  />
                </div>
              </CollapsibleSection>

              {/* External IDs Section */}
              <CollapsibleSection title="External IDs" changeCount={countSectionChanges('externalIds')} defaultExpanded={false}>
                <div className="section-fields two-column">
                  <FieldWithLock
                    fieldName="comicVineId"
                    label="ComicVine ID"
                    value={series.comicVineId}
                    onChange={handleFieldChange('comicVineId')}
                    isLocked={isLocked('comicVineId')}
                    onToggleLock={() => handleToggleLock('comicVineId')}
                    fieldSource={getFieldSource('comicVineId')}
                    isModified={state.modifiedFields.has('comicVineId')}
                    placeholder="e.g., 4050-12345"
                  />
                  <FieldWithLock
                    fieldName="metronId"
                    label="Metron ID"
                    value={series.metronId}
                    onChange={handleFieldChange('metronId')}
                    isLocked={isLocked('metronId')}
                    onToggleLock={() => handleToggleLock('metronId')}
                    fieldSource={getFieldSource('metronId')}
                    isModified={state.modifiedFields.has('metronId')}
                    placeholder="e.g., 12345"
                  />
                </div>
              </CollapsibleSection>

              {/* User Data Section */}
              <CollapsibleSection title="Your Data" changeCount={countSectionChanges('userData')} defaultExpanded={false}>
                <div className="section-fields">
                  {/* Per-user rating */}
                  <div className="field-group user-rating-field">
                    <label className="field-label">Your Rating</label>
                    <RatingStars
                      value={userData?.rating ?? null}
                      onChange={(rating) => updateUserData.mutate({ seriesId, input: { rating } })}
                      size="large"
                      showValue
                      allowClear
                    />
                  </div>

                  {/* Per-user private notes */}
                  <div className="field-group full-width">
                    <label className="field-label">Private Notes</label>
                    <textarea
                      className="field-input"
                      value={userData?.privateNotes ?? ''}
                      onChange={(e) => {
                        const value = e.target.value || null;
                        updateUserData.mutate({ seriesId, input: { privateNotes: value } });
                      }}
                      rows={3}
                      placeholder="Your personal notes (only visible to you)..."
                    />
                  </div>

                  {/* Per-user public review */}
                  <div className="field-group full-width">
                    <div className="field-label-row">
                      <label className="field-label">Review</label>
                      <label className="visibility-toggle">
                        <input
                          type="checkbox"
                          checked={userData?.reviewVisibility === 'public'}
                          onChange={(e) => {
                            updateUserData.mutate({
                              seriesId,
                              input: { reviewVisibility: e.target.checked ? 'public' : 'private' }
                            });
                          }}
                        />
                        <span className="visibility-label">Public</span>
                      </label>
                    </div>
                    <textarea
                      className="field-input"
                      value={userData?.publicReview ?? ''}
                      onChange={(e) => {
                        const value = e.target.value || null;
                        updateUserData.mutate({ seriesId, input: { publicReview: value } });
                      }}
                      rows={4}
                      placeholder={userData?.reviewVisibility === 'public'
                        ? "Write a review (visible to others)..."
                        : "Write a review (currently private)..."}
                    />
                  </div>

                  {/* Series aliases - for matching purposes */}
                  <TagInput
                    fieldName="aliases"
                    label="Aliases"
                    value={series.aliases}
                    onChange={handleFieldChange('aliases')}
                    isLocked={isLocked('aliases')}
                    onToggleLock={() => handleToggleLock('aliases')}
                    fieldSource={getFieldSource('aliases')}
                    isModified={state.modifiedFields.has('aliases')}
                    placeholder="Alternate names for matching..."
                    fullWidth
                  />
                </div>
              </CollapsibleSection>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div className="footer-left">
            {hasUnsavedChanges && (
              <span className="unsaved-indicator">Unsaved changes</span>
            )}
          </div>
          <div className="footer-right">
            <button
              className="btn-secondary"
              onClick={handleReset}
              disabled={state.saving || !hasUnsavedChanges}
            >
              Reset
            </button>
            <button className="btn-ghost" onClick={handleClose} disabled={state.saving}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={state.saving || !hasUnsavedChanges}
            >
              {state.saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Series Metadata Search Modal */}
      <SeriesMetadataSearchModal
        isOpen={state.showSearchModal}
        onClose={handleCloseSearchModal}
        onSelect={handleSearchSelect}
        seriesId={seriesId}
        initialQuery={state.originalSeries?.name || ''}
        libraryType={state.originalSeries?.type}
      />

      {/* Metadata Preview Modal */}
      <MetadataPreviewModal
        isOpen={state.showPreviewModal}
        onClose={handleClosePreviewModal}
        onApply={handlePreviewApply}
        currentSeries={state.originalSeries}
        fields={state.previewFields}
        source={state.pendingSource}
        isApplying={state.applyingMetadata}
      />

      {/* Refetch Confirmation Dialog */}
      {state.showRefetchConfirm && (
        <div className="modal-overlay refetch-confirm-overlay" onClick={() => handleRefetchConfirm('cancel')}>
          <div className="refetch-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Series Already Linked</h3>
            <p>
              This series is already linked to{' '}
              {state.originalSeries?.comicVineId
                ? `ComicVine (ID: ${state.originalSeries.comicVineId})`
                : `Metron (ID: ${state.originalSeries?.metronId})`}
              .
            </p>
            <p>What would you like to do?</p>
            <div className="refetch-confirm-actions">
              <button
                className="btn btn-primary"
                onClick={() => handleRefetchConfirm('refresh')}
              >
                Refresh Metadata
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => handleRefetchConfirm('unlink')}
              >
                Search Different Series
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => handleRefetchConfirm('cancel')}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Series Cover Editor Modal */}
      <SeriesCoverEditorModal
        isOpen={showCoverModal}
        currentCoverSource={series.coverSource || 'auto'}
        currentCoverUrl={series.coverUrl || null}
        currentCoverHash={uploadedCoverHash || series.coverHash || null}
        currentCoverFileId={series.coverFileId || null}
        issues={state.issues}
        onClose={handleCloseCoverModal}
        onCoverChange={handleCoverChange}
        onUpload={handleCoverUpload}
        uploadedPreviewUrl={uploadedPreviewUrl}
      />
    </div>
  );
}
