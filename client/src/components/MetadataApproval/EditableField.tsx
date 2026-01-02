/**
 * EditableField Component
 *
 * Individual editable field with current value display below.
 * Shows the proposed value in the input with the current value as reference.
 * Includes a revert icon to toggle between edited/proposed and original values.
 */

import { useState, useEffect, useCallback } from 'react';
import type { FieldChange } from '../../services/api.service';

interface EditableFieldProps {
  label: string;
  fieldKey: string;
  fieldChange: FieldChange | undefined;
  type?: 'text' | 'number' | 'textarea' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: string | number | null) => void;
  disabled?: boolean;
}

export function EditableField({
  label,
  fieldKey,
  fieldChange,
  type = 'text',
  options,
  placeholder,
  min,
  max,
  step,
  onChange,
  disabled = false,
}: EditableFieldProps) {
  // Track whether we're showing the original value (toggled state)
  const [showingOriginal, setShowingOriginal] = useState(false);
  // Store the value we had before toggling to original
  const [valueBeforeRevert, setValueBeforeRevert] = useState<string | number | null>(null);

  // Get the display value: edited > proposed > current > empty
  const getDisplayValue = useCallback((): string | number => {
    if (!fieldChange) return '';
    // Check if user has edited the field (edited flag is true)
    // editedValue can be null (user cleared field), undefined (not edited), or a value
    if (fieldChange.edited) {
      // User has made an edit - use editedValue, treating null as empty string
      return fieldChange.editedValue ?? '';
    }
    if (fieldChange.proposed !== null && fieldChange.proposed !== undefined) {
      return fieldChange.proposed;
    }
    if (fieldChange.current !== null && fieldChange.current !== undefined) {
      return fieldChange.current;
    }
    return '';
  }, [fieldChange]);

  const [localValue, setLocalValue] = useState<string | number>(getDisplayValue());

  // Only sync from props when the edited flag or editedValue actually changes
  // Use stable values for dependency instead of object reference
  const isEdited = fieldChange?.edited ?? false;
  const proposedValue = fieldChange?.proposed;
  const currentValue = fieldChange?.current;

  useEffect(() => {
    // Only update local value from props if not currently edited by user
    // or if external values have changed (e.g., new file selected)
    if (!isEdited) {
      // No pending edits, sync with proposed/current
      setLocalValue(getDisplayValue());
    }
    // Reset the toggle state when file changes
    setShowingOriginal(false);
    setValueBeforeRevert(null);
    // When isEdited is true, the local state drives the display
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdited, proposedValue, currentValue, fieldKey]);

  const hasChange = fieldChange && (
    fieldChange.proposed !== fieldChange.current ||
    fieldChange.edited
  );

  // Show revert icon when the field has been changed (proposed differs from current)
  // and there's a current value to revert to
  const canRevert = fieldChange &&
    currentValue !== null &&
    currentValue !== undefined &&
    currentValue !== '' &&
    (proposedValue !== currentValue || fieldChange.edited);

  const showCurrentValue = currentValue !== null &&
    currentValue !== undefined &&
    currentValue !== '' &&
    currentValue !== localValue;

  // Handle revert icon click - toggle between original and edited/proposed value
  const handleRevertClick = useCallback(() => {
    if (!fieldChange || currentValue === null || currentValue === undefined) return;

    if (showingOriginal) {
      // Toggle back to the value we had before reverting
      if (valueBeforeRevert !== null) {
        setLocalValue(valueBeforeRevert);
        onChange(valueBeforeRevert);
      } else {
        // Fallback to proposed
        const newValue = proposedValue ?? '';
        setLocalValue(newValue);
        onChange(newValue === '' ? null : newValue);
      }
      setShowingOriginal(false);
    } else {
      // Store current value and switch to original
      setValueBeforeRevert(localValue === '' ? null : localValue);
      setLocalValue(currentValue);
      onChange(currentValue);
      setShowingOriginal(true);
    }
  }, [fieldChange, currentValue, proposedValue, localValue, showingOriginal, valueBeforeRevert, onChange]);

  const handleChange = (newValue: string | number) => {
    setLocalValue(newValue);
    // When user types, we're no longer in "showing original" mode
    setShowingOriginal(false);

    // Convert to appropriate type
    if (type === 'number') {
      const numValue = newValue === '' ? null : Number(newValue);
      onChange(numValue);
    } else {
      onChange(newValue === '' ? null : newValue);
    }
  };

  const renderInput = () => {
    if (type === 'select' && options) {
      return (
        <select
          id={fieldKey}
          value={String(localValue)}
          onChange={(e) => handleChange(e.target.value)}
          className="field-input field-select"
          disabled={disabled}
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    if (type === 'textarea') {
      return (
        <textarea
          id={fieldKey}
          value={String(localValue)}
          onChange={(e) => handleChange(e.target.value)}
          className="field-input field-textarea"
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
        />
      );
    }

    if (type === 'number') {
      return (
        <input
          id={fieldKey}
          type="number"
          value={localValue === '' ? '' : Number(localValue)}
          onChange={(e) => handleChange(e.target.value)}
          className="field-input"
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
        />
      );
    }

    return (
      <input
        id={fieldKey}
        type="text"
        value={String(localValue)}
        onChange={(e) => handleChange(e.target.value)}
        className="field-input"
        placeholder={placeholder}
        disabled={disabled}
      />
    );
  };

  return (
    <div className={`editable-field ${hasChange ? 'has-change' : ''}`}>
      <div className="field-label-row">
        <label htmlFor={fieldKey} className="field-label">
          {label}
        </label>
        {canRevert && (
          <button
            type="button"
            className={`field-revert-btn ${showingOriginal ? 'showing-original' : ''}`}
            onClick={handleRevertClick}
            disabled={disabled}
            title={showingOriginal ? 'Restore proposed value' : 'Use original value'}
          >
            <span className="revert-icon">{'\u21BA'}</span>
          </button>
        )}
      </div>
      {renderInput()}
      {showCurrentValue && (
        <div className="field-current-value">
          Current: {String(currentValue)}
        </div>
      )}
    </div>
  );
}

export default EditableField;
