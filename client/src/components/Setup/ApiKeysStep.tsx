/**
 * ApiKeysStep Component
 *
 * Second step of the setup wizard. Allows user to configure API keys
 * for external metadata services (ComicVine, Anthropic).
 */

import { useState } from 'react';
import './SetupWizard.css';

interface ApiKeysStepProps {
  onNext: () => void;
  onSkip: () => void;
}

const API_BASE = '/api';

export function ApiKeysStep({ onNext, onSkip }: ApiKeysStepProps) {
  const [comicVineKey, setComicVineKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [testingComicVine, setTestingComicVine] = useState(false);
  const [testingAnthropic, setTestingAnthropic] = useState(false);
  const [comicVineResult, setComicVineResult] = useState<'success' | 'error' | null>(null);
  const [anthropicResult, setAnthropicResult] = useState<'success' | 'error' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTestComicVine = async () => {
    if (!comicVineKey.trim()) return;

    setTestingComicVine(true);
    setComicVineResult(null);

    try {
      const response = await fetch(`${API_BASE}/config/test-comicvine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    if (!comicVineKey.trim()) {
      setError('Please enter a ComicVine API key, or use "Skip for now" below');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/config/api-keys`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comicVine: comicVineKey || undefined,
          anthropic: anthropicKey || undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to save API keys');
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API keys');
    } finally {
      setSaving(false);
    }
  };

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
            <span className="label-required">Required</span>
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
            <input
              id="comicvine-key"
              type="password"
              value={comicVineKey}
              onChange={(e) => {
                setComicVineKey(e.target.value);
                setComicVineResult(null);
              }}
              placeholder="Enter your ComicVine API key"
              disabled={saving}
            />
            <button
              type="button"
              className="btn-secondary test-btn"
              onClick={handleTestComicVine}
              disabled={!comicVineKey.trim() || testingComicVine || saving}
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
          </div>
        </div>

        {/* Anthropic Section */}
        <div className="form-group">
          <label htmlFor="anthropic-key">
            Anthropic API Key
            <span className="label-optional">Optional</span>
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
            <input
              id="anthropic-key"
              type="password"
              value={anthropicKey}
              onChange={(e) => {
                setAnthropicKey(e.target.value);
                setAnthropicResult(null);
              }}
              placeholder="Enter your Anthropic API key (optional)"
              disabled={saving}
            />
            <button
              type="button"
              className="btn-secondary test-btn"
              onClick={handleTestAnthropic}
              disabled={!anthropicKey.trim() || testingAnthropic || saving}
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
          disabled={saving || !comicVineKey.trim()}
        >
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>
        <button className="btn-text" onClick={onSkip} disabled={saving}>
          Skip for now
        </button>
        <p className="skip-warning">
          Skipping will limit metadata search to free sources only.
        </p>
      </div>
    </div>
  );
}
