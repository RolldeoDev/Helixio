/**
 * TagChipsInput Component
 *
 * Tag-style chip input for array fields like Characters, Teams, Locations.
 * Parses comma-separated values into visual chips with add/remove functionality.
 */

import { useState, useRef, KeyboardEvent } from 'react';
import type { FieldChange } from '../../services/api.service';

interface TagChipsInputProps {
  label: string;
  fieldKey: string;
  fieldChange: FieldChange | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

// Parse comma-separated string into array of trimmed values
function parseChips(value: string | number | null | undefined): string[] {
  if (value === null || value === undefined || value === '') return [];
  const str = String(value);
  return str.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

// Join array back to comma-separated string
function joinChips(chips: string[]): string {
  return chips.join(', ');
}

export function TagChipsInput({
  label,
  fieldKey,
  fieldChange,
  onChange,
  placeholder = 'Add item...',
  disabled = false,
}: TagChipsInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Get the current chips from the field change
  const getChips = (): string[] => {
    if (!fieldChange) return [];
    // Check if user has edited the field (edited flag is true)
    // editedValue can be null (user cleared all chips), undefined, or a value
    if (fieldChange.edited) {
      // User has made an edit - use editedValue (null means empty)
      return parseChips(fieldChange.editedValue);
    }
    if (fieldChange.proposed !== null && fieldChange.proposed !== undefined) {
      return parseChips(fieldChange.proposed);
    }
    if (fieldChange.current !== null && fieldChange.current !== undefined) {
      return parseChips(fieldChange.current);
    }
    return [];
  };

  const chips = getChips();
  const currentChips = parseChips(fieldChange?.current);

  const hasChange = fieldChange && (
    fieldChange.proposed !== fieldChange.current ||
    fieldChange.edited
  );

  // Check if a chip is new (not in current)
  const isNewChip = (chip: string): boolean => {
    return !currentChips.some((c) => c.toLowerCase() === chip.toLowerCase());
  };

  // Check if a chip was removed (in current but not in chips)
  const removedChips = currentChips.filter(
    (c) => !chips.some((chip) => chip.toLowerCase() === c.toLowerCase())
  );

  const addChip = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !chips.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      const newChips = [...chips, trimmed];
      onChange(joinChips(newChips));
    }
    setInputValue('');
  };

  const removeChip = (index: number) => {
    const newChips = chips.filter((_, i) => i !== index);
    onChange(joinChips(newChips));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) {
        addChip(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && chips.length > 0) {
      removeChip(chips.length - 1);
    }
  };

  const handleInputBlur = () => {
    if (inputValue.trim()) {
      addChip(inputValue);
    }
  };

  return (
    <div className={`tag-chips-field ${hasChange ? 'has-change' : ''}`}>
      <label htmlFor={fieldKey} className="field-label">
        {label}
      </label>
      <div
        className="tag-chips-container"
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((chip, index) => (
          <span
            key={`${chip}-${index}`}
            className={`tag-chip ${isNewChip(chip) ? 'tag-chip-new' : ''}`}
          >
            <span className="tag-chip-text">{chip}</span>
            {!disabled && (
              <button
                type="button"
                className="tag-chip-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(index);
                }}
                aria-label={`Remove ${chip}`}
              >
                &times;
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          id={fieldKey}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleInputBlur}
          className="tag-chips-input"
          placeholder={chips.length === 0 ? placeholder : ''}
          disabled={disabled}
        />
      </div>
      {removedChips.length > 0 && (
        <div className="field-current-value">
          Removed: {removedChips.join(', ')}
        </div>
      )}
      {currentChips.length > 0 && chips.length === 0 && (
        <div className="field-current-value">
          Current: {joinChips(currentChips)}
        </div>
      )}
    </div>
  );
}

export default TagChipsInput;
