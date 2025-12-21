/**
 * TagInput Component
 *
 * Comma-separated value editor with chips UI.
 * Supports adding tags by pressing Enter or comma, removing with backspace or click.
 * Optional server-side autocomplete with debouncing and infinite scroll.
 */

import { useState, useCallback, useRef, useId, useMemo, useEffect } from 'react';
import { getTagAutocomplete, type TagFieldType } from '../../services/api.service';

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
  /** Field type for server-side autocomplete (e.g., 'characters', 'teams') */
  autocompleteField?: TagFieldType;
  /** Optional list of local suggestions (overrides server if provided) */
  suggestions?: string[];
  /** Maximum number of suggestions to show (default 10) */
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
  autocompleteField,
  suggestions = [],
  maxSuggestions = 10,
}: TagInputProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  // Server-side autocomplete state
  const [serverSuggestions, setServerSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [hasMoreSuggestions, setHasMoreSuggestions] = useState(false);
  const [suggestionOffset, setSuggestionOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Parse comma-separated string to array
  const tags = value
    ? value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  // Fetch server suggestions with debouncing
  const fetchSuggestions = useCallback(
    async (query: string, offset: number = 0) => {
      if (!autocompleteField || query.length < 1) {
        setServerSuggestions([]);
        setHasMoreSuggestions(false);
        return;
      }

      setIsLoadingSuggestions(true);
      try {
        const result = await getTagAutocomplete(
          autocompleteField,
          query,
          maxSuggestions,
          offset
        );

        if (offset === 0) {
          setServerSuggestions(result.values);
        } else {
          setServerSuggestions((prev) => [...prev, ...result.values]);
        }
        setHasMoreSuggestions(result.hasMore);
        setSuggestionOffset(offset + result.values.length);
      } catch (error) {
        console.error('Failed to fetch tag suggestions:', error);
      } finally {
        setIsLoadingSuggestions(false);
      }
    },
    [autocompleteField, maxSuggestions]
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Determine which suggestions to use (server or local)
  const effectiveSuggestions = autocompleteField ? serverSuggestions : suggestions;

  // Filter out already-added tags from suggestions
  const filteredSuggestions = useMemo(() => {
    if (autocompleteField) {
      // Server suggestions are already prefix-filtered, just exclude already-added tags
      return effectiveSuggestions.filter(
        (s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase())
      );
    } else {
      // Local suggestions: filter by input value
      if (!inputValue.trim() || suggestions.length === 0) return [];
      const searchTerm = inputValue.toLowerCase().trim();
      return suggestions
        .filter((s) => {
          const lower = s.toLowerCase();
          return (
            (lower.startsWith(searchTerm) || lower.includes(searchTerm)) &&
            !tags.some((t) => t.toLowerCase() === lower)
          );
        })
        .slice(0, maxSuggestions);
    }
  }, [autocompleteField, effectiveSuggestions, inputValue, suggestions, tags, maxSuggestions]);

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
      setServerSuggestions([]);
      setSearchQuery('');
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

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
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

        // Handle server autocomplete for the remaining part
        if (autocompleteField && lastPart.trim().length > 0) {
          // Clear previous timer
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          setSearchQuery(lastPart.trim());
          debounceTimerRef.current = setTimeout(() => {
            setSuggestionOffset(0);
            fetchSuggestions(lastPart.trim(), 0);
          }, 300);
          setShowSuggestions(true);
        } else if (!autocompleteField) {
          setShowSuggestions(lastPart.trim().length > 0 && suggestions.length > 0);
        }
      } else {
        setInputValue(val);
        setSelectedSuggestionIndex(-1);

        // Handle server autocomplete
        if (autocompleteField) {
          // Clear previous timer
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }

          if (val.trim().length > 0) {
            setSearchQuery(val.trim());
            debounceTimerRef.current = setTimeout(() => {
              setSuggestionOffset(0);
              fetchSuggestions(val.trim(), 0);
            }, 300);
            setShowSuggestions(true);
          } else {
            setServerSuggestions([]);
            setShowSuggestions(false);
          }
        } else {
          setShowSuggestions(val.trim().length > 0 && suggestions.length > 0);
        }
      }
    },
    [addTag, tags, suggestions.length, autocompleteField, fetchSuggestions]
  );

  const handleBlur = useCallback(() => {
    // Delay everything to allow click events on suggestions to fire first
    setTimeout(() => {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
      // Only add inputValue as tag if it wasn't cleared by a suggestion click
      if (inputRef.current && inputRef.current.value.trim()) {
        addTag(inputRef.current.value);
      }
    }, 150);
  }, [addTag]);

  const handleFocus = useCallback(() => {
    if (autocompleteField && inputValue.trim()) {
      setShowSuggestions(true);
    } else if (!autocompleteField && inputValue.trim() && suggestions.length > 0) {
      setShowSuggestions(true);
    }
  }, [inputValue, suggestions.length, autocompleteField]);

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      addTag(suggestion);
      inputRef.current?.focus();
    },
    [addTag]
  );

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Infinite scroll handler for suggestions
  const handleSuggestionsScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!autocompleteField) return;

      const container = e.currentTarget;
      const isNearBottom =
        container.scrollHeight - container.scrollTop <= container.clientHeight + 50;

      if (isNearBottom && hasMoreSuggestions && !isLoadingSuggestions) {
        fetchSuggestions(searchQuery, suggestionOffset);
      }
    },
    [autocompleteField, hasMoreSuggestions, isLoadingSuggestions, searchQuery, suggestionOffset, fetchSuggestions]
  );

  const formatSourceText = (source: FieldSource): string => {
    const sourceLabel =
      source.source === 'manual' ? 'Manual' : source.source === 'api' ? 'API' : 'File';
    if (source.lockedAt) {
      const date = new Date(source.lockedAt);
      return `${sourceLabel} (locked ${date.toLocaleDateString()})`;
    }
    return sourceLabel;
  };

  const showDropdown =
    showSuggestions && (filteredSuggestions.length > 0 || isLoadingSuggestions);

  return (
    <div
      className={`field-with-lock tag-input-field ${fullWidth ? 'full-width' : ''} ${error ? 'has-error' : ''}`}
    >
      <div className="field-with-lock-header">
        <label htmlFor={inputId} className="field-with-lock-label">
          {label}
        </label>
        <button
          type="button"
          className={`field-lock-btn ${isLocked ? 'locked' : ''}`}
          onClick={onToggleLock}
          title={
            isLocked
              ? 'Unlock field to allow auto-updates'
              : 'Lock field to prevent auto-updates'
          }
          aria-pressed={isLocked}
        >
          {isLocked ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10.5 6.417V4.667a3.5 3.5 0 1 0-7 0v1.75M4.083 12.833h5.834a1.167 1.167 0 0 0 1.166-1.166V7.583a1.167 1.167 0 0 0-1.166-1.166H4.083a1.167 1.167 0 0 0-1.166 1.166v4.084a1.167 1.167 0 0 0 1.166 1.166Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
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
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M2 2L8 8M8 2L2 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
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
            aria-expanded={showDropdown}
            aria-controls={`${inputId}-suggestions`}
            aria-autocomplete="list"
          />
        </div>

        {/* Autocomplete suggestions dropdown */}
        {showDropdown && (
          <div
            ref={suggestionsRef}
            id={`${inputId}-suggestions`}
            className="tag-suggestions"
            role="listbox"
            onScroll={handleSuggestionsScroll}
            style={{ maxHeight: '200px', overflowY: 'auto' }}
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
            {isLoadingSuggestions && (
              <div className="tag-suggestions-loading">Loading...</div>
            )}
            {hasMoreSuggestions && !isLoadingSuggestions && (
              <div className="tag-suggestions-more">Scroll for more...</div>
            )}
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
