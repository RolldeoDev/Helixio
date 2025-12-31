/**
 * LibraryStep Component
 *
 * Second step of the setup wizard. Allows user to create their first library.
 */

import { useState } from 'react';
import { FolderBrowser } from '../FolderBrowser/FolderBrowser';
import { createLibrary } from '../../services/api/libraries';
import './SetupWizard.css';

interface LibraryStepProps {
  onLibraryCreated: (libraryId: string) => void;
  onSkip: () => void;
}

type LibraryType = 'western' | 'manga';

export function LibraryStep({ onLibraryCreated, onSkip }: LibraryStepProps) {
  const [name, setName] = useState('My Comics');
  const [rootPath, setRootPath] = useState('');
  const [type, setType] = useState<LibraryType>('western');
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || !rootPath.trim()) {
      setError('Please provide a library name and select a folder');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const library = await createLibrary({
        name: name.trim(),
        rootPath: rootPath.trim(),
        type,
      });
      onLibraryCreated(library.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create library');
      setIsCreating(false);
    }
  };

  return (
    <div className="setup-step library-step">
      <div className="step-header">
        <h2>Create Your First Library</h2>
        <p className="step-subtitle">
          A library is a folder containing your comic files. Helixio will scan it and organize your comics automatically.
        </p>
      </div>

      {error && (
        <div className="step-error">
          {error}
        </div>
      )}

      <div className="library-form">
        <div className="form-group">
          <label htmlFor="library-name">Library Name</label>
          <input
            id="library-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., My Comics"
            disabled={isCreating}
          />
        </div>

        <div className="form-group">
          <label htmlFor="library-path">Folder Location</label>
          <div className="path-input-group">
            <input
              id="library-path"
              type="text"
              value={rootPath}
              placeholder="Select a folder..."
              disabled={isCreating}
              readOnly
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsBrowsing(true)}
              disabled={isCreating}
            >
              Browse
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Library Type</label>
          <div className="type-selector">
            <button
              type="button"
              className={`type-option ${type === 'western' ? 'selected' : ''}`}
              onClick={() => setType('western')}
              disabled={isCreating}
            >
              <div className="type-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
              <span className="type-label">Western Comics</span>
              <span className="type-description">
                Left-to-right reading, typical US/EU comics
              </span>
            </button>
            <button
              type="button"
              className={`type-option ${type === 'manga' ? 'selected' : ''}`}
              onClick={() => setType('manga')}
              disabled={isCreating}
            >
              <div className="type-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <text x="11" y="14" fontSize="8" fill="currentColor" textAnchor="middle">JP</text>
                </svg>
              </div>
              <span className="type-label">Manga</span>
              <span className="type-description">
                Right-to-left reading, Japanese-style comics
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="step-actions">
        <button
          className="btn-primary btn-lg"
          onClick={handleCreate}
          disabled={isCreating || !name.trim() || !rootPath.trim()}
        >
          {isCreating ? 'Creating...' : 'Create Library'}
        </button>
        <button className="btn-text" onClick={onSkip} disabled={isCreating}>
          Skip for now
        </button>
      </div>

      <FolderBrowser
        isOpen={isBrowsing}
        onClose={() => setIsBrowsing(false)}
        onSelect={(path: string) => {
          setRootPath(path);
          setIsBrowsing(false);
        }}
        initialPath={rootPath || undefined}
      />
    </div>
  );
}
