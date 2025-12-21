/**
 * CommandPalette Component
 *
 * A Spotlight/Alfred-style search overlay that provides:
 * - Quick search across comics, series, and metadata
 * - Navigation commands (go to pages)
 * - Recent searches
 * - Keyboard navigation
 *
 * Triggered by Cmd/Ctrl+K or clicking the search icon.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCoverUrl } from '../../services/api.service';
import './CommandPalette.css';

const API_BASE = '/api';
const RECENT_SEARCHES_KEY = 'helixio-recent-searches';
const MAX_RECENT_SEARCHES = 5;

interface SearchResult {
  id: string;
  filename: string;
  path: string;
  libraryId: string;
  libraryName: string;
  metadata: {
    series?: string;
    number?: string;
    title?: string;
    year?: number;
    writer?: string;
    publisher?: string;
  };
  score: number;
}

interface CommandItem {
  id: string;
  type: 'search-result' | 'command' | 'recent';
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

// Navigation commands
const COMMANDS: CommandItem[] = [
  {
    id: 'nav-home',
    type: 'command',
    title: 'Go to Home',
    subtitle: 'Dashboard and continue reading',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    action: () => {}, // Will be replaced with navigate
  },
  {
    id: 'nav-library',
    type: 'command',
    title: 'Go to Library',
    subtitle: 'Browse all comics',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
    action: () => {},
  },
  {
    id: 'nav-series',
    type: 'command',
    title: 'Go to Series',
    subtitle: 'Browse series',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    ),
    action: () => {},
  },
  {
    id: 'nav-collections',
    type: 'command',
    title: 'Go to Collections',
    subtitle: 'Your collections and reading lists',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    action: () => {},
  },
  {
    id: 'nav-settings',
    type: 'command',
    title: 'Go to Settings',
    subtitle: 'Configure Helixio',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    action: () => {},
  },
];

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (saved) {
        setRecentSearches(JSON.parse(saved));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save recent search
  const saveRecentSearch = useCallback((search: string) => {
    if (!search.trim()) return;

    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s.toLowerCase() !== search.toLowerCase());
      const updated = [search, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Search debounce
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          limit: '8',
        });
        const response = await fetch(`${API_BASE}/metadata/search?${params}`);
        if (response.ok) {
          const data = await response.json();
          setResults(data.results || []);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Build items list
  const items: CommandItem[] = [];

  // Add search results
  if (query.trim()) {
    results.forEach((result) => {
      items.push({
        id: result.id,
        type: 'search-result',
        title: result.metadata.series
          ? `${result.metadata.series}${result.metadata.number ? ` #${result.metadata.number}` : ''}`
          : result.filename.replace(/\.cb[rz7t]$/i, ''),
        subtitle: [result.metadata.writer, result.metadata.publisher, result.metadata.year]
          .filter(Boolean)
          .join(' · ') || result.libraryName,
        action: () => {
          saveRecentSearch(query);
          navigate(`/read/${result.id}`);
          onClose();
        },
      });
    });
  }

  // Add commands if query matches or empty
  const filteredCommands = query.trim()
    ? COMMANDS.filter(
        (cmd) =>
          cmd.title.toLowerCase().includes(query.toLowerCase()) ||
          cmd.subtitle?.toLowerCase().includes(query.toLowerCase())
      )
    : COMMANDS;

  filteredCommands.forEach((cmd) => {
    items.push({
      ...cmd,
      action: () => {
        const routes: Record<string, string> = {
          'nav-home': '/',
          'nav-library': '/library',
          'nav-series': '/series',
          'nav-collections': '/collections',
          'nav-settings': '/settings',
        };
        const route = routes[cmd.id];
        if (route) {
          navigate(route);
        }
        onClose();
      },
    });
  });

  // Add recent searches if no query
  if (!query.trim() && recentSearches.length > 0) {
    recentSearches.forEach((search, i) => {
      items.push({
        id: `recent-${i}`,
        type: 'recent',
        title: search,
        subtitle: 'Recent search',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        ),
        action: () => {
          setQuery(search);
        },
      });
    });
  }

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (items[selectedIndex]) {
          items[selectedIndex].action();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        {/* Search Input */}
        <div className="command-input-wrapper">
          <svg className="command-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="command-input"
            placeholder="Search comics, series, or type a command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <div className="command-spinner" />}
          <div className="command-shortcut">
            <kbd>esc</kbd>
          </div>
        </div>

        {/* Results List */}
        <div className="command-list" ref={listRef}>
          {items.length === 0 && query.trim() && !loading && (
            <div className="command-empty">
              No results found for "{query}"
            </div>
          )}

          {/* Search Results Section */}
          {results.length > 0 && (
            <div className="command-section">
              <div className="command-section-header">Comics</div>
              {items
                .filter((item) => item.type === 'search-result')
                .map((item) => {
                  const globalIndex = items.findIndex((it) => it.id === item.id);
                  return (
                    <button
                      key={item.id}
                      className={`command-item ${globalIndex === selectedIndex ? 'selected' : ''}`}
                      onClick={item.action}
                      data-index={globalIndex}
                    >
                      <div className="command-item-cover">
                        <img src={getCoverUrl(item.id)} alt="" loading="lazy" />
                      </div>
                      <div className="command-item-content">
                        <span className="command-item-title">{item.title}</span>
                        {item.subtitle && (
                          <span className="command-item-subtitle">{item.subtitle}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          )}

          {/* Commands Section */}
          {filteredCommands.length > 0 && (
            <div className="command-section">
              <div className="command-section-header">Navigation</div>
              {items
                .filter((item) => item.type === 'command')
                .map((item) => {
                  const globalIndex = items.findIndex((it) => it.id === item.id);
                  return (
                    <button
                      key={item.id}
                      className={`command-item ${globalIndex === selectedIndex ? 'selected' : ''}`}
                      onClick={item.action}
                      data-index={globalIndex}
                    >
                      <div className="command-item-icon">{item.icon}</div>
                      <div className="command-item-content">
                        <span className="command-item-title">{item.title}</span>
                        {item.subtitle && (
                          <span className="command-item-subtitle">{item.subtitle}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          )}

          {/* Recent Searches Section */}
          {!query.trim() && recentSearches.length > 0 && (
            <div className="command-section">
              <div className="command-section-header">Recent Searches</div>
              {items
                .filter((item) => item.type === 'recent')
                .map((item) => {
                  const globalIndex = items.findIndex((it) => it.id === item.id);
                  return (
                    <button
                      key={item.id}
                      className={`command-item ${globalIndex === selectedIndex ? 'selected' : ''}`}
                      onClick={item.action}
                      data-index={globalIndex}
                    >
                      <div className="command-item-icon">{item.icon}</div>
                      <div className="command-item-content">
                        <span className="command-item-title">{item.title}</span>
                        {item.subtitle && (
                          <span className="command-item-subtitle">{item.subtitle}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="command-footer">
          <span className="command-hint">
            <kbd>↑</kbd><kbd>↓</kbd> to navigate
          </span>
          <span className="command-hint">
            <kbd>↵</kbd> to select
          </span>
          <span className="command-hint">
            <kbd>esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
