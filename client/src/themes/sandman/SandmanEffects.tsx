/**
 * SandmanEffects Component
 *
 * "I am the Lord of Dreams. And my realm is not a place of madness."
 * - Morpheus, Dream of the Endless
 *
 * This component renders the magical visual effects unique to the Sandman theme:
 * - Floating dream sand particles that drift across the screen
 * - Dynamic particle generation with varied sizes and speeds
 * - Performance-optimized with CSS animations
 * - Automatically detects theme changes and responds accordingly
 *
 * The particles represent the dream sand that Morpheus uses to bring sleep
 * and dreams to the waking world. Each golden mote is a fragment of the
 * Dreaming itself.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTheme } from '../ThemeContext';
import './sandman-effects.css';

interface Particle {
  id: number;
  left: string;
  animationDelay: string;
  animationDuration: string;
  size: 'small' | 'medium' | 'large';
}

const PARTICLE_COUNT = 40;
const BASE_DURATION = 20; // seconds

/**
 * Generate a random particle with varied properties
 */
function generateParticle(id: number): Particle {
  const left = Math.random() * 100;
  const delay = Math.random() * BASE_DURATION;
  const durationVariance = 0.5 + Math.random(); // 0.5x to 1.5x speed
  const sizeRoll = Math.random();

  let size: 'small' | 'medium' | 'large';
  if (sizeRoll < 0.5) {
    size = 'small';
  } else if (sizeRoll < 0.85) {
    size = 'medium';
  } else {
    size = 'large';
  }

  return {
    id,
    left: `${left}%`,
    animationDelay: `-${delay}s`,
    animationDuration: `${BASE_DURATION * durationVariance}s`,
    size,
  };
}

/**
 * Dream Quote Component - Displays ethereal quotes from the Sandman
 */
function DreamQuote() {
  const quotes = useMemo(() => [
    "I am hope.",
    "Everybody has a secret world inside of them.",
    "Sometimes you wake up. Sometimes the fall kills you.",
    "Have you ever had one of those days when something just seems to be trying to tell you somebody?",
    "You get what anybody gets - you get a lifetime.",
    "I think I'll dismember the world and then I'll dance in the wreckage.",
    "What power would hell have if those imprisoned here would not be able to dream of heaven?",
    "Destiny smiles. And no one knows.",
    "To absent friends, lost loves, old gods, and the season of mists.",
  ], []);

  const [currentQuote, setCurrentQuote] = useState(() =>
    quotes[Math.floor(Math.random() * quotes.length)]
  );
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentQuote(quotes[Math.floor(Math.random() * quotes.length)]);
        setIsVisible(true);
      }, 1000);
    }, 30000); // Change quote every 30 seconds

    return () => clearInterval(interval);
  }, [quotes]);

  return (
    <div
      className="sandman-quote"
      style={{
        position: 'fixed',
        bottom: '60px',
        right: '20px',
        maxWidth: '300px',
        fontFamily: "'Crimson Text', Georgia, serif",
        fontStyle: 'italic',
        fontSize: '0.875rem',
        color: 'var(--color-text-subtle)',
        opacity: isVisible ? 0.6 : 0,
        transition: 'opacity 1s ease-in-out',
        pointerEvents: 'none',
        zIndex: 1,
        textAlign: 'right',
        lineHeight: 1.5,
      }}
    >
      "{currentQuote}"
      <div style={{
        marginTop: '4px',
        fontSize: '0.75rem',
        fontStyle: 'normal',
        color: 'var(--color-primary)',
      }}>
        — The Sandman
      </div>
    </div>
  );
}

/**
 * Morpheus Sigil - A subtle animated sigil in the corner
 */
function MorpheusSigil() {
  return (
    <svg
      className="sandman-sigil"
      viewBox="0 0 100 100"
      style={{
        position: 'fixed',
        bottom: '80px',
        left: '20px',
        width: '40px',
        height: '40px',
        opacity: 0.15,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {/* Dream Helm inspired sigil */}
      <defs>
        <linearGradient id="sigilGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: 'var(--color-primary)', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: 'var(--color-accent)', stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#sigilGradient)" strokeWidth="2">
        {/* Outer circle */}
        <circle cx="50" cy="50" r="45" opacity="0.5">
          <animate
            attributeName="r"
            values="45;47;45"
            dur="4s"
            repeatCount="indefinite"
          />
        </circle>
        {/* Inner patterns - representing the Dream Helm */}
        <ellipse cx="50" cy="35" rx="25" ry="15">
          <animate
            attributeName="opacity"
            values="0.8;0.4;0.8"
            dur="3s"
            repeatCount="indefinite"
          />
        </ellipse>
        <path d="M 25 50 Q 50 70 75 50" strokeWidth="3">
          <animate
            attributeName="stroke-opacity"
            values="1;0.5;1"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </path>
        {/* Eye-like center */}
        <circle cx="50" cy="45" r="8" fill="url(#sigilGradient)" stroke="none">
          <animate
            attributeName="r"
            values="8;10;8"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
        {/* Radiating lines */}
        <line x1="50" y1="5" x2="50" y2="15" opacity="0.5" />
        <line x1="50" y1="85" x2="50" y2="95" opacity="0.5" />
        <line x1="5" y1="50" x2="15" y2="50" opacity="0.5" />
        <line x1="85" y1="50" x2="95" y2="50" opacity="0.5" />
      </g>
    </svg>
  );
}

/**
 * Vignette Effect Component
 */
function VignetteEffect() {
  return (
    <div
      className="sandman-vignette"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        background: `
          radial-gradient(
            ellipse at center,
            transparent 0%,
            transparent 50%,
            rgba(10, 6, 18, 0.3) 100%
          )
        `,
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Dream Sand Particles Component
 */
function DreamSandParticles() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const newParticles = Array.from(
      { length: PARTICLE_COUNT },
      (_, i) => generateParticle(i)
    );
    setParticles(newParticles);
  }, []);

  const regenerateParticle = useCallback((id: number) => {
    setParticles(prev =>
      prev.map(p => p.id === id ? generateParticle(id) : p)
    );
  }, []);

  return (
    <div className="sandman-particles" aria-hidden="true">
      {particles.map(particle => (
        <div
          key={particle.id}
          className={`sandman-particle sandman-particle--${particle.size}`}
          style={{
            left: particle.left,
            animationDelay: particle.animationDelay,
            animationDuration: particle.animationDuration,
          }}
          onAnimationIteration={() => regenerateParticle(particle.id)}
        />
      ))}
    </div>
  );
}

/**
 * Main SandmanEffects Component
 */
export function SandmanEffects() {
  const { themeId, effectToggles } = useTheme();

  // Don't render anything if theme isn't active
  if (themeId !== 'sandman') {
    return null;
  }

  return (
    <>
      {/* Particle Container */}
      {effectToggles.dreamSand && <DreamSandParticles />}

      {/* Decorative Elements */}
      {effectToggles.morpheusSigil && <MorpheusSigil />}
      {effectToggles.dreamQuote && <DreamQuote />}

      {/* Vignette Effect */}
      {effectToggles.vignette && <VignetteEffect />}
    </>
  );
}

export default SandmanEffects;
