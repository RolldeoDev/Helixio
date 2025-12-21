/**
 * RetroEffects Component
 *
 * "IT'S DANGEROUS TO GO ALONE! TAKE THIS."
 *
 * This component renders visual effects unique to the Retro Gaming theme:
 * - Pixel grid overlay for authentic 8-bit feel
 * - CRT screen curvature and scanlines
 * - Floating pixel particles (coins, stars, hearts)
 * - Classic game quotes from legendary titles
 * - Corner score/lives display UI element
 *
 * Inspired by NES, SNES, Sega Genesis, and Game Boy aesthetics.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTheme } from '../ThemeContext';
import { useRetroStats } from './useRetroStats';
import './retro-effects.css';

/**
 * Pixel Grid Overlay - Subtle grid pattern like old CRT pixels
 */
function PixelGrid() {
  return (
    <div className="retro-pixel-grid" aria-hidden="true" />
  );
}

/**
 * CRT Screen Effect - Curved edges and scanlines
 */
function CRTEffect() {
  return (
    <div className="retro-crt-overlay" aria-hidden="true">
      <div className="retro-crt-scanlines" />
      <div className="retro-crt-curve" />
    </div>
  );
}

/**
 * Pixel Particle - Individual floating game item
 */
interface PixelParticle {
  id: number;
  type: 'coin' | 'star' | 'heart' | 'gem';
  left: string;
  delay: string;
  duration: string;
}

function generateParticle(id: number): PixelParticle {
  const types: PixelParticle['type'][] = ['coin', 'star', 'heart', 'gem'];
  return {
    id,
    type: types[Math.floor(Math.random() * types.length)]!,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 15}s`,
    duration: `${12 + Math.random() * 8}s`,
  };
}

/**
 * Floating Pixels - Game items floating up the screen
 */
function FloatingPixels() {
  const particles = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => generateParticle(i));
  }, []);

  return (
    <div className="retro-pixels" aria-hidden="true">
      {particles.map(p => (
        <div
          key={p.id}
          className={`retro-pixel retro-pixel--${p.type}`}
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
 * Game Quote - Classic gaming quotes with typewriter effect
 */
function GameQuote() {
  const quotes = useMemo(() => [
    "IT'S DANGEROUS TO GO ALONE!",
    'A WINNER IS YOU!',
    'ALL YOUR BASE ARE BELONG TO US',
    'CONGRATURATION!',
    'THANK YOU MARIO!',
    'BUT OUR PRINCESS IS IN ANOTHER CASTLE',
    'DO A BARREL ROLL!',
    'FINISH HIM!',
    'HADOUKEN!',
    'GAME OVER',
    'CONTINUE? 9',
    'INSERT COIN',
    'PLAYER ONE READY',
    'LEVEL UP!',
    'YOU HAVE DIED OF DYSENTERY',
    'PRESS START',
    'HIGH SCORE',
    'GET OVER HERE!',
    'TOASTY!',
    'PERFECT!',
  ], []);

  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.floor(Math.random() * quotes.length)
  );
  const [isVisible, setIsVisible] = useState(true);
  const [displayText, setDisplayText] = useState('');

  const cycleQuote = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      const nextIndex = (currentIndex + 1) % quotes.length;
      setCurrentIndex(nextIndex);
      setDisplayText('');
      setIsVisible(true);
    }, 600);
  }, [currentIndex, quotes.length]);

  // Typewriter effect
  useEffect(() => {
    if (!isVisible) return;

    const fullText = quotes[currentIndex] || '';
    if (displayText.length < fullText.length) {
      const timer = setTimeout(() => {
        setDisplayText(fullText.slice(0, displayText.length + 1));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [displayText, currentIndex, quotes, isVisible]);

  // Cycle quotes
  useEffect(() => {
    const interval = setInterval(cycleQuote, 25000);
    return () => clearInterval(interval);
  }, [cycleQuote]);

  return (
    <div
      className={`retro-quote ${isVisible ? 'visible' : ''}`}
      aria-hidden="true"
    >
      <span className="retro-quote-text">{displayText}</span>
      <span className="retro-quote-cursor">_</span>
    </div>
  );
}

/**
 * Score Display - Classic game UI corner element
 * Shows real reading stats: score = pages read, coins = comics completed
 */
function ScoreDisplay() {
  const { score, coins, isLoading } = useRetroStats();

  return (
    <div className={`retro-score-display ${isLoading ? 'loading' : ''}`} aria-hidden="true">
      <div className="retro-score-row">
        <span className="retro-score-label">SCORE</span>
        <span className="retro-score-value">{score.toString().padStart(8, '0')}</span>
      </div>
      <div className="retro-score-row">
        <span className="retro-coin-icon" />
        <span className="retro-score-value">x{coins.toString().padStart(3, '0')}</span>
      </div>
    </div>
  );
}

/**
 * Lives Display - Hearts in corner
 */
function LivesDisplay() {
  return (
    <div className="retro-lives-display" aria-hidden="true">
      <span className="retro-heart" />
      <span className="retro-heart" />
      <span className="retro-heart" />
    </div>
  );
}

/**
 * Main RetroEffects Component
 */
export function RetroEffects() {
  const { themeId, getEffectEnabled } = useTheme();
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    setIsActive(themeId === 'retro');
  }, [themeId]);

  if (!isActive) {
    return null;
  }

  return (
    <>
      {/* Background effects */}
      {getEffectEnabled('pixelGrid') && <PixelGrid />}
      {getEffectEnabled('crtEffect') && <CRTEffect />}

      {/* Floating elements */}
      {getEffectEnabled('floatingPixels') && <FloatingPixels />}

      {/* UI elements */}
      {getEffectEnabled('scoreDisplay') && <ScoreDisplay />}
      {getEffectEnabled('livesDisplay') && <LivesDisplay />}
      {getEffectEnabled('gameQuote') && <GameQuote />}
    </>
  );
}

export default RetroEffects;
