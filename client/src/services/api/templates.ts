/**
 * Templates API Client
 *
 * API client for filename template operations.
 */

import { API_BASE } from './shared';

// =============================================================================
// Types
// =============================================================================

export interface CharacterReplacementRules {
  colon?: 'dash' | 'underscore' | 'space' | 'remove';
  pipe?: 'dash' | 'underscore' | 'space' | 'remove';
  question?: 'dash' | 'underscore' | 'space' | 'remove';
  asterisk?: 'dash' | 'underscore' | 'space' | 'remove';
  quotes?: 'single' | 'remove';
  slash?: 'dash' | 'underscore' | 'space' | 'remove';
  lt?: 'dash' | 'underscore' | 'space' | 'remove';
  gt?: 'dash' | 'underscore' | 'space' | 'remove';
}

export interface FilenameTemplate {
  id: string;
  libraryId: string | null;
  name: string;
  description: string | null;
  filePattern: string;
  folderSegments: string[];
  characterRules: CharacterReplacementRules;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TokenDefinition {
  name: string;
  description: string;
  category: 'basic' | 'date' | 'creator' | 'content' | 'file' | 'computed';
  example: string;
  supportedModifiers: ('padding' | 'case' | 'truncate')[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PreviewResult {
  result: string;
  type: string;
  hadMissingValues: boolean;
  missingTokens: string[];
  warnings: string[];
}

export interface TemplatePreviewResponse {
  filename: PreviewResult;
  folderSegments: PreviewResult[];
  context: {
    series?: string;
    number?: string;
    title?: string;
    year?: number;
  };
}

export interface CreateTemplateInput {
  libraryId?: string | null;
  name: string;
  description?: string;
  filePattern: string;
  folderSegments?: string[];
  characterRules?: CharacterReplacementRules;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  filePattern?: string;
  folderSegments?: string[];
  characterRules?: CharacterReplacementRules;
  isActive?: boolean;
  sortOrder?: number;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Get all templates.
 */
export async function getTemplates(libraryId?: string | null): Promise<FilenameTemplate[]> {
  const params = new URLSearchParams();
  if (libraryId === null) {
    params.set('libraryId', 'global');
  } else if (libraryId) {
    params.set('libraryId', libraryId);
  }

  const url = `${API_BASE}/templates${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url, { credentials: 'include' });

  if (!response.ok) {
    throw new Error('Failed to fetch templates');
  }

  const data = await response.json();
  return data.templates;
}

/**
 * Get template by ID.
 */
export async function getTemplateById(id: string): Promise<FilenameTemplate> {
  const response = await fetch(`${API_BASE}/templates/${id}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch template');
  }

  const data = await response.json();
  return data.template;
}

/**
 * Get the active template for a scope.
 */
export async function getActiveTemplate(libraryId?: string): Promise<FilenameTemplate> {
  const params = libraryId ? `?libraryId=${libraryId}` : '';
  const response = await fetch(`${API_BASE}/templates/active${params}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch active template');
  }

  const data = await response.json();
  return data.template;
}

/**
 * Get available tokens for autocomplete.
 */
export async function getAvailableTokens(): Promise<{
  tokens: TokenDefinition[];
  byCategory: Record<string, TokenDefinition[]>;
}> {
  const response = await fetch(`${API_BASE}/templates/tokens`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch tokens');
  }

  return response.json();
}

/**
 * Get templates for a specific library.
 */
export async function getTemplatesForLibrary(libraryId: string): Promise<{
  libraryTemplates: FilenameTemplate[];
  globalTemplates: FilenameTemplate[];
  activeTemplate: FilenameTemplate | null;
}> {
  const response = await fetch(`${API_BASE}/templates/library/${libraryId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch library templates');
  }

  return response.json();
}

/**
 * Create a new template.
 */
export async function createTemplate(input: CreateTemplateInput): Promise<FilenameTemplate> {
  const response = await fetch(`${API_BASE}/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create template');
  }

  const data = await response.json();
  return data.template;
}

/**
 * Update an existing template.
 */
export async function updateTemplate(id: string, input: UpdateTemplateInput): Promise<FilenameTemplate> {
  const response = await fetch(`${API_BASE}/templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update template');
  }

  const data = await response.json();
  return data.template;
}

/**
 * Delete a template.
 */
export async function deleteTemplate(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/templates/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete template');
  }
}

/**
 * Set a template as active.
 */
export async function activateTemplate(id: string): Promise<FilenameTemplate> {
  const response = await fetch(`${API_BASE}/templates/${id}/activate`, {
    method: 'PUT',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to activate template');
  }

  const data = await response.json();
  return data.template;
}

/**
 * Validate a template pattern.
 */
export async function validateTemplate(
  filePattern: string,
  folderSegments?: string[]
): Promise<{
  valid: boolean;
  filePattern: ValidationResult;
  folderSegments: Array<{ index: number; segment: string } & ValidationResult>;
}> {
  const response = await fetch(`${API_BASE}/templates/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ filePattern, folderSegments }),
  });

  if (!response.ok) {
    throw new Error('Failed to validate template');
  }

  return response.json();
}

/**
 * Preview a template with sample or real data.
 */
export async function previewTemplate(
  filePattern: string,
  options?: {
    folderSegments?: string[];
    fileId?: string;
    sampleData?: Record<string, unknown>;
  }
): Promise<TemplatePreviewResponse> {
  const response = await fetch(`${API_BASE}/templates/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      filePattern,
      ...options,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to preview template');
  }

  return response.json();
}

/**
 * Duplicate a template.
 */
export async function duplicateTemplate(
  sourceId: string,
  libraryId: string | null,
  name?: string
): Promise<FilenameTemplate> {
  const response = await fetch(`${API_BASE}/templates/${sourceId}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ libraryId, name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to duplicate template');
  }

  const data = await response.json();
  return data.template;
}

/**
 * Reset a library to use global templates.
 */
export async function resetLibraryToGlobal(libraryId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/templates/library/${libraryId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to reset library templates');
  }
}
