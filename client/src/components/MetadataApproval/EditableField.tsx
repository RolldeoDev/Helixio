/**
 * EditableField Component
 *
 * Individual editable field with current value display below.
 * Shows the proposed value in the input with the current value as reference.
 */

import { useState, useEffect } from 'react';
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
  // Get the display value: edited > proposed > current > empty
  const getDisplayValue = (): string | number => {
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
  };

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
    // When isEdited is true, the local state drives the display
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdited, proposedValue, currentValue, fieldKey]);

  const hasChange = fieldChange && (
    fieldChange.proposed !== fieldChange.current ||
    fieldChange.edited
  );
  const showCurrentValue = currentValue !== null &&
    currentValue !== undefined &&
    currentValue !== '' &&
    currentValue !== localValue;

  const handleChange = (newValue: string | number) => {
    setLocalValue(newValue);

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
      <label htmlFor={fieldKey} className="field-label">
        {label}
      </label>
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
