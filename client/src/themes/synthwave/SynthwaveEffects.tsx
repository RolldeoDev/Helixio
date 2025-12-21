/**
 * SynthwaveEffects Component
 *
 * "INSERT COIN TO CONTINUE"
 *
 * This component renders the visual effects unique to the Synthwave theme:
 * - CRT scan lines overlay for authentic retro monitor feel
 * - Perspective neon grid receding to the horizon
 * - Dark purple vignette at screen edges
 * - Rotating arcade/80s quotes with fade transitions
 *
 * Inspired by 1980s arcade cabinets, VHS aesthetics, and the synthwave genre.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTheme } from '../ThemeContext';
import './synthwave-effects.css';

/**
 * CRT Scan Lines - Subtle horizontal lines like an old monitor
 */
function ScanLines() {
  return (
    <div className="synthwave-scanlines" aria-hidden="true" />
  );
}

/**
 * Neon Grid - Perspective floor grid receding to horizon
 * The iconic synthwave visual element
 */
function NeonGrid() {
  return (
    <div className="synthwave-grid-container" aria-hidden="true">
      <div className="synthwave-grid" />
      <div className="synthwave-grid-glow" />
      <div className="synthwave-horizon-line" />
    </div>
  );
}

/**
 * Vignette - Dark purple gradient at edges
 */
function Vignette() {
  return (
    <div className="synthwave-vignette" aria-hidden="true" />
  );
}

/**
 * Neon Sign - Decorative glowing element in corner
 */
function NeonSign() {
  return (
    <div className="synthwave-neon-sign" aria-hidden="true">
      <svg viewBox="0 0 120 40" className="synthwave-neon-svg">
        <defs>
          <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <text
          x="60"
          y="28"
          textAnchor="middle"
          className="synthwave-neon-text"
          filter="url(#neonGlow)"
        >
          ARCADE
        </text>
      </svg>
    </div>
  );
}

/**
 * Arcade Quote - Rotating retro gaming quotes
 */
function ArcadeQuote() {
  const quotes = useMemo(() => [
    'INSERT COIN TO CONTINUE',
    'PLAYER ONE READY',
    'GAME OVER',
    'HIGH SCORE',
    'PRESS START',
    'LEVEL UP',
    'READY PLAYER ONE',
    'CONTINUE? 9...8...7...',
    'WINNER!',
    'NEW HIGH SCORE',
    'CREDITS: 99',
    'SELECT YOUR FIGHTER',
    'ROUND 1 - FIGHT!',
    'FLAWLESS VICTORY',
    'FATALITY',
  ], []);

  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.floor(Math.random() * quotes.length)
  );
  const [isVisible, setIsVisible] = useState(true);

  const cycleQuote = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      setCurrentIndex(prev => (prev + 1) % quotes.length);
      setIsVisible(true);
    }, 800);
  }, [quotes.length]);

  useEffect(() => {
    const interval = setInterval(cycleQuote, 30000);
    return () => clearInterval(interval);
  }, [cycleQuote]);

  return (
    <div
      className={`synthwave-quote ${isVisible ? 'visible' : ''}`}
      aria-hidden="true"
    >
      <span className="synthwave-quote-text">
        {quotes[currentIndex]}
      </span>
      <span className="synthwave-quote-cursor">_</span>
    </div>
  );
}

/**
 * Floating Particles - Optional subtle neon particles
 */
function FloatingParticles() {
  const particles = useMemo(() => {
    return Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 20}s`,
      duration: `${15 + Math.random() * 20}s`,
      size: Math.random() > 0.7 ? 'large' : Math.random() > 0.4 ? 'medium' : 'small',
      color: Math.random() > 0.5 ? 'magenta' : 'cyan',
    }));
  }, []);

  return (
    <div className="synthwave-particles" aria-hidden="true">
      {particles.map(p => (
        <div
          key={p.id}
          className={`synthwave-particle synthwave-particle--${p.size} synthwave-particle--${p.color}`}
          style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Main SynthwaveEffects Component
 */
export function SynthwaveEffects() {
  const { themeId, effectsEnabled } = useTheme();
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    setIsActive(themeId === 'synthwave');
  }, [themeId]);

  if (!isActive || !effectsEnabled) {
    return null;
  }

  return (
    <>
      {/* Background effects layer */}
      <NeonGrid />
      <Vignette />

      {/* Overlay effects */}
      <ScanLines />
      <FloatingParticles />

      {/* UI elements */}
      <NeonSign />
      <ArcadeQuote />
    </>
  );
}

export default SynthwaveEffects;
