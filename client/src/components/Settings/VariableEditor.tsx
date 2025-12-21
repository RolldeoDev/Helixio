import { useState, useMemo } from 'react';
import { useTheme } from '../../themes/ThemeContext';
import { VARIABLE_GROUPS, toKebabCase } from '../../themes/types';
import type { ThemeTokens } from '../../themes/types';
import './VariableEditor.css';

interface VariableEditorProps {
  onClose: () => void;
}

/**
 * VariableEditor - Full CSS variable editor with collapsible groups and search
 */
export function VariableEditor({ onClose }: VariableEditorProps) {
  const {
    currentTheme,
    userOverrides,
    setOverride,
    removeOverride,
    resetToDefaults,
  } = useTheme();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['Background Colors', 'Primary & Accent Colors'])
  );

  // Get the current value for a variable (override or theme default)
  const getValue = (tokenKey: keyof ThemeTokens): string => {
    const cssVar = `--${toKebabCase(tokenKey)}`;
    if (userOverrides[cssVar]) {
      return userOverrides[cssVar];
    }
    return currentTheme.tokens[tokenKey];
  };

  // Check if a variable has been overridden
  const isOverridden = (tokenKey: keyof ThemeTokens): boolean => {
    const cssVar = `--${toKebabCase(tokenKey)}`;
    return cssVar in userOverrides;
  };

  // Handle value change
  const handleChange = (tokenKey: keyof ThemeTokens, value: string) => {
    const cssVar = `--${toKebabCase(tokenKey)}`;
    setOverride(cssVar, value);
  };

  // Reset single variable
  const handleReset = (tokenKey: keyof ThemeTokens) => {
    const cssVar = `--${toKebabCase(tokenKey)}`;
    removeOverride(cssVar);
  };

  // Reset all to defaults
  const handleResetAll = () => {
    if (window.confirm('Reset all variables to the original theme defaults?')) {
      resetToDefaults();
    }
  };

  // Toggle group expansion
  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  // Filter variables by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return VARIABLE_GROUPS;
    }

    const query = searchQuery.toLowerCase();
    return VARIABLE_GROUPS.map((group) => ({
      ...group,
      variables: group.variables.filter(
        (v) =>
          v.label.toLowerCase().includes(query) ||
          v.key.toLowerCase().includes(query)
      ),
    })).filter((group) => group.variables.length > 0);
  }, [searchQuery]);

  // Count of overridden variables
  const overrideCount = Object.keys(userOverrides).length;

  return (
    <div className="variable-editor">
      <div className="variable-editor__header">
        <div className="variable-editor__title-row">
          <h2 className="variable-editor__title">
            Edit Theme: {currentTheme.meta.name}
          </h2>
          {overrideCount > 0 && (
            <button
              className="variable-editor__reset-all"
              onClick={handleResetAll}
              type="button"
            >
              Reset to Default ({overrideCount})
            </button>
          )}
        </div>
        <p className="variable-editor__subtitle">
          Customize any CSS variable. Changes are saved per-theme.
        </p>
      </div>

      <div className="variable-editor__search">
        <input
          type="text"
          className="variable-editor__search-input"
          placeholder="Search variables..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="variable-editor__search-clear"
            onClick={() => setSearchQuery('')}
            type="button"
            aria-label="Clear search"
          >
            &times;
          </button>
        )}
      </div>

      <div className="variable-editor__groups">
        {filteredGroups.map((group) => (
          <div key={group.name} className="variable-editor__group">
            <button
              className="variable-editor__group-header"
              onClick={() => toggleGroup(group.name)}
              type="button"
              aria-expanded={expandedGroups.has(group.name)}
            >
              <span className="variable-editor__group-arrow">
                {expandedGroups.has(group.name) ? '▼' : '▶'}
              </span>
              <span className="variable-editor__group-name">{group.name}</span>
              <span className="variable-editor__group-count">
                ({group.variables.length})
              </span>
            </button>

            {expandedGroups.has(group.name) && (
              <div className="variable-editor__group-content">
                {group.variables.map((variable) => {
                  const value = getValue(variable.key as keyof ThemeTokens);
                  const overridden = isOverridden(variable.key as keyof ThemeTokens);

                  return (
                    <div
                      key={variable.key}
                      className={`variable-editor__item ${
                        overridden ? 'variable-editor__item--modified' : ''
                      }`}
                    >
                      <label className="variable-editor__label">
                        {variable.label}
                      </label>

                      <div className="variable-editor__control">
                        {variable.type === 'color' ? (
                          <div className="variable-editor__color-input">
                            <input
                              type="color"
                              value={parseColorValue(value)}
                              onChange={(e) =>
                                handleChange(
                                  variable.key as keyof ThemeTokens,
                                  e.target.value
                                )
                              }
                              className="variable-editor__color-picker"
                            />
                            <input
                              type="text"
                              value={value}
                              onChange={(e) =>
                                handleChange(
                                  variable.key as keyof ThemeTokens,
                                  e.target.value
                                )
                              }
                              className="variable-editor__text-input"
                            />
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={value}
                            onChange={(e) =>
                              handleChange(
                                variable.key as keyof ThemeTokens,
                                e.target.value
                              )
                            }
                            className="variable-editor__text-input variable-editor__text-input--full"
                          />
                        )}

                        {overridden && (
                          <button
                            className="variable-editor__reset-btn"
                            onClick={() =>
                              handleReset(variable.key as keyof ThemeTokens)
                            }
                            type="button"
                            title="Reset to default"
                          >
                            <svg viewBox="0 0 16 16" fill="currentColor">
                              <path d="M11.534 7h3.932a.25.25 0 01.192.41l-1.966 2.36a.25.25 0 01-.384 0l-1.966-2.36a.25.25 0 01.192-.41zm-11 2h3.932a.25.25 0 00.192-.41L2.692 6.23a.25.25 0 00-.384 0L.342 8.59A.25.25 0 00.534 9z"/>
                              <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 11-.771-.636A6.002 6.002 0 0113.917 7H12.9A5.002 5.002 0 008 3zM3.1 9a5.002 5.002 0 008.757 2.182.5.5 0 11.771.636A6.002 6.002 0 012.083 9H3.1z"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="variable-editor__footer">
        <button
          className="variable-editor__btn variable-editor__btn--secondary"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// Helper to parse color value for color picker (handles rgba, etc.)
function parseColorValue(value: string): string {
  // If it's already a hex color, return it
  if (value.startsWith('#') && (value.length === 4 || value.length === 7)) {
    return value;
  }

  // Try to parse rgba to hex
  const rgbaMatch = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]!, 10);
    const g = parseInt(rgbaMatch[2]!, 10);
    const b = parseInt(rgbaMatch[3]!, 10);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // Return a default if unparseable
  return '#888888';
}

export default VariableEditor;
