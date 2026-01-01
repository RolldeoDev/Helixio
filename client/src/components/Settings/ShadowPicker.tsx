import { useState, useEffect, useCallback, useMemo } from 'react';
import './ShadowPicker.css';

interface ShadowPickerProps {
  value: string;
  onChange: (value: string) => void;
}

interface ShadowLayer {
  inset: boolean;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

/**
 * ShadowPicker - Box shadow picker with presets and advanced layer controls
 * Supports multi-layer shadows with full customization
 */
export function ShadowPicker({ value, onChange }: ShadowPickerProps) {
  const [layers, setLayers] = useState<ShadowLayer[]>(() => parseShadow(value));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [textValue, setTextValue] = useState(value);

  // Sync with external value changes
  useEffect(() => {
    const parsed = parseShadow(value);
    setLayers(parsed);
    setTextValue(value);
  }, [value]);

  // Emit change when layers update
  const emitChange = useCallback(
    (newLayers: ShadowLayer[]) => {
      const shadowString = layersToString(newLayers);
      setTextValue(shadowString);
      onChange(shadowString);
    },
    [onChange]
  );

  // Update a specific layer
  const updateLayer = useCallback(
    (index: number, updates: Partial<ShadowLayer>) => {
      const newLayers = [...layers];
      newLayers[index] = { ...newLayers[index]!, ...updates };
      setLayers(newLayers);
      emitChange(newLayers);
    },
    [layers, emitChange]
  );

  // Add a new layer
  const addLayer = useCallback(() => {
    const newLayers = [
      ...layers,
      { inset: false, x: 0, y: 4, blur: 8, spread: 0, color: 'rgba(0, 0, 0, 0.2)' },
    ];
    setLayers(newLayers);
    emitChange(newLayers);
  }, [layers, emitChange]);

  // Remove a layer
  const removeLayer = useCallback(
    (index: number) => {
      const newLayers = layers.filter((_, i) => i !== index);
      setLayers(newLayers);
      emitChange(newLayers);
    },
    [layers, emitChange]
  );

  // Presets
  const presets = useMemo(
    () => [
      { label: 'None', value: 'none' },
      { label: 'Sm', value: '0 1px 3px rgba(0, 0, 0, 0.12)' },
      { label: 'Md', value: '0 4px 12px rgba(0, 0, 0, 0.15)' },
      { label: 'Lg', value: '0 8px 24px rgba(0, 0, 0, 0.2)' },
      { label: 'Glow', value: '0 0 20px rgba(var(--color-primary-rgb, 99, 102, 241), 0.4)' },
    ],
    []
  );

  // Check if current value matches a preset
  const normalizedValue = value.replace(/\s+/g, ' ').trim().toLowerCase();
  const activePreset = presets.find(
    (p) => p.value.replace(/\s+/g, ' ').trim().toLowerCase() === normalizedValue
  );

  // Display value for preview
  const displayValue = textValue || 'none';

  return (
    <div className="shadow-picker">
      {/* Visual preview */}
      <div className="shadow-picker__preview">
        <div
          className="shadow-picker__preview-box"
          style={{ boxShadow: displayValue === 'none' ? 'none' : displayValue }}
        />
      </div>

      {/* Controls */}
      <div className="shadow-picker__controls">
        {/* Presets */}
        <div className="shadow-picker__presets">
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={`shadow-picker__preset ${
                activePreset?.value === preset.value ? 'shadow-picker__preset--active' : ''
              }`}
              onClick={() => {
                const parsed = parseShadow(preset.value);
                setLayers(parsed);
                setTextValue(preset.value);
                onChange(preset.value);
              }}
              title={preset.value}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          className="shadow-picker__advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? '▼ Advanced' : '▶ Advanced'}
        </button>

        {/* Advanced layer controls */}
        {showAdvanced && (
          <div className="shadow-picker__layers">
            {layers.length === 0 ? (
              <div className="shadow-picker__empty">No shadow layers</div>
            ) : (
              layers.map((layer, index) => (
                <div key={index} className="shadow-picker__layer">
                  <div className="shadow-picker__layer-header">
                    <span className="shadow-picker__layer-title">Layer {index + 1}</span>
                    <button
                      type="button"
                      className="shadow-picker__layer-remove"
                      onClick={() => removeLayer(index)}
                      title="Remove layer"
                    >
                      ×
                    </button>
                  </div>

                  <div className="shadow-picker__layer-controls">
                    {/* Inset */}
                    <label className="shadow-picker__inset">
                      <input
                        type="checkbox"
                        checked={layer.inset}
                        onChange={(e) => updateLayer(index, { inset: e.target.checked })}
                      />
                      <span>Inset</span>
                    </label>

                    {/* X Offset */}
                    <div className="shadow-picker__slider-row">
                      <label>X</label>
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        value={layer.x}
                        onChange={(e) => updateLayer(index, { x: Number(e.target.value) })}
                      />
                      <input
                        type="number"
                        className="shadow-picker__number"
                        value={layer.x}
                        onChange={(e) => updateLayer(index, { x: Number(e.target.value) })}
                      />
                      <span className="shadow-picker__unit">px</span>
                    </div>

                    {/* Y Offset */}
                    <div className="shadow-picker__slider-row">
                      <label>Y</label>
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        value={layer.y}
                        onChange={(e) => updateLayer(index, { y: Number(e.target.value) })}
                      />
                      <input
                        type="number"
                        className="shadow-picker__number"
                        value={layer.y}
                        onChange={(e) => updateLayer(index, { y: Number(e.target.value) })}
                      />
                      <span className="shadow-picker__unit">px</span>
                    </div>

                    {/* Blur */}
                    <div className="shadow-picker__slider-row">
                      <label>Blur</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={layer.blur}
                        onChange={(e) => updateLayer(index, { blur: Number(e.target.value) })}
                      />
                      <input
                        type="number"
                        className="shadow-picker__number"
                        min="0"
                        value={layer.blur}
                        onChange={(e) => updateLayer(index, { blur: Math.max(0, Number(e.target.value)) })}
                      />
                      <span className="shadow-picker__unit">px</span>
                    </div>

                    {/* Spread */}
                    <div className="shadow-picker__slider-row">
                      <label>Spread</label>
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        value={layer.spread}
                        onChange={(e) => updateLayer(index, { spread: Number(e.target.value) })}
                      />
                      <input
                        type="number"
                        className="shadow-picker__number"
                        value={layer.spread}
                        onChange={(e) => updateLayer(index, { spread: Number(e.target.value) })}
                      />
                      <span className="shadow-picker__unit">px</span>
                    </div>

                    {/* Color */}
                    <div className="shadow-picker__color-row">
                      <label>Color</label>
                      <input
                        type="text"
                        className="shadow-picker__color-input"
                        value={layer.color}
                        onChange={(e) => updateLayer(index, { color: e.target.value })}
                        placeholder="rgba(0, 0, 0, 0.2)"
                      />
                    </div>
                  </div>
                </div>
              ))
            )}

            <button
              type="button"
              className="shadow-picker__add-layer"
              onClick={addLayer}
            >
              + Add Layer
            </button>
          </div>
        )}

        {/* Text input for custom values */}
        <input
          type="text"
          className="shadow-picker__text"
          value={textValue}
          onChange={(e) => {
            setTextValue(e.target.value);
            const parsed = parseShadow(e.target.value);
            setLayers(parsed);
            onChange(e.target.value);
          }}
          placeholder="e.g., 0 4px 12px rgba(0, 0, 0, 0.15)"
        />
      </div>
    </div>
  );
}

/**
 * Parse a CSS box-shadow value into layers
 */
function parseShadow(value: string): ShadowLayer[] {
  if (!value || value.trim().toLowerCase() === 'none') {
    return [];
  }

  const layers: ShadowLayer[] = [];

  // Split by comma, but not inside parentheses
  const parts = splitShadowLayers(value);

  for (const part of parts) {
    const layer = parseSingleShadow(part.trim());
    if (layer) {
      layers.push(layer);
    }
  }

  return layers;
}

/**
 * Split shadow string by commas, respecting parentheses
 */
function splitShadowLayers(value: string): string[] {
  const result: string[] = [];
  let current = '';
  let parenDepth = 0;

  for (const char of value) {
    if (char === '(') {
      parenDepth++;
      current += char;
    } else if (char === ')') {
      parenDepth--;
      current += char;
    } else if (char === ',' && parenDepth === 0) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    result.push(current);
  }

  return result;
}

/**
 * Parse a single shadow layer
 */
function parseSingleShadow(value: string): ShadowLayer | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let inset = false;
  let workingValue = trimmed;

