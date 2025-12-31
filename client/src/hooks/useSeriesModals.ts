/**
 * useSeriesModals Hook
 *
 * Manages modal states and workflows for SeriesDetailPage.
 * Handles edit, merge, link, metadata, ratings, and reader settings modals.
 */

import { useState, useCallback } from 'react';
import {
  fetchSeriesMetadata,
  previewSeriesMetadata,
  applySeriesMetadata,
  type Series,
  type SeriesForMerge,
  type MetadataSource,
  type SeriesMetadataPayload,
  type MetadataPreviewField,
} from '../services/api.service';
import {
  getReaderPresetsGrouped,
  getSeriesReaderSettingsById,
  getLibraryReaderSettings,
  type PresetsGrouped,
} from '../services/api/reading';
import type { SeriesIssue } from '../services/api.service';

export interface UseSeriesModalsOptions {
  /** The series ID */
  seriesId: string | undefined;
  /** The series data */
  series: Series | null;
  /** The list of issues (to get libraryId) */
  issues: SeriesIssue[];
  /** Callback to refetch series data */
  onRefresh: () => Promise<void>;
  /** Callback to show toast notification */
  addToast: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void;
}

export interface UseSeriesModalsResult {
  // Edit Series Modal
  isEditSeriesModalOpen: boolean;
  openEditSeriesModal: () => void;
  closeEditSeriesModal: () => void;

  // Merge Modals
  showSeriesSelectModal: boolean;
  openSeriesSelectModal: () => void;
  closeSeriesSelectModal: () => void;
  showMergeModal: boolean;
  selectedMergeSeries: SeriesForMerge[];
  handleSeriesSelectedForMerge: (selectedSeries: Series[]) => void;
  handleMergeComplete: () => void;
  closeMergeModal: () => void;

  // Link Series Modal
  showLinkSeriesModal: boolean;
  openLinkSeriesModal: () => void;
  closeLinkSeriesModal: () => void;

  // Manage Relationships Modal
  showManageRelationshipsModal: boolean;
  openManageRelationshipsModal: () => void;
  closeManageRelationshipsModal: () => void;

  // Ratings Modal
  showRatingsModal: boolean;
  openRatingsModal: () => void;
  closeRatingsModal: () => void;

  // Reader Settings Modal
  showReaderSettingsModal: boolean;
  readerPresets: PresetsGrouped | null;
  seriesReaderSettings: { presetId?: string; presetName?: string } | null;
  libraryReaderSettingsInfo: { presetId?: string; presetName?: string } | null;
  loadingReaderSettings: boolean;
  openReaderSettingsModal: () => void;
  closeReaderSettingsModal: () => void;
  setSeriesReaderSettings: React.Dispatch<React.SetStateAction<{ presetId?: string; presetName?: string } | null>>;

  // Metadata Search Modal
  showMetadataSearchModal: boolean;
  openMetadataSearchModal: () => void;
  closeMetadataSearchModal: () => void;

  // Metadata Preview Modal
  showMetadataPreviewModal: boolean;
  pendingMetadata: SeriesMetadataPayload | null;
  pendingSource: MetadataSource | null;
  pendingExternalId: string | null;
  previewFields: MetadataPreviewField[];
  isApplyingMetadata: boolean;
  handleMetadataSearchSelect: (source: MetadataSource, externalId: string, metadata: SeriesMetadataPayload) => Promise<void>;
  handleMetadataPreviewApply: (selectedFields: string[]) => Promise<void>;
  handleMetadataPreviewClose: () => void;

  // Combined handler for fetching series metadata (opens search or preview modal)
  handleFetchSeriesMetadata: () => Promise<void>;
}

/**
 * Helper to convert Series to SeriesForMerge format.
 */
function seriesToMergeFormat(s: Series): SeriesForMerge {
  return {
    id: s.id,
    name: s.name,
    publisher: s.publisher,
    startYear: s.startYear,
    endYear: s.endYear,
    issueCount: s.issueCount,
    ownedIssueCount: s._count?.issues ?? 0,
    comicVineId: s.comicVineId,
    metronId: s.metronId,
    coverUrl: s.coverUrl,
    coverHash: s.coverHash,
    coverFileId: s.coverFileId,
    aliases: s.aliases,
    summary: s.summary,
    type: s.type,
    createdAt: String(s.createdAt ?? new Date().toISOString()),
    updatedAt: String(s.updatedAt ?? new Date().toISOString()),
  };
}

/**
 * Hook for managing series modal states and workflows.
 *
 * Features:
 * - Edit, merge, link, relationships modals
 * - Metadata search and preview workflow
 * - Reader settings with preset management
 * - Community ratings modal
 */
