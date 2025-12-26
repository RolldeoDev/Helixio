/**
 * GroupSelectCheckbox Component
 *
 * A reusable checkbox for selecting all items within a group (e.g., a series).
 * Shows checked/unchecked/indeterminate state based on selection.
 * Only visible when at least one item in the view is selected.
 */

import { useRef, useEffect, useCallback } from 'react';
import './GroupSelectCheckbox.css';

export interface GroupSelectCheckboxProps {
  /** IDs of all files in this group */
  groupFileIds: string[];
  /** Currently selected file IDs (can be from context or local state) */
  selectedFileIds: Set<string>;
  /** Callback when "select all in group" is triggered */
  onSelectAll: (fileIds: string[]) => void;
  /** Callback when "deselect all in group" is triggered */
  onDeselectAll: (fileIds: string[]) => void;
  /** Whether any file in the entire view is selected (controls visibility) */
  hasAnySelection: boolean;
  /** Optional class name for styling */
  className?: string;
}

export function GroupSelectCheckbox({
  groupFileIds,
  selectedFileIds,
  onSelectAll,
  onDeselectAll,
  hasAnySelection,
  className = '',
}: GroupSelectCheckboxProps) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  // Calculate selection state for this group
  const selectedInGroup = groupFileIds.filter((id) => selectedFileIds.has(id));
  const allSelected = selectedInGroup.length === groupFileIds.length && groupFileIds.length > 0;
  const someSelected = selectedInGroup.length > 0 && selectedInGroup.length < groupFileIds.length;

  // Set indeterminate state (can't be set via attribute)
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (allSelected) {
      onDeselectAll(groupFileIds);
    } else {
      onSelectAll(groupFileIds);
    }
  }, [allSelected, groupFileIds, onSelectAll, onDeselectAll]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Only show when there's any selection in the view
  if (!hasAnySelection) {
    return null;
  }

  return (
    <div
      className={`group-select-checkbox ${className}`}
      onClick={handleClick}
    >
      <input
        ref={checkboxRef}
        type="checkbox"
        checked={allSelected}
        onChange={handleChange}
        title={allSelected ? 'Deselect all in this group' : 'Select all in this group'}
        aria-label={allSelected ? 'Deselect all in this group' : 'Select all in this group'}
      />
    </div>
  );
}