  // Check for inset
  if (workingValue.toLowerCase().startsWith('inset ')) {
    inset = true;
    workingValue = workingValue.slice(6).trim();
  } else if (workingValue.toLowerCase().endsWith(' inset')) {
    inset = true;
    workingValue = workingValue.slice(0, -6).trim();
  }

  // Extract color (rgba, rgb, hex, or named color)
  let color = 'rgba(0, 0, 0, 0.2)';

  // Match rgba/rgb
  const rgbaMatch = workingValue.match(/rgba?\([^)]+\)/i);
  if (rgbaMatch) {
    color = rgbaMatch[0];
    workingValue = workingValue.replace(rgbaMatch[0], '').trim();
  } else {
    // Match hex color
    const hexMatch = workingValue.match(/#[0-9a-fA-F]{3,8}/);
    if (hexMatch) {
      color = hexMatch[0];
      workingValue = workingValue.replace(hexMatch[0], '').trim();
    }
  }

  // Parse numeric values (x, y, blur, spread)
  const numbers = workingValue.match(/-?\d+(\.\d+)?/g) || [];
  const values = numbers.map((n) => parseFloat(n));

  return {
    inset,
    x: values[0] || 0,
    y: values[1] || 0,
    blur: values[2] || 0,
    spread: values[3] || 0,
    color,
  };
}

/**
 * Convert layers back to CSS string
 */
function layersToString(layers: ShadowLayer[]): string {
  if (layers.length === 0) return 'none';

  return layers
    .map((layer) => {
      const parts: string[] = [];
      if (layer.inset) parts.push('inset');
      parts.push(`${layer.x}px`);
      parts.push(`${layer.y}px`);
      parts.push(`${layer.blur}px`);
      parts.push(`${layer.spread}px`);
      parts.push(layer.color);
      return parts.join(' ');
    })
    .join(', ');
}

export default ShadowPicker;
