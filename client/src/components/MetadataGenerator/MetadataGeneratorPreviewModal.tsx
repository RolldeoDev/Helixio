/**
 * MetadataGeneratorPreviewModal Component
 *
 * Preview modal for LLM-generated metadata with confidence scores.
 * Users can select which fields to apply, with empty fields pre-selected by default.
 *
 * Uses the shared FieldComparisonRow component for consistent field display.
 */

import { useState, useCallback } from 'react';
import type { GeneratedSeriesMetadata } from '../../services/api.service';
import type { MetadataGeneratorCurrentValues } from './MetadataGenerator';
import { FieldComparisonRow } from '../FieldComparison';
import './MetadataGeneratorPreviewModal.css';

// Field configuration
interface FieldConfig {
  key: keyof GeneratedSeriesMetadata;
  label: string;
  formatValue: (value: string | number | null) => string;
}

const FIELD_CONFIGS: FieldConfig[] = [
  {
    key: 'summary',
    label: 'Summary',
    formatValue: (v) => (typeof v === 'string' && v.length > 150 ? v.substring(0, 150) + '...' : String(v || '')),
  },
  {
    key: 'deck',
    label: 'Deck',
    formatValue: (v) => String(v || ''),
  },
  {
    key: 'ageRating',
    label: 'Age Rating',
    formatValue: (v) => String(v || ''),
  },
  {
    key: 'genres',
    label: 'Genres',
    formatValue: (v) => String(v || ''),
  },
  {
    key: 'tags',
    label: 'Tags',
    formatValue: (v) => String(v || ''),
  },
  {
    key: 'startYear',
    label: 'Start Year',
    formatValue: (v) => (v != null ? String(v) : ''),
  },
  {
    key: 'endYear',
    label: 'End Year',
    formatValue: (v) => (v != null ? String(v) : ''),
  },
];

interface MetadataGeneratorPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (updates: Partial<MetadataGeneratorCurrentValues>) => void;
  generatedMetadata: GeneratedSeriesMetadata;
  currentValues: MetadataGeneratorCurrentValues;
  seriesName: string;
  webSearchUsed: boolean;
}

export function MetadataGeneratorPreviewModal({
  isOpen,
  onClose,
  onApply,
  generatedMetadata,
  currentValues,
  seriesName,
  webSearchUsed,
}: MetadataGeneratorPreviewModalProps) {
  // Track selected fields - default to fields that are empty
  const [selectedFields, setSelectedFields] = useState<Set<keyof GeneratedSeriesMetadata>>(() => {
    const defaultSelected = new Set<keyof GeneratedSeriesMetadata>();
    for (const config of FIELD_CONFIGS) {
      const currentValue = currentValues[config.key];
      const isEmpty = currentValue === null || currentValue === '' || currentValue === undefined;
      if (isEmpty) {
        defaultSelected.add(config.key);
      }
    }
    return defaultSelected;
  });

  // Toggle a single field
  const toggleField = useCallback((fieldKey: string, selected: boolean) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(fieldKey as keyof GeneratedSeriesMetadata);
      } else {
        next.delete(fieldKey as keyof GeneratedSeriesMetadata);
      }
      return next;
    });
  }, []);

  // Select all empty fields
  const selectAllEmpty = useCallback(() => {
    setSelectedFields(() => {
      const selected = new Set<keyof GeneratedSeriesMetadata>();
      for (const config of FIELD_CONFIGS) {
        const currentValue = currentValues[config.key];
        const isEmpty = currentValue === null || currentValue === '' || currentValue === undefined;
        if (isEmpty) {
          selected.add(config.key);
        }
      }
      return selected;
    });
  }, [currentValues]);

  // Deselect all
  const deselectAll = useCallback(() => {
    setSelectedFields(new Set());
  }, []);

  // Handle apply
  const handleApply = useCallback(() => {
    const updates: Partial<MetadataGeneratorCurrentValues> = {};

    for (const fieldKey of selectedFields) {
      const generated = generatedMetadata[fieldKey];
      if (generated && generated.value !== null && generated.value !== undefined) {
        // Type assertion needed due to mixed types
        (updates as Record<string, string | number | null>)[fieldKey] = generated.value;
      }
    }

    onApply(updates);
  }, [selectedFields, generatedMetadata, onApply]);

  // Check if current value is empty
  const isCurrentEmpty = (value: string | number | null): boolean => {
    return value === null || value === '' || value === undefined;
  };

  if (!isOpen) return null;

  // Filter to only show fields that have generated values
  const visibleFields = FIELD_CONFIGS.filter((config) => {
    const generated = generatedMetadata[config.key];
    return generated && generated.value !== null && generated.value !== '';
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="metadata-generator-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Generated Metadata Preview</h2>
          <button
            className="btn-icon btn-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M15 5L5 15M5 5L15 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="modal-content">
          <div className="series-info">
            <span className="series-name">{seriesName}</span>
            {webSearchUsed && (
              <span className="web-search-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Web Search Used
              </span>
            )}
          </div>

          <div className="field-comparison-rows">
            {visibleFields.map((config) => {
              const generated = generatedMetadata[config.key];
              const currentValue = currentValues[config.key];
              const isSelected = selectedFields.has(config.key);
              const isEmpty = isCurrentEmpty(currentValue);

              return (
                <FieldComparisonRow
                  key={config.key}
                  fieldName={config.key}
                  label={config.label}
                  currentValue={isEmpty ? null : currentValue}
                  proposedValue={generated.value}
                  isSelected={isSelected}
                  confidence={generated.confidence}
                  onToggle={(selected) => toggleField(config.key, selected)}
                  formatValue={config.formatValue}
                />
              );
            })}
          </div>
        </div>

        <div className="modal-footer">
          <div className="footer-left">
            <button
              type="button"
              className="field-comparison-quick-action"
              onClick={selectAllEmpty}
            >
              Select All Empty
            </button>
            <span className="field-comparison-separator">|</span>
            <button
              type="button"
              className="field-comparison-quick-action"
              onClick={deselectAll}
            >
              Deselect All
            </button>
          </div>
          <div className="footer-right">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleApply}
              disabled={selectedFields.size === 0}
            >
              Apply {selectedFields.size} Field{selectedFields.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
