/**
 * PulpEffects Component
 *
 * "The city was a dame who'd seen too much and forgotten
 *  how to smile. I was just another sap looking for answers
 *  in the bottom of a whiskey glass."
 *
 * This component renders the atmospheric visual effects for the Pulp Noir theme:
 * - Aged paper texture for that vintage pulp magazine feel
 * - Ink splatters and printing imperfections
 * - Classic film noir grain overlay
 * - Vignette darkening like old photographs
 * - Drifting cigarette smoke wisps
 * - Rotating quotes from the golden age of pulp fiction
 *
 * Each effect can be toggled independently via theme settings.
 */

import { useEffect, useState, useMemo } from 'react';
import { useTheme } from '../ThemeContext';
import './pulp-effects.css';

/**
 * Classic pulp noir quotes that capture the essence of the genre
 */
const PULP_QUOTES = [
  { text: "She walked into my office like trouble on high heels.", author: "The Detective's Lament" },
  { text: "In this town, everybody's got a secret. Most of 'em are buried six feet under.", author: "City of Shadows" },
  { text: "The rain fell like tears from a sky that had given up on redemption.", author: "Midnight Confessional" },
  { text: "Trust is a luxury I can't afford. Cash up front.", author: "The Hard Goodbye" },
  { text: "Every dame's got a story. Most of 'em end in tragedy.", author: "Femme Fatale" },
  { text: "The night was dark, but my past was darker.", author: "Shadows of Yesterday" },
  { text: "I'd seen enough dead men to know when I was looking at a corpse.", author: "Dead Men's Tales" },
  { text: "The bottle was my only friend. At least it never lied to me.", author: "Bottom of the Glass" },
  { text: "Justice? In this city, justice is just another word for revenge.", author: "Streets of Sin" },
  { text: "She had eyes like a cat and a smile that promised trouble.", author: "The Black Dahlia" },
  { text: "Some questions are better left unasked. I asked anyway.", author: "Curious George" },
  { text: "The gun felt heavy in my hand. So did my conscience.", author: "The Last Bullet" },
];

/**
 * Paper Texture Effect Component
 * Adds aged paper grain overlay for authentic vintage feel
 */
function PaperTextureEffect() {
  return (
    <div className="pulp-paper-texture" aria-hidden="true" />
  );
}

/**
 * Ink Splatter Effect Component
 * Subtle ink drops and printing imperfections
 */
function InkSplatterEffect() {
  return (
    <div className="pulp-ink-splatter" aria-hidden="true">
      <div className="pulp-ink-drop pulp-ink-drop--1" />
      <div className="pulp-ink-drop pulp-ink-drop--2" />
      <div className="pulp-ink-drop pulp-ink-drop--3" />
      <div className="pulp-ink-drop pulp-ink-drop--4" />
      <div className="pulp-ink-drop pulp-ink-drop--5" />
      {/* Coffee stains for extra vintage feel */}
      <div className="pulp-stain pulp-stain--1" />
      <div className="pulp-stain pulp-stain--2" />
    </div>
  );
}

/**
 * Film Grain Effect Component
 * Classic film noir grain overlay with subtle animation
 */
function FilmGrainEffect() {
  return (
    <div className="pulp-film-grain" aria-hidden="true" />
  );
}

/**
 * Vignette Effect Component
 * Dark corners like vintage photographs
 */
function VignetteEffect() {
  return (
    <div className="pulp-vignette" aria-hidden="true" />
  );
}

/**
 * Smoke Wisps Effect Component
 * Drifting cigarette smoke for that detective office atmosphere
 */
function SmokeWispsEffect() {
  return (
    <div className="pulp-smoke-container" aria-hidden="true">
      <div className="pulp-smoke-wisp pulp-smoke-wisp--1" />
      <div className="pulp-smoke-wisp pulp-smoke-wisp--2" />
      <div className="pulp-smoke-wisp pulp-smoke-wisp--3" />
    </div>
  );
}

/**
 * Pulp Quote Component
 * Displays rotating quotes from pulp fiction with typewriter effect
 */
function PulpQuoteEffect() {
  const quotes = useMemo(() => PULP_QUOTES, []);

  const [currentQuote, setCurrentQuote] = useState(() => {
    const index = Math.floor(Math.random() * quotes.length);
    return quotes[index] ?? quotes[0]!;
  });
  const [isVisible, setIsVisible] = useState(true);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  // Typewriter effect
  useEffect(() => {
    if (!isTyping) return;

    const fullText = currentQuote.text;
    let currentIndex = 0;

    const typeInterval = setInterval(() => {
      if (currentIndex <= fullText.length) {
        setDisplayedText(fullText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(typeInterval);
        setIsTyping(false);
      }
    }, 40); // Typing speed

    return () => clearInterval(typeInterval);
  }, [currentQuote, isTyping]);

  // Quote rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);

      setTimeout(() => {
        const index = Math.floor(Math.random() * quotes.length);
        const newQuote = quotes[index] ?? quotes[0]!;
        setCurrentQuote(newQuote);
        setDisplayedText('');
        setIsTyping(true);
        setIsVisible(true);
      }, 800);
    }, 25000); // Change quote every 25 seconds

    return () => clearInterval(interval);
  }, [quotes]);

  return (
    <div
      className="pulp-quote"
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      <span className="pulp-quote-text">
        "{displayedText}"
        {isTyping && <span className="pulp-quote-cursor" />}
      </span>
      {!isTyping && (
        <span className="pulp-quote-author">
          &mdash; {currentQuote.author}
        </span>
      )}
    </div>
  );
}

/**
 * Main PulpEffects Component
 * Orchestrates all visual effects based on theme settings
 */
export function PulpEffects() {
  const { themeId, effectToggles } = useTheme();

  // Don't render anything if theme isn't active
  if (themeId !== 'pulp') {
    return null;
  }

  return (
    <>
      {/* Background effects (lowest z-index) */}
      {effectToggles.paperTexture && <PaperTextureEffect />}

      {/* Overlay effects */}
      {effectToggles.inkSplatter && <InkSplatterEffect />}
      {effectToggles.filmGrain && <FilmGrainEffect />}
      {effectToggles.vignette && <VignetteEffect />}

      {/* Particle effects */}
      {effectToggles.smokeWisps && <SmokeWispsEffect />}

      {/* UI elements (highest z-index) */}
      {effectToggles.pulpQuote && <PulpQuoteEffect />}
    </>
  );
}

export default PulpEffects;
