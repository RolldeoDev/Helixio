/**
 * MetadataGenerator Component
 *
 * Enhanced metadata generation for series using LLM with optional web search.
 * Generates multiple metadata fields with confidence scores and shows a preview modal.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getDescriptionGenerationStatus,
  generateSeriesMetadata,
  type GeneratedSeriesMetadata,
} from '../../services/api.service';
import { MetadataGeneratorPreviewModal } from './MetadataGeneratorPreviewModal';
import './MetadataGenerator.css';

export interface MetadataGeneratorCurrentValues {
  summary: string | null;
  deck: string | null;
  ageRating: string | null;
  genres: string | null;
  tags: string | null;
  startYear: number | null;
  endYear: number | null;
}

interface MetadataGeneratorProps {
  /** ID of the series */
  seriesId: string;
  /** Name of the series (for display) */
  seriesName: string;
  /** Current values for all metadata fields */
  currentValues: MetadataGeneratorCurrentValues;
  /** Callback when metadata fields are applied */
  onApply: (updates: Partial<MetadataGeneratorCurrentValues>) => void;
  /** Callback for errors */
  onError?: (error: string) => void;
  /** Disable the component */
  disabled?: boolean;
  /** Compact mode for header placement */
  compact?: boolean;
}

export function MetadataGenerator({
  seriesId,
  seriesName,
  currentValues,
  onApply,
  onError,
  disabled = false,
  compact = false,
}: MetadataGeneratorProps) {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [generatedMetadata, setGeneratedMetadata] = useState<GeneratedSeriesMetadata | null>(null);
  const [webSearchUsed, setWebSearchUsed] = useState(false);

  // Check if LLM is available on mount
  useEffect(() => {
    let mounted = true;

    const checkAvailability = async () => {
      try {
        const status = await getDescriptionGenerationStatus();
        if (mounted) {
          setIsAvailable(status.available);
        }
      } catch {
        if (mounted) {
          setIsAvailable(false);
        }
      }
    };

    checkAvailability();

    return () => {
      mounted = false;
    };
  }, []);

  const handleGenerateClick = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateSeriesMetadata(seriesId, { useWebSearch });
      setGeneratedMetadata(result.metadata);
      setWebSearchUsed(result.webSearchUsed);
      setShowPreviewModal(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate metadata';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  }, [seriesId, useWebSearch, onError]);

  const handlePreviewClose = useCallback(() => {
    setShowPreviewModal(false);
  }, []);

  const handlePreviewApply = useCallback((updates: Partial<MetadataGeneratorCurrentValues>) => {
    onApply(updates);
    setShowPreviewModal(false);
    setGeneratedMetadata(null);
  }, [onApply]);

  // Don't render if not available
  if (isAvailable === false) {
    return null;
  }

  // Loading state while checking availability
  if (isAvailable === null) {
    return null;
  }

  // Compact mode for header placement
  if (compact) {
    return (
      <div className="metadata-generator metadata-generator-compact">
        <div className="generate-btn-wrapper">
          <button
            type="button"
            className="generate-btn generate-btn-secondary"
            onClick={handleGenerateClick}
            disabled={disabled || isGenerating}
          >
            {isGenerating ? (
              <>
                <span className="spinner-small" />
                Generating...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 8c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M8 6v4M6 8h4"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
                Generate
                <span className="beta-badge">BETA</span>
              </>
            )}
          </button>
          <div className="generate-options-toggle">
            <button
              type="button"
              className="options-chevron"
              onClick={() => setShowOptions(!showOptions)}
              disabled={disabled || isGenerating}
              title="Options"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          {showOptions && (
            <div className="generate-options-dropdown">
              <div className="generate-disclaimer">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 4.5V8.5M8 10.5V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span>Requires API key. Costs money per request. Results may be inaccurate.</span>
              </div>
              <label className="web-search-toggle">
                <input
                  type="checkbox"
                  checked={useWebSearch}
                  onChange={(e) => setUseWebSearch(e.target.checked)}
                  disabled={disabled || isGenerating}
                />
                <span className="toggle-label">Use Web Search</span>
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="generation-error generation-error-compact">
            {error}
          </div>
        )}

        {/* Preview Modal */}
        {showPreviewModal && generatedMetadata && (
          <MetadataGeneratorPreviewModal
            isOpen={showPreviewModal}
            onClose={handlePreviewClose}
            onApply={handlePreviewApply}
            generatedMetadata={generatedMetadata}
            currentValues={currentValues}
            seriesName={seriesName}
            webSearchUsed={webSearchUsed}
          />
        )}
      </div>
    );
  }

  return (
    <div className="metadata-generator">
      <div className="metadata-generator-controls">
        <button
          type="button"
          className="generate-btn"
          onClick={handleGenerateClick}
          disabled={disabled || isGenerating}
        >
          {isGenerating ? (
            <>
              <span className="spinner-small" />
              Generating...
            </>
          ) : (
            <>Generate Metadata</>
          )}
        </button>

        <label className="web-search-toggle">
          <input
            type="checkbox"
            checked={useWebSearch}
            onChange={(e) => setUseWebSearch(e.target.checked)}
            disabled={disabled || isGenerating}
          />
          <span className="toggle-label">Use Web Search</span>
        </label>
      </div>

      {error && (
        <div className="generation-error">
          {error}
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && generatedMetadata && (
        <MetadataGeneratorPreviewModal
          isOpen={showPreviewModal}
          onClose={handlePreviewClose}
          onApply={handlePreviewApply}
          generatedMetadata={generatedMetadata}
          currentValues={currentValues}
          seriesName={seriesName}
          webSearchUsed={webSearchUsed}
        />
      )}
    </div>
  );
}
