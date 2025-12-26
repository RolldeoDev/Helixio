import React, { useId } from 'react';
import './ToggleSwitch.css';

export interface ToggleSwitchProps {
  /** Current checked state */
  checked: boolean;
  /** Callback when toggle state changes */
  onChange: (checked: boolean) => void;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: 'small' | 'default';
  /** Label text displayed next to toggle */
  label?: string;
  /** Description text displayed below label */
  description?: string;
  /** Optional id for the input element */
  id?: string;
  /** Additional class name for the container */
  className?: string;
}

/**
 * Premium iOS-style toggle switch component
 *
 * Can be used standalone or with label/description in a setting row layout.
 * Features smooth animations, proper accessibility, and refined micro-interactions.
 */
export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  size = 'default',
  label,
  description,
  id,
  className = '',
}: ToggleSwitchProps) {
  // Generate a unique ID if none provided
  const generatedId = useId();
  const inputId = id || generatedId;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onChange(e.target.checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabled) {
        onChange(!checked);
      }
    }
  };

  // Build toggle switch element
  const toggleElement = (
    <label
      className={`
        toggle-switch
        ${size === 'small' ? 'toggle-small' : ''}
        ${disabled ? 'toggle-disabled' : ''}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      <input
        type="checkbox"
        id={inputId}
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        aria-describedby={description ? `${inputId}-desc` : undefined}
      />
      <span className="toggle-track" onKeyDown={handleKeyDown} tabIndex={-1}>
        <span className="toggle-knob" />
      </span>
    </label>
  );

  // If no label, return just the toggle
  if (!label) {
    return toggleElement;
  }

  // With label/description, wrap in setting row layout
  return (
    <div
      className={`
        toggle-setting-row
        ${disabled ? 'toggle-row-disabled' : ''}
      `.trim().replace(/\s+/g, ' ')}
    >
      <div className="toggle-content">
        <label htmlFor={inputId} className="toggle-label">
          {label}
        </label>
        {description && (
          <p id={`${inputId}-desc`} className="toggle-description">
            {description}
          </p>
        )}
      </div>
      {toggleElement}
    </div>
  );
}

export default ToggleSwitch;
