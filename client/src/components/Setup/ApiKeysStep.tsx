/**
 * ApiKeysStep Component
 *
 * Second step of the setup wizard. Allows user to configure API keys
 * for external metadata services (ComicVine, Anthropic).
 */

import { useState, useEffect } from 'react';
import './SetupWizard.css';

interface ApiKeysStepProps {
  onNext: () => void;
  onSkip: () => void;
}

const API_BASE = '/api';

// API key metadata type
type ApiKeySource = 'environment' | 'config' | 'none';
interface ApiKeyMeta { source: ApiKeySource; readOnly: boolean }

export function ApiKeysStep({ onNext, onSkip }: ApiKeysStepProps) {
  const [comicVineKey, setComicVineKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [testingComicVine, setTestingComicVine] = useState(false);
  const [testingAnthropic, setTestingAnthropic] = useState(false);
  const [comicVineResult, setComicVineResult] = useState<'success' | 'error' | null>(null);
  const [anthropicResult, setAnthropicResult] = useState<'success' | 'error' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // API key metadata (source and readOnly status)
  const [apiKeyMeta, setApiKeyMeta] = useState<{
    comicVine: ApiKeyMeta;
    anthropic: ApiKeyMeta;
  }>({
    comicVine: { source: 'none', readOnly: false },
    anthropic: { source: 'none', readOnly: false },
  });

  // Load existing API key metadata on mount
  useEffect(() => {
    const loadApiKeyMeta = async () => {
      try {
        const response = await fetch(`${API_BASE}/config/api-keys`, {
          credentials: 'include',
        });
        if (!response.ok) {
          console.error('Failed to fetch API key metadata:', response.status);
          return;
        }
        const keys = await response.json();

        // Store values and metadata
        setComicVineKey(keys.comicVine?.value || '');
        setAnthropicKey(keys.anthropic?.value || '');

        const cvMeta = {
          source: (keys.comicVine?.source || 'none') as ApiKeySource,
          readOnly: keys.comicVine?.readOnly || false,
        };
        const anthMeta = {
          source: (keys.anthropic?.source || 'none') as ApiKeySource,
          readOnly: keys.anthropic?.readOnly || false,
        };

        setApiKeyMeta({ comicVine: cvMeta, anthropic: anthMeta });

        // Auto-skip if ComicVine is already configured via environment
        // (ComicVine is the required key)
        // Use setTimeout to defer the skip call, preventing React state updates during render
        if (cvMeta.source === 'environment' && cvMeta.readOnly) {
          setTimeout(() => onSkip(), 0);
          return;
        }
      } catch (err) {
        console.error('Failed to load API key metadata:', err);
      } finally {
        setLoading(false);
      }
    };

    loadApiKeyMeta();
  }, [onSkip]);

  const handleTestComicVine = async () => {
    if (!comicVineKey.trim()) return;

    setTestingComicVine(true);
    setComicVineResult(null);

    try {
      const response = await fetch(`${API_BASE}/config/test-comicvine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiKey: comicVineKey }),
      });
      const data = await response.json();
      setComicVineResult(response.ok && data.success ? 'success' : 'error');
    } catch {
      setComicVineResult('error');
    } finally {
      setTestingComicVine(false);
    }
  };

  const handleTestAnthropic = async () => {
    if (!anthropicKey.trim()) return;

    setTestingAnthropic(true);
    setAnthropicResult(null);

    try {
      const response = await fetch(`${API_BASE}/config/test-anthropic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiKey: anthropicKey }),
      });
      const data = await response.json();
      setAnthropicResult(response.ok && data.success ? 'success' : 'error');
    } catch {
      setAnthropicResult('error');
    } finally {
      setTestingAnthropic(false);
    }
  };

  const handleSaveAndContinue = async () => {
    // At least ComicVine should be configured to use Save & Continue
    // (unless it's already configured via environment)
    if (!comicVineKey.trim() && !apiKeyMeta.comicVine.readOnly) {
      setError('Please enter a ComicVine API key, or use "Skip for now" below');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Only send keys that aren't read-only
      const keysToSave: Record<string, string | undefined> = {};
      if (!apiKeyMeta.comicVine.readOnly && comicVineKey) {
        keysToSave.comicVine = comicVineKey;
      }
      if (!apiKeyMeta.anthropic.readOnly && anthropicKey) {
        keysToSave.anthropic = anthropicKey;
      }

      // If all keys are read-only, just continue
      if (Object.keys(keysToSave).length === 0) {
        onNext();
        return;
      }

      const response = await fetch(`${API_BASE}/config/api-keys`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(keysToSave),
      });

      if (!response.ok) throw new Error('Failed to save API keys');
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API keys');
    } finally {
      setSaving(false);
    }
  };

  // Show loading state while fetching metadata
  if (loading) {
    return (
      <div className="setup-step apikeys-step">
        <div className="step-header">
          <h2>Configure API Keys</h2>
          <p className="step-subtitle">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-step apikeys-step">
      <div className="step-header">
        <h2>Configure API Keys</h2>
        <p className="step-subtitle">
          Connect to external services for rich metadata. ComicVine is required
          for western comics metadata like series info, covers, and issue details.
        </p>
      </div>

      {error && <div className="step-error">{error}</div>}

      <div className="library-form">
        {/* ComicVine Section */}
        <div className="form-group">
          <label htmlFor="comicvine-key">
            ComicVine API Key
            {apiKeyMeta.comicVine.source === 'environment' ? (
              <span className="env-source-badge">Environment</span>
            ) : (
              <span className="label-required">Required</span>
            )}
          </label>
          <p className="form-hint">
            Free to obtain from{' '}
            <a
              href="https://comicvine.gamespot.com/api/"
              target="_blank"
              rel="noopener noreferrer"
            >
              comicvine.gamespot.com/api
            </a>
          </p>
          <div className="api-key-input-row">
            <div className="api-key-input-wrapper">
              <input
                id="comicvine-key"
                type="password"
                value={comicVineKey}
                onChange={(e) => {
                  setComicVineKey(e.target.value);
                  setComicVineResult(null);
                }}
                placeholder={apiKeyMeta.comicVine.readOnly ? 'Set via environment variable' : 'Enter your ComicVine API key'}
                disabled={saving || apiKeyMeta.comicVine.readOnly}
                title={apiKeyMeta.comicVine.readOnly ? 'This key is set via environment variable and cannot be changed here' : undefined}
              />
              {apiKeyMeta.comicVine.readOnly && (
                <span className="api-key-lock-icon" title="Configured via environment variable">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                  </svg>
                </span>
              )}
            </div>
            {(comicVineKey || apiKeyMeta.comicVine.readOnly) && (
              <button
                type="button"
                className="btn-secondary test-btn"
                onClick={handleTestComicVine}
                disabled={testingComicVine || saving}
              >
                {testingComicVine ? (
                  <span className="spinner-tiny" />
                ) : comicVineResult === 'success' ? (
                  <span className="test-result success">✓</span>
                ) : comicVineResult === 'error' ? (
                  <span className="test-result error">✕</span>
                ) : (
                  'Test'
                )}
              </button>
            )}
          </div>
        </div>

        {/* Anthropic Section */}
        <div className="form-group">
          <label htmlFor="anthropic-key">
            Anthropic API Key
            {apiKeyMeta.anthropic.source === 'environment' ? (
              <span className="env-source-badge">Environment</span>
            ) : (
              <span className="label-optional">Optional</span>
            )}
          </label>
          <p className="form-hint">
            Enables AI-powered filename parsing for better metadata matching.
            Get one from{' '}
            <a
              href="https://console.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              console.anthropic.com
            </a>
          </p>
          <div className="api-key-input-row">
            <div className="api-key-input-wrapper">
              <input
                id="anthropic-key"
                type="password"
                value={anthropicKey}
                onChange={(e) => {
                  setAnthropicKey(e.target.value);
                  setAnthropicResult(null);
                }}
                placeholder={apiKeyMeta.anthropic.readOnly ? 'Set via environment variable' : 'Enter your Anthropic API key (optional)'}
                disabled={saving || apiKeyMeta.anthropic.readOnly}
                title={apiKeyMeta.anthropic.readOnly ? 'This key is set via environment variable and cannot be changed here' : undefined}
              />
              {apiKeyMeta.anthropic.readOnly && (
                <span className="api-key-lock-icon" title="Configured via environment variable">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                  </svg>
                </span>
              )}
            </div>
            {(anthropicKey || apiKeyMeta.anthropic.readOnly) && (
              <button
                type="button"
                className="btn-secondary test-btn"
                onClick={handleTestAnthropic}
                disabled={testingAnthropic || saving}
              >
                {testingAnthropic ? (
                  <span className="spinner-tiny" />
                ) : anthropicResult === 'success' ? (
                  <span className="test-result success">✓</span>
                ) : anthropicResult === 'error' ? (
                  <span className="test-result error">✕</span>
                ) : (
                  'Test'
                )}
              </button>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="api-info-box">
          <div className="api-info-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div className="api-info-content">
            <strong>Why is ComicVine needed?</strong>
            <p>
              ComicVine is the primary source for western comic metadata. Without it,
              you won&apos;t be able to automatically fetch series info, issue details,
              character data, or high-quality cover images. Manga libraries use
              AniList/MAL which don&apos;t require API keys.
            </p>
          </div>
        </div>
      </div>

      <div className="step-actions">
        <button
          className="btn-primary btn-lg"
          onClick={handleSaveAndContinue}
          disabled={saving || (!comicVineKey.trim() && !apiKeyMeta.comicVine.readOnly)}
        >
          {saving ? 'Saving...' : apiKeyMeta.comicVine.readOnly ? 'Continue' : 'Save & Continue'}
        </button>
        {!apiKeyMeta.comicVine.readOnly && (
          <>
            <button className="btn-text" onClick={onSkip} disabled={saving}>
              Skip for now
            </button>
            <p className="skip-warning">
              Skipping will limit metadata search to free sources only.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
