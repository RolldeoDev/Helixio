/**
 * FolderBrowser Component
 *
 * A modal dialog for browsing and selecting folders from the filesystem.
 * Used for selecting library root paths.
 */

import { useState, useEffect, useCallback } from 'react';

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface RootLocation {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface FolderBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

const API_BASE = '/api';

export function FolderBrowser({ isOpen, onClose, onSelect, initialPath }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [roots, setRoots] = useState<RootLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState('');

  // Load root locations on mount
  useEffect(() => {
    if (isOpen) {
      loadRoots();
    }
  }, [isOpen]);

  // Browse to initial path or home when opened
  useEffect(() => {
    if (isOpen) {
      if (initialPath) {
        browseTo(initialPath);
      } else {
        // Start at first root (usually Home)
        loadRoots().then((loadedRoots) => {
          const firstRoot = loadedRoots?.[0];
          if (firstRoot) {
            browseTo(firstRoot.path);
          }
        });
      }
    }
  }, [isOpen, initialPath]);

  const loadRoots = useCallback(async (): Promise<RootLocation[] | null> => {
    try {
      const response = await fetch(`${API_BASE}/filesystem/roots`);
      if (!response.ok) throw new Error('Failed to load roots');
      const data = await response.json();
      setRoots(data.locations);
      return data.locations;
    } catch (err) {
      console.error('Failed to load roots:', err);
      return null;
    }
  }, []);

  const browseTo = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/filesystem/browse?path=${encodeURIComponent(path)}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to browse directory');
      }

      const data = await response.json();
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setDirectories(data.directories);
      setManualPath(data.currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to browse directory');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDirectoryClick = (dir: DirectoryEntry) => {
    browseTo(dir.path);
  };

  const handleGoUp = () => {
    if (parentPath) {
      browseTo(parentPath);
    }
  };

  const handleRootClick = (root: RootLocation) => {
    browseTo(root.path);
  };

  const handleManualPathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualPath.trim()) {
      browseTo(manualPath.trim());
    }
  };

  const handleSelect = () => {
    onSelect(currentPath);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content folder-browser-modal" onClick={(e) => e.stopPropagation()}>
        <div className="folder-browser-header">
          <h2>Select Folder</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="folder-browser-path-bar">
          <form onSubmit={handleManualPathSubmit} className="path-form">
            <input
              type="text"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              placeholder="Enter path..."
              className="path-input"
            />
            <button type="submit" className="btn-secondary">
              Go
            </button>
          </form>
        </div>

        <div className="folder-browser-content">
          <div className="folder-browser-sidebar">
            <h4>Locations</h4>
            <div className="roots-list">
              {roots.map((root) => (
                <button
                  key={root.path}
                  className={`root-item ${currentPath === root.path ? 'active' : ''}`}
                  onClick={() => handleRootClick(root)}
                >
                  <span className="root-icon">
                    {root.name === 'Home' ? '~' : root.name === 'Root' ? '/' : root.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="root-name">{root.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="folder-browser-main">
            <div className="folder-browser-toolbar">
              <button
                className="btn-icon"
                onClick={handleGoUp}
                disabled={!parentPath}
                title="Go to parent folder"
              >
                &uarr;
              </button>
              <span className="current-path-display">{currentPath}</span>
            </div>

            {error && (
              <div className="folder-browser-error">
                {error}
              </div>
            )}

            {loading ? (
              <div className="folder-browser-loading">
                <div className="spinner" />
                Loading...
              </div>
            ) : (
              <div className="directories-list">
                {directories.length === 0 ? (
                  <div className="empty-directory">
                    No subdirectories found
                  </div>
                ) : (
                  directories.map((dir) => (
                    <button
                      key={dir.path}
                      className="directory-item"
                      onClick={() => handleDirectoryClick(dir)}
                      onDoubleClick={() => {
                        browseTo(dir.path);
                      }}
                    >
                      <span className="directory-icon">
                        &gt;
                      </span>
                      <span className="directory-name">{dir.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="folder-browser-footer">
          <div className="selected-path">
            <strong>Selected:</strong> {currentPath || 'None'}
          </div>
          <div className="footer-actions">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleSelect}
              disabled={!currentPath}
            >
              Select Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
