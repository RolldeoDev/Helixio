/**
 * Factory Reset Modal
 *
 * Multi-step wizard for performing factory reset operations.
 * Steps:
 * 1. Level Selection - Choose reset tier (1/2/3)
 * 2. Confirmation - Review what will be deleted
 * 3. Verification - Enter random 3-word phrase
 * 4. Progress/Complete - Show deletion progress and results
 */

import { useState, useEffect, useCallback } from 'react';
import { generateVerificationPhrase, phrasesMatch } from './wordlist';
import './FactoryResetModal.css';

// =============================================================================
// Types
// =============================================================================

type ResetLevel = 1 | 2 | 3;
type ResetStep = 'select' | 'confirm' | 'verify' | 'progress' | 'complete' | 'error';

interface ResetResult {
  success: boolean;
  message?: string;
  deletedItems?: string[];
  clearedTables?: string[];
  freedBytes?: number;
  freedMB?: number;
  requiresRestart?: boolean;
  error?: string;
}

interface LevelInfo {
  level: ResetLevel;
  name: string;
  severity: 'warning' | 'danger' | 'critical';
  description: string;
  details: string[];
  preserves: string[];
}

interface FactoryResetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const LEVEL_INFO: LevelInfo[] = [
  {
    level: 1,
    name: 'Clear Cache',
    severity: 'warning',
    description: 'Remove cached data to free up disk space',
    details: [
      'Cover images (will be re-extracted)',
      'Thumbnail images',
      'Cached series metadata from APIs',
      'API response cache',
    ],
    preserves: [
      'Reading progress and history',
      'Achievements and collections',
      'Libraries and series data',
    ],
  },
  {
    level: 2,
    name: 'Clear Reading Data',
    severity: 'danger',
    description: 'Remove all reading progress and user data',
    details: [
      'Everything in Level 1',
      'Reading progress for all comics',
      'Reading history and statistics',
      'Achievements and progress',
      'Collections (Favorites, custom)',
    ],
    preserves: ['Libraries and series structure', 'Comic metadata', 'Settings and API keys'],
  },
  {
    level: 3,
    name: 'Full Factory Reset',
    severity: 'critical',
    description: 'Completely reset Helixio to initial state',
    details: [
      'Everything in Level 2',
      'Entire database (libraries, series, files)',
      'Configuration file (settings)',
      'Application logs',
    ],
    preserves: ['Your comic files (NEVER touched)', 'Library folder structure on disk'],
  },
];

// =============================================================================
// Component
// =============================================================================

