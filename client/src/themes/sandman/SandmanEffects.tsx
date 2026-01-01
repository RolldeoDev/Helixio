/**
 * SandmanEffects Component - Endless Night Edition
 *
 * "Everybody has a secret world inside of them."
 * - Dream of the Endless
 *
 * This component renders the atmospheric visual effects for the Endless Night theme:
 * - Raven Feathers: Sparse dark feathers drifting slowly through the void (2-3 at a time)
 * - Starfield Drift: Distant stars rotating slowly in infinite darkness
 *
 * The effects evoke the gothic elegance of the Endless and the impossible
 * architecture of the Dreaming - intimate darkness with glimpses of infinity.
 */

import { useEffect, useState, useMemo } from 'react';
import { useTheme } from '../ThemeContext';
import './sandman-effects.css';

// ============================================================================
// RAVEN FEATHERS - Sparse, contemplative presence
// ============================================================================

interface Feather {
  id: number;
  left: number;
  rotation: number;
  size: 'small' | 'medium' | 'large';
  animationDuration: number;
  swayOffset: number;
}

const FEATHER_COUNT = 3; // Very sparse - only 2-3 visible at once
const FEATHER_MIN_DURATION = 25; // Slow, deliberate fall
const FEATHER_MAX_DURATION = 35;

function generateFeather(id: number): Feather {
  const sizeRoll = Math.random();
  let size: 'small' | 'medium' | 'large';
  if (sizeRoll < 0.4) {
    size = 'small';
  } else if (sizeRoll < 0.8) {
    size = 'medium';
  } else {
    size = 'large';
  }

  return {
    id,
    left: 5 + Math.random() * 90, // Keep away from edges
    rotation: -30 + Math.random() * 60, // Initial rotation
    size,
    animationDuration: FEATHER_MIN_DURATION + Math.random() * (FEATHER_MAX_DURATION - FEATHER_MIN_DURATION),
    swayOffset: Math.random() * Math.PI * 2, // Phase offset for sway
  };
}

/**
 * Individual Feather SVG Component
 */
function FeatherSVG({ size }: { size: 'small' | 'medium' | 'large' }) {
  const dimensions = {
    small: { width: 12, height: 28 },
    medium: { width: 16, height: 38 },
    large: { width: 22, height: 52 },
  };
  const { width, height } = dimensions[size];

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 22 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="endless-feather-svg"
    >
      {/* Feather body - dark with subtle blue-grey edge */}
      <path
        d="M11 0 C11 0 4 8 3 20 C2 32 5 44 11 52 C17 44 20 32 19 20 C18 8 11 0 11 0Z"
        fill="#1a1c22"
        stroke="#2a2d35"
        strokeWidth="0.5"
      />
      {/* Central shaft */}
      <line
        x1="11"
        y1="2"
        x2="11"
        y2="50"
        stroke="#2a2d35"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Barb lines - subtle texture */}
      <g stroke="#252830" strokeWidth="0.3" opacity="0.6">
        <line x1="11" y1="10" x2="5" y2="14" />
        <line x1="11" y1="10" x2="17" y2="14" />
        <line x1="11" y1="18" x2="4" y2="24" />
        <line x1="11" y1="18" x2="18" y2="24" />
        <line x1="11" y1="26" x2="5" y2="34" />
        <line x1="11" y1="26" x2="17" y2="34" />
        <line x1="11" y1="36" x2="7" y2="44" />
        <line x1="11" y1="36" x2="15" y2="44" />
      </g>
    </svg>
  );
}

/**
 * Raven Feathers Effect Component
 */
