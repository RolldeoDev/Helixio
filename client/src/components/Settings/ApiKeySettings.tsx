/**
 * API Key Settings Component
 *
 * Manage API keys for programmatic access to Helixio.
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../contexts/AppContext';
import { useApiToast } from '../../hooks';
import { useConfirmModal } from '../ConfirmModal';
import { ToggleSwitch } from '../ToggleSwitch';
import {
  getApiKeys,
  createApiKey,
  revokeApiKey,
  rotateApiKey,
  getApiKeyUsage,
  getAvailableScopes,
  ApiKeyInfo,
  CreateApiKeyInput,
  UsageStats,
  ScopesResponse,
  getKeyStatus,
  getStatusColor,
  formatLastUsed,
  formatExpiration,
} from '../../services/api/api-keys';
import './ApiKeySettings.css';

// =============================================================================
// Simple Modal Wrapper
// =============================================================================

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const modal = (
    <div className="api-key-modal-overlay" onClick={handleBackdropClick}>
      <div className="api-key-modal" role="dialog" aria-modal="true">
        <div className="api-key-modal-header">
          <h3>{title}</h3>
          <button type="button" className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="api-key-modal-body">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// =============================================================================
// Create Key Modal
// =============================================================================

interface CreateKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (key: string, info: ApiKeyInfo) => void;
  scopesData: ScopesResponse | null;
  libraries: Array<{ id: string; name: string }>;
}

function CreateKeyModal({
  isOpen,
  onClose,
  onCreated,
  scopesData,
  libraries,
}: CreateKeyModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [expirationDays, setExpirationDays] = useState<number | null>(null);
  const [selectedLibraries, setSelectedLibraries] = useState<string[]>([]);
  const [restrictLibraries, setRestrictLibraries] = useState(false);
  const [ipWhitelist, setIpWhitelist] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { addToast } = useApiToast();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setSelectedScopes([]);
      setSelectedPreset('');
      setExpirationDays(null);
      setSelectedLibraries([]);
      setRestrictLibraries(false);
      setIpWhitelist('');
      setError(null);
    }
  }, [isOpen]);

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (preset && scopesData?.presets[preset]) {
      setSelectedScopes([...scopesData.presets[preset]]);
    }
  };

  const toggleScope = (scope: string) => {
    setSelectedPreset(''); // Clear preset when manually changing scopes
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (selectedScopes.length === 0) {
      setError('Select at least one scope');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const input: CreateApiKeyInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        scopes: selectedScopes,
      };

      if (expirationDays) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expirationDays);
        input.expiresAt = expiresAt.toISOString();
      }

      if (restrictLibraries && selectedLibraries.length > 0) {
        input.libraryIds = selectedLibraries;
      }

      if (ipWhitelist.trim()) {
        input.ipWhitelist = ipWhitelist
          .split('\n')
          .map((ip) => ip.trim())
          .filter(Boolean);
      }

      const result = await createApiKey(input);
      onCreated(result.key, result.info);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create API key';
      setError(message);
      addToast('error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create API Key">
      <form onSubmit={handleSubmit} className="api-key-form">
        {error && <div className="api-key-error">{error}</div>}

        <div className="form-group">
          <label htmlFor="key-name">Name *</label>
          <input
            id="key-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Komga Sync, Mobile App"
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label htmlFor="key-description">Description</label>
          <input
            id="key-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>

        <div className="form-group">
          <label>Expiration</label>
          <div className="expiration-options">
            {[
              { label: 'Never', value: null },
              { label: '30 days', value: 30 },
              { label: '90 days', value: 90 },
              { label: '1 year', value: 365 },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                className={`expiration-button ${expirationDays === opt.value ? 'active' : ''}`}
                onClick={() => setExpirationDays(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Scopes *</label>
          {scopesData?.presets && (
            <div className="scope-presets">
              <label>Preset:</label>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
              >
                <option value="">Custom...</option>
                {Object.keys(scopesData.presets).map((preset) => (
                  <option key={preset} value={preset}>
                    {preset.replace(/-/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="scope-categories">
            {scopesData?.categories &&
              Object.entries(scopesData.categories).map(([category, scopes]) => (
                <div key={category} className="scope-category">
                  <div className="scope-category-header">{category}</div>
                  <div className="scope-list">
                    {scopes
                      .filter((scope) => scopesData.availableScopes.includes(scope))
                      .map((scope) => (
                        <label key={scope} className="scope-item">
                          <input
                            type="checkbox"
                            checked={selectedScopes.includes(scope)}
                            onChange={() => toggleScope(scope)}
                          />
                          <span className="scope-name">{scope}</span>
                          <span className="scope-desc">
                            {scopesData.scopes[scope]}
                          </span>
                        </label>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="form-group">
          <label className="toggle-label">
            <ToggleSwitch
              checked={restrictLibraries}
              onChange={setRestrictLibraries}
            />
            <span>Restrict to specific libraries</span>
          </label>
          {restrictLibraries && (
            <div className="library-select">
              {libraries.map((lib) => (
                <label key={lib.id} className="library-item">
                  <input
                    type="checkbox"
                    checked={selectedLibraries.includes(lib.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedLibraries([...selectedLibraries, lib.id]);
                      } else {
                        setSelectedLibraries(
                          selectedLibraries.filter((id) => id !== lib.id)
                        );
                      }
                    }}
                  />
                  <span>{lib.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="ip-whitelist">IP Whitelist (optional)</label>
          <textarea
            id="ip-whitelist"
            value={ipWhitelist}
            onChange={(e) => setIpWhitelist(e.target.value)}
            placeholder="One IP per line (supports CIDR notation)"
            rows={3}
          />
          <p className="form-hint">Leave empty to allow all IPs</p>
        </div>

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Key'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// New Key Display Modal
// =============================================================================

interface NewKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  keyValue: string;
  keyInfo: ApiKeyInfo | null;
}

function NewKeyModal({ isOpen, onClose, keyValue, keyInfo }: NewKeyModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(keyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = keyValue;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen || !keyInfo) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="API Key Created">
      <div className="new-key-modal">
        <div className="warning-banner">
          Make sure to copy your API key now. You won't be able to see it again!
        </div>

        <div className="key-display">
          <code className="key-value">{keyValue}</code>
          <button
            type="button"
            className="copy-button"
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <div className="key-summary">
          <p><strong>Name:</strong> {keyInfo.name}</p>
          <p><strong>Scopes:</strong> {keyInfo.scopes.join(', ')}</p>
          {keyInfo.expiresAt && (
            <p><strong>Expires:</strong> {formatExpiration(keyInfo.expiresAt)}</p>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="button-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// Usage Stats Modal
// =============================================================================

interface UsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  keyInfo: ApiKeyInfo | null;
}

function UsageModal({ isOpen, onClose, keyInfo }: UsageModalProps) {
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && keyInfo) {
      setLoading(true);
      getApiKeyUsage(keyInfo.id)
        .then(setUsage)
        .catch(() => setUsage(null))
        .finally(() => setLoading(false));
    }
  }, [isOpen, keyInfo]);

  if (!isOpen || !keyInfo) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Usage: ${keyInfo.name}`}>
      <div className="usage-modal">
        {loading ? (
          <div className="loading">Loading usage data...</div>
        ) : usage ? (
          <>
            <div className="usage-stats">
              <div className="stat-card">
                <div className="stat-value">{usage.totalRequests.toLocaleString()}</div>
                <div className="stat-label">Total Requests</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{usage.requestsLast24h.toLocaleString()}</div>
                <div className="stat-label">Last 24 Hours</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{usage.requestsLast7d.toLocaleString()}</div>
                <div className="stat-label">Last 7 Days</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{usage.requestsLast30d.toLocaleString()}</div>
                <div className="stat-label">Last 30 Days</div>
              </div>
            </div>

            {usage.topEndpoints.length > 0 && (
              <div className="usage-section">
                <h4>Top Endpoints</h4>
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>Endpoint</th>
                      <th>Requests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.topEndpoints.map((ep, i) => (
                      <tr key={i}>
                        <td><code>{ep.endpoint}</code></td>
                        <td>{ep.count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {usage.recentRequests.length > 0 && (
              <div className="usage-section">
                <h4>Recent Requests</h4>
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Method</th>
                      <th>Endpoint</th>
                      <th>Status</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.recentRequests.map((req, i) => (
                      <tr key={i}>
                        <td>{new Date(req.timestamp).toLocaleString()}</td>
                        <td><code>{req.method}</code></td>
                        <td><code>{req.endpoint}</code></td>
                        <td className={req.statusCode < 400 ? 'status-ok' : 'status-error'}>
                          {req.statusCode}
                        </td>
                        <td>{req.ipAddress}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="error">Failed to load usage data</div>
        )}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ApiKeySettings() {
  const { libraries } = useApp();
  const { addToast } = useApiToast();
  const confirm = useConfirmModal();

  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [scopesData, setScopesData] = useState<ScopesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyInfo, setNewKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [selectedKey, setSelectedKey] = useState<ApiKeyInfo | null>(null);

  // Load API keys and scopes
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [keysData, scopesResponse] = await Promise.all([
        getApiKeys(),
        getAvailableScopes(),
      ]);
      setKeys(keysData);
      setScopesData(scopesResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load API keys';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleKeyCreated = (key: string, info: ApiKeyInfo) => {
    setShowCreateModal(false);
    setNewKeyValue(key);
    setNewKeyInfo(info);
    setShowNewKeyModal(true);
    setKeys((prev) => [info, ...prev]);
  };

  const handleRevoke = async (keyInfo: ApiKeyInfo) => {
    const confirmed = await confirm({
      title: 'Revoke API Key',
      message: `Are you sure you want to revoke "${keyInfo.name}"? This action cannot be undone.`,
      confirmText: 'Revoke',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      await revokeApiKey(keyInfo.id);
      addToast('success', 'API key revoked');
      loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke API key';
      addToast('error', message);
    }
  };

  const handleRotate = async (keyInfo: ApiKeyInfo) => {
    const confirmed = await confirm({
      title: 'Rotate API Key',
      message: `This will revoke "${keyInfo.name}" and create a new key with the same settings. Continue?`,
      confirmText: 'Rotate',
      variant: 'warning',
    });

    if (!confirmed) return;

    try {
      const result = await rotateApiKey(keyInfo.id);
      setNewKeyValue(result.key);
      setNewKeyInfo(result.info);
      setShowNewKeyModal(true);
      loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rotate API key';
      addToast('error', message);
    }
  };

  const handleViewUsage = (keyInfo: ApiKeyInfo) => {
    setSelectedKey(keyInfo);
    setShowUsageModal(true);
  };

  if (loading) {
    return <div className="api-key-settings loading">Loading API keys...</div>;
  }

  if (error) {
    return (
      <div className="api-key-settings error">
        <p>{error}</p>
        <button onClick={loadData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="api-key-settings">
      <div className="api-key-header">
        <div>
          <h3>API Keys</h3>
          <p className="subtitle">
            Manage API keys for programmatic access to Helixio
          </p>
        </div>
        <button
          className="button-primary"
          onClick={() => setShowCreateModal(true)}
        >
          Create API Key
        </button>
      </div>

      {keys.length === 0 ? (
        <div className="empty-state">
          <p>No API keys yet</p>
          <p className="hint">
            Create an API key to allow external tools and scripts to access Helixio
          </p>
        </div>
      ) : (
        <div className="api-key-list">
          {keys.map((key) => {
            const status = getKeyStatus(key);
            const statusColor = getStatusColor(status);

            return (
              <div key={key.id} className={`api-key-card ${status}`}>
                <div className="key-header">
                  <div className="key-info">
                    <div className="key-name">{key.name}</div>
                    <code className="key-prefix">{key.keyPrefix}...</code>
                  </div>
                  <span className={`status-badge ${statusColor}`}>{status}</span>
                </div>

                {key.description && (
                  <div className="key-description">{key.description}</div>
                )}

                <div className="key-meta">
                  <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                  <span>Last used: {formatLastUsed(key.lastUsedAt)}</span>
                  <span>Expires: {formatExpiration(key.expiresAt)}</span>
                  <span>{key.usageCount.toLocaleString()} requests</span>
                </div>

                <div className="key-scopes">
                  {key.scopes.slice(0, 5).map((scope) => (
                    <span key={scope} className="scope-badge">
                      {scope}
                    </span>
                  ))}
                  {key.scopes.length > 5 && (
                    <span className="scope-badge more">
                      +{key.scopes.length - 5} more
                    </span>
                  )}
                </div>

                <div className="key-actions">
                  <button
                    className="button-secondary"
                    onClick={() => handleViewUsage(key)}
                  >
                    Usage
                  </button>
                  {status === 'active' && (
                    <>
                      <button
                        className="button-secondary"
                        onClick={() => handleRotate(key)}
                      >
                        Rotate
                      </button>
                      <button
                        className="button-danger"
                        onClick={() => handleRevoke(key)}
                      >
                        Revoke
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateKeyModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleKeyCreated}
        scopesData={scopesData}
        libraries={libraries}
      />

      <NewKeyModal
        isOpen={showNewKeyModal}
        onClose={() => setShowNewKeyModal(false)}
        keyValue={newKeyValue}
        keyInfo={newKeyInfo}
      />

      <UsageModal
        isOpen={showUsageModal}
        onClose={() => setShowUsageModal(false)}
        keyInfo={selectedKey}
      />
    </div>
  );
}
