/**
 * PageLoadingFallback - Loading state for lazy-loaded pages
 *
 * Used with React.lazy() and Suspense for code-split routes.
 */

import { HelixioLoader } from './HelixioLoader';

export function PageLoadingFallback() {
  return <HelixioLoader fullPage message="Loading page..." />;
}