export function useSeriesModals({
  seriesId,
  series,
  issues,
  onRefresh,
  addToast,
}: UseSeriesModalsOptions): UseSeriesModalsResult {
  // Edit Series Modal
  const [isEditSeriesModalOpen, setIsEditSeriesModalOpen] = useState(false);

  // Merge Modals
  const [showSeriesSelectModal, setShowSeriesSelectModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedMergeSeries, setSelectedMergeSeries] = useState<SeriesForMerge[]>([]);

  // Relationship Modals
  const [showLinkSeriesModal, setShowLinkSeriesModal] = useState(false);
  const [showManageRelationshipsModal, setShowManageRelationshipsModal] = useState(false);

  // Ratings Modal
  const [showRatingsModal, setShowRatingsModal] = useState(false);

  // Reader Settings Modal
  const [showReaderSettingsModal, setShowReaderSettingsModal] = useState(false);
  const [readerPresets, setReaderPresets] = useState<PresetsGrouped | null>(null);
  const [seriesReaderSettings, setSeriesReaderSettings] = useState<{ presetId?: string; presetName?: string } | null>(null);
  const [libraryReaderSettingsInfo, setLibraryReaderSettingsInfo] = useState<{ presetId?: string; presetName?: string } | null>(null);
  const [loadingReaderSettings, setLoadingReaderSettings] = useState(false);

  // Metadata Workflow State
  const [showMetadataSearchModal, setShowMetadataSearchModal] = useState(false);
  const [showMetadataPreviewModal, setShowMetadataPreviewModal] = useState(false);
  const [pendingMetadata, setPendingMetadata] = useState<SeriesMetadataPayload | null>(null);
  const [pendingSource, setPendingSource] = useState<MetadataSource | null>(null);
  const [pendingExternalId, setPendingExternalId] = useState<string | null>(null);
  const [previewFields, setPreviewFields] = useState<MetadataPreviewField[]>([]);
  const [isApplyingMetadata, setIsApplyingMetadata] = useState(false);

  // Edit Series Modal handlers
  const openEditSeriesModal = useCallback(() => setIsEditSeriesModalOpen(true), []);
  const closeEditSeriesModal = useCallback(() => setIsEditSeriesModalOpen(false), []);

  // Series Select Modal handlers
  const openSeriesSelectModal = useCallback(() => setShowSeriesSelectModal(true), []);
  const closeSeriesSelectModal = useCallback(() => setShowSeriesSelectModal(false), []);

  // Merge Modal handlers
  const handleSeriesSelectedForMerge = useCallback((selectedSeries: Series[]) => {
    if (!series) return;

    const currentSeriesForMerge = seriesToMergeFormat(series);
    const selectedSeriesForMerge = selectedSeries.map(seriesToMergeFormat);

    setSelectedMergeSeries([currentSeriesForMerge, ...selectedSeriesForMerge]);
    setShowSeriesSelectModal(false);
    setShowMergeModal(true);
  }, [series]);

  const handleMergeComplete = useCallback(() => {
    setShowMergeModal(false);
    setSelectedMergeSeries([]);
    onRefresh();
  }, [onRefresh]);

  const closeMergeModal = useCallback(() => {
    setShowMergeModal(false);
    setSelectedMergeSeries([]);
  }, []);

  // Link Series Modal handlers
  const openLinkSeriesModal = useCallback(() => setShowLinkSeriesModal(true), []);
  const closeLinkSeriesModal = useCallback(() => setShowLinkSeriesModal(false), []);

  // Manage Relationships Modal handlers
  const openManageRelationshipsModal = useCallback(() => setShowManageRelationshipsModal(true), []);
  const closeManageRelationshipsModal = useCallback(() => setShowManageRelationshipsModal(false), []);

  // Ratings Modal handlers
  const openRatingsModal = useCallback(() => setShowRatingsModal(true), []);
  const closeRatingsModal = useCallback(() => setShowRatingsModal(false), []);

  // Reader Settings Modal handlers
  const openReaderSettingsModal = useCallback(() => {
    if (!seriesId) return;

    setShowReaderSettingsModal(true);
    const libraryId = issues?.[0]?.libraryId ?? null;
    setLoadingReaderSettings(true);

    Promise.all([
      getReaderPresetsGrouped(),
      getSeriesReaderSettingsById(seriesId),
      libraryId ? getLibraryReaderSettings(libraryId) : Promise.resolve(null)
    ]).then(([presets, seriesSettings, libSettings]) => {
      setReaderPresets(presets);
      const seriesWithPreset = seriesSettings as { basedOnPresetId?: string; basedOnPresetName?: string };
      setSeriesReaderSettings(seriesWithPreset?.basedOnPresetId ? {
        presetId: seriesWithPreset.basedOnPresetId,
        presetName: seriesWithPreset.basedOnPresetName
      } : null);
      const libWithPreset = libSettings as { basedOnPresetId?: string; basedOnPresetName?: string } | null;
      setLibraryReaderSettingsInfo(libWithPreset?.basedOnPresetId ? {
        presetId: libWithPreset.basedOnPresetId,
        presetName: libWithPreset.basedOnPresetName
      } : null);
    }).catch(console.error).finally(() => setLoadingReaderSettings(false));
  }, [seriesId, issues]);

  const closeReaderSettingsModal = useCallback(() => setShowReaderSettingsModal(false), []);

  // Metadata Search Modal handlers
  const openMetadataSearchModal = useCallback(() => setShowMetadataSearchModal(true), []);
  const closeMetadataSearchModal = useCallback(() => setShowMetadataSearchModal(false), []);

  // Handle fetching series metadata (opens search or preview modal)
  const handleFetchSeriesMetadata = useCallback(async () => {
    if (!series) return;

    try {
      const result = await fetchSeriesMetadata(series.id);
      if (result.needsSearch) {
        setShowMetadataSearchModal(true);
      } else if (result.metadata && result.source && result.externalId) {
        const previewResult = await previewSeriesMetadata(
          series.id,
          result.metadata,
          result.source,
          result.externalId
        );
        setPendingMetadata(result.metadata);
        setPendingSource(result.source);
        setPendingExternalId(result.externalId);
        setPreviewFields(previewResult.preview.fields);
        setShowMetadataPreviewModal(true);
      } else {
        addToast('info', result.message || 'No metadata found');
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to fetch metadata');
    }
  }, [series, addToast]);

  // Handle metadata search modal selection
  const handleMetadataSearchSelect = useCallback(
    async (source: MetadataSource, externalId: string, metadata: SeriesMetadataPayload) => {
      setShowMetadataSearchModal(false);

      if (!seriesId) return;

      try {
        const previewResult = await previewSeriesMetadata(
          seriesId,
          metadata,
          source,
          externalId
        );

        setPendingMetadata(metadata);
        setPendingSource(source);
        setPendingExternalId(externalId);
        setPreviewFields(previewResult.preview.fields);
        setShowMetadataPreviewModal(true);
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to load preview');
      }
    },
    [seriesId, addToast]
  );

  // Handle metadata preview modal apply
  const handleMetadataPreviewApply = useCallback(
    async (selectedFields: string[]) => {
      if (!seriesId || !pendingMetadata || !pendingSource) return;

      setIsApplyingMetadata(true);

      try {
        await applySeriesMetadata(seriesId, {
          metadata: pendingMetadata,
          source: pendingSource,
          externalId: pendingExternalId,
          fields: selectedFields,
        });

        // Reset state and refresh
        setShowMetadataPreviewModal(false);
        setPendingMetadata(null);
        setPendingSource(null);
        setPendingExternalId(null);
        setPreviewFields([]);
        addToast('success', 'Metadata applied successfully');
        onRefresh();
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to apply metadata');
      } finally {
        setIsApplyingMetadata(false);
      }
    },
    [seriesId, pendingMetadata, pendingSource, pendingExternalId, onRefresh, addToast]
  );

  // Handle metadata preview modal close
  const handleMetadataPreviewClose = useCallback(() => {
    setShowMetadataPreviewModal(false);
    setPendingMetadata(null);
    setPendingSource(null);
    setPendingExternalId(null);
    setPreviewFields([]);
  }, []);

  return {
    // Edit Series Modal
    isEditSeriesModalOpen,
    openEditSeriesModal,
    closeEditSeriesModal,

    // Merge Modals
    showSeriesSelectModal,
    openSeriesSelectModal,
    closeSeriesSelectModal,
    showMergeModal,
    selectedMergeSeries,
    handleSeriesSelectedForMerge,
    handleMergeComplete,
    closeMergeModal,

    // Link Series Modal
    showLinkSeriesModal,
    openLinkSeriesModal,
    closeLinkSeriesModal,

    // Manage Relationships Modal
    showManageRelationshipsModal,
    openManageRelationshipsModal,
    closeManageRelationshipsModal,

    // Ratings Modal
    showRatingsModal,
    openRatingsModal,
    closeRatingsModal,

    // Reader Settings Modal
    showReaderSettingsModal,
    readerPresets,
    seriesReaderSettings,
    libraryReaderSettingsInfo,
    loadingReaderSettings,
    openReaderSettingsModal,
    closeReaderSettingsModal,
    setSeriesReaderSettings,

    // Metadata Search Modal
    showMetadataSearchModal,
    openMetadataSearchModal,
    closeMetadataSearchModal,

    // Metadata Preview Modal
    showMetadataPreviewModal,
    pendingMetadata,
    pendingSource,
    pendingExternalId,
    previewFields,
    isApplyingMetadata,
    handleMetadataSearchSelect,
    handleMetadataPreviewApply,
    handleMetadataPreviewClose,

    // Combined handler
    handleFetchSeriesMetadata,
  };
}
