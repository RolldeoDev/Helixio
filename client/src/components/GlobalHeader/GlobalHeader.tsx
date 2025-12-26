/**
 * GlobalHeader Component
 *
 * Thin header bar containing the global search bar.
 * Hidden on the reader page for immersive reading.
 */

import { useLocation } from 'react-router-dom';
import { GlobalSearchBar } from './GlobalSearchBar';
import './GlobalHeader.css';

export function GlobalHeader() {
  const location = useLocation();

  // Hide on reader pages for immersive fullscreen reading
  if (location.pathname.startsWith('/read/')) {
    return null;
  }

  return (
    <header className="global-header">
      <GlobalSearchBar />
    </header>
  );
}
