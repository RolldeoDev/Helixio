/**
 * DescriptionGenerator Component
 *
 * Provides LLM-based description generation for series and issues.
 * Includes optional web search toggle and overwrite confirmation.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getDescriptionGenerationStatus,
  generateSeriesDescription,
  generateIssueSummary,
} from '../../services/api.service';
import './DescriptionGenerator.css';

interface DescriptionGeneratorProps {
  /** Type of entity to generate description for */
  type: 'series' | 'issue';
  /** ID of the entity */
  entityId: string;
  /** Name of the entity (for display) */
  entityName: string;
  /** Current description (to detect overwrite) */
  currentDescription?: string | null;
  /** Current deck (series only) */
  currentDeck?: string | null;
  /** Callback when description is generated */
  onGenerated: (result: { description: string; deck?: string }) => void;
  /** Callback for errors */
  onError?: (error: string) => void;
  /** Disable the component */
  disabled?: boolean;
}

export function DescriptionGenerator({
  type,
  entityId,
  entityName,
  currentDescription,
  currentDeck,
  onGenerated,
  onError,
  disabled = false,
}: DescriptionGeneratorProps) {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const hasExistingContent = Boolean(currentDescription || currentDeck);

  const handleGenerateClick = useCallback(() => {
    if (hasExistingContent) {
      setShowConfirmDialog(true);
    } else {
      performGeneration();
    }
  }, [hasExistingContent]);

  const performGeneration = useCallback(async () => {
    setShowConfirmDialog(false);
    setIsGenerating(true);
    setError(null);

    try {
      if (type === 'series') {
        const result = await generateSeriesDescription(entityId, { useWebSearch });
        onGenerated({
          description: result.description,
          deck: result.deck,
        });
      } else {
        const result = await generateIssueSummary(entityId, { useWebSearch });
        onGenerated({
          description: result.summary,
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate description';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  }, [type, entityId, useWebSearch, onGenerated, onError]);

  const handleConfirmCancel = useCallback(() => {
    setShowConfirmDialog(false);
  }, []);

  // Don't render if not available
  if (isAvailable === false) {
    return null;
  }

  // Loading state while checking availability
  if (isAvailable === null) {
    return null;
  }

  return (
    <div className="description-generator">
      <div className="description-generator-controls">
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
            <>Generate Description</>
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

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="confirm-dialog-overlay" onClick={handleConfirmCancel}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Replace Existing Description?</h3>
            <p>
              {entityName} already has a description. Generating a new one will replace it.
            </p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleConfirmCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={performGeneration}
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
