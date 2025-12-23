/**
 * HelixioLoader Component
 *
 * A branded loading spinner featuring the Helixio logo with a pulse animation.
 * Use for full-page loading states or prominent loading indicators.
 */

import './HelixioLoader.css';

interface HelixioLoaderProps {
  /** Size of the loader: 'sm' (32px), 'md' (48px), 'lg' (64px) */
  size?: 'sm' | 'md' | 'lg';
  /** Optional loading message to display */
  message?: string;
  /** Whether to show in a full-page overlay */
  fullPage?: boolean;
}

export function HelixioLoader({ size = 'md', message, fullPage = false }: HelixioLoaderProps) {
  const loader = (
    <div className={`helixio-loader helixio-loader--${size}`}>
      <div className="helixio-loader__spinner">
        <img
          src="/helixioLogoSquareTransparent.png"
          alt="Loading"
          className="helixio-loader__logo"
        />
      </div>
      {message && <span className="helixio-loader__message">{message}</span>}
    </div>
  );

  if (fullPage) {
    return <div className="helixio-loader__overlay">{loader}</div>;
  }

  return loader;
}

export default HelixioLoader;
