/**
 * QuickActions Component
 *
 * Quick action buttons for common library operations.
 * Displayed in the sidebar dashboard.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { useFolderDrawer } from '../../contexts/FolderDrawerContext';
import { scanLibrary, applyScan } from '../../services/api.service';
import { useConfirmModal } from '../ConfirmModal';

export function QuickActions() {
  const navigate = useNavigate();
  const { selectedLibrary, refreshLibraries, refreshFiles, setOperation } = useApp();
  const { openDrawer } = useFolderDrawer();
  const confirm = useConfirmModal();
  const [scanning, setScanning] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleScan = async () => {
    if (!selectedLibrary || scanning) return;

    setScanning(true);
    setOperation('scan', `Scanning ${selectedLibrary.name}...`);

    try {
      const result = await scanLibrary(selectedLibrary.id);

      if (result.autoApplied) {
        setOperation(null, 'No changes detected');
        setTimeout(() => setOperation(null), 2000);
      } else {
        const changes =
          result.summary.newFiles +
          result.summary.movedFiles +
          result.summary.orphanedFiles;

        if (changes > 0) {
          const confirmed = await confirm({
            title: 'Apply Scan Results',
            message: `Found ${result.summary.newFiles} new files, ${result.summary.movedFiles} moved files, and ${result.summary.orphanedFiles} orphaned files.\n\nApply these changes?`,
            confirmText: 'Apply',
          });

          if (confirmed) {
            await applyScan(selectedLibrary.id, result.scanId);
            setOperation(null, 'Changes applied');
          } else {
            setOperation(null, 'Scan cancelled');
          }
        } else {
          setOperation(null, 'No changes found');
        }
        setTimeout(() => setOperation(null), 2000);
      }

      await refreshLibraries();
      await refreshFiles();
    } catch (err) {
      setOperation(null, `Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setTimeout(() => setOperation(null), 3000);
    } finally {
      setScanning(false);
    }
  };

  const handleManageFolders = () => {
    openDrawer();
  };

  const handleGoToJobs = () => {
    navigate('/jobs');
  };

  return (
    <div className="quick-actions">
      <button
        className="quick-actions-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="quick-actions-title">Quick Actions</span>
        <span className={`quick-actions-chevron ${isExpanded ? '' : 'collapsed'}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className="quick-actions-content">
          <button
            className="quick-action-btn"
            onClick={handleScan}
            disabled={!selectedLibrary || scanning}
            title={selectedLibrary ? `Scan ${selectedLibrary.name}` : 'Select a library first'}
          >
            <span className="action-icon">{scanning ? '...' : '🔄'}</span>
            <span className="action-label">Scan Library</span>
          </button>

          <button
            className="quick-action-btn"
            onClick={handleManageFolders}
            title="Open folder navigation"
          >
            <span className="action-icon">📁</span>
            <span className="action-label">Browse Folders</span>
          </button>

          <button
            className="quick-action-btn"
            onClick={handleGoToJobs}
            title="View metadata jobs"
          >
            <span className="action-icon">📥</span>
            <span className="action-label">Metadata Jobs</span>
          </button>

          <button
            className="quick-action-btn"
            onClick={handleGoToJobs}
            title="View all jobs"
          >
            <span className="action-icon">⚡</span>
            <span className="action-label">Jobs</span>
          </button>
        </div>
      )}
    </div>
  );
}