function RavenFeathers() {
  const [feathers, setFeathers] = useState<Feather[]>([]);

  useEffect(() => {
    // Stagger initial feathers so they don't all appear at once
    const initialFeathers = Array.from({ length: FEATHER_COUNT }, (_, i) =>
      generateFeather(i)
    );
    setFeathers(initialFeathers);
  }, []);

  const handleAnimationEnd = (id: number) => {
    setFeathers(prev =>
      prev.map(f => (f.id === id ? generateFeather(id) : f))
    );
  };

  return (
    <div className="endless-feathers" aria-hidden="true">
      {feathers.map((feather, index) => (
        <div
          key={feather.id}
          className={`endless-feather endless-feather--${feather.size}`}
          style={{
            left: `${feather.left}%`,
            '--rotation': `${feather.rotation}deg`,
            '--duration': `${feather.animationDuration}s`,
            '--delay': `${index * 8}s`, // Stagger by 8 seconds
            '--sway-offset': feather.swayOffset,
          } as React.CSSProperties}
          onAnimationIteration={() => handleAnimationEnd(feather.id)}
        >
          <FeatherSVG size={feather.size} />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// STARFIELD DRIFT - Infinite cosmic background
// ============================================================================

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  color: 'white' | 'teal' | 'amber';
  layer: 'distant' | 'medium' | 'close';
}

/**
 * Generate stars for each layer
 */
function generateStars(): Star[] {
  const stars: Star[] = [];
  let id = 0;

  // Distant layer - many tiny dim stars
  for (let i = 0; i < 60; i++) {
    stars.push({
      id: id++,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 0.5 + Math.random() * 0.5,
      opacity: 0.3 + Math.random() * 0.3,
      color: 'white',
      layer: 'distant',
    });
  }

  // Medium layer - smaller count, slightly brighter
  for (let i = 0; i < 25; i++) {
    const colorRoll = Math.random();
    let color: Star['color'] = 'white';
    if (colorRoll > 0.85) color = 'teal';
    else if (colorRoll > 0.7) color = 'amber';

    stars.push({
      id: id++,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 0.5,
      opacity: 0.5 + Math.random() * 0.3,
      color,
      layer: 'medium',
    });
  }

  // Close layer - few bright stars with glow
  for (let i = 0; i < 8; i++) {
    const colorRoll = Math.random();
    let color: Star['color'] = 'white';
    if (colorRoll > 0.7) color = 'amber';
    else if (colorRoll > 0.5) color = 'teal';

    stars.push({
      id: id++,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1.5 + Math.random() * 1,
      opacity: 0.7 + Math.random() * 0.3,
      color,
      layer: 'close',
    });
  }

  return stars;
}

/**
 * Starfield Drift Effect Component
 */
function StarfieldDrift() {
  const stars = useMemo(() => generateStars(), []);

  const getStarColor = (color: Star['color']) => {
    switch (color) {
      case 'teal':
        return '#a8c4c8';
      case 'amber':
        return '#d4a574';
      default:
        return '#e0e4ea';
    }
  };

  return (
    <div className="endless-starfield" aria-hidden="true">
      {/* Distant stars - slowest rotation */}
      <div className="endless-starfield-layer endless-starfield-layer--distant">
        {stars
          .filter(s => s.layer === 'distant')
          .map(star => (
            <div
              key={star.id}
              className="endless-star"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                opacity: star.opacity,
                backgroundColor: getStarColor(star.color),
              }}
            />
          ))}
      </div>

      {/* Medium stars - medium rotation */}
      <div className="endless-starfield-layer endless-starfield-layer--medium">
        {stars
          .filter(s => s.layer === 'medium')
          .map(star => (
            <div
              key={star.id}
              className="endless-star endless-star--glow"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                opacity: star.opacity,
                backgroundColor: getStarColor(star.color),
                boxShadow: `0 0 ${star.size * 2}px ${getStarColor(star.color)}`,
              }}
            />
          ))}
      </div>

      {/* Close stars - fastest rotation, with twinkle */}
      <div className="endless-starfield-layer endless-starfield-layer--close">
        {stars
          .filter(s => s.layer === 'close')
          .map(star => (
            <div
              key={star.id}
              className="endless-star endless-star--bright"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                opacity: star.opacity,
                backgroundColor: getStarColor(star.color),
                boxShadow: `0 0 ${star.size * 3}px ${getStarColor(star.color)}, 0 0 ${star.size * 6}px ${getStarColor(star.color)}`,
                animationDelay: `${Math.random() * 10}s`,
              }}
            />
          ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Main SandmanEffects Component - Endless Night Edition
 */
export function SandmanEffects() {
  const { themeId, effectToggles } = useTheme();

  // Don't render anything if theme isn't active
  if (themeId !== 'sandman') {
    return null;
  }

  return (
    <>
      {/* Background starfield - behind everything */}
      {effectToggles.starfieldDrift && <StarfieldDrift />}

      {/* Floating feathers - subtle foreground presence */}
      {effectToggles.ravenFeathers && <RavenFeathers />}
    </>
  );
}

export default SandmanEffects;
