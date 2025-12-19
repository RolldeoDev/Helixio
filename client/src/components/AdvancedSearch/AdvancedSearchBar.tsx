/**
 * Advanced Search Bar Component
 *
 * Provides field-specific search with:
 * - Field prefix syntax (e.g., writer:stan lee)
 * - Search suggestions and autocomplete
 * - Recent searches
 * - Boolean operators (AND, OR, NOT)
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import './AdvancedSearch.css';

// =============================================================================
// Types
// =============================================================================

interface SearchSuggestion {
  type: 'field' | 'value' | 'recent' | 'operator';
  text: string;
  description?: string;
  field?: string;
}

interface AdvancedSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string, parsedQuery: ParsedQuery) => void;
  suggestions?: Array<{ field: string; values: string[] }>;
  recentSearches?: string[];
  placeholder?: string;
  autoFocus?: boolean;
}

export interface ParsedQuery {
  terms: string[];
  fields: Record<string, string[]>;
  operators: Array<{ type: 'AND' | 'OR' | 'NOT'; index: number }>;
  raw: string;
}

// =============================================================================
// Constants
// =============================================================================

const SEARCH_FIELDS = [
  { name: 'series', description: 'Series name' },
  { name: 'title', description: 'Issue title' },
  { name: 'writer', description: 'Writer name' },
  { name: 'artist', description: 'Artist name' },
  { name: 'penciller', description: 'Penciller name' },
  { name: 'inker', description: 'Inker name' },
  { name: 'colorist', description: 'Colorist name' },
  { name: 'letterer', description: 'Letterer name' },
  { name: 'coverArtist', description: 'Cover artist' },
  { name: 'editor', description: 'Editor name' },
  { name: 'publisher', description: 'Publisher name' },
  { name: 'imprint', description: 'Imprint' },
  { name: 'genre', description: 'Genre' },
  { name: 'year', description: 'Publication year' },
  { name: 'characters', description: 'Character names' },
  { name: 'teams', description: 'Team names' },
  { name: 'locations', description: 'Location names' },
  { name: 'storyArc', description: 'Story arc name' },
  { name: 'summary', description: 'Summary text' },
];

const OPERATORS = ['AND', 'OR', 'NOT'];

const RECENT_SEARCHES_KEY = 'helixio_recent_searches';
const MAX_RECENT_SEARCHES = 10;

// =============================================================================
// Query Parser
// =============================================================================

export function parseQuery(query: string): ParsedQuery {
  const result: ParsedQuery = {
    terms: [],
    fields: {},
    operators: [],
    raw: query,
  };

  if (!query.trim()) return result;

  // Tokenize the query
  const tokens = tokenizeQuery(query);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    // Check for operators
    if (OPERATORS.includes(token.toUpperCase())) {
      result.operators.push({
        type: token.toUpperCase() as 'AND' | 'OR' | 'NOT',
        index: i,
      });
      continue;
    }

    // Check for field:value syntax
    const colonIndex = token.indexOf(':');
    if (colonIndex > 0) {
      const field = token.substring(0, colonIndex).toLowerCase();
      const value = token.substring(colonIndex + 1);

      if (SEARCH_FIELDS.some(f => f.name.toLowerCase() === field)) {
        if (!result.fields[field]) {
          result.fields[field] = [];
        }
        result.fields[field]!.push(value.replace(/^["']|["']$/g, ''));
        continue;
      }
    }

    // Regular search term
    result.terms.push(token.replace(/^["']|["']$/g, ''));
  }

  return result;
}

function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < query.length; i++) {
    const char = query[i]!;

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
      current += char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      current += char;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

// =============================================================================
// Component
// =============================================================================

export function AdvancedSearchBar({
  value,
  onChange,
  onSearch,
  suggestions = [],
  recentSearches: propRecentSearches,
  placeholder = 'Search comics... (try writer:stan lee)',
  autoFocus = false,
}: AdvancedSearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    if (propRecentSearches) {
      setRecentSearches(propRecentSearches);
    } else {
      try {
        const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
        if (stored) {
          setRecentSearches(JSON.parse(stored));
        }
      } catch {
        // Ignore errors
      }
    }
  }, [propRecentSearches]);

  // Save search to recent
  const saveToRecent = useCallback((query: string) => {
    if (!query.trim()) return;

    setRecentSearches(prev => {
      const filtered = prev.filter(s => s !== query);
      const updated = [query, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Get current word being typed (for suggestions)
  const currentWord = useMemo(() => {
    if (!value) return '';
    const words = value.split(/\s+/);
    return words[words.length - 1] || '';
  }, [value]);

  // Generate suggestions based on current input
  const computedSuggestions = useMemo((): SearchSuggestion[] => {
    const result: SearchSuggestion[] = [];

    if (!value && !isFocused) return result;

    // If no input, show recent searches
    if (!value.trim()) {
      recentSearches.slice(0, 5).forEach(search => {
        result.push({
          type: 'recent',
          text: search,
          description: 'Recent search',
        });
      });
      return result;
    }

    const word = currentWord.toLowerCase();

    // Check if typing a field name
    if (!word.includes(':')) {
      // Suggest field names
      SEARCH_FIELDS.filter(f =>
        f.name.toLowerCase().startsWith(word) ||
        f.description.toLowerCase().includes(word)
      ).slice(0, 5).forEach(field => {
        result.push({
          type: 'field',
          text: `${field.name}:`,
          description: field.description,
        });
      });

      // Suggest operators
      if (value.trim().length > 0) {
        OPERATORS.filter(op =>
          op.toLowerCase().startsWith(word)
        ).forEach(op => {
          result.push({
            type: 'operator',
            text: op,
            description: `Boolean ${op} operator`,
          });
        });
      }
    } else {
      // Suggest values for the field
      const colonIndex = word.indexOf(':');
      const fieldName = word.substring(0, colonIndex);
      const partialValue = word.substring(colonIndex + 1).toLowerCase();

      const fieldSuggestions = suggestions.find(
        s => s.field.toLowerCase() === fieldName.toLowerCase()
      );

      if (fieldSuggestions) {
        fieldSuggestions.values
          .filter(v => v.toLowerCase().includes(partialValue))
          .slice(0, 8)
          .forEach(val => {
            const needsQuotes = val.includes(' ');
            result.push({
              type: 'value',
              text: needsQuotes ? `${fieldName}:"${val}"` : `${fieldName}:${val}`,
              description: val,
              field: fieldName,
            });
          });
      }
    }

    return result;
  }, [value, currentWord, isFocused, recentSearches, suggestions]);

  // Handle suggestion selection
  const selectSuggestion = useCallback((suggestion: SearchSuggestion) => {
    let newValue = value;

    if (suggestion.type === 'recent') {
      newValue = suggestion.text;
    } else if (suggestion.type === 'field' || suggestion.type === 'operator') {
      // Replace current word with suggestion
      const words = value.split(/\s+/);
      words[words.length - 1] = suggestion.text;
      newValue = words.join(' ');
      if (!suggestion.text.endsWith(':')) {
        newValue += ' ';
      }
    } else if (suggestion.type === 'value') {
      // Replace current field:partial with full value
      const words = value.split(/\s+/);
      words[words.length - 1] = suggestion.text;
      newValue = words.join(' ') + ' ';
    }

    onChange(newValue);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  }, [value, onChange]);

  // Handle form submission
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseQuery(value);
    saveToRecent(value);
    onSearch(value, parsed);
    setShowSuggestions(false);
  }, [value, onSearch, saveToRecent]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || computedSuggestions.length === 0) {
      if (e.key === 'Enter') {
        handleSubmit(e);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < computedSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          selectSuggestion(computedSuggestions[selectedIndex]!);
        } else {
          handleSubmit(e);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
      case 'Tab':
        if (selectedIndex >= 0) {
          e.preventDefault();
          selectSuggestion(computedSuggestions[selectedIndex]!);
        }
        break;
    }
  }, [showSuggestions, computedSuggestions, selectedIndex, selectSuggestion, handleSubmit]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Parse query for display
  const parsedQuery = useMemo(() => parseQuery(value), [value]);

  return (
    <div className="advanced-search-bar">
      <form onSubmit={handleSubmit} className="search-form">
        <div className="search-input-wrapper">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setShowSuggestions(true);
              setSelectedIndex(-1);
            }}
            onFocus={() => {
              setIsFocused(true);
              setShowSuggestions(true);
            }}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="search-input"
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
          />

          {value && (
            <button
              type="button"
              className="search-clear"
              onClick={() => {
                onChange('');
                inputRef.current?.focus();
              }}
              title="Clear search"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}

          <button type="submit" className="search-submit">
            Search
          </button>
        </div>

        {/* Query Preview */}
        {value && (Object.keys(parsedQuery.fields).length > 0 || parsedQuery.operators.length > 0) && (
          <div className="query-preview">
            {parsedQuery.terms.length > 0 && (
              <span className="query-tag term">
                {parsedQuery.terms.join(' ')}
              </span>
            )}
            {Object.entries(parsedQuery.fields).map(([field, values]) => (
              <span key={field} className="query-tag field">
                <span className="field-name">{field}:</span>
                {values.join(', ')}
              </span>
            ))}
            {parsedQuery.operators.map((op, i) => (
              <span key={i} className="query-tag operator">
                {op.type}
              </span>
            ))}
          </div>
        )}
      </form>

      {/* Suggestions Dropdown */}
      {showSuggestions && computedSuggestions.length > 0 && (
        <div ref={suggestionsRef} className="search-suggestions">
          {computedSuggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.type}-${suggestion.text}`}
              className={`suggestion-item ${suggestion.type} ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => selectSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="suggestion-icon">
                {suggestion.type === 'field' && '🏷️'}
                {suggestion.type === 'value' && '📝'}
                {suggestion.type === 'recent' && '🕒'}
                {suggestion.type === 'operator' && '🔗'}
              </span>
              <span className="suggestion-text">{suggestion.text}</span>
              {suggestion.description && (
                <span className="suggestion-description">{suggestion.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
