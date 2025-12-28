/**
 * NotesMigrationBanner Component
 *
 * Shows a banner prompting users to migrate their localStorage notes
 * to the database for per-user data isolation and persistence.
 */

import { useState, useEffect, useCallback } from 'react';
import { useMigrateNotes, type LocalStorageNote } from '../../hooks/queries';
import './NotesMigrationBanner.css';

const STORAGE_KEY = 'helixio_annotations';
const MIGRATION_KEY = 'helixio_notes_migrated';

interface ComicNote {
  id: string;
  fileId: string;
  title: string;
  content: string;
  rating?: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface AnnotationsState {
  annotations: unknown[];
  bookmarks: unknown[];
  notes: ComicNote[];
}

/**
 * Check if there are notes to migrate
 */
function getNotesToMigrate(): ComicNote[] {
  try {
    // Check if already migrated
    if (localStorage.getItem(MIGRATION_KEY)) {
      return [];
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const state: AnnotationsState = JSON.parse(stored);
    return state.notes || [];
  } catch {
    return [];
  }
}

/**
 * Convert ComicNote to LocalStorageNote format for API
 */
function convertToApiFormat(notes: ComicNote[]): LocalStorageNote[] {
  return notes.map((note) => ({
    fileId: note.fileId,
    title: note.title || undefined,
    content: note.content || undefined,
    rating: note.rating,
    tags: note.tags?.length > 0 ? note.tags : undefined,
  }));
}

export function NotesMigrationBanner() {
  const [notes, setNotes] = useState<ComicNote[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const migrateMutation = useMigrateNotes();

  // Check for notes on mount
  useEffect(() => {
    const notesToMigrate = getNotesToMigrate();
    setNotes(notesToMigrate);
  }, []);

  const handleMigrate = useCallback(async () => {
    if (notes.length === 0) return;

    const apiNotes = convertToApiFormat(notes);

    try {
      const result = await migrateMutation.mutateAsync(apiNotes);

      // Mark as migrated
      localStorage.setItem(MIGRATION_KEY, new Date().toISOString());

      // Clear local notes after successful migration
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const state: AnnotationsState = JSON.parse(stored);
          state.notes = [];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
      } catch {
        // Ignore cleanup errors
      }

      // Hide banner
      setNotes([]);

      // Show success message
      console.log(`Migration complete: ${result.migrated} migrated, ${result.skipped} skipped`);
    } catch (error) {
      console.error('Migration failed:', error);
    }
  }, [notes, migrateMutation]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleDismissForever = useCallback(() => {
    // Mark as migrated even though we didn't migrate
    localStorage.setItem(MIGRATION_KEY, 'dismissed');
    setNotes([]);
  }, []);

  // Don't show if no notes or dismissed
  if (notes.length === 0 || dismissed) {
    return null;
  }

  return (
    <div className="notes-migration-banner">
      <div className="notes-migration-content">
        <div className="notes-migration-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </div>
        <div className="notes-migration-text">
          <strong>Migrate your notes</strong>
          <span>
            You have {notes.length} note{notes.length !== 1 ? 's' : ''} stored locally.
            Migrate them to your account for better sync and backup.
          </span>
        </div>
        <div className="notes-migration-actions">
          <button
            className="btn-migrate"
            onClick={handleMigrate}
            disabled={migrateMutation.isPending}
          >
            {migrateMutation.isPending ? 'Migrating...' : 'Migrate Now'}
          </button>
          <button className="btn-dismiss" onClick={handleDismiss} title="Dismiss for this session">
            Later
          </button>
          <button className="btn-dismiss-forever" onClick={handleDismissForever} title="Don't show again">
            Don't ask again
          </button>
        </div>
      </div>
      {migrateMutation.isError && (
        <div className="notes-migration-error">
          Migration failed. Please try again.
        </div>
      )}
    </div>
  );
}

export default NotesMigrationBanner;
