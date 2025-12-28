/**
 * Template Editor Component
 *
 * A rich editor for creating and editing filename templates.
 * Features live preview, persistent token sidebar, and tabbed sections.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  previewTemplate,
  getAvailableTokens,
  validateTemplate,
  type TokenDefinition,
  type TemplatePreviewResponse,
  type CharacterReplacementRules,
} from '../../services/api/templates';
import './TemplateEditor.css';

// =============================================================================
// Types
// =============================================================================

interface TemplateEditorProps {
  filePattern: string;
  folderSegments: string[];
  characterRules: CharacterReplacementRules;
  onFilePatternChange: (pattern: string) => void;
  onFolderSegmentsChange: (segments: string[]) => void;
  onCharacterRulesChange: (rules: CharacterReplacementRules) => void;
  readOnly?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  basic: 'Basic',
  date: 'Date',
  creator: 'Creators',
  content: 'Content',
  file: 'File',
  computed: 'Computed',
};

const CATEGORY_ICONS: Record<string, string> = {
  basic: 'M4 6h16M4 12h16M4 18h8',
  date: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  creator: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  content: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
  file: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  computed: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
};

const CHAR_RULE_OPTIONS = [
  { value: 'remove', label: 'Remove' },
  { value: 'dash', label: 'Dash (-)' },
  { value: 'underscore', label: 'Underscore (_)' },
  { value: 'space', label: 'Space' },
];

const ILLEGAL_CHARS = [
  { key: 'colon', char: ':', label: 'Colon' },
  { key: 'pipe', char: '|', label: 'Pipe' },
  { key: 'question', char: '?', label: 'Question' },
  { key: 'asterisk', char: '*', label: 'Asterisk' },
  { key: 'quotes', char: '"', label: 'Quotes' },
  { key: 'slash', char: '/', label: 'Slash' },
  { key: 'lt', char: '<', label: 'Less than' },
  { key: 'gt', char: '>', label: 'Greater than' },
];

// =============================================================================
// Component
// =============================================================================

export function TemplateEditor({
  filePattern,
  folderSegments,
  characterRules,
  onFilePatternChange,
  onFolderSegmentsChange,
  onCharacterRulesChange,
  readOnly = false,
}: TemplateEditorProps) {
  const [tokensByCategory, setTokensByCategory] = useState<Record<string, TokenDefinition[]>>({});
  const [preview, setPreview] = useState<TemplatePreviewResponse | null>(null);
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [activeTab, setActiveTab] = useState<'pattern' | 'folders' | 'rules'>('pattern');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['basic', 'file']));
  const [tokenSidebarCollapsed, setTokenSidebarCollapsed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load tokens on mount
  useEffect(() => {
    getAvailableTokens()
      .then(data => {
        setTokensByCategory(data.byCategory);
      })
      .catch(console.error);
  }, []);

  // Update preview when pattern changes (debounced)
  const updatePreview = useCallback(async () => {
    if (!filePattern) {
      setPreview(null);
      return;
    }

    try {
      const result = await previewTemplate(filePattern, { folderSegments });
      setPreview(result);
    } catch (error) {
      console.error('Preview error:', error);
    }
  }, [filePattern, folderSegments]);

  useEffect(() => {
    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current);
    }
    previewDebounceRef.current = setTimeout(updatePreview, 300);
    return () => {
      if (previewDebounceRef.current) {
        clearTimeout(previewDebounceRef.current);
      }
    };
  }, [updatePreview]);

  // Validate template
  useEffect(() => {
    if (!filePattern) {
      setValidation(null);
      return;
    }

    validateTemplate(filePattern, folderSegments)
      .then(result => {
        setValidation({
          valid: result.valid,
          errors: result.filePattern.errors,
        });
      })
      .catch(console.error);
  }, [filePattern, folderSegments]);

  // Insert token at cursor position
  const insertToken = useCallback((token: TokenDefinition) => {
    const tokenStr = `{${token.name}}`;

    if (inputRef.current) {
      const start = inputRef.current.selectionStart;
      const end = inputRef.current.selectionEnd;
      const newPattern =
        filePattern.slice(0, start) + tokenStr + filePattern.slice(end);
      onFilePatternChange(newPattern);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = start + tokenStr.length;
          inputRef.current.selectionEnd = start + tokenStr.length;
          inputRef.current.focus();
        }
      }, 0);
    } else {
      onFilePatternChange(filePattern + tokenStr);
    }
  }, [filePattern, onFilePatternChange]);

  // Toggle category expansion
  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Folder segment handlers
  const addFolderSegment = useCallback(() => {
    onFolderSegmentsChange([...folderSegments, '']);
  }, [folderSegments, onFolderSegmentsChange]);

  const updateFolderSegment = useCallback((index: number, value: string) => {
    const newSegments = [...folderSegments];
    newSegments[index] = value;
    onFolderSegmentsChange(newSegments);
  }, [folderSegments, onFolderSegmentsChange]);

  const removeFolderSegment = useCallback((index: number) => {
    const newSegments = folderSegments.filter((_, i) => i !== index);
    onFolderSegmentsChange(newSegments);
  }, [folderSegments, onFolderSegmentsChange]);

  // Character rule handler
  const updateCharRule = useCallback((key: string, value: string) => {
    onCharacterRulesChange({
      ...characterRules,
      [key]: value,
    });
  }, [characterRules, onCharacterRulesChange]);

  return (
    <div className={`te ${tokenSidebarCollapsed ? 'te--sidebar-collapsed' : ''}`}>
      {/* Main Editor Area */}
      <div className="te-main">
        {/* Section Tabs */}
        <div className="te-tabs">
          <button
            className={`te-tab ${activeTab === 'pattern' ? 'active' : ''}`}
            onClick={() => setActiveTab('pattern')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Filename Pattern
          </button>
          <button
            className={`te-tab ${activeTab === 'folders' ? 'active' : ''}`}
            onClick={() => setActiveTab('folders')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            Folder Organization
          </button>
          <button
            className={`te-tab ${activeTab === 'rules' ? 'active' : ''}`}
            onClick={() => setActiveTab('rules')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            Character Rules
          </button>
        </div>

        {/* Pattern Tab */}
        {activeTab === 'pattern' && (
          <div className="te-panel">
            {/* Pattern Input */}
            <div className="te-pattern-section">
              <label className="te-label">Template Pattern</label>
              <div className="te-input-wrapper">
                <textarea
                  ref={inputRef}
                  className={`te-input ${!validation?.valid ? 'te-input--invalid' : ''}`}
                  value={filePattern}
                  onChange={(e) => onFilePatternChange(e.target.value)}
                  placeholder="{Series} - {Type} {Number:000} - {Title} ({Year|}).{Extension}"
                  rows={2}
                  disabled={readOnly}
                />
              </div>
              {validation && !validation.valid && (
                <div className="te-errors">
                  {validation.errors.map((error, i) => (
                    <div key={i} className="te-error">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      {error}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="te-preview">
              <div className="te-preview-header">
                <span className="te-preview-label">Live Preview</span>
                {preview?.context && (
                  <span className="te-preview-context">
                    Sample: {preview.context.series} #{preview.context.number}
                  </span>
                )}
              </div>
              <div className="te-preview-result">
                {preview ? (
                  <>
                    <code className="te-preview-filename">
                      {preview.filename.result || '(empty)'}
                    </code>
                    {preview.filename.warnings.length > 0 && (
                      <div className="te-preview-warnings">
                        {preview.filename.warnings.map((w, i) => (
                          <span key={i} className="te-preview-warning">{w}</span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="te-preview-empty">Enter a pattern to see preview</span>
                )}
              </div>
            </div>

            {/* Quick Modifiers Reference */}
            <div className="te-modifiers">
              <span className="te-modifiers-label">Modifiers:</span>
              <code>{'{Number:000}'}</code>
              <span>Zero-pad</span>
              <code>{'{Series:upper}'}</code>
              <span>Uppercase</span>
              <code>{'{Title:30}'}</code>
              <span>Truncate</span>
              <code>{'{Year|N/A}'}</code>
              <span>Fallback</span>
            </div>
          </div>
        )}

        {/* Folders Tab */}
        {activeTab === 'folders' && (
          <div className="te-panel">
            <p className="te-description">
              Define folder segments to organize files into directories based on metadata.
              Each segment creates a nested folder.
            </p>

            <div className="te-folder-list">
              {folderSegments.map((segment, index) => (
                <div key={index} className="te-folder-item">
                  <span className="te-folder-index">{index + 1}</span>
                  <input
                    type="text"
                    className="te-folder-input"
                    value={segment}
                    onChange={(e) => updateFolderSegment(index, e.target.value)}
                    placeholder={index === 0 ? '{Publisher}' : index === 1 ? '{Series}' : 'e.g., {Year}'}
                    disabled={readOnly}
                  />
                  {!readOnly && (
                    <button
                      className="te-folder-remove"
                      onClick={() => removeFolderSegment(index)}
                      title="Remove segment"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {!readOnly && (
              <button className="te-add-folder" onClick={addFolderSegment}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Folder Segment
              </button>
            )}

            {/* Folder Preview */}
            {preview && preview.folderSegments.length > 0 && (
              <div className="te-folder-preview">
                <span className="te-folder-preview-label">Result:</span>
                <code className="te-folder-path">
                  {preview.folderSegments.map((seg, i) => (
                    <span key={i}>
                      {seg.result}
                      {i < preview.folderSegments.length - 1 && <span className="te-folder-sep">/</span>}
                    </span>
                  ))}
                </code>
              </div>
            )}
          </div>
        )}

        {/* Character Rules Tab */}
        {activeTab === 'rules' && (
          <div className="te-panel">
            <p className="te-description">
              Configure how illegal filename characters are handled when they appear in metadata values.
            </p>

            <div className="te-char-grid">
              {ILLEGAL_CHARS.map(({ key, char, label }) => (
                <div key={key} className="te-char-item">
                  <div className="te-char-info">
                    <span className="te-char-symbol">{char}</span>
                    <span className="te-char-label">{label}</span>
                  </div>
                  <select
                    className="te-char-select"
                    value={(characterRules as Record<string, string>)[key] || 'remove'}
                    onChange={(e) => updateCharRule(key, e.target.value)}
                    disabled={readOnly}
                  >
                    {key === 'quotes' ? (
                      <>
                        <option value="remove">Remove</option>
                        <option value="single">Single (')</option>
                      </>
                    ) : (
                      CHAR_RULE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Token Sidebar */}
      <div className="te-sidebar">
        <div className="te-sidebar-header">
          <span className="te-sidebar-title">Tokens</span>
          <button
            className="te-sidebar-toggle"
            onClick={() => setTokenSidebarCollapsed(!tokenSidebarCollapsed)}
            title={tokenSidebarCollapsed ? 'Expand' : 'Collapse'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {tokenSidebarCollapsed ? (
                <polyline points="9 18 15 12 9 6"/>
              ) : (
                <polyline points="15 18 9 12 15 6"/>
              )}
            </svg>
          </button>
        </div>

        <div className="te-sidebar-content">
          {Object.entries(tokensByCategory).map(([category, categoryTokens]) => (
            <div key={category} className="te-category">
              <button
                className={`te-category-header ${expandedCategories.has(category) ? 'expanded' : ''}`}
                onClick={() => toggleCategory(category)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d={CATEGORY_ICONS[category] || CATEGORY_ICONS.basic}/>
                </svg>
                <span>{CATEGORY_LABELS[category] || category}</span>
                <svg className="te-category-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {expandedCategories.has(category) && (
                <div className="te-category-tokens">
                  {categoryTokens.map((token) => (
                    <button
                      key={token.name}
                      className="te-token"
                      onClick={() => insertToken(token)}
                      title={token.description}
                      disabled={readOnly}
                    >
                      <span className="te-token-name">{token.name}</span>
                      <span className="te-token-example">{token.example}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TemplateEditor;
