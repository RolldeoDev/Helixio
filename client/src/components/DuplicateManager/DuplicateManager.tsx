/**
 * DuplicateManager Component
 *
 * Display and manage duplicate comic files with side-by-side comparison.
 */

import { useState, useEffect } from 'react';
import { getCoverUrl, deleteFile } from '../../services/api.service';
import { formatFileSize } from '../../utils/format';
import { useConfirmModal } from '../ConfirmModal';

const API_BASE = '/api';

interface DuplicateFile {
  id: string;
  filename: string;
  path: string;
  size: number;
  hash: string;
  modifiedAt: string;
  metadata?: {
    series?: string;
    number?: string;
    title?: string;
    year?: number;
  };
}

interface DuplicateGroup {
  id: string;
  matchType: 'hash' | 'metadata' | 'filename';
  files: DuplicateFile[];
  reason: string;
}

interface DuplicatesResponse {
  groups: DuplicateGroup[];
  total: number;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

export function DuplicateManager() {
  const confirm = useConfirmModal();
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Load duplicate groups
  useEffect(() => {
    loadDuplicates();
  }, []);

  const loadDuplicates = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/files/duplicates`);
      if (!response.ok) {
        throw new Error('Failed to load duplicates');
      }

      const data: DuplicatesResponse = await response.json();
      setDuplicates(data.groups);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load duplicates');
    } finally {
      setLoading(false);
    }
  };

  const handleScanDuplicates = async () => {
    setProcessing(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/files/duplicates/scan`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to scan for duplicates');
      }

      await loadDuplicates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan for duplicates');
    } finally {
      setProcessing(false);
    }
  };

  const handleKeepFile = async (groupId: string, fileIdToKeep: string) => {
    const group = duplicates.find((g) => g.id === groupId);
    if (!group) return;

    const filesToDelete = group.files
      .filter((f) => f.id !== fileIdToKeep)
      .map((f) => f.id);

    const keepFilename = group.files.find((f) => f.id === fileIdToKeep)?.filename;
    const confirmed = await confirm({
      title: 'Delete Duplicates',
      message: `Delete ${filesToDelete.length} duplicate file(s) and keep "${keepFilename}"?`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    setProcessing(true);
    setError(null);

    try {
      for (const fileId of filesToDelete) {
        await deleteFile(fileId);
      }

      // Remove resolved group
      setDuplicates((prev) => prev.filter((g) => g.id !== groupId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve duplicate');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteFile = async (groupId: string, fileId: string) => {
    const group = duplicates.find((g) => g.id === groupId);
    const file = group?.files.find((f) => f.id === fileId);

    const confirmed = await confirm({
      title: 'Delete File',
      message: `Delete "${file?.filename}"?`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    setProcessing(true);
    setError(null);

    try {
      await deleteFile(fileId);

      // Update group
      setDuplicates((prev) =>
        prev
          .map((g) => {
            if (g.id === groupId) {
              const updatedFiles = g.files.filter((f) => f.id !== fileId);
              return { ...g, files: updatedFiles };
            }
            return g;
          })
          .filter((g) => g.files.length > 1) // Remove groups with only one file
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    } finally {
      setProcessing(false);
    }
  };

  const handleDismissGroup = async (groupId: string) => {
    setProcessing(true);
    try {
      const response = await fetch(`${API_BASE}/files/duplicates/${groupId}/dismiss`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to dismiss duplicate group');
      }

      setDuplicates((prev) => prev.filter((g) => g.id !== groupId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss');
    } finally {
      setProcessing(false);
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroup((prev) => (prev === groupId ? null : groupId));
    setSelectedFile(null);
  };

  if (loading) {
    return (
      <div className="duplicate-manager">
        <div className="loading-overlay">
          <div className="spinner" />
          Loading duplicates...
        </div>
      </div>
    );
  }

  return (
    <div className="duplicate-manager">
      <div className="duplicate-manager-header">
        <h1>Duplicate Manager</h1>
        <button
          className="btn-primary"
          onClick={handleScanDuplicates}
          disabled={processing}
        >
          {processing ? 'Scanning...' : 'Scan for Duplicates'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {duplicates.length === 0 ? (
        <div className="empty-state">
          <h2>No Duplicates Found</h2>
          <p>
            Click "Scan for Duplicates" to check your library for duplicate files.
          </p>
        </div>
      ) : (
        <div className="duplicate-groups">
          <div className="groups-header">
            <span>{duplicates.length} duplicate groups found</span>
          </div>

          {duplicates.map((group) => (
            <div
              key={group.id}
              className={`duplicate-group ${expandedGroup === group.id ? 'expanded' : ''}`}
            >
              <div
                className="group-header"
                onClick={() => toggleGroup(group.id)}
              >
                <div className="group-info">
                  <span className="group-title">
                    {group.files[0]?.metadata?.series || group.files[0]?.filename}
                  </span>
                  <span className="group-count">{group.files.length} files</span>
                  <span className={`match-type badge-${group.matchType}`}>
                    {group.matchType === 'hash'
                      ? 'Exact Match'
                      : group.matchType === 'metadata'
                      ? 'Same Issue'
                      : 'Similar Name'}
                  </span>
                </div>
                <span className="expand-icon">{expandedGroup === group.id ? '▼' : '▶'}</span>
              </div>

              {expandedGroup === group.id && (
                <div className="group-content">
                  <div className="group-reason">
                    <strong>Reason:</strong> {group.reason}
                  </div>

                  <div className="files-comparison">
                    {group.files.map((file) => (
                      <div
                        key={file.id}
                        className={`file-card ${selectedFile === file.id ? 'selected' : ''}`}
                        onClick={() => setSelectedFile(file.id)}
                      >
                        <div className="file-cover">
                          <img
                            src={getCoverUrl(file.id)}
                            alt={file.filename}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '';
                              (e.target as HTMLImageElement).classList.add('error');
                            }}
                          />
                        </div>

                        <div className="file-details">
                          <span className="file-name" title={file.path}>
                            {file.filename}
                          </span>
                          <div className="file-meta">
                            <span>Size: {formatFileSize(file.size)}</span>
                            <span>Modified: {formatDate(file.modifiedAt)}</span>
                          </div>
                          <div className="file-path" title={file.path}>
                            {file.path}
                          </div>
                        </div>

                        <div className="file-actions">
                          <button
                            className="btn-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleKeepFile(group.id, file.id);
                            }}
                            disabled={processing}
                          >
                            Keep This
                          </button>
                          <button
                            className="btn-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFile(group.id, file.id);
                            }}
                            disabled={processing}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="group-actions">
                    <button
                      className="btn-ghost"
                      onClick={() => handleDismissGroup(group.id)}
                      disabled={processing}
                    >
                      Not Duplicates - Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
