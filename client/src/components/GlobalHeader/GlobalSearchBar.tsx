/**
 * GlobalSearchBar Component
 *
 * Main search bar with autocomplete dropdown.
 * Features:
 * - Global keyboard shortcut (/ or Cmd+K)
 * - Debounced search
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Click outside to close
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalSearch } from './useGlobalSearch';
import { SearchResult } from './SearchResult';

// Search icon (inline SVG)
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

// Loading spinner (inline SVG)
const Spinner = () => (
  <svg className="global-search-spinner" width="14" height="14" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.2" />
    <path
      d="M12 2a10 10 0 0 1 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

export function GlobalSearchBar() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { results, isLoading } = useGlobalSearch(query);

  // Close dropdown and clear state
  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
    inputRef.current?.blur();
  }, []);

  // Navigate to result
  const navigateToResult = useCallback((path: string) => {
    navigate(path);
    closeDropdown();
  }, [navigate, closeDropdown]);

  // Global keyboard shortcut: '/' or Cmd+K
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // '/' key or Cmd/Ctrl+K
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Keyboard navigation in dropdown
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          navigateToResult(results[selectedIndex].navigationPath);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
    }
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, closeDropdown]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Should show dropdown?
  const showDropdown = isOpen && query.trim().length >= 2;

  return (
    <div className="global-search" ref={containerRef}>
      <div className="global-search-input-wrapper">
        <span className="global-search-icon">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="text"
          className="global-search-input"
          placeholder="Search series, issues, creators..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleInputKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {isLoading ? (
          <Spinner />
        ) : (
          <span className="global-search-shortcut">/</span>
        )}
      </div>

      {showDropdown && (
        <div className="global-search-dropdown" ref={dropdownRef} role="listbox">
          {results.length === 0 && !isLoading ? (
            <div className="global-search-empty">
              No results for "{query}"
            </div>
          ) : (
            results.map((result, index) => (
              <SearchResult
                key={result.id}
                result={result}
                isSelected={index === selectedIndex}
                onClick={() => navigateToResult(result.navigationPath)}
                onMouseEnter={() => setSelectedIndex(index)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
