import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import './NavigationSidebar.css';

// =============================================================================
// Types
// =============================================================================

interface SectionMarker {
  label: string;           // Display label (e.g., "A", "2024")
  index: number;           // First item index for this section
  count: number;           // Items in this section
}

interface NavigationSidebarProps<T> {
  items: T[];
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onNavigate: (index: number) => void;
  visibleRange?: { start: number; end: number };
  getItemValue: (item: T) => string | number | null | undefined;
  className?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Determine if sort field is name-based (uses A-Z markers)
 */
function isLetterSort(sortField: string): boolean {
  return ['name', 'publisher', 'genre', 'filename', 'series', 'title', 'writer', 'penciller'].includes(sortField);
}

/**
 * Determine if sort field is year/date-based
 */
function isYearSort(sortField: string): boolean {
  return ['startYear', 'year', 'createdAt', 'updatedAt', 'modifiedAt'].includes(sortField);
}

/**
 * Determine if sort field is numeric (issue numbers)
 */
function isNumericSort(sortField: string): boolean {
  return ['number', 'issueCount', 'volume'].includes(sortField);
}

/**
 * Extract first letter from a string value
 */
function getFirstLetter(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '#';
  const str = String(value).trim();
  if (!str) return '#';
  const firstChar = str.charAt(0).toUpperCase();
  return /[A-Z]/.test(firstChar) ? firstChar : '#';
}

/**
 * Extract year from a value
 */
function getYear(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;

  // If it's a number, assume it's a year
  if (typeof value === 'number') {
    return value >= 1900 && value <= 2100 ? value : null;
  }

  // Try to parse as date string
  const str = String(value);
  const dateMatch = str.match(/(\d{4})/);
  if (dateMatch && dateMatch[1]) {
    const year = parseInt(dateMatch[1], 10);
    return year >= 1900 && year <= 2100 ? year : null;
  }

  return null;
}

/**
 * Calculate letter markers for A-Z navigation
 * Always shows ALL letters, with hasItems flag for styling
 */
function calculateLetterMarkers<T>(
  items: T[],
  getValue: (item: T) => string | number | null | undefined,
  sortOrder: 'asc' | 'desc'
): SectionMarker[] {
  // First pass: find which letters have items and their first index
  const letterData: Map<string, { index: number; count: number }> = new Map();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const value = getValue(item);
    const letter = getFirstLetter(value);

    const existing = letterData.get(letter);
    if (existing) {
      existing.count++;
    } else {
      letterData.set(letter, { index: i, count: 1 });
    }
  }

  // Define letter order - ALWAYS show all letters
  const allLetters = sortOrder === 'asc'
    ? ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
    : ['Z', 'Y', 'X', 'W', 'V', 'U', 'T', 'S', 'R', 'Q', 'P', 'O', 'N', 'M', 'L', 'K', 'J', 'I', 'H', 'G', 'F', 'E', 'D', 'C', 'B', 'A', '#'];

  // Track the last valid index for letters without items
  let lastValidIndex = 0;

  // Return ALL letters, even those without items
  return allLetters.map(letter => {
    const data = letterData.get(letter);
    if (data) {
      lastValidIndex = data.index;
      return { label: letter, index: data.index, count: data.count };
    } else {
      // Letter has no items - use last valid index, count of 0
      return { label: letter, index: lastValidIndex, count: 0 };
    }
  });
}

/**
 * Calculate year markers for date navigation
 */
function calculateYearMarkers<T>(
  items: T[],
  getValue: (item: T) => string | number | null | undefined,
  sortOrder: 'asc' | 'desc'
): SectionMarker[] {
  const markers: Map<string, SectionMarker> = new Map();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const value = getValue(item);
    const year = getYear(value);
    const label = year ? String(year) : 'Unknown';

    const existing = markers.get(label);
    if (existing) {
      existing.count++;
    } else {
      markers.set(label, { label, index: i, count: 1 });
    }
  }

  // Sort by year
  const sorted = Array.from(markers.values()).sort((a, b) => {
    const yearA = parseInt(a.label) || 0;
    const yearB = parseInt(b.label) || 0;
    return sortOrder === 'desc' ? yearB - yearA : yearA - yearB;
  });

  return sorted;
}

/**
 * Calculate numeric range markers for issue number navigation
 */
