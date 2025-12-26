/**
 * BreadcrumbContext
 *
 * Manages breadcrumb navigation state for the GlobalHeader.
 * Pages update this context with their hierarchical path, allowing
 * the header to display dynamic breadcrumbs with actual content names.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * Navigation origin state - passed via React Router's location.state
 * to track where the user came from for breadcrumb building.
 */
export interface NavigationOrigin {
  /** The source page type */
  from: 'library' | 'series' | 'folders' | 'collections' | 'search' | 'stats' | 'home';
  /** Optional library ID if coming from a specific library */
  libraryId?: string;
  /** Optional library name for display */
  libraryName?: string;
  /** Optional series ID if coming from a series page */
  seriesId?: string;
  /** Optional series name for display */
  seriesName?: string;
  /** Optional collection ID */
  collectionId?: string;
  /** Optional collection name */
  collectionName?: string;
}

export interface BreadcrumbSegment {
  /** Display text (e.g., "Batman (2016)") */
  label: string;
  /** Navigation path (e.g., "/series/abc123") */
  path: string;
  /** Shows loading placeholder when true */
  isLoading?: boolean;
}

interface BreadcrumbContextValue {
  /** Array of breadcrumb segments after "Helixio" root */
  segments: BreadcrumbSegment[];
  /** Set the full breadcrumb path (replaces current segments) */
  setBreadcrumbs: (segments: BreadcrumbSegment[]) => void;
  /** Clear all breadcrumbs */
  clearBreadcrumbs: () => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | undefined>(undefined);

interface BreadcrumbProviderProps {
  children: ReactNode;
}

export function BreadcrumbProvider({ children }: BreadcrumbProviderProps) {
  const [segments, setSegments] = useState<BreadcrumbSegment[]>([]);

  const setBreadcrumbs = useCallback((newSegments: BreadcrumbSegment[]) => {
    setSegments(newSegments);
  }, []);

  const clearBreadcrumbs = useCallback(() => {
    setSegments([]);
  }, []);

  return (
    <BreadcrumbContext.Provider value={{ segments, setBreadcrumbs, clearBreadcrumbs }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbs(): BreadcrumbContextValue {
  const context = useContext(BreadcrumbContext);
  if (!context) {
    throw new Error('useBreadcrumbs must be used within a BreadcrumbProvider');
  }
  return context;
}
