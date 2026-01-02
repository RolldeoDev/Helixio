/**
 * Toast Context
 *
 * Provides general toast notification functionality across the app.
 * Used for success, error, and info messages for bulk operations, etc.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  timestamp: number;
  action?: ToastAction;
}

export interface ToastContextType {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, action?: ToastAction) => void;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

// How long to show each toast (5 seconds)
const TOAST_DURATION = 5000;

// Maximum toasts to show at once
const MAX_TOASTS = 5;

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Add a new toast
  const addToast = useCallback((type: ToastType, message: string, action?: ToastAction) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newToast: Toast = {
      id,
      type,
      message,
      timestamp: Date.now(),
      action,
    };

    setToasts(prev => [...prev, newToast].slice(-MAX_TOASTS));

    // Auto-dismiss after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, TOAST_DURATION);
  }, []);

  // Dismiss a single toast
  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Dismiss all toasts
  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, dismissToast, dismissAll }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