function calculateNumericMarkers<T>(
  items: T[],
  getValue: (item: T) => string | number | null | undefined,
  _sortOrder: 'asc' | 'desc'
): SectionMarker[] {
  if (items.length === 0) return [];

  // For small lists, show individual numbers
  if (items.length <= 30) {
    const markers: SectionMarker[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      const value = getValue(item);
      const label = value !== null && value !== undefined ? String(value) : '?';

      if (!seen.has(label)) {
        seen.add(label);
        markers.push({ label, index: i, count: 1 });
      } else {
        const existing = markers.find(m => m.label === label);
        if (existing) existing.count++;
      }
    }

    return markers;
  }

  // For larger lists, create ranges
  const rangeSize = Math.ceil(items.length / 10);
  const markers: SectionMarker[] = [];

  for (let i = 0; i < items.length; i += rangeSize) {
    const startItem = items[i];
    const endIdx = Math.min(i + rangeSize - 1, items.length - 1);
    const endItem = items[endIdx];

    if (!startItem || !endItem) continue;

    const startValue = getValue(startItem);
    const endValue = getValue(endItem);

    const startLabel = startValue !== null && startValue !== undefined ? String(startValue) : '?';
    const endLabel = endValue !== null && endValue !== undefined ? String(endValue) : '?';

    markers.push({
      label: startLabel === endLabel ? startLabel : `${startLabel}-${endLabel}`,
      index: i,
      count: Math.min(rangeSize, items.length - i),
    });
  }

  return markers;
}

/**
 * Find the active marker based on visible range.
 * Only considers markers with items (count > 0).
 * Returns the marker whose range contains visibleStart.
 */
function findActiveMarker(markers: SectionMarker[], visibleStart: number): SectionMarker | null {
  if (markers.length === 0) return null;

  // Filter to only markers that have items
  const markersWithItems = markers.filter(m => m.count > 0);
  if (markersWithItems.length === 0) return null;

  // Sort by index ascending to establish proper ranges
  const sorted = [...markersWithItems].sort((a, b) => a.index - b.index);

  // Find the marker whose range contains visibleStart
  // A marker's range is from its index to the next marker's index - 1
  for (let i = sorted.length - 1; i >= 0; i--) {
    const marker = sorted[i];
    if (marker && marker.index <= visibleStart) {
      return marker;
    }
  }

  // If visibleStart is before all markers, return the first one
  return sorted[0] ?? null;
}

/**
 * Reduce markers to fit available space.
 * Strategy:
 * 1. First remove empty letters (count === 0)
 * 2. Then remove letters with lowest count, keeping good distribution
 */
function reduceMarkersToFit(
  markers: SectionMarker[],
  maxCount: number
): SectionMarker[] {
  if (markers.length <= maxCount) return markers;

  // Get markers with items (non-empty letters)
  const withItems = markers.filter(m => m.count > 0);

  // If markers with items already fit, return them
  if (withItems.length <= maxCount) {
    return withItems;
  }

  // Need to reduce further - sort by count and keep highest
  // But maintain alphabetical distribution by keeping first, last, and evenly spaced
  const sorted = [...withItems].sort((a, b) => b.count - a.count);

  // Keep the top markers by count, but ensure good letter distribution
  // We want to keep A, Z, and the most popular letters in between
  const kept = new Set<string>();
  const result: SectionMarker[] = [];

  // Always try to keep first and last letter markers (# and Z for asc)
  const firstMarker = markers.find(m => m.count > 0);
  const lastMarker = [...markers].reverse().find(m => m.count > 0);

  if (firstMarker) {
    kept.add(firstMarker.label);
    result.push(firstMarker);
  }
  if (lastMarker && !kept.has(lastMarker.label)) {
    kept.add(lastMarker.label);
    result.push(lastMarker);
  }

  // Fill remaining slots with highest count markers
  for (const marker of sorted) {
    if (result.length >= maxCount) break;
    if (!kept.has(marker.label)) {
      kept.add(marker.label);
      result.push(marker);
    }
  }

  // Sort result back to original order
  const labelOrder = markers.map(m => m.label);
  result.sort((a, b) => labelOrder.indexOf(a.label) - labelOrder.indexOf(b.label));

  return result;
}

// =============================================================================
// Component
// =============================================================================

