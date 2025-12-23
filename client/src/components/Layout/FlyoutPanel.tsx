/**
 * FlyoutPanel Component
 *
 * Quick-access panel that slides out from the icon rail.
 * Contains:
 * - Library selector dropdown
 * - Quick stats (total comics, reading progress)
 * - Continue Reading preview (3 items max)
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import {
  getContinueReading,
  getCoverUrl,
  ContinueReadingItem,
} from '../../services/api.service';

interface FlyoutPanelProps {
  isOpen: boolean;
  width: number;
  onClose: () => void;
}

export function FlyoutPanel({ isOpen, width, onClose }: FlyoutPanelProps) {
  const navigate = useNavigate();
  const {
    libraries,
    selectedLibrary,
    isAllLibraries,
    selectLibrary,
  } = useApp();

  const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false);
  const [continueReading, setContinueReading] = useState<ContinueReadingItem[]>([]);
  const [loadingReading, setLoadingReading] = useState(true);

  // Calculate total comics across all libraries
  const totalComicsAllLibraries = libraries.reduce(
    (sum, lib) => sum + (lib.stats?.total ?? 0),
    0
  );

  // Fetch continue reading items
  const fetchContinueReading = useCallback(async () => {
    try {
      setLoadingReading(true);
      // When all-libraries mode, don't pass libraryId to get items from all libraries
      const response = await getContinueReading(3, isAllLibraries ? undefined : selectedLibrary?.id);
      setContinueReading(response.items);
    } catch (err) {
      console.error('Failed to fetch continue reading:', err);
    } finally {
      setLoadingReading(false);
    }
  }, [selectedLibrary?.id, isAllLibraries]);

  useEffect(() => {
    if (isOpen) {
      fetchContinueReading();
    }
  }, [isOpen, fetchContinueReading]);

  const handleAllLibrariesSelect = () => {
    selectLibrary('all');
    navigate('/library');
    setIsLibraryMenuOpen(false);
  };

  const handleLibrarySelect = (library: typeof selectedLibrary) => {
    if (library) {
      selectLibrary(library);
      navigate(`/library/${library.id}`);
    }
    setIsLibraryMenuOpen(false);
  };

  const handleReadingItemClick = (item: ContinueReadingItem) => {
    navigate(`/read/${item.fileId}`);
    onClose();
  };

  const getLibraryIcon = (type: 'western' | 'manga') => {
    return type === 'manga' ? '📚' : '🗃️';
  };

  return (
    <aside
      className={`flyout-panel ${isOpen ? 'open' : ''}`}
      style={{ width }}
      aria-hidden={!isOpen}
    >
      <header className="panel-header">
        <h2 className="panel-title">Library</h2>
      </header>

      <div className="panel-content">
        {/* Library Selector */}
        <div className="flyout-library-selector">
          <button
            className="flyout-library-btn"
            onClick={() => setIsLibraryMenuOpen(!isLibraryMenuOpen)}
            aria-expanded={isLibraryMenuOpen}
            aria-haspopup="listbox"
          >
            {isAllLibraries ? (
              <>
                <span className="library-icon">📖</span>
                <span className="library-name">All Libraries</span>
                <span className="library-count">{totalComicsAllLibraries}</span>
              </>
            ) : selectedLibrary ? (
              <>
                <span className="library-icon">{getLibraryIcon(selectedLibrary.type)}</span>
                <span className="library-name">{selectedLibrary.name}</span>
                <span className="library-count">{selectedLibrary.stats?.total ?? 0}</span>
              </>
            ) : (
              <span className="library-name">Select Library</span>
            )}
            <svg className="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {isLibraryMenuOpen && (
            <div className="flyout-library-menu" role="listbox">
              {/* All Libraries option */}
              <button
                className={isAllLibraries ? 'selected' : ''}
                onClick={handleAllLibrariesSelect}
                role="option"
                aria-selected={isAllLibraries}
              >
                <span className="library-icon">📖</span>
                <span className="library-name">All Libraries</span>
                <span className="library-count">{totalComicsAllLibraries}</span>
              </button>
              {/* Divider */}
              <div className="flyout-library-divider" />
              {/* Individual libraries */}
              {libraries.map((library) => (
                <button
                  key={library.id}
                  className={!isAllLibraries && library.id === selectedLibrary?.id ? 'selected' : ''}
                  onClick={() => handleLibrarySelect(library)}
                  role="option"
                  aria-selected={!isAllLibraries && library.id === selectedLibrary?.id}
                >
                  <span className="library-icon">{getLibraryIcon(library.type)}</span>
                  <span className="library-name">{library.name}</span>
                  <span className="library-count">{library.stats?.total ?? 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        {(selectedLibrary || isAllLibraries) && (
          <div className="flyout-stats">
            <div className="flyout-stat">
              <span className="flyout-stat-value">
                {isAllLibraries ? totalComicsAllLibraries : (selectedLibrary?.stats?.total ?? 0)}
              </span>
              <span className="flyout-stat-label">Comics</span>
            </div>
            <div className="flyout-stat">
              <span className="flyout-stat-value">{continueReading.length}</span>
              <span className="flyout-stat-label">In Progress</span>
            </div>
          </div>
        )}

        {/* Continue Reading */}
        {continueReading.length > 0 && (
          <div className="flyout-continue-section">
            <div className="flyout-section-header">Continue Reading</div>
            <div className="flyout-continue-reading">
              {continueReading.map((item) => (
                <button
                  key={item.fileId}
                  className="flyout-reading-item"
                  onClick={() => handleReadingItemClick(item)}
                >
                  <div className="flyout-reading-cover">
                    <img
                      src={getCoverUrl(item.fileId)}
                      alt=""
                      loading="lazy"
                    />
                    <div className="flyout-reading-progress">
                      <div
                        className="flyout-reading-progress-fill"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="flyout-reading-info">
                    <span className="flyout-reading-title" title={item.filename}>
                      {item.filename.replace(/\.cb[rz7t]$/i, '')}
                    </span>
                    <span className="flyout-reading-meta">
                      {Math.round(item.progress)}% · Page {item.currentPage + 1}/{item.totalPages}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty state for continue reading */}
        {!loadingReading && continueReading.length === 0 && (selectedLibrary || isAllLibraries) && (
          <div className="flyout-empty">
            <p>No comics in progress</p>
          </div>
        )}

        {/* No library selected */}
        {!selectedLibrary && !isAllLibraries && (
          <div className="flyout-empty">
            <p>Select a library to get started</p>
          </div>
        )}
      </div>
    </aside>
  );
}
