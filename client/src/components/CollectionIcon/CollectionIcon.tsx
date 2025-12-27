/**
 * CollectionIcon Component
 *
 * Renders the appropriate icon for a collection based on iconName,
 * with optional color styling.
 */

import './CollectionIcon.css';

// Icon path definitions - matches the options in CollectionSettingsDrawer
const ICON_PATHS: Record<string, string> = {
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01',
  fire: 'M12 2c.5.5 1.5 2 1.5 4s-1 3-2.5 4c1.5-1 2.5-2.5 2.5-4.5 0-1-.5-2-1.5-3.5zm-3 6c1 1 1.5 2 1.5 3.5s-.5 2.5-1.5 3.5c2-1 3-2.5 3-4.5 0-1.5-.5-2.5-1.5-3.5zM6 12c1 1 1.5 2.5 1.5 4s-.5 3-1.5 4c3-2 4.5-4 4.5-6.5 0-2-.75-3.5-2-5z',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  crown: 'M2 17l2-4 4 2 4-6 4 6 4-2 2 4v3H2v-3z',
  trophy: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6 M18 9h1.5a2.5 2.5 0 0 0 0-5H18 M4 22h16 M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22 M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22 M18 2H6v7a6 6 0 0 0 12 0V2z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M4 19.5A2.5 2.5 0 0 0 6.5 22H20 M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z',
  archive: 'M21 8v13H3V8 M1 3h22v5H1z M10 12h4',
  layers: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
};

// Icons that look better filled vs stroked
const FILLED_ICONS = new Set(['heart', 'bookmark', 'star', 'folder']);

interface CollectionIconProps {
  iconName?: string | null;
  color?: string | null;
  size?: number;
  className?: string;
}

export function CollectionIcon({
  iconName,
  color,
  size = 16,
  className = '',
}: CollectionIconProps) {
  // Default to folder if no icon specified
  const icon = iconName || 'folder';
  const path = ICON_PATHS[icon] || ICON_PATHS.folder;
  const isFilled = FILLED_ICONS.has(icon);

  const style = color ? { color } : undefined;

  return (
    <span
      className={`collection-icon ${className}`}
      style={style}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={isFilled ? 'currentColor' : 'none'}
        stroke={isFilled ? 'none' : 'currentColor'}
        strokeWidth={isFilled ? 0 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    </span>
  );
}

export default CollectionIcon;