export function NavigationSidebar<T>({
  items,
  sortField,
  sortOrder,
  onNavigate,
  visibleRange,
  getItemValue,
  className = '',
}: NavigationSidebarProps<T>) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [availableHeight, setAvailableHeight] = useState(0);

  // Measure available height with ResizeObserver
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const updateHeight = () => {
      // Get the computed height of the sidebar container
      const rect = sidebar.getBoundingClientRect();
      // Subtract padding (top + bottom = 16px) and some buffer
      setAvailableHeight(Math.max(0, rect.height - 24));
    };

    // Initial measurement
    updateHeight();

    // Watch for size changes
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(sidebar);

    // Also watch window resize for fixed positioning updates
    window.addEventListener('resize', updateHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  // Determine navigation mode and calculate markers
  const { mode, allMarkers } = useMemo(() => {
    if (isLetterSort(sortField)) {
      return {
        mode: 'letter' as const,
        allMarkers: calculateLetterMarkers(items, getItemValue, sortOrder),
      };
    } else if (isYearSort(sortField)) {
      return {
        mode: 'year' as const,
        allMarkers: calculateYearMarkers(items, getItemValue, sortOrder),
      };
    } else if (isNumericSort(sortField)) {
      return {
        mode: 'numeric' as const,
        allMarkers: calculateNumericMarkers(items, getItemValue, sortOrder),
      };
    }
    return { mode: 'letter' as const, allMarkers: [] };
  }, [items, sortField, sortOrder, getItemValue]);

  // Calculate how many markers can fit and reduce if needed
  const markers = useMemo(() => {
    if (availableHeight <= 0 || allMarkers.length === 0) return allMarkers;

    // Estimate marker height (including gaps) - each marker is ~20px with gap
    const markerHeight = mode === 'year' ? 24 : 20;
    const maxMarkers = Math.floor(availableHeight / markerHeight);

    // Only reduce for letter mode - year and numeric modes handle themselves
    if (mode === 'letter' && maxMarkers < allMarkers.length) {
      return reduceMarkersToFit(allMarkers, Math.max(5, maxMarkers));
    }

    return allMarkers;
  }, [allMarkers, availableHeight, mode]);

  // Find active marker
  const activeMarker = useMemo(() => {
    if (!visibleRange) return null;
    return findActiveMarker(markers, visibleRange.start);
  }, [markers, visibleRange]);

  // Handle marker click
  const handleMarkerClick = useCallback((marker: SectionMarker) => {
    onNavigate(marker.index);
  }, [onNavigate]);

  // Handle spectrum navigation (for year mode)
  // Clicking between markers calculates proportional position
  const handleSpectrumInteraction = useCallback((clientY: number) => {
    if (!sidebarRef.current || markers.length < 2 || mode !== 'year') return;

    const navContainer = sidebarRef.current.querySelector('.nav-markers-container');
    if (!navContainer) return;

    const navRect = navContainer.getBoundingClientRect();
    const relativeY = clientY - navRect.top;
    const percentage = Math.max(0, Math.min(1, relativeY / navRect.height));

    // Calculate target index based on percentage through the list
    const targetIndex = Math.round(percentage * (items.length - 1));
    onNavigate(targetIndex);
  }, [markers, mode, items.length, onNavigate]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode === 'year' && markers.length >= 2) {
      setIsDragging(true);
      handleSpectrumInteraction(e.clientY);
    }
  }, [mode, markers.length, handleSpectrumInteraction]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      handleSpectrumInteraction(e.clientY);
    }
  }, [isDragging, handleSpectrumInteraction]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle touch events for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (mode === 'year' && markers.length >= 2 && e.touches[0]) {
      setIsDragging(true);
      handleSpectrumInteraction(e.touches[0].clientY);
    }
  }, [mode, markers.length, handleSpectrumInteraction]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isDragging && e.touches[0]) {
      e.preventDefault();
      handleSpectrumInteraction(e.touches[0].clientY);
    }
  }, [isDragging, handleSpectrumInteraction]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Don't render if not enough items or no markers
  // Show for 10+ items since it's useful even for smaller collections
  if (items.length < 10 || markers.length === 0) {
    return null;
  }

  return (
    <nav
      ref={sidebarRef}
      className={`navigation-sidebar ${mode}-mode ${isDragging ? 'is-dragging' : ''} ${className}`}
      aria-label="Quick navigation"
      onMouseDown={mode === 'year' ? handleMouseDown : undefined}
      onMouseMove={mode === 'year' ? handleMouseMove : undefined}
      onMouseUp={mode === 'year' ? handleMouseUp : undefined}
      onMouseLeave={mode === 'year' ? handleMouseLeave : undefined}
      onTouchStart={mode === 'year' ? handleTouchStart : undefined}
      onTouchMove={mode === 'year' ? handleTouchMove : undefined}
      onTouchEnd={mode === 'year' ? handleTouchEnd : undefined}
    >
      <div className="nav-markers-container">
        {markers.map((marker, idx) => {
          const isActive = marker.label === activeMarker?.label;
          const isEmpty = marker.count === 0;
          const classNames = [
            'nav-marker',
            isActive ? 'active' : '',
            isEmpty ? 'empty' : '',
          ].filter(Boolean).join(' ');

          return (
            <button
              key={`${marker.label}-${idx}`}
              className={classNames}
              onClick={() => handleMarkerClick(marker)}
              disabled={isEmpty}
              title={isEmpty ? `${marker.label} (no items)` : `${marker.label} (${marker.count} item${marker.count !== 1 ? 's' : ''})`}
              aria-label={`Jump to ${marker.label}`}
            >
              {marker.label}
            </button>
          );
        })}
      </div>

      {/* Year mode spectrum indicator */}
      {mode === 'year' && markers.length >= 2 && (
        <div className="spectrum-track" aria-hidden="true">
          {visibleRange && (
            <div
              className="spectrum-thumb"
              style={{
                top: `${(visibleRange.start / Math.max(1, items.length - 1)) * 100}%`,
              }}
            />
          )}
        </div>
      )}
    </nav>
  );
}

export default NavigationSidebar;
