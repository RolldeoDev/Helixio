/**
 * External Theme Loader
 * Handles loading themes from ~/.helixio/themes/ with hot reload via SSE
 */

import type { ExternalTheme, ColorScheme } from './types';

const API_BASE = '/api/themes';

/**
 * Load all external themes from the server
 */
export async function loadExternalThemes(): Promise<ExternalTheme[]> {
  try {
    const response = await fetch(`${API_BASE}/external`);
    if (!response.ok) {
      throw new Error('Failed to load external themes');
    }
    return response.json();
  } catch (error) {
    console.warn('External themes not available:', error);
    return [];
  }
}

/**
 * Subscribe to theme file changes via Server-Sent Events
 * Returns an unsubscribe function
 */
export function subscribeToThemeChanges(
  callback: (themes: ExternalTheme[]) => void
): () => void {
  let eventSource: EventSource | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let isClosing = false;

  const connect = () => {
    if (isClosing) return;

    try {
      eventSource = new EventSource(`${API_BASE}/watch`);

      eventSource.onmessage = (event) => {
        try {
          const themes = JSON.parse(event.data);
          callback(themes);
        } catch (e) {
          console.warn('Failed to parse theme update:', e);
        }
      };

      eventSource.onerror = () => {
        if (isClosing) return;

        eventSource?.close();
        eventSource = null;

        // Attempt to reconnect after a delay
        reconnectTimeout = setTimeout(connect, 5000);
      };

      eventSource.onopen = () => {
        console.log('Theme hot reload connected');
      };
    } catch (e) {
      console.warn('Failed to connect to theme hot reload:', e);
    }
  };

  connect();

  // Return unsubscribe function
  return () => {
    isClosing = true;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    eventSource?.close();
  };
}

/**
 * Delete an external theme
 */
export async function deleteExternalTheme(themeId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/external/${encodeURIComponent(themeId)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete theme');
  }
}

/**
 * Import a theme from a zip file
 */
export async function importThemeZip(file: File): Promise<{ themeId: string }> {
  const formData = new FormData();
  formData.append('theme', file);

  const response = await fetch(`${API_BASE}/import`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to import theme' }));
    throw new Error(error.error || 'Failed to import theme');
  }

  return response.json();
}

/**
 * Parse theme metadata from CSS comments
 */
export function parseThemeCSS(css: string): {
  name?: string;
  description?: string;
  scheme?: ColorScheme;
  author?: string;
} {
  const nameMatch = css.match(/@theme-name:\s*(.+)/i) || css.match(/Theme:\s*(.+)/i);
  const descMatch = css.match(/@theme-description:\s*(.+)/i);
  const schemeMatch = css.match(/@theme-scheme:\s*(light|dark)/i) || css.match(/Scheme:\s*(light|dark)/i);
  const authorMatch = css.match(/@theme-author:\s*(.+)/i);

  return {
    name: nameMatch?.[1]?.trim(),
    description: descMatch?.[1]?.trim(),
    scheme: schemeMatch?.[1]?.toLowerCase() as ColorScheme | undefined,
    author: authorMatch?.[1]?.trim(),
  };
}
