/**
 * IssueMetadataGenerator Component
 *
 * Enhanced metadata generation for issues using LLM with optional web search.
 * Generates multiple metadata fields with confidence scores and shows a preview modal.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getDescriptionGenerationStatus,
  generateIssueMetadata,
  type GeneratedIssueMetadata,
} from '../../services/api.service';
import { IssueMetadataGeneratorPreviewModal } from './IssueMetadataGeneratorPreviewModal';
import './IssueMetadataGenerator.css';

export interface IssueMetadataGeneratorCurrentValues {
  summary: string | null;
  deck: string | null;
  ageRating: string | null;
  genres: string | null;
  tags: string | null;
  characters: string | null;
  teams: string | null;
  locations: string | null;
}

interface IssueMetadataGeneratorProps {
  /** ID of the file/issue */
  fileId: string;
  /** Name of the issue (for display) */
  issueName: string;
  /** Current values for all metadata fields */
  currentValues: IssueMetadataGeneratorCurrentValues;
  /** Callback when metadata fields are applied */
  onApply: (updates: Partial<IssueMetadataGeneratorCurrentValues>) => void;
  /** Callback for errors */
  onError?: (error: string) => void;
  /** Disable the component */
  disabled?: boolean;
  /** Whether this is a CBR file (cannot save metadata) */
  isCbrFile?: boolean;
  /** Callback to convert CBR to CBZ */
  onConvertToCbz?: () => Promise<void>;
}

export function IssueMetadataGenerator({
  fileId,
  issueName,
  currentValues,
  onApply,
  onError,
  disabled = false,
  isCbrFile = false,
  onConvertToCbz,
}: IssueMetadataGeneratorProps) {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showCbrPrompt, setShowCbrPrompt] = useState(false);

  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [generatedMetadata, setGeneratedMetadata] = useState<GeneratedIssueMetadata | null>(null);
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
    // If CBR file, show conversion prompt
    if (isCbrFile) {
      setShowCbrPrompt(true);
      return;
    }

    await performGeneration();
  }, [fileId, useWebSearch, onError, isCbrFile]);

  const performGeneration = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateIssueMetadata(fileId, { useWebSearch });
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
  };

  const handleConvertAndGenerate = useCallback(async () => {
    if (!onConvertToCbz) return;

    setIsConverting(true);
    setShowCbrPrompt(false);
    setError(null);

    try {
      await onConvertToCbz();
      // After conversion, proceed with generation
      await performGeneration();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to convert file';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsConverting(false);
    }
  }, [onConvertToCbz, fileId, useWebSearch, onError]);

  const handlePreviewClose = useCallback(() => {
    setShowPreviewModal(false);
  }, []);

  const handlePreviewApply = useCallback((updates: Partial<IssueMetadataGeneratorCurrentValues>) => {
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

  return (
    <div className="issue-metadata-generator">
      <div className="generate-btn-wrapper">
        <button
          type="button"
          className="generate-btn generate-btn-secondary"
          onClick={handleGenerateClick}
          disabled={disabled || isGenerating || isConverting}
        >
          {isGenerating || isConverting ? (
            <>
              <span className="spinner-small" />
              {isConverting ? 'Converting...' : 'Generating...'}
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
            disabled={disabled || isGenerating || isConverting}
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
                disabled={disabled || isGenerating || isConverting}
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

      {/* CBR Conversion Prompt Modal */}
      {showCbrPrompt && (
        <div className="modal-overlay" onClick={() => setShowCbrPrompt(false)}>
          <div className="cbr-prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cbr-prompt-header">
              <h3>Convert to CBZ?</h3>
            </div>
            <div className="cbr-prompt-content">
              <p>
                This file is a CBR archive which cannot store metadata.
                Would you like to convert it to CBZ format first?
              </p>
              <p className="cbr-prompt-note">
                The conversion will preserve all images and existing data.
              </p>
            </div>
            <div className="cbr-prompt-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCbrPrompt(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConvertAndGenerate}
              >
                Convert & Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && generatedMetadata && (
        <IssueMetadataGeneratorPreviewModal
          isOpen={showPreviewModal}
          onClose={handlePreviewClose}
          onApply={handlePreviewApply}
          generatedMetadata={generatedMetadata}
          currentValues={currentValues}
          issueName={issueName}
          webSearchUsed={webSearchUsed}
        />
      )}
    </div>
  );
}
