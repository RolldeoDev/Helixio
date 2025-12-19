/**
 * Reading Status Badge Component
 *
 * Visual indicators for reading status:
 * - Unread
 * - Reading (in progress)
 * - Completed
 * - On Hold
 * - Dropped
 */

import { useMemo } from 'react';
import './ReadingStatus.css';

// =============================================================================
// Types
// =============================================================================

export type ReadingStatus = 'unread' | 'reading' | 'completed' | 'on_hold' | 'dropped';

interface ReadingStatusBadgeProps {
  status: ReadingStatus;
  progress?: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

// =============================================================================
// Status Configuration
// =============================================================================

const STATUS_CONFIG: Record<ReadingStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}> = {
  unread: {
    label: 'Unread',
    color: 'var(--color-text-muted, #888)',
    bgColor: 'var(--color-bg-tertiary, #333)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  reading: {
    label: 'Reading',
    color: 'var(--color-accent, #3b82f6)',
    bgColor: 'rgba(59, 130, 246, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  completed: {
    label: 'Completed',
    color: 'var(--color-success, #22c55e)',
    bgColor: 'rgba(34, 197, 94, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
  on_hold: {
    label: 'On Hold',
    color: 'var(--color-warning, #f59e0b)',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="10" y1="15" x2="10" y2="9" />
        <line x1="14" y1="15" x2="14" y2="9" />
      </svg>
    ),
  },
  dropped: {
    label: 'Dropped',
    color: 'var(--color-error, #ef4444)',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
};

// =============================================================================
// Component
// =============================================================================

export function ReadingStatusBadge({
  status,
  progress,
  size = 'md',
  showLabel = false,
  onClick,
}: ReadingStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  const sizeClasses = {
    sm: 'rs-badge-sm',
    md: 'rs-badge-md',
    lg: 'rs-badge-lg',
  };

  return (
    <button
      className={`rs-badge ${sizeClasses[size]} ${onClick ? 'clickable' : ''}`}
      style={{
        '--rs-color': config.color,
        '--rs-bg': config.bgColor,
      } as React.CSSProperties}
      onClick={onClick}
      title={config.label}
      disabled={!onClick}
    >
      <span className="rs-badge-icon">{config.icon}</span>
      {showLabel && <span className="rs-badge-label">{config.label}</span>}
      {status === 'reading' && progress !== undefined && (
        <span className="rs-badge-progress">{Math.round(progress)}%</span>
      )}
    </button>
  );
}

// =============================================================================
// Status Picker Component
// =============================================================================

interface ReadingStatusPickerProps {
  currentStatus: ReadingStatus;
  onStatusChange: (status: ReadingStatus) => void;
  className?: string;
}

export function ReadingStatusPicker({
  currentStatus,
  onStatusChange,
  className = '',
}: ReadingStatusPickerProps) {
  const statuses: ReadingStatus[] = ['unread', 'reading', 'completed', 'on_hold', 'dropped'];

  return (
    <div className={`rs-picker ${className}`}>
      {statuses.map((status) => {
        const config = STATUS_CONFIG[status];
        return (
          <button
            key={status}
            className={`rs-picker-option ${status === currentStatus ? 'active' : ''}`}
            style={{
              '--rs-color': config.color,
              '--rs-bg': config.bgColor,
            } as React.CSSProperties}
            onClick={() => onStatusChange(status)}
            title={config.label}
          >
            <span className="rs-picker-icon">{config.icon}</span>
            <span className="rs-picker-label">{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// Helper Hook
// =============================================================================

export function useReadingStatus(
  currentPage: number,
  totalPages: number,
  completed: boolean
): { status: ReadingStatus; progress: number } {
  return useMemo(() => {
    const progress = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;

    if (completed) {
      return { status: 'completed', progress: 100 };
    }
    if (currentPage > 0) {
      return { status: 'reading', progress };
    }
    return { status: 'unread', progress: 0 };
  }, [currentPage, totalPages, completed]);
}
