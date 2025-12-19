/**
 * TagInput Component
 *
 * Comma-separated value editor with chips UI.
 * Supports adding tags by pressing Enter or comma, removing with backspace or click.
 * Optional autocomplete suggestions for type-ahead.
 */

import { useState, useCallback, useRef, useId, useMemo } from 'react';

interface FieldSource {
  source: 'manual' | 'api' | 'file';
  lockedAt?: string;
}

interface TagInputProps {
  fieldName?: string;
  label: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  isLocked: boolean;
  onToggleLock: () => void;
  fieldSource?: FieldSource | null;
  placeholder?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  error?: string | null;
  /** Optional list of suggestions for autocomplete */
  suggestions?: string[];
  /** Maximum number of suggestions to show (default 8) */
  maxSuggestions?: number;
}

export function TagInput({
  label,
  value,
  onChange,
  isLocked,
  onToggleLock,
  fieldSource,
  placeholder = 'Type and press Enter...',
  disabled = false,
  fullWidth = false,
  error,
  suggestions = [],
  maxSuggestions = 8,
}: TagInputProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  // Parse comma-separated string to array
  const tags = value
    ? value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  // Filter suggestions based on input and exclude already-added tags
  const filteredSuggestions = useMemo(() => {
    if (!inputValue.trim() || suggestions.length === 0) return [];
    const searchTerm = inputValue.toLowerCase().trim();
    return suggestions
      .filter((s) => {
        const lower = s.toLowerCase();
        // Match if suggestion starts with input or contains input
        return (lower.startsWith(searchTerm) || lower.includes(searchTerm)) &&
          !tags.some((t) => t.toLowerCase() === lower);
      })
      .slice(0, maxSuggestions);
  }, [inputValue, suggestions, tags, maxSuggestions]);

  // Convert array back to comma-separated string
  const tagsToString = (tagArray: string[]): string | null => {
    if (tagArray.length === 0) return null;
    return tagArray.join(', ');
  };

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (trimmed && !tags.includes(trimmed)) {
        onChange(tagsToString([...tags, trimmed]));
      }
      setInputValue('');
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    },
    [tags, onChange]
  );

  const removeTag = useCallback(
    (tagToRemove: string) => {
      const newTags = tags.filter((t) => t !== tagToRemove);
      onChange(tagsToString(newTags));
    },
    [tags, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Handle suggestion navigation
      if (showSuggestions && filteredSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedSuggestionIndex((prev) =>
            prev < filteredSuggestions.length - 1 ? prev + 1 : 0
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedSuggestionIndex((prev) =>
            prev > 0 ? prev - 1 : filteredSuggestions.length - 1
          );
          return;
        }
        if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
          e.preventDefault();
          const selected = filteredSuggestions[selectedSuggestionIndex];
          if (selected) addTag(selected);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowSuggestions(false);
          setSelectedSuggestionIndex(-1);
          return;
        }
        if (e.key === 'Tab' && selectedSuggestionIndex >= 0) {
          e.preventDefault();
          const selected = filteredSuggestions[selectedSuggestionIndex];
          if (selected) addTag(selected);
          return;
        }
      }

      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        if (inputValue.trim()) {
          addTag(inputValue);
        }
      } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
        // Remove last tag on backspace when input is empty
        const lastTag = tags[tags.length - 1];
        if (lastTag) {
          removeTag(lastTag);
        }
      }
    },
    [inputValue, addTag, removeTag, tags, showSuggestions, filteredSuggestions, selectedSuggestionIndex]
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // If user pastes comma-separated values, split them
    if (val.includes(',')) {
      const parts = val.split(',');
      const lastPart = parts.pop() || '';
      parts.forEach((part) => {
        const trimmed = part.trim();
        if (trimmed && !tags.includes(trimmed)) {
          addTag(trimmed);
        }
      });
      setInputValue(lastPart);
      setShowSuggestions(lastPart.trim().length > 0 && suggestions.length > 0);
    } else {
      setInputValue(val);
      setShowSuggestions(val.trim().length > 0 && suggestions.length > 0);
      setSelectedSuggestionIndex(-1);
    }
  }, [addTag, tags, suggestions.length]);

  const handleBlur = useCallback(() => {
    // Delay hiding suggestions to allow click events to fire
    setTimeout(() => {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }, 150);
    // Add any remaining input as a tag on blur
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  }, [inputValue, addTag]);

  const handleFocus = useCallback(() => {
    if (inputValue.trim() && suggestions.length > 0) {
      setShowSuggestions(true);
    }
  }, [inputValue, suggestions.length]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    addTag(suggestion);
    inputRef.current?.focus();
  }, [addTag]);

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const formatSourceText = (source: FieldSource): string => {
    const sourceLabel = source.source === 'manual' ? 'Manual' : source.source === 'api' ? 'API' : 'File';
    if (source.lockedAt) {
      const date = new Date(source.lockedAt);
      return `${sourceLabel} (locked ${date.toLocaleDateString()})`;
    }
    return sourceLabel;
  };

  return (
    <div className={`field-with-lock tag-input-field ${fullWidth ? 'full-width' : ''} ${error ? 'has-error' : ''}`}>
      <div className="field-with-lock-header">
        <label htmlFor={inputId} className="field-with-lock-label">
          {label}
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

      <div className="tag-input-wrapper">
        <div
          className={`tag-input-container ${disabled ? 'disabled' : ''}`}
          onClick={handleContainerClick}
        >
          {tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
              {!disabled && (
                <button
                  type="button"
                  className="tag-chip-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTag(tag);
                  }}
                  aria-label={`Remove ${tag}`}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </span>
          ))}
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onFocus={handleFocus}
            placeholder={tags.length === 0 ? placeholder : ''}
            disabled={disabled}
            className="tag-input-inner"
            autoComplete="off"
            role="combobox"
            aria-expanded={showSuggestions && filteredSuggestions.length > 0}
            aria-controls={`${inputId}-suggestions`}
            aria-autocomplete="list"
          />
        </div>

        {/* Autocomplete suggestions dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            id={`${inputId}-suggestions`}
            className="tag-suggestions"
            role="listbox"
          >
            {filteredSuggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                type="button"
                className={`tag-suggestion ${index === selectedSuggestionIndex ? 'selected' : ''}`}
                onClick={() => handleSuggestionClick(suggestion)}
                role="option"
                aria-selected={index === selectedSuggestionIndex}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="field-error">{error}</div>}

      {fieldSource && (
        <div className="field-source-info">Source: {formatSourceText(fieldSource)}</div>
      )}
    </div>
  );
}
