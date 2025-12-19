/**
 * CoverSizeSlider Component
 *
 * A slider control for adjusting cover card sizes in grid views.
 * Scale 1-10: 1 = very small (~20 per row), 10 = very large (2-3 per row)
 */

import { useCallback } from 'react';
import './CoverSizeSlider.css';

interface CoverSizeSliderProps {
  /** Current size value (1-10) */
  value: number;
  /** Called when size changes */
  onChange: (size: number) => void;
  /** Optional label text */
  label?: string;
  /** Optional class name */
  className?: string;
}

/**
 * Maps slider value (1-10) to card width in pixels
 * 1 = ~60px (very small, ~20 per row on typical screen)
 * 5 = ~160px (medium, default)
 * 10 = ~400px (very large, 2-3 per row)
 */
export function getCoverWidth(sliderValue: number): number {
  // Exponential scale for better distribution
  // Formula: width = 60 + (sliderValue - 1) * (340 / 9) * (sliderValue / 10 + 0.5)
  // This gives more resolution at smaller sizes
  const minWidth = 60;
  const maxWidth = 400;

  // Use a slightly curved progression
  const normalized = (sliderValue - 1) / 9; // 0 to 1
  const curved = Math.pow(normalized, 1.3); // Slight curve for better feel

  return Math.round(minWidth + curved * (maxWidth - minWidth));
}

export function CoverSizeSlider({
  value,
  onChange,
  label = 'Size',
  className = '',
}: CoverSizeSliderProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseInt(e.target.value, 10));
    },
    [onChange]
  );

  const width = getCoverWidth(value);

  return (
    <div className={`cover-size-slider ${className}`.trim()}>
      {label && <span className="cover-size-slider__label">{label}</span>}
      <div className="cover-size-slider__control">
        <svg className="cover-size-slider__icon cover-size-slider__icon--small" viewBox="0 0 16 16" fill="currentColor">
          <rect x="3" y="3" width="4" height="6" rx="0.5" />
          <rect x="9" y="3" width="4" height="6" rx="0.5" />
          <rect x="3" y="10" width="4" height="3" rx="0.5" opacity="0.5" />
          <rect x="9" y="10" width="4" height="3" rx="0.5" opacity="0.5" />
        </svg>
        <input
          type="range"
          min="1"
          max="10"
          value={value}
          onChange={handleChange}
          className="cover-size-slider__input"
          aria-label={`Cover size: ${value}`}
        />
        <svg className="cover-size-slider__icon cover-size-slider__icon--large" viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="2" width="12" height="12" rx="1" />
        </svg>
      </div>
      <span className="cover-size-slider__value">{width}px</span>
    </div>
  );
}
