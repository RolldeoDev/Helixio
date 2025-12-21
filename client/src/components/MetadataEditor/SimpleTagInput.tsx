/**
 * SimpleTagInput Component
 *
 * A simplified tag input for MetadataEditor with server-side autocomplete.
 * Unlike TagInput, this doesn't have lock functionality or field source tracking.
 */

import { useState, useCallback, useRef, useId, useMemo, useEffect } from 'react';
import { getTagAutocomplete, type TagFieldType } from '../../services/api.service';
import './SimpleTagInput.css';

interface SimpleTagInputProps {
  id?: string;
  value: string;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  autocompleteField?: TagFieldType;
}

export function SimpleTagInput({
  id,
  value,
  onChange,
  disabled = false,
  placeholder = 'Type and press Enter...',
  autocompleteField,
}: SimpleTagInputProps) {
  const inputId = useId();
  const effectiveId = id || inputId;
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
  const tags = useMemo(
    () =>
      value
        ? value
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    [value]
  );

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
        const result = await getTagAutocomplete(autocompleteField, query, 10, offset);

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
    [autocompleteField]
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Filter out already-added tags from suggestions
  const filteredSuggestions = useMemo(() => {
    return serverSuggestions.filter(
      (s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase())
    );
  }, [serverSuggestions, tags]);

  // Convert array back to comma-separated string
  const tagsToString = (tagArray: string[]): string | null => {
    if (tagArray.length === 0) return null;
    return tagArray.join(', ');
  };

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (trimmed && !tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
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
          if (trimmed && !tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
            addTag(trimmed);
          }
        });
        setInputValue(lastPart);

        // Handle server autocomplete for the remaining part
        if (autocompleteField && lastPart.trim().length > 0) {
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          setSearchQuery(lastPart.trim());
          debounceTimerRef.current = setTimeout(() => {
            setSuggestionOffset(0);
            fetchSuggestions(lastPart.trim(), 0);
          }, 300);
          setShowSuggestions(true);
        }
      } else {
        setInputValue(val);
        setSelectedSuggestionIndex(-1);

        // Handle server autocomplete
        if (autocompleteField) {
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
        }
      }
    },
    [addTag, tags, autocompleteField, fetchSuggestions]
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
    if (autocompleteField && inputValue.trim() && serverSuggestions.length > 0) {
      setShowSuggestions(true);
    }
  }, [inputValue, autocompleteField, serverSuggestions.length]);

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

  const showDropdown =
    showSuggestions && (filteredSuggestions.length > 0 || isLoadingSuggestions);

  return (
    <div className="simple-tag-input-wrapper">
      <div
        className={`simple-tag-input-container ${disabled ? 'disabled' : ''}`}
        onClick={handleContainerClick}
      >
        {tags.map((tag) => (
          <span key={tag} className="simple-tag-chip">
            {tag}
            {!disabled && (
              <button
                type="button"
                className="simple-tag-chip-remove"
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
          id={effectiveId}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={tags.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="simple-tag-input-inner"
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={`${effectiveId}-suggestions`}
          aria-autocomplete="list"
        />
      </div>

      {showDropdown && (
        <div
          ref={suggestionsRef}
          id={`${effectiveId}-suggestions`}
          className="simple-tag-suggestions"
          role="listbox"
          onScroll={handleSuggestionsScroll}
        >
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              className={`simple-tag-suggestion ${index === selectedSuggestionIndex ? 'selected' : ''}`}
              onClick={() => handleSuggestionClick(suggestion)}
              role="option"
              aria-selected={index === selectedSuggestionIndex}
            >
              {suggestion}
            </button>
          ))}
          {isLoadingSuggestions && (
            <div className="simple-tag-suggestions-loading">Loading...</div>
          )}
          {hasMoreSuggestions && !isLoadingSuggestions && (
            <div className="simple-tag-suggestions-more">Scroll for more...</div>
          )}
        </div>
      )}
    </div>
  );
}
