/**
 * FileRenamingDisabledBanner Component
 *
 * Shows an info banner when file renaming is disabled, informing users
 * that file operations are not available. Dismissible for the session.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './FileRenamingDisabledBanner.css';

const SESSION_KEY = 'helixio_file_renaming_banner_dismissed';

interface FileRenamingDisabledBannerProps {
  /** Where to position the banner */
  position?: 'top' | 'inline';
}

export function FileRenamingDisabledBanner({ position = 'top' }: FileRenamingDisabledBannerProps) {
  const [isDisabled, setIsDisabled] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  });
  const navigate = useNavigate();

  // Check file renaming status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/config/file-renaming');
        if (res.ok) {
          const data = await res.json();
          setIsDisabled(!data.enabled);
        }
      } catch {
        // If we can't check, assume it might be disabled
        setIsDisabled(null);
      }
    };

    checkStatus();
  }, []);

  const handleDismiss = useCallback(() => {
    sessionStorage.setItem(SESSION_KEY, 'true');
    setDismissed(true);
  }, []);

  const handleGoToSettings = useCallback(() => {
    navigate('/settings?tab=system');
  }, [navigate]);

  // Don't show if enabled, loading, or dismissed
  if (isDisabled !== true || dismissed) {
    return null;
  }

  return (
    <div className={`file-renaming-banner file-renaming-banner--${position}`}>
      <div className="file-renaming-banner__content">
        <div className="file-renaming-banner__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div className="file-renaming-banner__text">
          <span>File operations are disabled.</span>
          <button className="file-renaming-banner__link" onClick={handleGoToSettings}>
            Enable in Settings
          </button>
        </div>
        <button
          className="file-renaming-banner__dismiss"
          onClick={handleDismiss}
          title="Dismiss for this session"
          aria-label="Dismiss banner"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default FileRenamingDisabledBanner;
