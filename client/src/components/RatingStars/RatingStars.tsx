import { useState, useCallback, KeyboardEvent, MouseEvent } from 'react';
import './RatingStars.css';

export interface RatingStarsProps {
  /** Current rating value (0.5-5.0 in 0.5 increments) or null for unrated */
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
 * Star rating component with 0.5-5.0 scale (half-star precision).
 *
 * Features:
 * - Click zones: left half of star = X.5, right half = X.0
 * - Hover preview with half-star precision
 * - Keyboard accessible (arrow keys in 0.5 increments)
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

  /**
   * Handle star click with zone detection.
   * Left half of star = index + 0.5
   * Right half of star = index + 1.0
   */
  const handleStarClick = useCallback(
    (index: number, event: MouseEvent<HTMLSpanElement>) => {
      if (!isInteractive) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const isLeftHalf = clickX < rect.width / 2;

      // Star 0: left=0.5, right=1.0; Star 1: left=1.5, right=2.0; etc.
      const newRating = isLeftHalf ? index + 0.5 : index + 1;

      // If clicking on the current value and allowClear is true, clear the rating
      if (value === newRating && allowClear) {
        onChange(null);
      } else {
        onChange(newRating);
      }
    },
    [isInteractive, value, allowClear, onChange]
  );

  /**
   * Handle mouse move for hover preview with half-star precision.
   */
  const handleMouseMove = useCallback(
    (index: number, event: MouseEvent<HTMLSpanElement>) => {
      if (!isInteractive) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const isLeftHalf = mouseX < rect.width / 2;

      setHoverValue(isLeftHalf ? index + 0.5 : index + 1);
    },
    [isInteractive]
  );

  /**
   * Handle keyboard navigation in 0.5 increments.
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!isInteractive) return;

      const currentValue = value ?? 0;
      const step = 0.5;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          e.preventDefault();
          if (currentValue < 5) {
            onChange(Math.min(currentValue + step, 5));
          }
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          e.preventDefault();
          if (currentValue > 0.5) {
            onChange(currentValue - step);
          } else if (allowClear && currentValue === 0.5) {
            onChange(null);
          }
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          // If no value, set to 0.5; if value exists and allowClear, clear
          if (value === null) {
            onChange(0.5);
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

  const handleMouseLeave = () => {
    setHoverValue(null);
  };

  /**
   * Render a star with half-fill support.
   * Uses overlay technique: background star (empty) + foreground star (filled) with width control.
   */
  const renderStar = (index: number) => {
    const starMinValue = index + 0.5; // Half threshold
    const starFullValue = index + 1; // Full threshold

    // Determine fill state based on display value (hover or actual)
    let fillState: 'empty' | 'half' | 'full' = 'empty';
    if (displayValue !== null) {
      if (displayValue >= starFullValue) {
        fillState = 'full';
      } else if (displayValue >= starMinValue) {
        fillState = 'half';
      }
    }

    const isHovered = hoverValue !== null && hoverValue >= starMinValue;

    return (
      <span
        key={index}
        className={`
          rating-star
          rating-star-${fillState}
          ${isHovered ? 'rating-star-hovered' : ''}
          ${isInteractive ? 'rating-star-interactive' : ''}
        `.trim().replace(/\s+/g, ' ')}
        onClick={(e) => handleStarClick(index, e)}
        onMouseMove={(e) => handleMouseMove(index, e)}
        onMouseLeave={handleMouseLeave}
        data-value={index + 1}
      >
        <span className="star-background">☆</span>
        <span className="star-fill">★</span>
      </span>
    );
  };

  /**
   * Format value for screen readers (e.g., "3 and a half" for 3.5).
   */
  const getAriaValueText = (val: number | null): string => {
    if (val === null) return 'Not rated';
    const whole = Math.floor(val);
    const hasHalf = (val % 1) >= 0.5;
    if (hasHalf) {
      return whole === 0
        ? 'half star out of 5 stars'
        : `${whole} and a half stars out of 5 stars`;
    }
    return `${whole} ${whole === 1 ? 'star' : 'stars'} out of 5 stars`;
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
      aria-valuemin={0.5}
      aria-valuemax={5}
      aria-valuenow={value ?? undefined}
      aria-valuetext={getAriaValueText(value)}
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
