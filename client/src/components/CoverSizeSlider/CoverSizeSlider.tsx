/**
 * CoverSizeSlider Component
 *
 * A slider control for adjusting cover card sizes in grid views.
 * Scale 1-10: 1 = largest covers (2-3 per row), 10 = smallest covers (~15 per row)
 *
 * The slider controls "density" - the actual cover size is calculated to
 * fill the available container width exactly, maximizing space usage.
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
 * Maps slider value (1-10) to a target card width in pixels.
 * This is used as a reference size - actual sizes are calculated
 * dynamically to fill available width.
 *
 * 1 = ~350px (very large, 2-3 per row)
 * 5 = ~160px (medium, default)
 * 10 = ~80px (small, many per row)
 *
 * @deprecated Use calculateOptimalItemWidth from useOptimalGridSize instead
 * for actual sizing. This function is kept for backward compatibility.
 */
export function getCoverWidth(sliderValue: number): number {
  // Inverted scale: 1 = largest, 10 = smallest
  const minWidth = 80;
  const maxWidth = 350;

  // Invert the slider value for intuitive sizing (left = large, right = small)
  const inverted = 11 - sliderValue; // Convert 1-10 to 10-1
  const normalized = (inverted - 1) / 9; // 0 to 1
  const curved = Math.pow(normalized, 1.3); // Slight curve for better feel

  return Math.round(minWidth + curved * (maxWidth - minWidth));
}

/**
 * Get size label for display based on slider value
 */
function getSizeLabel(value: number): string {
  if (value <= 2) return 'XL';
  if (value <= 4) return 'L';
  if (value <= 6) return 'M';
  if (value <= 8) return 'S';
  return 'XS';
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

  const sizeLabel = getSizeLabel(value);

  return (
    <div className={`cover-size-slider ${className}`.trim()}>
      {label && <span className="cover-size-slider__label">{label}</span>}
      <div className="cover-size-slider__control">
        <svg className="cover-size-slider__icon cover-size-slider__icon--large" viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="2" width="12" height="12" rx="1" />
        </svg>
        <input
          type="range"
          min="1"
          max="10"
          value={value}
          onChange={handleChange}
          className="cover-size-slider__input"
          aria-label={`Cover size: ${sizeLabel}`}
        />
        <svg className="cover-size-slider__icon cover-size-slider__icon--small" viewBox="0 0 16 16" fill="currentColor">
          <rect x="3" y="3" width="4" height="6" rx="0.5" />
          <rect x="9" y="3" width="4" height="6" rx="0.5" />
          <rect x="3" y="10" width="4" height="3" rx="0.5" opacity="0.5" />
          <rect x="9" y="10" width="4" height="3" rx="0.5" opacity="0.5" />
        </svg>
      </div>
      <span className="cover-size-slider__value">{sizeLabel}</span>
    </div>
  );
}
