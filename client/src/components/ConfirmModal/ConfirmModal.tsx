/**
 * ConfirmModal Component
 *
 * A reusable confirmation modal that replaces native window.confirm().
 * Provides consistent styling and better UX across the application.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ConfirmModal.css';

export type ConfirmModalVariant = 'default' | 'danger' | 'warning';

export interface ConfirmModalOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmModalVariant;
}

interface ConfirmModalProps extends ConfirmModalOptions {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title = 'Confirm',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus management - focus cancel button (safer default) when modal opens
  useEffect(() => {
    if (isOpen && cancelButtonRef.current) {
      cancelButtonRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  // Lock body scroll when modal is open
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
      onCancel();
    }
  };

  if (!isOpen) return null;

  const modal = (
    <div className="confirm-modal-overlay" onClick={handleBackdropClick}>
      <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div className="confirm-modal-header">
          <h3 id="confirm-modal-title">{title}</h3>
        </div>
        <div className="confirm-modal-body">
          <p>{message}</p>
        </div>
        <div className="confirm-modal-footer">
          <button
            ref={cancelButtonRef}
            type="button"
            className="confirm-modal-btn confirm-modal-btn-secondary"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={`confirm-modal-btn confirm-modal-btn-${variant === 'default' ? 'primary' : variant}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default ConfirmModal;
