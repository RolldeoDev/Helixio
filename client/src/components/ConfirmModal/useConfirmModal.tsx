/**
 * useConfirmModal Hook
 *
 * Provides a promise-based API for showing confirmation modals.
 * Usage:
 *   const confirm = useConfirmModal();
 *   const result = await confirm({ message: 'Delete this item?' });
 *   if (result) { ... }
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ConfirmModal, ConfirmModalOptions } from './ConfirmModal';

interface ConfirmModalContextValue {
  confirm: (options: ConfirmModalOptions) => Promise<boolean>;
}

const ConfirmModalContext = createContext<ConfirmModalContextValue | null>(null);

interface PendingConfirmation extends ConfirmModalOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmModalProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const confirm = useCallback((options: ConfirmModalOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (pending) {
      pending.resolve(true);
      setPending(null);
    }
  }, [pending]);

  const handleCancel = useCallback(() => {
    if (pending) {
      pending.resolve(false);
      setPending(null);
    }
  }, [pending]);

  return (
    <ConfirmModalContext.Provider value={{ confirm }}>
      {children}
      <ConfirmModal
        isOpen={pending !== null}
        title={pending?.title}
        message={pending?.message || ''}
        confirmText={pending?.confirmText}
        cancelText={pending?.cancelText}
        variant={pending?.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmModalContext.Provider>
  );
}

export function useConfirmModal(): (options: ConfirmModalOptions) => Promise<boolean> {
  const context = useContext(ConfirmModalContext);
  if (!context) {
    throw new Error('useConfirmModal must be used within a ConfirmModalProvider');
  }
  return context.confirm;
}

export default useConfirmModal;
