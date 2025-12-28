import React, { useState, useCallback } from 'react';
import './RatingStars.css';

export interface RatingStarsProps {
  /** Current rating value (1-5) or null for unrated */
  value: number | null;
  /** Callback when rating changes */
  onChange?: (value: number | null) => void;
  /** Whether the rating is read-only */
  readonly?: boolean;
  /** Size variant */
  size?: 'small' | 'default' | 'large';
  /** Show empty stars when unrated */
  showEmpty?: boolean;
  /** Show rating number next to stars */
  showValue?: boolean;
  /** Allow clearing rating by clicking active star */
  allowClear?: boolean;
  /** Label for screen readers */
  ariaLabel?: string;
  /** Additional class name */
  className?: string;
}

/**
 * Star rating component with 1-5 scale.
 *
 * Features:
 * - Hover preview for interactive mode
 * - Keyboard accessible (arrow keys, enter)
 * - Customizable size
 * - Optional value display
 * - Clear functionality
 */
export function RatingStars({
  value,
  onChange,
  readonly = false,
  size = 'default',
  showEmpty = true,
  showValue = false,
  allowClear = true,
  ariaLabel = 'Rating',
  className = '',
}: RatingStarsProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const isInteractive = !readonly && onChange;
  const displayValue = hoverValue ?? value;

  const handleStarClick = useCallback(
    (starValue: number) => {
      if (!isInteractive) return;

      // If clicking on the current value and allowClear is true, clear the rating
      if (value === starValue && allowClear) {
        onChange(null);
      } else {
        onChange(starValue);
      }
    },
    [isInteractive, value, allowClear, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isInteractive) return;

      const currentValue = value ?? 0;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          e.preventDefault();
          if (currentValue < 5) {
            onChange(currentValue + 1);
          }
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          e.preventDefault();
          if (currentValue > 1) {
            onChange(currentValue - 1);
          } else if (allowClear && currentValue === 1) {
            onChange(null);
          }
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          // If no value, set to 1; if value exists and allowClear, clear
          if (value === null) {
            onChange(1);
          } else if (allowClear) {
            onChange(null);
          }
          break;
        case 'Backspace':
        case 'Delete':
          if (allowClear) {
            e.preventDefault();
            onChange(null);
          }
          break;
      }
    },
    [isInteractive, value, allowClear, onChange]
  );

  const handleMouseEnter = (starValue: number) => {
    if (isInteractive) {
      setHoverValue(starValue);
    }
  };

  const handleMouseLeave = () => {
    setHoverValue(null);
  };

  const renderStar = (index: number) => {
    const starValue = index + 1;
    const isFilled = displayValue !== null && starValue <= displayValue;
    const isHovered = hoverValue !== null && starValue <= hoverValue;

    return (
      <span
        key={starValue}
        className={`
          rating-star
          ${isFilled ? 'rating-star-filled' : 'rating-star-empty'}
          ${isHovered ? 'rating-star-hovered' : ''}
          ${isInteractive ? 'rating-star-interactive' : ''}
        `.trim().replace(/\s+/g, ' ')}
        onClick={() => handleStarClick(starValue)}
        onMouseEnter={() => handleMouseEnter(starValue)}
        onMouseLeave={handleMouseLeave}
        data-value={starValue}
      >
        {isFilled ? '★' : '☆'}
      </span>
    );
  };

  // Don't render anything if unrated and showEmpty is false
  if (value === null && !showEmpty && !isInteractive) {
    return null;
  }

  return (
    <div
      className={`
        rating-stars
        rating-stars-${size}
        ${isInteractive ? 'rating-stars-interactive' : 'rating-stars-readonly'}
        ${isFocused ? 'rating-stars-focused' : ''}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      role={isInteractive ? 'slider' : 'img'}
      aria-label={ariaLabel}
      aria-valuemin={1}
      aria-valuemax={5}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value ? `${value} out of 5 stars` : 'Not rated'}
      tabIndex={isInteractive ? 0 : -1}
      onKeyDown={handleKeyDown}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      <span className="rating-stars-container" onMouseLeave={handleMouseLeave}>
        {[0, 1, 2, 3, 4].map(renderStar)}
      </span>
      {showValue && value !== null && (
        <span className="rating-value">{value.toFixed(1)}</span>
      )}
    </div>
  );
}

export default RatingStars;
