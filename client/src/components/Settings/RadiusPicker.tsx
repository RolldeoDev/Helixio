import { useState, useEffect, useCallback, useMemo } from 'react';
import './RadiusPicker.css';

interface RadiusPickerProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * RadiusPicker - Border radius picker with visual preview and presets
 * Supports px, rem, em, %, and special values like "9999px" for pill shapes
 */
export function RadiusPicker({ value, onChange }: RadiusPickerProps) {
  const [numericValue, setNumericValue] = useState(() => parseRadius(value).value);
  const [unit, setUnit] = useState(() => parseRadius(value).unit);

  // Sync with external value changes
  useEffect(() => {
    const parsed = parseRadius(value);
    setNumericValue(parsed.value);
    setUnit(parsed.unit);
  }, [value]);

  // Emit change
  const emitChange = useCallback(
    (newValue: number, newUnit: string) => {
      if (newUnit === 'full') {
        onChange('9999px');
      } else {
        onChange(`${newValue}${newUnit}`);
      }
    },
    [onChange]
  );

  // Handle numeric value change
  const handleValueChange = (newValue: number) => {
    setNumericValue(newValue);
    emitChange(newValue, unit);
  };

  // Handle unit change
  const handleUnitChange = (newUnit: string) => {
    setUnit(newUnit);
    if (newUnit === 'full') {
      onChange('9999px');
    } else {
      emitChange(numericValue, newUnit);
    }
  };

  // Quick presets
  const presets = useMemo(
    () => [
      { label: 'None', value: '0px' },
      { label: 'Sm', value: '4px' },
      { label: 'Md', value: '8px' },
      { label: 'Lg', value: '12px' },
      { label: 'Xl', value: '16px' },
      { label: 'Full', value: '9999px' },
    ],
    []
  );

  // Check if current value matches a preset
  const activePreset = presets.find((p) => p.value === value);

  // Display value for the input
  const displayValue = unit === 'full' ? '9999px' : `${numericValue}${unit}`;

  // Max slider value based on unit
  const getMaxValue = () => {
    switch (unit) {
      case 'rem':
      case 'em':
        return 4;
      case '%':
        return 50;
      default:
        return 32;
    }
  };

  return (
    <div className="radius-picker">
      {/* Visual preview */}
      <div className="radius-picker__preview">
        <div
          className="radius-picker__preview-box"
          style={{ borderRadius: displayValue }}
        />
      </div>

      {/* Controls */}
      <div className="radius-picker__controls">
        {/* Presets */}
        <div className="radius-picker__presets">
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={`radius-picker__preset ${
                activePreset?.value === preset.value ? 'radius-picker__preset--active' : ''
              }`}
              onClick={() => onChange(preset.value)}
              title={preset.value}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Slider and input */}
        <div className="radius-picker__input-row">
          <input
            type="range"
            className="radius-picker__slider"
            min="0"
            max={getMaxValue()}
            step={unit === 'rem' || unit === 'em' ? 0.125 : 1}
            value={unit === 'full' ? getMaxValue() : numericValue}
            onChange={(e) => handleValueChange(Number(e.target.value))}
            disabled={unit === 'full'}
          />

          <input
            type="number"
            className="radius-picker__number"
            min="0"
            step={unit === 'rem' || unit === 'em' ? 0.125 : 1}
            value={unit === 'full' ? 9999 : numericValue}
            onChange={(e) => handleValueChange(Number(e.target.value))}
            disabled={unit === 'full'}
          />

          <select
            className="radius-picker__unit"
            value={unit}
            onChange={(e) => handleUnitChange(e.target.value)}
          >
            <option value="px">px</option>
            <option value="rem">rem</option>
            <option value="em">em</option>
            <option value="%">%</option>
            <option value="full">full</option>
          </select>
        </div>

        {/* Text input for custom values */}
        <input
          type="text"
          className="radius-picker__text"
          value={displayValue}
          onChange={(e) => {
            const parsed = parseRadius(e.target.value);
            if (parsed.value >= 0) {
              setNumericValue(parsed.value);
              setUnit(parsed.unit);
              onChange(e.target.value);
            }
          }}
          placeholder="e.g., 8px, 0.5rem, 50%"
        />
      </div>
    </div>
  );
}

/**
 * Parse a radius value string into numeric value and unit
 */
function parseRadius(value: string): { value: number; unit: string } {
  if (!value) return { value: 0, unit: 'px' };

  const trimmed = value.trim().toLowerCase();

  // Handle "full" / pill radius
  if (trimmed === '9999px' || trimmed === 'full' || trimmed === '100%') {
    return { value: 9999, unit: 'full' };
  }

  // Match number + unit
  const match = trimmed.match(/^([\d.]+)(px|rem|em|%)?$/);
  if (match) {
    return {
      value: parseFloat(match[1]!) || 0,
      unit: match[2] || 'px',
    };
  }

  return { value: 0, unit: 'px' };
}

export default RadiusPicker;
