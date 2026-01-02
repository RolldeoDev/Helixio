import { useState, useEffect, useCallback, useRef } from 'react';
import './RgbaColorPicker.css';

interface RgbaColorPickerProps {
  value: string;
  onChange: (value: string) => void;
}

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface PopoverPosition {
  top: number;
  left: number;
}

/**
 * RgbaColorPicker - Color picker with alpha/transparency support
 * Supports hex, rgb(), rgba(), and named colors
 */
export function RgbaColorPicker({ value, onChange }: RgbaColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rgba, setRgba] = useState<RgbaColor>(() => parseColor(value));
  const [hexInput, setHexInput] = useState(() => rgbaToHex(parseColor(value)));
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>({ top: 0, left: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Parse incoming value when it changes externally
  useEffect(() => {
    const parsed = parseColor(value);
    setRgba(parsed);
    setHexInput(rgbaToHex(parsed));
  }, [value]);

  // Calculate popover position based on trigger element
  const calculatePosition = useCallback((): PopoverPosition => {
    if (!triggerRef.current) return { top: 0, left: 0 };

    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 280;
    const popoverHeight = 400; // Approximate height

    // Position below the trigger, but adjust if it would go off-screen
    let top = rect.bottom + 8;
    let left = rect.left;

    // Check if popover would go off the right edge
    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }

    // Check if popover would go off the bottom edge
    if (top + popoverHeight > window.innerHeight - 16) {
      // Position above the trigger instead
      top = rect.top - popoverHeight - 8;
    }

    // Ensure left doesn't go negative
    if (left < 16) left = 16;

    return { top, left };
  }, []);

  // Handle opening the popover
  const handleOpen = useCallback(() => {
    // Calculate position synchronously before opening to avoid flicker
    const position = calculatePosition();
    setPopoverPosition(position);
    setIsOpen(true);
  }, [calculatePosition]);

  // Close popover on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Update color and emit change
  const updateColor = useCallback(
    (newRgba: RgbaColor) => {
      setRgba(newRgba);
      setHexInput(rgbaToHex(newRgba));

      // Emit as rgba() if alpha < 1, otherwise as hex
      if (newRgba.a < 1) {
        onChange(`rgba(${newRgba.r}, ${newRgba.g}, ${newRgba.b}, ${newRgba.a.toFixed(2)})`);
      } else {
        onChange(rgbaToHex(newRgba));
      }
    },
    [onChange]
  );

  // Handle hex input change
  const handleHexChange = (hex: string) => {
    setHexInput(hex);

    // Try to parse as valid hex
    const cleanHex = hex.replace(/^#/, '');
    if (/^[0-9a-fA-F]{6}$/.test(cleanHex) || /^[0-9a-fA-F]{3}$/.test(cleanHex)) {
      const parsed = parseColor(`#${cleanHex}`);
      parsed.a = rgba.a; // Preserve alpha
      updateColor(parsed);
    }
  };

  // Handle native color picker change
  const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseColor(e.target.value);
    parsed.a = rgba.a; // Preserve alpha
    updateColor(parsed);
  };

  // Handle slider changes
  const handleSliderChange = (channel: 'r' | 'g' | 'b' | 'a', rawValue: number) => {
    const newRgba = { ...rgba };
    if (channel === 'a') {
      newRgba.a = Math.round(rawValue * 100) / 100;
    } else {
      newRgba[channel] = Math.round(rawValue);
    }
    updateColor(newRgba);
  };

  // Display value for the text input
  const displayValue = rgba.a < 1
    ? `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a.toFixed(2)})`
    : rgbaToHex(rgba);

  return (
    <div className="rgba-color-picker">
      <button
        ref={triggerRef}
        type="button"
        className="rgba-color-picker__trigger"
        onClick={() => isOpen ? setIsOpen(false) : handleOpen()}
        aria-label="Pick color"
      >
        <span
          className="rgba-color-picker__swatch"
          style={{ backgroundColor: displayValue }}
        />
        <span
          className="rgba-color-picker__checkerboard"
          style={{ opacity: 1 - rgba.a }}
        />
      </button>

      <input
        type="text"
        className="rgba-color-picker__text"
        value={displayValue}
        onChange={(e) => {
          const parsed = parseColor(e.target.value);
          if (parsed.r !== 0 || parsed.g !== 0 || parsed.b !== 0 || e.target.value === '#000000' || e.target.value === 'rgba(0, 0, 0, 1)') {
            updateColor(parsed);
          }
        }}
        onBlur={() => {
          // Reset to valid value on blur
          const parsed = parseColor(displayValue);
          updateColor(parsed);
        }}
      />

      {isOpen && (
        <div
          ref={popoverRef}
          className="rgba-color-picker__popover rgba-color-picker__popover--fixed"
          style={{
            top: popoverPosition.top,
            left: popoverPosition.left,
          }}
        >
          <div className="rgba-color-picker__section">
            <label className="rgba-color-picker__label">Color</label>
            <div className="rgba-color-picker__hex-row">
              <input
                type="color"
                className="rgba-color-picker__native"
                value={rgbaToHex(rgba)}
                onChange={handleNativeColorChange}
              />
              <input
                type="text"
                className="rgba-color-picker__hex-input"
                value={hexInput}
                onChange={(e) => handleHexChange(e.target.value)}
                placeholder="#000000"
              />
            </div>
          </div>

          <div className="rgba-color-picker__section">
            <label className="rgba-color-picker__label">
              Red <span className="rgba-color-picker__value">{rgba.r}</span>
            </label>
            <input
              type="range"
              className="rgba-color-picker__slider rgba-color-picker__slider--red"
              min="0"
              max="255"
              value={rgba.r}
              onChange={(e) => handleSliderChange('r', Number(e.target.value))}
            />
          </div>

          <div className="rgba-color-picker__section">
            <label className="rgba-color-picker__label">
              Green <span className="rgba-color-picker__value">{rgba.g}</span>
            </label>
            <input
              type="range"
              className="rgba-color-picker__slider rgba-color-picker__slider--green"
              min="0"
              max="255"
              value={rgba.g}
              onChange={(e) => handleSliderChange('g', Number(e.target.value))}
            />
          </div>

          <div className="rgba-color-picker__section">
            <label className="rgba-color-picker__label">
              Blue <span className="rgba-color-picker__value">{rgba.b}</span>
            </label>
            <input
              type="range"
              className="rgba-color-picker__slider rgba-color-picker__slider--blue"
              min="0"
              max="255"
              value={rgba.b}
              onChange={(e) => handleSliderChange('b', Number(e.target.value))}
            />
          </div>

          <div className="rgba-color-picker__section">
            <label className="rgba-color-picker__label">
              Alpha <span className="rgba-color-picker__value">{Math.round(rgba.a * 100)}%</span>
            </label>
            <div className="rgba-color-picker__alpha-track">
              <input
                type="range"
                className="rgba-color-picker__slider rgba-color-picker__slider--alpha"
                min="0"
                max="1"
                step="0.01"
                value={rgba.a}
                onChange={(e) => handleSliderChange('a', Number(e.target.value))}
                style={{
                  '--alpha-color': rgbaToHex(rgba),
                } as React.CSSProperties}
              />
            </div>
          </div>

          <div className="rgba-color-picker__preview">
            <div className="rgba-color-picker__preview-label">Preview</div>
            <div className="rgba-color-picker__preview-box">
              <div
                className="rgba-color-picker__preview-color"
                style={{ backgroundColor: displayValue }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Parse any color format to RGBA
 */
function parseColor(color: string): RgbaColor {
  const defaultColor: RgbaColor = { r: 0, g: 0, b: 0, a: 1 };

  if (!color) return defaultColor;

  const trimmed = color.trim().toLowerCase();

  // Handle hex
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0]! + hex[0], 16),
        g: parseInt(hex[1]! + hex[1], 16),
        b: parseInt(hex[2]! + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
  }

  // Handle rgba()
  const rgbaMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    return {
      r: Math.min(255, Math.max(0, parseInt(rgbaMatch[1]!, 10))),
      g: Math.min(255, Math.max(0, parseInt(rgbaMatch[2]!, 10))),
      b: Math.min(255, Math.max(0, parseInt(rgbaMatch[3]!, 10))),
      a: rgbaMatch[4] ? Math.min(1, Math.max(0, parseFloat(rgbaMatch[4]))) : 1,
    };
  }

  return defaultColor;
}

/**
 * Convert RGBA to hex (ignores alpha for hex output)
 */
function rgbaToHex(rgba: RgbaColor): string {
  const r = Math.round(rgba.r).toString(16).padStart(2, '0');
  const g = Math.round(rgba.g).toString(16).padStart(2, '0');
  const b = Math.round(rgba.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export default RgbaColorPicker;
