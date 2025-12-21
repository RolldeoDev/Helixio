import React, { useState, useCallback } from 'react';
import { useTheme } from '../../themes/ThemeContext';
import './ThemeDropZone.css';

interface ThemeDropZoneProps {
  className?: string;
}

/**
 * ThemeDropZone - Drag and drop zone for importing theme zip files
 */
export function ThemeDropZone({ className = '' }: ThemeDropZoneProps) {
  const { importTheme } = useTheme();
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      setError(null);
      setSuccess(null);

      const files = Array.from(e.dataTransfer.files);
      const zipFile = files.find(
        (f) => f.type === 'application/zip' || f.name.endsWith('.zip')
      );

      if (!zipFile) {
        setError('Please drop a .zip file');
        return;
      }

      setIsImporting(true);

      try {
        await importTheme(zipFile);
        setSuccess(`Theme "${zipFile.name}" imported successfully!`);
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to import theme');
      } finally {
        setIsImporting(false);
      }
    },
    [importTheme]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);
      setSuccess(null);
      setIsImporting(true);

      try {
        await importTheme(file);
        setSuccess(`Theme "${file.name}" imported successfully!`);
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to import theme');
      } finally {
        setIsImporting(false);
        // Reset input
        e.target.value = '';
      }
    },
    [importTheme]
  );

  return (
    <div
      className={`theme-dropzone ${className} ${
        isDragging ? 'theme-dropzone--dragging' : ''
      } ${isImporting ? 'theme-dropzone--importing' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".zip,application/zip"
        onChange={handleFileSelect}
        className="theme-dropzone__input"
        id="theme-import-input"
      />

      <label htmlFor="theme-import-input" className="theme-dropzone__content">
        {isImporting ? (
          <>
            <div className="theme-dropzone__spinner" />
            <span className="theme-dropzone__text">Importing theme...</span>
          </>
        ) : (
          <>
            <div className="theme-dropzone__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <span className="theme-dropzone__text">
              {isDragging
                ? 'Drop theme file here'
                : 'Drag and drop a theme .zip file here'}
            </span>
            <span className="theme-dropzone__subtext">or click to browse</span>
          </>
        )}
      </label>

      {error && (
        <div className="theme-dropzone__message theme-dropzone__message--error">
          {error}
        </div>
      )}

      {success && (
        <div className="theme-dropzone__message theme-dropzone__message--success">
          {success}
        </div>
      )}
    </div>
  );
}

export default ThemeDropZone;
