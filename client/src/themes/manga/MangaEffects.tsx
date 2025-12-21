/**
 * MangaEffects Component
 *
 * This component renders visual effects unique to the Manga/Anime theme:
 * - Floating sakura (cherry blossom) petals
 * - Soft vignette with pink tint
 * - Paper texture overlay (like manga pages)
 * - Manga-style expressions and sound effects
 *
 * Inspired by Japanese manga and anime aesthetics - serene, elegant, whimsical.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTheme } from '../ThemeContext';
import './manga-effects.css';

/**
 * Sakura Petal - Individual floating cherry blossom petal
 */
interface SakuraPetal {
  id: number;
  left: string;
  delay: string;
  duration: string;
  size: 'small' | 'medium' | 'large';
  rotation: number;
}

function generatePetal(id: number): SakuraPetal {
  const sizes: SakuraPetal['size'][] = ['small', 'medium', 'large'];
  return {
    id,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 20}s`,
    duration: `${15 + Math.random() * 15}s`,
    size: sizes[Math.floor(Math.random() * sizes.length)]!,
    rotation: Math.random() * 360,
  };
}

/**
 * Sakura Petals - Cherry blossoms floating across the screen
 */
function SakuraPetals() {
  const petals = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => generatePetal(i));
  }, []);

  return (
    <div className="manga-sakura" aria-hidden="true">
      {petals.map((petal) => (
        <div
          key={petal.id}
          className={`manga-petal manga-petal--${petal.size}`}
          style={{
            left: petal.left,
            animationDelay: petal.delay,
            animationDuration: petal.duration,
            '--petal-rotation': `${petal.rotation}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/**
 * Paper Texture - Subtle manga paper grain effect
 */
function PaperTexture() {
  return <div className="manga-paper-texture" aria-hidden="true" />;
}

/**
 * Vignette - Soft pink-tinted screen edge fade
 */
function Vignette() {
  return <div className="manga-vignette" aria-hidden="true" />;
}

/**
 * Speed Lines - Occasional manga-style motion lines
 */
function SpeedLines() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Randomly show speed lines for dramatic effect
    const showLines = () => {
      if (Math.random() > 0.85) {
        setIsVisible(true);
        setTimeout(() => setIsVisible(false), 800);
      }
    };

    const interval = setInterval(showLines, 45000);
    return () => clearInterval(interval);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="manga-speed-lines" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="manga-speed-line"
          style={{
            '--line-angle': `${-15 + i * 2.5}deg`,
            '--line-delay': `${i * 0.03}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/**
 * Manga Expression - Sound effects and expressions in speech bubble style
 */
function MangaExpression() {
  const expressions = useMemo(
    () => [
      { text: 'SUGOI!', style: 'excited' },
      { text: 'KAWAII', style: 'cute' },
      { text: 'DOKI DOKI', style: 'heartbeat' },
      { text: '!!!', style: 'shock' },
      { text: 'NYA~', style: 'cute' },
      { text: 'YATTA!', style: 'excited' },
      { text: 'NANI?!', style: 'shock' },
      { text: 'GAMBATTE', style: 'encourage' },
      { text: 'SUBARASHII', style: 'wonderful' },
      { text: 'UWU', style: 'cute' },
      { text: 'OWO', style: 'curious' },
      { text: 'KYAA~', style: 'excited' },
    ],
    []
  );

  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.floor(Math.random() * expressions.length)
  );
  const [isVisible, setIsVisible] = useState(true);

  const cycleExpression = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      const nextIndex = (currentIndex + 1) % expressions.length;
      setCurrentIndex(nextIndex);
      setIsVisible(true);
    }, 500);
  }, [currentIndex, expressions.length]);

  useEffect(() => {
    const interval = setInterval(cycleExpression, 35000);
    return () => clearInterval(interval);
  }, [cycleExpression]);

  const expression = expressions[currentIndex]!;

  return (
    <div
      className={`manga-expression manga-expression--${expression.style} ${isVisible ? 'visible' : ''}`}
      aria-hidden="true"
    >
      <span className="manga-expression-text">{expression.text}</span>
    </div>
  );
}

/**
 * Sakura Flower - Decorative flower element
 */
function SakuraFlower() {
  return <div className="manga-corner-decoration" aria-hidden="true" />;
}

/**
 * Sparkle Stars - Small twinkling stars
 */
function SparkleStars() {
  const stars = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => ({
      id: i,
      left: `${10 + Math.random() * 80}%`,
      top: `${10 + Math.random() * 80}%`,
      delay: `${Math.random() * 5}s`,
      duration: `${2 + Math.random() * 3}s`,
    }));
  }, []);

  return (
    <div className="manga-sparkles" aria-hidden="true">
      {stars.map((star) => (
        <div
          key={star.id}
          className="manga-sparkle"
          style={{
            left: star.left,
            top: star.top,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Main MangaEffects Component
 */
export function MangaEffects() {
  const { themeId, effectToggles } = useTheme();

  if (themeId !== 'manga') {
    return null;
  }

  return (
    <>
      {/* Background effects */}
      {effectToggles.paperTexture && <PaperTexture />}
      {effectToggles.vignette && <Vignette />}

      {/* Floating elements */}
      {effectToggles.sakuraPetals && <SakuraPetals />}
      {effectToggles.sparkleStars && <SparkleStars />}

      {/* Dynamic effects */}
      {effectToggles.speedLines && <SpeedLines />}

      {/* UI elements */}
      {effectToggles.sakuraFlower && <SakuraFlower />}
      {effectToggles.mangaExpression && <MangaExpression />}
    </>
  );
}

export default MangaEffects;
