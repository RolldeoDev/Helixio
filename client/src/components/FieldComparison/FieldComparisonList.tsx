/**
 * FieldComparisonList Component
 *
 * Container component for a list of FieldComparisonRow components.
 * Provides bulk actions like Select All, Deselect All, etc.
 */

import { useMemo } from 'react';
import { FieldComparisonRow, type FieldDiffStatus } from './FieldComparisonRow';
import './FieldComparison.css';

export interface FieldComparisonItem {
  fieldName: string;
  label: string;
  currentValue: string | number | null;
  proposedValue: string | number | null;
  isSelected: boolean;
  isLocked?: boolean;
  status?: FieldDiffStatus;
  confidence?: number;
  coverPreview?: {
    currentUrl: string | null;
    proposedUrl: string | null;
  };
  formatValue?: (value: string | number | null) => string;
}

export type QuickAction =
  | 'selectAllChanged'
  | 'selectAllEmpty'
  | 'selectAllUnlocked'
  | 'deselectAll';

export interface FieldComparisonListProps {
  fields: FieldComparisonItem[];
  onFieldToggle: (fieldName: string, selected: boolean) => void;
  disabled?: boolean;
  // Which quick actions to show
  quickActions?: QuickAction[];
  onQuickAction?: (action: QuickAction) => void;
  // Optional: show locked fields warning
  showLockedWarning?: boolean;
  lockedCount?: number;
  // Empty state message
  emptyMessage?: string;
}

export function FieldComparisonList({
  fields,
  onFieldToggle,
  disabled = false,
  quickActions = [],
  onQuickAction,
  showLockedWarning = false,
  lockedCount = 0,
  emptyMessage = 'No changes to preview.',
}: FieldComparisonListProps) {
  // Filter out fields with same status (no changes)
  const visibleFields = useMemo(
    () => fields.filter((f) => f.status !== 'same'),
    [fields]
  );

  // Compute quick action button states
  const actionStates = useMemo(() => {
    const states: Record<QuickAction, { enabled: boolean; active: boolean }> = {
      selectAllChanged: { enabled: false, active: false },
      selectAllEmpty: { enabled: false, active: false },
      selectAllUnlocked: { enabled: false, active: false },
      deselectAll: { enabled: false, active: false },
    };

    const changedFields = visibleFields.filter(
      (f) => !f.isLocked && f.status && f.status !== 'same'
    );
    const emptyFields = visibleFields.filter(
      (f) => !f.isLocked && (f.currentValue === null || f.currentValue === '' || f.currentValue === undefined)
    );
    const unlockedFields = visibleFields.filter((f) => !f.isLocked);
    const anySelected = visibleFields.some((f) => f.isSelected);

    states.selectAllChanged.enabled = changedFields.length > 0;
    states.selectAllChanged.active = changedFields.every((f) => f.isSelected);

    states.selectAllEmpty.enabled = emptyFields.length > 0;
    states.selectAllEmpty.active = emptyFields.every((f) => f.isSelected);

    states.selectAllUnlocked.enabled = unlockedFields.length > 0;
    states.selectAllUnlocked.active = unlockedFields.every((f) => f.isSelected);

    states.deselectAll.enabled = anySelected;
    states.deselectAll.active = false;

    return states;
  }, [visibleFields]);

  const handleQuickAction = (action: QuickAction) => {
    if (onQuickAction) {
      onQuickAction(action);
    }
  };

  const getActionLabel = (action: QuickAction): string => {
    switch (action) {
      case 'selectAllChanged':
        return 'Select All Changed';
      case 'selectAllEmpty':
        return 'Select All Empty';
      case 'selectAllUnlocked':
        return 'Select All Unlocked';
      case 'deselectAll':
        return 'Deselect All';
      default:
        return '';
    }
  };

  if (visibleFields.length === 0) {
    return (
      <div className="field-comparison-empty-state">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="field-comparison-list">
      {showLockedWarning && lockedCount > 0 && (
        <div className="field-comparison-locked-warning">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M12 5.333V4a4 4 0 1 0-8 0v1.333M4.667 14.667h6.666a1.333 1.333 0 0 0 1.334-1.334V6.667a1.333 1.333 0 0 0-1.334-1.334H4.667a1.333 1.333 0 0 0-1.334 1.334v6.666a1.333 1.333 0 0 0 1.334 1.334Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            {lockedCount} field{lockedCount !== 1 ? 's' : ''} {lockedCount !== 1 ? 'have' : 'has'} changes but {lockedCount !== 1 ? 'are' : 'is'} locked
          </span>
        </div>
      )}

      {quickActions.length > 0 && (
        <div className="field-comparison-quick-actions">
          {quickActions.map((action, index) => (
            <span key={action}>
              {index > 0 && <span className="field-comparison-separator">|</span>}
              <button
                type="button"
                className={`field-comparison-quick-action ${actionStates[action].active ? 'active' : ''}`}
                onClick={() => handleQuickAction(action)}
                disabled={!actionStates[action].enabled || disabled}
              >
                {getActionLabel(action)}
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="field-comparison-rows">
        {visibleFields.map((field) => (
          <FieldComparisonRow
            key={field.fieldName}
            fieldName={field.fieldName}
            label={field.label}
            currentValue={field.currentValue}
            proposedValue={field.proposedValue}
            isSelected={field.isSelected}
            isLocked={field.isLocked}
            status={field.status}
            confidence={field.confidence}
            onToggle={(selected) => onFieldToggle(field.fieldName, selected)}
            disabled={disabled}
            coverPreview={field.coverPreview}
            formatValue={field.formatValue}
          />
        ))}
      </div>
    </div>
  );
}
