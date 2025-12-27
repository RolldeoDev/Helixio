import { useState, useMemo, useCallback } from 'react';
import { useTheme } from '../../themes/ThemeContext';
import { getTheme } from '../../themes';
import { VARIABLE_GROUPS, toKebabCase } from '../../themes/types';
import type { ThemeTokens, ThemeId, EffectToggleDefinition, EffectCategory } from '../../themes/types';
import { RgbaColorPicker } from './RgbaColorPicker';
import { RadiusPicker } from './RadiusPicker';
import { useConfirmModal } from '../ConfirmModal';
import './VariableEditor.css';

interface VariableEditorProps {
  onClose: () => void;
}

// Category display names and order
const EFFECT_CATEGORY_LABELS: Record<EffectCategory, string> = {
  background: 'Background',
  overlay: 'Overlay',
  particles: 'Particles',
  ui: 'UI Elements',
};

const EFFECT_CATEGORY_ORDER: EffectCategory[] = ['background', 'overlay', 'particles', 'ui'];

/**
 * VariableEditor - Full CSS variable editor with collapsible groups and search
 */
export function VariableEditor({ onClose }: VariableEditorProps) {
  const {
    currentTheme,
    editingThemeId,
    colorScheme,
    setOverride,
    removeOverride,
    resetToDefaults,
    getOverridesForTheme,
    getEffectTogglesForTheme,
    setEffectEnabledForTheme,
    setAllEffectsEnabledForTheme,
  } = useTheme();
  const confirm = useConfirmModal();

  // Get the theme being edited (may differ from currently active theme)
  const editingTheme = useMemo(() => {
    if (editingThemeId) {
      const theme = getTheme(editingThemeId as ThemeId, colorScheme);
      if (theme) return theme;
    }
    return currentTheme;
  }, [editingThemeId, colorScheme, currentTheme]);

  // Get overrides for the theme being edited
  const userOverrides = useMemo(() => {
    return getOverridesForTheme(editingTheme.id as ThemeId, colorScheme);
  }, [editingTheme.id, colorScheme, getOverridesForTheme]);

  // Get effect toggles for the theme being edited
  const effectToggles = useMemo(() => {
    return getEffectTogglesForTheme(editingTheme.id as ThemeId, colorScheme);
  }, [editingTheme.id, colorScheme, getEffectTogglesForTheme]);

  // Get available effects for the theme being edited
  const editingThemeEffects = useMemo((): EffectToggleDefinition[] => {
    return editingTheme.effects || [];
  }, [editingTheme.effects]);

  // Group effects by category
  const effectsByCategory = useMemo(() => {
    const categories: Record<EffectCategory, EffectToggleDefinition[]> = {
      background: [],
      overlay: [],
      particles: [],
      ui: [],
    };

    editingThemeEffects.forEach((effect) => {
      const cat = effect.category || 'ui';
      categories[cat].push(effect);
    });

    return categories;
  }, [editingThemeEffects]);

  const hasEffects = editingThemeEffects.length > 0;

  // Effect toggle handlers
  const handleEffectToggle = useCallback((effectId: string, enabled: boolean) => {
    setEffectEnabledForTheme(editingTheme.id as ThemeId, colorScheme, effectId, enabled);
  }, [editingTheme.id, colorScheme, setEffectEnabledForTheme]);

  const handleEnableAllEffects = useCallback(() => {
    setAllEffectsEnabledForTheme(editingTheme.id as ThemeId, colorScheme, true);
  }, [editingTheme.id, colorScheme, setAllEffectsEnabledForTheme]);

  const handleDisableAllEffects = useCallback(() => {
    setAllEffectsEnabledForTheme(editingTheme.id as ThemeId, colorScheme, false);
  }, [editingTheme.id, colorScheme, setAllEffectsEnabledForTheme]);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['Theme Effects', 'Background Colors', 'Primary & Accent Colors'])
  );

  // Get the current value for a variable (override or theme default)
  const getValue = (tokenKey: keyof ThemeTokens): string => {
    const cssVar = `--${toKebabCase(tokenKey)}`;
    if (userOverrides[cssVar]) {
      return userOverrides[cssVar];
    }
    return editingTheme.tokens[tokenKey];
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
  const handleResetAll = async () => {
    const confirmed = await confirm({
      title: 'Reset Theme',
      message: 'Reset all variables to the original theme defaults?',
      confirmText: 'Reset',
      variant: 'warning',
    });
    if (confirmed) {
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
            Edit Theme: {editingTheme.meta.name}
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
        {/* Theme Effects Section */}
        {hasEffects && (
          <div className="variable-editor__group">
            <button
              className="variable-editor__group-header"
              onClick={() => toggleGroup('Theme Effects')}
              type="button"
              aria-expanded={expandedGroups.has('Theme Effects')}
            >
              <span className="variable-editor__group-arrow">
                {expandedGroups.has('Theme Effects') ? '▼' : '▶'}
              </span>
              <span className="variable-editor__group-name">Theme Effects</span>
              <span className="variable-editor__group-count">
                ({editingThemeEffects.length})
              </span>
            </button>

            {expandedGroups.has('Theme Effects') && (
              <div className="variable-editor__group-content">
                {/* Master toggle buttons */}
                <div className="variable-editor__effect-master">
                  <button
                    className="variable-editor__effect-all-btn"
                    onClick={handleEnableAllEffects}
                    type="button"
                  >
                    Enable All
                  </button>
                  <button
                    className="variable-editor__effect-all-btn"
                    onClick={handleDisableAllEffects}
                    type="button"
                  >
                    Disable All
                  </button>
                </div>

                {/* Effect toggles by category */}
                {EFFECT_CATEGORY_ORDER.map((category) => {
                  const effects = effectsByCategory[category];
                  if (effects.length === 0) return null;

                  return (
                    <div key={category} className="variable-editor__effect-category">
                      <span className="variable-editor__effect-category-label">
                        {EFFECT_CATEGORY_LABELS[category]}
                      </span>
                      {effects.map((effect) => (
                        <div key={effect.id} className="variable-editor__effect-item">
                          <label className="variable-editor__effect-toggle">
                            <input
                              type="checkbox"
                              checked={effectToggles[effect.id] ?? false}
                              onChange={(e) => handleEffectToggle(effect.id, e.target.checked)}
                            />
                            <span className="variable-editor__effect-label">
                              {effect.label}
                            </span>
                          </label>
                          {effect.description && (
                            <span className="variable-editor__effect-description">
                              {effect.description}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CSS Variable Groups */}
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
                          <RgbaColorPicker
                            value={value}
                            onChange={(newValue) =>
                              handleChange(
                                variable.key as keyof ThemeTokens,
                                newValue
                              )
                            }
                          />
                        ) : variable.type === 'radius' ? (
                          <RadiusPicker
                            value={value}
                            onChange={(newValue) =>
                              handleChange(
                                variable.key as keyof ThemeTokens,
                                newValue
                              )
                            }
                          />
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

export default VariableEditor;
