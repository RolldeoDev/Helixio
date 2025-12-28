/**
 * File Naming Settings Component
 *
 * Manage global and library-specific filename templates.
 * Redesigned for better space utilization and UX.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getTemplates,
  getTemplatesForLibrary,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  activateTemplate,
  duplicateTemplate,
  type FilenameTemplate,
  type CharacterReplacementRules,
} from '../../services/api/templates';
import { TemplateEditor } from '../TemplateEditor';
import { useApp } from '../../contexts/AppContext';
import { useApiToast } from '../../hooks';
import { useConfirmModal } from '../ConfirmModal';
import './FileNamingSettings.css';

const DEFAULT_CHARACTER_RULES: CharacterReplacementRules = {
  colon: 'remove',
  pipe: 'remove',
  question: 'remove',
  asterisk: 'remove',
  quotes: 'remove',
  slash: 'remove',
  lt: 'remove',
  gt: 'remove',
};

export function FileNamingSettings() {
  const { libraries } = useApp();
  const { addToast } = useApiToast();
  const confirm = useConfirmModal();

  const [templates, setTemplates] = useState<FilenameTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [selectedLibrary, setSelectedLibrary] = useState<string | null>(null);

  // Template editing state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFilePattern, setEditFilePattern] = useState('');
  const [editFolderSegments, setEditFolderSegments] = useState<string[]>([]);
  const [editCharacterRules, setEditCharacterRules] = useState<CharacterReplacementRules>(DEFAULT_CHARACTER_RULES);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load templates
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      if (selectedLibrary) {
        const data = await getTemplatesForLibrary(selectedLibrary);
        setTemplates([...data.libraryTemplates, ...data.globalTemplates]);
      } else {
        const data = await getTemplates(null);
        setTemplates(data);
      }
    } catch (err) {
      addToast('error', 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [selectedLibrary, addToast]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Auto-select first template or active template
  useEffect(() => {
    if (!loading && templates.length > 0 && !selectedTemplateId && !showNewTemplate) {
      const activeTemplate = templates.find(t => t.isActive);
      const templateToSelect = activeTemplate || templates[0];
      if (templateToSelect) {
        handleSelectTemplate(templateToSelect);
      }
    }
  }, [loading, templates, selectedTemplateId, showNewTemplate]);

  // Select template and populate editor
  const handleSelectTemplate = useCallback((template: FilenameTemplate) => {
    setSelectedTemplateId(template.id);
    setEditName(template.name);
    setEditDescription(template.description || '');
    setEditFilePattern(template.filePattern);
    setEditFolderSegments(template.folderSegments || []);
    setEditCharacterRules(template.characterRules || DEFAULT_CHARACTER_RULES);
    setHasUnsavedChanges(false);
    setShowNewTemplate(false);
  }, []);

  // Reset editor for new template
  const handleNewTemplate = useCallback(() => {
    setSelectedTemplateId(null);
    setEditName('');
    setEditDescription('');
    setEditFilePattern('{Series} - {Type} {Number:000} - {Title} ({Year|}).{Extension}');
    setEditFolderSegments([]);
    setEditCharacterRules(DEFAULT_CHARACTER_RULES);
    setHasUnsavedChanges(false);
    setShowNewTemplate(true);
  }, []);

  // Save template
  const handleSaveTemplate = async () => {
    if (!editName.trim()) {
      addToast('error', 'Template name is required');
      return;
    }
    if (!editFilePattern.trim()) {
      addToast('error', 'File pattern is required');
      return;
    }

    setSaving(true);
    try {
      if (showNewTemplate) {
        const newTemplate = await createTemplate({
          libraryId: selectedLibrary,
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          filePattern: editFilePattern,
          folderSegments: editFolderSegments,
          characterRules: editCharacterRules,
        });
        setSelectedTemplateId(newTemplate.id);
        setShowNewTemplate(false);
        addToast('success', 'Template created successfully');
      } else if (selectedTemplateId) {
        await updateTemplate(selectedTemplateId, {
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          filePattern: editFilePattern,
          folderSegments: editFolderSegments,
          characterRules: editCharacterRules,
        });
        addToast('success', 'Template updated successfully');
      }
      setHasUnsavedChanges(false);
      await loadTemplates();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  // Delete template
  const handleDeleteTemplate = async () => {
    if (!selectedTemplateId) return;

    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) return;

    const confirmed = await confirm({
      title: 'Delete Template',
      message: `Delete template "${template.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
    });

    if (!confirmed) return;

    setSaving(true);
    try {
      await deleteTemplate(selectedTemplateId);
      setSelectedTemplateId(null);
      setShowNewTemplate(false);
      addToast('success', 'Template deleted');
      await loadTemplates();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setSaving(false);
    }
  };

  // Activate template
  const handleActivateTemplate = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSaving(true);
    try {
      await activateTemplate(id);
      addToast('success', 'Template activated');
      await loadTemplates();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to activate template');
    } finally {
      setSaving(false);
    }
  };

  // Duplicate template
  const handleDuplicateTemplate = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSaving(true);
    try {
      const newTemplate = await duplicateTemplate(id, selectedLibrary);
      handleSelectTemplate(newTemplate);
      addToast('success', 'Template duplicated');
      await loadTemplates();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to duplicate template');
    } finally {
      setSaving(false);
    }
  };

  // Track changes
  const handleFilePatternChange = (pattern: string) => {
    setEditFilePattern(pattern);
    setHasUnsavedChanges(true);
  };

  const handleFolderSegmentsChange = (segments: string[]) => {
    setEditFolderSegments(segments);
    setHasUnsavedChanges(true);
  };

  const handleCharacterRulesChange = (rules: CharacterReplacementRules) => {
    setEditCharacterRules(rules);
    setHasUnsavedChanges(true);
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const isLibraryTemplate = selectedTemplate?.libraryId != null;

  return (
    <div className="file-naming-settings">
      {/* Header */}
      <div className="fns-header">
        <div className="fns-header__title">
          <h2>File Naming</h2>
          <p className="fns-header__subtitle">
            Configure how comic files are renamed after metadata is applied
          </p>
        </div>
        <div className="fns-header__scope">
          <label>Scope</label>
          <select
            value={selectedLibrary || 'global'}
            onChange={(e) => setSelectedLibrary(e.target.value === 'global' ? null : e.target.value)}
          >
            <option value="global">All Libraries</option>
            {libraries.map((lib) => (
              <option key={lib.id} value={lib.id}>
                {lib.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Template Tabs */}
      <div className="fns-template-bar">
        <div className="fns-template-tabs">
          {loading ? (
            <div className="fns-template-loading">Loading templates...</div>
          ) : (
            <>
              {templates.map((template) => (
                <button
                  key={template.id}
                  className={`fns-template-tab ${selectedTemplateId === template.id ? 'active' : ''} ${template.isActive ? 'is-active' : ''}`}
                  onClick={() => handleSelectTemplate(template)}
                >
                  <span className="fns-template-tab__name">{template.name}</span>
                  {template.isActive && (
                    <span className="fns-template-tab__badge">Active</span>
                  )}
                  {template.libraryId && (
                    <span className="fns-template-tab__badge fns-template-tab__badge--library">Library</span>
                  )}
                </button>
              ))}
              {showNewTemplate && (
                <button className="fns-template-tab active new">
                  <span className="fns-template-tab__name">New Template</span>
                </button>
              )}
            </>
          )}
        </div>
        <button
          className="fns-add-template"
          onClick={handleNewTemplate}
          title="Create new template"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          New
        </button>
      </div>

      {/* Main Content */}
      {(selectedTemplateId || showNewTemplate) && (
        <div className="fns-content">
          {/* Template Meta */}
          <div className="fns-meta">
            <div className="fns-meta__field fns-meta__field--name">
              <label>Template Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => {
                  setEditName(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="My Custom Template"
              />
            </div>
            <div className="fns-meta__field fns-meta__field--desc">
              <label>Description</label>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => {
                  setEditDescription(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="Optional description for this template"
              />
            </div>
          </div>

          {/* Editor */}
          <TemplateEditor
            filePattern={editFilePattern}
            folderSegments={editFolderSegments}
            characterRules={editCharacterRules}
            onFilePatternChange={handleFilePatternChange}
            onFolderSegmentsChange={handleFolderSegmentsChange}
            onCharacterRulesChange={handleCharacterRulesChange}
          />

          {/* Actions */}
          <div className="fns-actions">
            <div className="fns-actions__left">
              {isLibraryTemplate && (
                <span className="fns-scope-badge">
                  Library-specific template
                </span>
              )}
            </div>
            <div className="fns-actions__right">
              {selectedTemplateId && !selectedTemplate?.isActive && (
                <button
                  className="fns-btn fns-btn--secondary"
                  onClick={(e) => handleActivateTemplate(selectedTemplateId, e)}
                  disabled={saving}
                >
                  Set as Active
                </button>
              )}
              {selectedTemplateId && (
                <button
                  className="fns-btn fns-btn--secondary"
                  onClick={(e) => handleDuplicateTemplate(selectedTemplateId, e)}
                  disabled={saving}
                >
                  Duplicate
                </button>
              )}
              {showNewTemplate && (
                <button
                  className="fns-btn fns-btn--ghost"
                  onClick={() => {
                    setShowNewTemplate(false);
                    setHasUnsavedChanges(false);
                    const firstTemplate = templates[0];
                    if (firstTemplate) {
                      handleSelectTemplate(firstTemplate);
                    }
                  }}
                >
                  Cancel
                </button>
              )}
              {selectedTemplateId && (
                <button
                  className="fns-btn fns-btn--danger"
                  onClick={handleDeleteTemplate}
                  disabled={saving}
                >
                  Delete
                </button>
              )}
              <button
                className="fns-btn fns-btn--primary"
                onClick={handleSaveTemplate}
                disabled={saving || !hasUnsavedChanges}
              >
                {saving ? 'Saving...' : showNewTemplate ? 'Create Template' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && templates.length === 0 && !showNewTemplate && (
        <div className="fns-empty">
          <div className="fns-empty__icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="8" y="12" width="32" height="24" rx="2" stroke="currentColor" strokeWidth="2"/>
              <path d="M8 18h32" stroke="currentColor" strokeWidth="2"/>
              <path d="M14 24h12M14 28h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <p>No templates found</p>
          <button className="fns-btn fns-btn--primary" onClick={handleNewTemplate}>
            Create Your First Template
          </button>
        </div>
      )}
    </div>
  );
}
