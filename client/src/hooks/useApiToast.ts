/**
 * useApiToast Hook
 *
 * Wraps API calls with automatic toast notifications for success/error feedback.
 * Provides a consistent pattern for operation feedback across the app.
 */

import { useCallback } from 'react';
import { useToast, ToastType } from '../contexts/ToastContext';

interface ApiToastOptions<T> {
  /** Success message or function to generate it from the result */
  successMessage?: string | ((result: T) => string);
  /** Error message or function to generate it from the error */
  errorMessage?: string | ((error: Error) => string);
  /** Toast type for success (defaults to 'success') */
  successType?: ToastType;
}

/**
 * Hook for wrapping API calls with automatic toast notifications.
 *
 * @example
 * // Simple usage with execute()
 * const { execute } = useApiToast();
 * await execute(() => updateProfile(data), 'Profile updated', 'Failed to update');
 *
 * @example
 * // Dynamic messages with withToast()
 * const { withToast } = useApiToast();
 * await withToast(() => clearCache(), {
 *   successMessage: (result) => `Cleared ${result.count} items`,
 *   errorMessage: 'Failed to clear cache'
 * });
 *
 * @example
 * // Direct toast access for non-API operations
 * const { addToast } = useApiToast();
 * addToast('info', 'Processing...');
 */
export function useApiToast() {
  const { addToast } = useToast();

  /**
   * Wraps an async API call with automatic toast notifications.
   * Use this for cases needing dynamic messages or custom options.
   */
  const withToast = useCallback(async <T>(
    apiCall: () => Promise<T>,
    options: ApiToastOptions<T> = {}
  ): Promise<T | undefined> => {
    const { successMessage, errorMessage, successType = 'success' } = options;

    try {
      const result = await apiCall();
      if (successMessage) {
        const message = typeof successMessage === 'function'
          ? successMessage(result)
          : successMessage;
        addToast(successType, message);
      }
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const message = errorMessage
        ? typeof errorMessage === 'function'
          ? errorMessage(error)
          : errorMessage
        : error.message;
      addToast('error', message);
      return undefined;
    }
  }, [addToast]);

  /**
   * Simplified wrapper for common API calls with static messages.
   * Returns undefined on error (error toast shown automatically).
   */
  const execute = useCallback(async <T>(
    apiCall: () => Promise<T>,
    successMsg: string,
    errorMsg?: string
  ): Promise<T | undefined> => {
    return withToast(apiCall, {
      successMessage: successMsg,
      errorMessage: errorMsg,
    });
  }, [withToast]);

  return { withToast, execute, addToast };
}
