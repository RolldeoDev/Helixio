/**
 * FieldWithLock Component
 *
 * Field wrapper with label, input, and lock toggle for preventing auto-updates.
 * Supports text, number, textarea, and select input types.
 */

import { useCallback, useId } from 'react';

export interface FieldSource {
  source: 'manual' | 'api' | 'file';
  lockedAt?: string;
}

interface SelectOption {
  value: string;
  label: string;
}

interface FieldWithLockProps {
  fieldName: string;
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string | number | null) => void;
  isLocked: boolean;
  onToggleLock: () => void;
  fieldSource?: FieldSource | null;
  type?: 'text' | 'number' | 'textarea' | 'select';
  options?: SelectOption[];
  placeholder?: string;
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  fullWidth?: boolean;
  min?: number;
  max?: number;
  rows?: number;
  isModified?: boolean;
}

export function FieldWithLock({
  fieldName,
  label,
  value,
  onChange,
  isLocked,
  onToggleLock,
  fieldSource,
  type = 'text',
  options = [],
  placeholder,
  required = false,
  error,
  disabled = false,
  fullWidth = false,
  min,
  max,
  rows = 3,
  isModified = false,
}: FieldWithLockProps) {
  const inputId = useId();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const rawValue = e.target.value;

      if (type === 'number') {
        if (rawValue === '') {
          onChange(null);
        } else {
          const numValue = parseInt(rawValue, 10);
          if (!isNaN(numValue)) {
            onChange(numValue);
          }
        }
      } else {
        onChange(rawValue === '' ? null : rawValue);
      }
    },
    [onChange, type]
  );

  const formatSourceText = (source: FieldSource): string => {
    const sourceLabel = source.source === 'manual' ? 'Manual' : source.source === 'api' ? 'API' : 'File';
    if (source.lockedAt) {
      const date = new Date(source.lockedAt);
      return `${sourceLabel} (locked ${date.toLocaleDateString()})`;
    }
    return sourceLabel;
  };

  const displayValue = value ?? '';

  return (
    <div className={`field-with-lock ${fullWidth ? 'full-width' : ''} ${error ? 'has-error' : ''} ${isModified ? 'has-change' : ''}`}>
      <div className="field-with-lock-header">
        <label htmlFor={inputId} className="field-with-lock-label">
          {label}
          {required && <span className="required-indicator">*</span>}
        </label>
        <button
          type="button"
          className={`field-lock-btn ${isLocked ? 'locked' : ''}`}
          onClick={onToggleLock}
          title={isLocked ? 'Unlock field to allow auto-updates' : 'Lock field to prevent auto-updates'}
          aria-pressed={isLocked}
        >
          {isLocked ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M10.5 6.417V4.667a3.5 3.5 0 1 0-7 0v1.75M4.083 12.833h5.834a1.167 1.167 0 0 0 1.166-1.166V7.583a1.167 1.167 0 0 0-1.166-1.166H4.083a1.167 1.167 0 0 0-1.166 1.166v4.084a1.167 1.167 0 0 0 1.166 1.166Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M3.5 6.417V4.667a3.5 3.5 0 0 1 6.563-1.72M4.083 12.833h5.834a1.167 1.167 0 0 0 1.166-1.166V7.583a1.167 1.167 0 0 0-1.166-1.166H4.083a1.167 1.167 0 0 0-1.166 1.166v4.084a1.167 1.167 0 0 0 1.166 1.166Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>

      {type === 'textarea' ? (
        <textarea
          id={inputId}
          name={fieldName}
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className="field-input field-textarea"
        />
      ) : type === 'select' ? (
        <select
          id={inputId}
          name={fieldName}
          value={displayValue}
          onChange={handleChange}
          disabled={disabled}
          className="field-input field-select"
        >
          <option value="">{placeholder || 'Select...'}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={inputId}
          type={type}
          name={fieldName}
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          min={min}
          max={max}
          className="field-input"
        />
      )}

      {error && <div className="field-error">{error}</div>}

      {fieldSource && (
        <div className="field-source-info">Source: {formatSourceText(fieldSource)}</div>
      )}
    </div>
  );
}