export function FactoryResetModal({ isOpen, onClose }: FactoryResetModalProps) {
  // Step state
  const [step, setStep] = useState<ResetStep>('select');
  const [selectedLevel, setSelectedLevel] = useState<ResetLevel | null>(null);
  const [clearKeychain, setClearKeychain] = useState(false);

  // Verification state
  const [verificationPhrase, setVerificationPhrase] = useState('');
  const [userInput, setUserInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  // Progress state
  const [progressMessage, setProgressMessage] = useState('');

  // Result state
  const [result, setResult] = useState<ResetResult | null>(null);

  // Generate new phrase when entering verification step
  useEffect(() => {
    if (step === 'verify') {
      setVerificationPhrase(generateVerificationPhrase());
      setUserInput('');
      setInputError(null);
    }
  }, [step]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('select');
      setSelectedLevel(null);
      setClearKeychain(false);
      setUserInput('');
      setInputError(null);
      setResult(null);
    }
  }, [isOpen]);

  // Perform the reset
  const performReset = useCallback(async () => {
    if (!selectedLevel) return;

    setStep('progress');
    setProgressMessage('Preparing reset...');

    try {
      setProgressMessage('Deleting data...');

      const response = await fetch(`${API_BASE}/api/factory-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: selectedLevel,
          clearKeychain,
          confirmPhrase: verificationPhrase,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setResult({
          success: true,
          message: data.message,
          deletedItems: data.deletedItems,
          clearedTables: data.clearedTables,
          freedBytes: data.freedBytes,
          freedMB: data.freedMB,
          requiresRestart: data.requiresRestart,
        });
        setStep('complete');

        // If full reset, redirect after delay
        if (data.requiresRestart) {
          setTimeout(() => {
            window.location.href = '/';
          }, 3000);
        }
      } else {
        setResult({
          success: false,
          error: data.error || 'Reset failed',
        });
        setStep('error');
      }
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      });
      setStep('error');
    }
  }, [selectedLevel, clearKeychain, verificationPhrase]);

  // Handle level selection
  const handleLevelSelect = (level: ResetLevel) => {
    setSelectedLevel(level);
    setStep('confirm');
  };

  // Handle confirmation
  const handleConfirm = () => {
    setStep('verify');
  };

  // Handle verification
  const handleVerify = () => {
    if (!phrasesMatch(userInput, verificationPhrase)) {
      setInputError('Phrase does not match. Please try again.');
      return;
    }
    performReset();
  };

  // Handle back navigation
  const handleBack = () => {
    switch (step) {
      case 'confirm':
        setStep('select');
        break;
      case 'verify':
        setStep('confirm');
        break;
      default:
        break;
    }
  };

  // Check if input matches
  const inputMatches = phrasesMatch(userInput, verificationPhrase);

  // Get selected level info
  const levelInfo = selectedLevel ? LEVEL_INFO.find((l) => l.level === selectedLevel) : null;

  if (!isOpen) return null;

  return (
    <div className="factory-reset-overlay" onClick={onClose}>
      <div className="factory-reset-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="factory-reset-header">
          <h2>
            <span className="factory-reset-header-icon">!</span>
            Factory Reset
          </h2>
          <button className="factory-reset-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="factory-reset-body">
          {/* Step 1: Level Selection */}
          {step === 'select' && (
            <>
              <div className="factory-reset-step-header">
                <h3>Choose Reset Level</h3>
                <p>Select how much data you want to remove</p>
              </div>

              <div className="factory-reset-levels">
                {LEVEL_INFO.map((info) => (
                  <div
                    key={info.level}
                    className={`factory-reset-level-card severity-${info.severity}`}
                    onClick={() => handleLevelSelect(info.level)}
                  >
                    <div className="factory-reset-level-header">
                      <span className="factory-reset-level-badge">Level {info.level}</span>
                      <h4>{info.name}</h4>
                    </div>
                    <p className="factory-reset-level-description">{info.description}</p>
                    <ul className="factory-reset-level-details">
                      {info.details.slice(0, 3).map((detail, i) => (
                        <li key={i}>{detail}</li>
                      ))}
                      {info.details.length > 3 && (
                        <li>+{info.details.length - 3} more...</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Step 2: Confirmation */}
          {step === 'confirm' && levelInfo && (
            <>
              <div className="factory-reset-step-header">
                <h3>Confirm {levelInfo.name}</h3>
                <p>Review what will be deleted</p>
              </div>

              <div className="factory-reset-confirm-box">
                <h4>
                  <span>!</span> Will be deleted:
                </h4>
                <ul className="factory-reset-confirm-list">
                  {levelInfo.details.map((detail, i) => (
                    <li key={i}>{detail}</li>
                  ))}
                </ul>
              </div>

              <div className="factory-reset-preserves-box">
                <h4>Will be preserved:</h4>
                <p>{levelInfo.preserves.join(' • ')}</p>
              </div>

              {selectedLevel === 3 && (
                <div className="factory-reset-keychain-option">
                  <label>
                    <input
                      type="checkbox"
                      checked={clearKeychain}
                      onChange={(e) => setClearKeychain(e.target.checked)}
                    />
                    <div>
                      <span>Also clear API keys from OS Keychain</span>
                      <p className="factory-reset-keychain-description">
                        Remove ComicVine, Metron, and Anthropic API keys from secure storage
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </>
          )}

          {/* Step 3: Verification */}
          {step === 'verify' && (
            <div className="factory-reset-verification">
              <div className="factory-reset-warning-box">
                <div className="factory-reset-warning-icon">!</div>
                <h3>Final Confirmation Required</h3>
                <p>
                  This action <strong>cannot be undone</strong>.
                  {selectedLevel === 3 && ' All your Helixio data will be permanently deleted.'}
                </p>
              </div>

              <div className="factory-reset-phrase-box">
                <p>To confirm, type the following phrase:</p>
                <div className="factory-reset-phrase-display">{verificationPhrase}</div>
              </div>

              <input
                type="text"
                className={`factory-reset-phrase-input ${inputError ? 'error' : ''} ${inputMatches ? 'valid' : ''}`}
                placeholder="Type the phrase above"
                value={userInput}
                onChange={(e) => {
                  setUserInput(e.target.value);
                  setInputError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && inputMatches) {
                    handleVerify();
                  }
                }}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />

              {inputError && <p className="factory-reset-phrase-error">{inputError}</p>}
            </div>
          )}

          {/* Step 4: Progress */}
          {step === 'progress' && (
            <div className="factory-reset-progress">
              <div className="factory-reset-spinner" />
              <h3>Performing Reset...</h3>
              <p className="factory-reset-progress-message">{progressMessage}</p>
            </div>
          )}

          {/* Step 5: Complete */}
          {step === 'complete' && result && (
            <div className="factory-reset-complete">
              <div className="factory-reset-complete-icon">&#10003;</div>
              <h3>Reset Complete</h3>
              <p>
                {result.requiresRestart
                  ? 'Helixio will reload in a few seconds...'
                  : 'Your selected data has been cleared.'}
              </p>

              <div className="factory-reset-summary">
                <div className="factory-reset-summary-item">
                  <span>Items deleted:</span>
                  <strong>{result.deletedItems?.length || 0}</strong>
                </div>
                {result.clearedTables && result.clearedTables.length > 0 && (
                  <div className="factory-reset-summary-item">
                    <span>Tables cleared:</span>
                    <strong>{result.clearedTables.length}</strong>
                  </div>
                )}
                {result.freedMB !== undefined && (
                  <div className="factory-reset-summary-item">
                    <span>Space freed:</span>
                    <strong>{result.freedMB} MB</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 6: Error */}
          {step === 'error' && result && (
            <div className="factory-reset-error">
              <div className="factory-reset-error-icon">!</div>
              <h3>Reset Failed</h3>
              <p>An error occurred during the reset process.</p>
              <div className="factory-reset-error-message">{result.error}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="factory-reset-footer">
          <div className="factory-reset-footer-left">
            {(step === 'confirm' || step === 'verify') && (
              <button className="factory-reset-btn factory-reset-btn-secondary" onClick={handleBack}>
                Back
              </button>
            )}
          </div>

          <div className="factory-reset-footer-right">
            {step === 'select' && (
              <button className="factory-reset-btn factory-reset-btn-secondary" onClick={onClose}>
                Cancel
              </button>
            )}

            {step === 'confirm' && (
              <>
                <button className="factory-reset-btn factory-reset-btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button className="factory-reset-btn factory-reset-btn-danger" onClick={handleConfirm}>
                  Continue
                </button>
              </>
            )}

            {step === 'verify' && (
              <>
                <button className="factory-reset-btn factory-reset-btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="factory-reset-btn factory-reset-btn-danger"
                  onClick={handleVerify}
                  disabled={!inputMatches}
                >
                  Confirm Reset
                </button>
              </>
            )}

            {(step === 'complete' || step === 'error') && (
              <button className="factory-reset-btn factory-reset-btn-primary" onClick={onClose}>
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FactoryResetModal;
