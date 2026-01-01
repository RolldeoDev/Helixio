import { useState, useEffect, useRef, useMemo } from 'react';
import './FontPicker.css';

interface FontPickerProps {
  value: string;
  onChange: (value: string) => void;
}

interface FontOption {
  name: string;
  stack: string;
  category: 'system' | 'serif' | 'sans-serif' | 'display' | 'monospace' | 'japanese';
}

// Available fonts in the project
const FONT_OPTIONS: FontOption[] = [
  // System fonts
  {
    name: 'System UI',
    stack: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    category: 'system',
  },
  {
    name: 'SF Mono',
    stack: "'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', 'Consolas', monospace",
    category: 'monospace',
  },

  // Serif fonts
  {
    name: 'Cormorant Garamond',
    stack: "'Cormorant Garamond', Georgia, serif",
    category: 'serif',
  },
  {
    name: 'Playfair Display',
    stack: "'Playfair Display', 'Bodoni Moda', Georgia, serif",
    category: 'serif',
  },
  {
    name: 'Crimson Pro',
    stack: "'Crimson Pro', 'Libre Baskerville', Georgia, serif",
    category: 'serif',
  },
  {
    name: 'Georgia',
    stack: "Georgia, 'Times New Roman', serif",
    category: 'serif',
  },

  // Sans-serif fonts
  {
    name: 'DM Sans',
    stack: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    category: 'sans-serif',
  },
  {
    name: 'Inter',
    stack: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    category: 'sans-serif',
  },
  {
    name: 'Roboto',
    stack: "'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
    category: 'sans-serif',
  },
  {
    name: 'Exo 2',
    stack: "'Exo 2', -apple-system, BlinkMacSystemFont, sans-serif",
    category: 'sans-serif',
  },

  // Display fonts
  {
    name: 'Bebas Neue',
    stack: "'Bebas Neue', 'Impact', sans-serif",
    category: 'display',
  },
  {
    name: 'Oswald',
    stack: "'Oswald', 'Impact', sans-serif",
    category: 'display',
  },
  {
    name: 'Orbitron',
    stack: "'Orbitron', monospace",
    category: 'display',
  },
  {
    name: 'Press Start 2P',
    stack: "'Press Start 2P', cursive",
    category: 'display',
  },

  // Monospace fonts
  {
    name: 'VT323',
    stack: "'VT323', monospace",
    category: 'monospace',
  },
  {
    name: 'Fira Code',
    stack: "'Fira Code', 'Fira Mono', 'Roboto Mono', monospace",
    category: 'monospace',
  },

  // Japanese fonts
  {
    name: 'Shippori Antique',
    stack: "'Shippori Antique', serif",
    category: 'japanese',
  },
  {
    name: 'Zen Kaku Gothic New',
    stack: "'Zen Kaku Gothic New', sans-serif",
    category: 'japanese',
  },
];

const CATEGORY_LABELS: Record<FontOption['category'], string> = {
  system: 'System',
  serif: 'Serif',
  'sans-serif': 'Sans-Serif',
  display: 'Display',
  monospace: 'Monospace',
  japanese: 'Japanese',
};

/**
 * FontPicker - Font family picker with preview and searchable dropdown
 */
export function FontPicker({ value, onChange }: FontPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [textValue, setTextValue] = useState(value);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Sync with external value changes
  useEffect(() => {
    setTextValue(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Find matching font from current value
  const selectedFont = useMemo(() => {
    const normalizedValue = value.toLowerCase().replace(/['"]/g, '');
    return FONT_OPTIONS.find((font) => {
      const normalizedStack = font.stack.toLowerCase().replace(/['"]/g, '');
      return normalizedStack === normalizedValue || normalizedStack.startsWith(normalizedValue);
    });
  }, [value]);

  // Filter fonts based on search
  const filteredFonts = useMemo(() => {
    if (!searchQuery.trim()) return FONT_OPTIONS;

    const query = searchQuery.toLowerCase();
    return FONT_OPTIONS.filter(
      (font) =>
        font.name.toLowerCase().includes(query) ||
        font.category.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Group fonts by category
  const groupedFonts = useMemo(() => {
    const groups: Record<string, FontOption[]> = {};

    for (const font of filteredFonts) {
      if (!groups[font.category]) {
        groups[font.category] = [];
      }
      groups[font.category]!.push(font);
    }

    return groups;
  }, [filteredFonts]);

  // Extract display name from value
  const displayName = selectedFont?.name || extractFontName(value);

  return (
    <div className="font-picker">
      {/* Preview button */}
      <button
        ref={triggerRef}
        type="button"
        className="font-picker__trigger"
        onClick={() => setIsOpen(!isOpen)}
        style={{ fontFamily: value || 'inherit' }}
      >
        <span className="font-picker__preview-text">Aa</span>
        <span className="font-picker__name">{displayName}</span>
        <span className="font-picker__arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div ref={dropdownRef} className="font-picker__dropdown">
          {/* Search input */}
          <div className="font-picker__search">
            <input
              type="text"
              className="font-picker__search-input"
              placeholder="Search fonts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          {/* Font list */}
          <div className="font-picker__list">
            {Object.entries(groupedFonts).map(([category, fonts]) => (
              <div key={category} className="font-picker__category">
                <div className="font-picker__category-label">
                  {CATEGORY_LABELS[category as FontOption['category']] || category}
                </div>
                {fonts.map((font) => (
                  <button
                    key={font.name}
                    type="button"
                    className={`font-picker__option ${
                      selectedFont?.name === font.name ? 'font-picker__option--selected' : ''
                    }`}
                    style={{ fontFamily: font.stack }}
                    onClick={() => {
                      onChange(font.stack);
                      setTextValue(font.stack);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <span className="font-picker__option-preview">Aa</span>
                    <span className="font-picker__option-name">{font.name}</span>
                  </button>
                ))}
              </div>
            ))}

            {Object.keys(groupedFonts).length === 0 && (
              <div className="font-picker__empty">No fonts found</div>
            )}
          </div>
        </div>
      )}

      {/* Text input for custom values */}
      <input
        type="text"
        className="font-picker__text"
        value={textValue}
        onChange={(e) => {
          setTextValue(e.target.value);
          onChange(e.target.value);
        }}
        placeholder="e.g., 'Inter', sans-serif"
      />
    </div>
  );
}

/**
 * Extract the primary font name from a font stack
 */
function extractFontName(fontStack: string): string {
  if (!fontStack) return 'Default';

  // Get the first font in the stack
  const match = fontStack.match(/^['"]?([^'"',]+)/);
  if (match && match[1]) {
    return match[1].trim();
  }

  return fontStack.split(',')[0]?.trim() || 'Default';
}

export default FontPicker;
