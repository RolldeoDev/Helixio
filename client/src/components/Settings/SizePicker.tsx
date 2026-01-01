import { useState, useEffect, useCallback, useMemo } from 'react';
import './SizePicker.css';

interface SizePickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Type of size for context-aware presets and limits */
  sizeType?: 'spacing' | 'fontSize' | 'generic';
}

interface ParsedSize {
  value: number;
  unit: string;
}

// Presets for different size types
const PRESETS: Record<string, Array<{ label: string; value: string }>> = {
  spacing: [
    { label: '0', value: '0px' },
    { label: '2', value: '2px' },
    { label: '4', value: '4px' },
    { label: '8', value: '8px' },
    { label: '16', value: '16px' },
    { label: '24', value: '24px' },
    { label: '32', value: '32px' },
    { label: '48', value: '48px' },
  ],
  fontSize: [
    { label: 'XS', value: '0.75rem' },
    { label: 'SM', value: '0.875rem' },
    { label: 'Base', value: '1rem' },
    { label: 'LG', value: '1.125rem' },
    { label: 'XL', value: '1.25rem' },
    { label: '2XL', value: '1.5rem' },
    { label: '3XL', value: '1.875rem' },
    { label: '4XL', value: '2.25rem' },
  ],
  generic: [
    { label: '0', value: '0' },
    { label: '4', value: '4px' },
    { label: '8', value: '8px' },
    { label: '16', value: '16px' },
    { label: '1rem', value: '1rem' },
    { label: '2rem', value: '2rem' },
  ],
};

// Max slider values based on unit
const MAX_VALUES: Record<string, number> = {
  px: 64,
  rem: 4,
  em: 4,
  '%': 100,
};

/**
 * SizePicker - Size picker with slider, numeric input, and unit selector
 */
export function SizePicker({ value, onChange, sizeType = 'generic' }: SizePickerProps) {
  const [parsed, setParsed] = useState<ParsedSize>(() => parseSize(value));
  const [textValue, setTextValue] = useState(value);

  // Sync with external value changes
  useEffect(() => {
    const newParsed = parseSize(value);
    setParsed(newParsed);
    setTextValue(value);
  }, [value]);

  // Emit change
  const emitChange = useCallback(
    (newValue: number, newUnit: string) => {
      const formatted = formatSize(newValue, newUnit);
      setTextValue(formatted);
      onChange(formatted);
    },
    [onChange]
  );

  // Handle numeric value change
  const handleValueChange = (newValue: number) => {
    const clamped = Math.max(0, newValue);
    setParsed((prev) => ({ ...prev, value: clamped }));
    emitChange(clamped, parsed.unit);
  };

  // Handle unit change
  const handleUnitChange = (newUnit: string) => {
    setParsed((prev) => ({ ...prev, unit: newUnit }));
    emitChange(parsed.value, newUnit);
  };

  // Get presets for this size type
  const presets = useMemo(() => PRESETS[sizeType] ?? PRESETS.generic!, [sizeType]);

  // Check if current value matches a preset
  const activePreset = useMemo(() => {
    const normalized = normalizeSize(textValue);
    return presets?.find((p) => normalizeSize(p.value) === normalized);
  }, [textValue, presets]);

  // Max slider value based on unit
  const maxValue = MAX_VALUES[parsed.unit] || 64;
  const step = parsed.unit === 'px' ? 1 : 0.125;

  // Visual bar width (percentage of max)
  const barWidth = Math.min(100, (parsed.value / maxValue) * 100);

  return (
    <div className="size-picker">
      {/* Context-aware preview */}
      {sizeType === 'fontSize' ? (
        <div className="size-picker__font-preview" style={{ fontSize: textValue || '1rem' }}>
          Aa
        </div>
      ) : sizeType === 'spacing' ? (
        <div className="size-picker__spacing-preview">
          <div className="size-picker__spacing-box" />
          <div className="size-picker__spacing-gap" style={{ width: textValue || '8px' }} />
          <div className="size-picker__spacing-box" />
        </div>
      ) : (
        <div className="size-picker__bar">
          <div
            className="size-picker__bar-fill"
            style={{ width: `${barWidth}%` }}
          />
        </div>
      )}

      {/* Controls */}
      <div className="size-picker__controls">
        {/* Presets */}
        <div className="size-picker__presets">
          {presets?.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={`size-picker__preset ${
                activePreset?.value === preset.value ? 'size-picker__preset--active' : ''
              }`}
              onClick={() => {
                const newParsed = parseSize(preset.value);
                setParsed(newParsed);
                setTextValue(preset.value);
                onChange(preset.value);
              }}
              title={preset.value}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Slider and inputs */}
        <div className="size-picker__input-row">
          <input
            type="range"
            className="size-picker__slider"
            min="0"
            max={maxValue}
            step={step}
            value={Math.min(parsed.value, maxValue)}
            onChange={(e) => handleValueChange(Number(e.target.value))}
          />

          <input
            type="number"
            className="size-picker__number"
            min="0"
            step={step}
            value={parsed.value}
            onChange={(e) => handleValueChange(Number(e.target.value))}
          />

          <select
            className="size-picker__unit"
            value={parsed.unit}
            onChange={(e) => handleUnitChange(e.target.value)}
          >
            <option value="px">px</option>
            <option value="rem">rem</option>
            <option value="em">em</option>
            <option value="%">%</option>
          </select>
        </div>

        {/* Text input for custom values */}
        <input
          type="text"
          className="size-picker__text"
          value={textValue}
          onChange={(e) => {
            setTextValue(e.target.value);
            const newParsed = parseSize(e.target.value);
            setParsed(newParsed);
            onChange(e.target.value);
          }}
          placeholder="e.g., 16px, 1rem, 50%"
        />
      </div>
    </div>
  );
}

/**
 * Parse a size value string into numeric value and unit
 */
function parseSize(value: string): ParsedSize {
  if (!value) return { value: 0, unit: 'px' };

  const trimmed = value.trim().toLowerCase();

  // Handle zero
  if (trimmed === '0') return { value: 0, unit: 'px' };

  // Match number + unit
  const match = trimmed.match(/^(-?[\d.]+)(px|rem|em|%)?$/);
  if (match && match[1]) {
    return {
      value: parseFloat(match[1]) || 0,
      unit: match[2] || 'px',
    };
  }

  return { value: 0, unit: 'px' };
}

/**
 * Format a size value with unit
 */
function formatSize(value: number, unit: string): string {
  if (value === 0) return '0';

  // Format with appropriate precision
  const formatted =
    unit === 'px' ? Math.round(value).toString() : value.toFixed(3).replace(/\.?0+$/, '');

  return `${formatted}${unit}`;
}

/**
 * Normalize a size value for comparison
 */
function normalizeSize(value: string): string {
  const parsed = parseSize(value);
  return formatSize(parsed.value, parsed.unit);
}

export default SizePicker;
