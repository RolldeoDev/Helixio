/**
 * LibraryDropdown Component
 *
 * Compact dropdown selector for library selection.
 * Replaces the full library list to maximize folder tree space.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Library } from '../../services/api.service';

interface LibraryDropdownProps {
  libraries: Library[];
  selectedLibrary: Library | null;
  onSelect: (library: Library) => void;
  onAddClick: () => void;
  loading?: boolean;
  error?: string | null;
}

export function LibraryDropdown({
  libraries,
  selectedLibrary,
  onSelect,
  onAddClick,
  loading,
  error,
}: LibraryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape, handle arrow keys
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          setIsOpen(true);
          setFocusedIndex(selectedLibrary ? libraries.findIndex(l => l.id === selectedLibrary.id) : 0);
        }
        return;
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(prev => Math.min(prev + 1, libraries.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < libraries.length) {
            onSelect(libraries[focusedIndex]!);
            setIsOpen(false);
          }
          break;
        case 'Tab':
          setIsOpen(false);
          break;
      }
    },
    [isOpen, focusedIndex, libraries, selectedLibrary, onSelect]
  );

  // Scroll focused item into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && menuRef.current) {
      const items = menuRef.current.querySelectorAll('.dropdown-item');
      items[focusedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, focusedIndex]);

  const handleSelect = (library: Library) => {
    onSelect(library);
    setIsOpen(false);
  };

  const getLibraryIcon = (type: 'western' | 'manga') => {
    return type === 'manga' ? '📚' : '🗃️';
  };

  return (
    <div className="library-dropdown" ref={dropdownRef}>
      <button
        className="library-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={selectedLibrary ? `Selected library: ${selectedLibrary.name}` : 'Select a library'}
      >
        {selectedLibrary ? (
          <>
            <span className="library-icon">{getLibraryIcon(selectedLibrary.type)}</span>
            <span className="library-name">{selectedLibrary.name}</span>
            <span className="library-count">{selectedLibrary.stats?.total ?? 0}</span>
          </>
        ) : (
          <span className="placeholder">Select Library</span>
        )}
        <span className="dropdown-chevron" aria-hidden="true">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      <button
        className="btn-icon library-add-btn"
        onClick={onAddClick}
        title="Add Library"
        aria-label="Add Library"
      >
        +
      </button>

      {isOpen && (
        <div
          className="library-dropdown-menu"
          role="listbox"
          aria-label="Libraries"
          ref={menuRef}
        >
          {loading && (
            <div className="dropdown-loading" aria-live="polite">
              Loading...
            </div>
          )}

          {error && (
            <div className="dropdown-error" aria-live="polite">
              {error}
            </div>
          )}

          {!loading && libraries.length === 0 && (
            <div className="dropdown-empty">No libraries yet</div>
          )}

          {libraries.map((library, index) => (
            <button
              key={library.id}
              className={`dropdown-item ${library.id === selectedLibrary?.id ? 'selected' : ''} ${index === focusedIndex ? 'focused' : ''}`}
              onClick={() => handleSelect(library)}
              role="option"
              aria-selected={library.id === selectedLibrary?.id}
            >
              <span className="library-icon">{getLibraryIcon(library.type)}</span>
              <span className="library-name">{library.name}</span>
              <span className="library-count">{library.stats?.total ?? 0}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
