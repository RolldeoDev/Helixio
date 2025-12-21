/**
 * FieldSourceSelector Component
 *
 * A reusable component for selecting which metadata source to use for a specific field.
 * Shows all values from all sources with radio buttons to select the preferred source.
 */

import { useState } from 'react';
import type { MetadataSource } from '../../services/api.service';
import './FieldSourceSelector.css';

const SOURCE_LABELS: Record<MetadataSource, string> = {
  comicvine: 'ComicVine',
  metron: 'Metron',
  gcd: 'GCD',
};

const SOURCE_COLORS: Record<MetadataSource, string> = {
  comicvine: '#f05050',
  metron: '#4a90d9',
  gcd: '#4caf50',
};

const SOURCE_ABBREVIATIONS: Record<MetadataSource, string> = {
  comicvine: 'CV',
  metron: 'MT',
  gcd: 'GCD',
};

interface FieldSourceSelectorProps {
  /** Field name (e.g., "publisher", "issueCount") */
  fieldName: string;
  /** Display label for the field */
  fieldLabel: string;
  /** All values from all sources for this field */
  allValues: Record<MetadataSource, unknown>;
  /** Currently selected source for this field */
  selectedSource: MetadataSource;
  /** Callback when user selects a different source */
  onSourceChange: (source: MetadataSource) => void;
  /** Whether this field is locked from auto-override */
  locked?: boolean;
  /** Callback when user toggles the lock */
  onLockToggle?: () => void;
  /** Whether the selector is in inline mode (compact) or expanded mode */
  inline?: boolean;
  /** Custom formatter for displaying values */
  formatValue?: (value: unknown) => string;
}

/**
 * Default value formatter
 */
function defaultFormatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value || '-';
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    // Handle Credit arrays
    if (value[0] && typeof value[0] === 'object' && 'name' in value[0]) {
      return (value as Array<{ name: string }>).map((c) => c.name).join(', ');
    }
    return value.join(', ');
  }
  return String(value);
}

/**
 * Truncate long text values
 */
function truncateValue(value: string, maxLength = 50): string {
  if (value.length > maxLength) {
    return value.substring(0, maxLength) + '...';
  }
  return value;
}

export function FieldSourceSelector({
  fieldName,
  fieldLabel,
  allValues,
  selectedSource,
  onSourceChange,
  locked = false,
  onLockToggle,
  inline = false,
  formatValue = defaultFormatValue,
}: FieldSourceSelectorProps) {
  const [expanded, setExpanded] = useState(false);

  // Get sources that have values
  const sourcesWithValues = (Object.entries(allValues) as [MetadataSource, unknown][])
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .sort((a, b) => {
      // Sort by source priority (comicvine first, then metron, then gcd)
      const order: MetadataSource[] = ['comicvine', 'metron', 'gcd'];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    });

  const hasMultipleSources = sourcesWithValues.length > 1;
  const selectedValue = allValues[selectedSource];

  if (inline) {
    // Compact inline mode - just show current value with source badge
    return (
      <div className={`field-source-inline ${locked ? 'locked' : ''}`}>
        <span className="field-value-inline">
          {truncateValue(formatValue(selectedValue))}
        </span>
        <span
          className="source-badge-small"
          style={{ backgroundColor: SOURCE_COLORS[selectedSource] }}
          title={SOURCE_LABELS[selectedSource]}
        >
          {SOURCE_ABBREVIATIONS[selectedSource]}
        </span>
        {hasMultipleSources && (
          <button
            className="expand-btn-inline"
            onClick={() => setExpanded(!expanded)}
            title="Choose different source"
          >
            {expanded ? '▼' : '▶'}
          </button>
        )}
        {expanded && (
          <div className="source-dropdown">
            {sourcesWithValues.map(([source, value]) => (
              <label
                key={source}
                className={`source-option ${source === selectedSource ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name={`field-source-${fieldName}`}
                  checked={source === selectedSource}
                  onChange={() => {
                    onSourceChange(source);
                    setExpanded(false);
                  }}
                />
                <span
                  className="source-dot"
                  style={{ backgroundColor: SOURCE_COLORS[source] }}
                />
                <span className="source-name">{SOURCE_LABELS[source]}</span>
                <span className="source-value" title={formatValue(value)}>
                  {truncateValue(formatValue(value), 30)}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full expanded mode - show all sources with radio buttons
  return (
    <div className={`field-source-selector ${locked ? 'locked' : ''} ${hasMultipleSources ? 'multi-source' : ''}`}>
      <div className="field-header">
        <span className="field-label">{fieldLabel}</span>
        {onLockToggle && (
          <button
            className={`lock-btn ${locked ? 'locked' : ''}`}
            onClick={onLockToggle}
            title={locked ? 'Unlock field (allow auto-override)' : 'Lock field (prevent auto-override)'}
          >
            {locked ? '🔒' : '🔓'}
          </button>
        )}
      </div>

      {!hasMultipleSources ? (
        // Only one source has a value
        <div className="single-source-value">
          <span className="field-value">{formatValue(selectedValue)}</span>
          <span
            className="source-badge"
            style={{ backgroundColor: SOURCE_COLORS[selectedSource] }}
          >
            {SOURCE_ABBREVIATIONS[selectedSource]}
          </span>
        </div>
      ) : (
        // Multiple sources have values - show radio options
        <div className="source-options">
          {sourcesWithValues.map(([source, value]) => {
            const isSelected = source === selectedSource;
            return (
              <label
                key={source}
                className={`source-option-row ${isSelected ? 'selected' : ''}`}
                style={{ borderLeftColor: SOURCE_COLORS[source] }}
              >
                <input
                  type="radio"
                  name={`field-source-${fieldName}`}
                  checked={isSelected}
                  onChange={() => onSourceChange(source)}
                  disabled={locked}
                />
                <span
                  className="source-badge"
                  style={{ backgroundColor: SOURCE_COLORS[source] }}
                >
                  {SOURCE_LABELS[source]}
                </span>
                <span className="source-value" title={formatValue(value)}>
                  {formatValue(value)}
                </span>
                {isSelected && (
                  <span className="selected-indicator">✓</span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FieldSourceSelector;
