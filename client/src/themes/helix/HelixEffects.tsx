/**
 * HelixEffects Component
 *
 * "Where every issue finds its place in the sequence."
 *
 * This component renders visual effects unique to the Helix theme:
 * - DNA strands floating in the background
 * - Gradient mesh overlay with brand colors
 * - Floating connected nodes (data visualization aesthetic)
 * - Subtle glow effects on interactive elements
 *
 * Inspired by the Helixio DNA helix logo.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../ThemeContext';
import './helix-effects.css';

/**
 * DNA Strands - Subtle animated double helix in background
 */
function DNAStrands() {
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  // Generate multiple DNA strand configurations
  const strands = useMemo(() => {
    return Array.from({ length: 3 }, (_, i) => ({
      id: i,
      left: `${15 + i * 35}%`,
      delay: `${i * 2}s`,
      duration: `${25 + i * 5}s`,
      opacity: isDark ? 0.06 + i * 0.02 : 0.04 + i * 0.015,
    }));
  }, [isDark]);

  return (
    <div className="helix-dna-container" aria-hidden="true">
      {strands.map((strand) => (
        <div
          key={strand.id}
          className="helix-dna-strand"
          style={{
            left: strand.left,
            animationDelay: strand.delay,
            animationDuration: strand.duration,
            opacity: strand.opacity,
          }}
        >
          <svg
            viewBox="0 0 100 400"
            className="helix-dna-svg"
            preserveAspectRatio="none"
          >
            {/* First strand - Cyan */}
            <path
              className="helix-strand helix-strand--cyan"
              d="M50,0
                 Q80,50 50,100
                 Q20,150 50,200
                 Q80,250 50,300
                 Q20,350 50,400"
              fill="none"
              strokeWidth="2"
            />
            {/* Second strand - Magenta */}
            <path
              className="helix-strand helix-strand--magenta"
              d="M50,0
                 Q20,50 50,100
                 Q80,150 50,200
                 Q20,250 50,300
                 Q80,350 50,400"
              fill="none"
              strokeWidth="2"
            />
            {/* Connection bars */}
            {[50, 150, 250, 350].map((y) => (
              <line
                key={y}
                className="helix-bar"
                x1="30"
                y1={y}
                x2="70"
                y2={y}
                strokeWidth="1.5"
              />
            ))}
            {/* Node points at intersections */}
            {[0, 100, 200, 300, 400].map((y) => (
              <circle
                key={y}
                className="helix-node"
                cx="50"
                cy={y}
                r="3"
              />
            ))}
          </svg>
        </div>
      ))}
    </div>
  );
}

/**
 * Gradient Mesh - Soft ambient color gradient overlay
 */
function GradientMesh() {
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  return (
    <div
      className={`helix-gradient-mesh ${isDark ? 'helix-gradient-mesh--dark' : 'helix-gradient-mesh--light'}`}
      aria-hidden="true"
    />
  );
}

/**
 * Floating Node - Individual particle in the network
 */
interface FloatingNode {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  color: 'cyan' | 'magenta' | 'yellow';
}

function generateNode(id: number): FloatingNode {
  const colors: FloatingNode['color'][] = ['cyan', 'magenta', 'yellow'];
  return {
    id,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 2 + Math.random() * 4,
    delay: Math.random() * 20,
    duration: 15 + Math.random() * 10,
    color: colors[Math.floor(Math.random() * colors.length)]!,
  };
}

/**
 * Floating Nodes - Connected particles floating slowly
 */
function FloatingNodes() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  const animationRef = useRef<number>();

  const nodes = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      ...generateNode(i),
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const colors = {
      cyan: isDark ? 'rgba(34, 211, 238, 0.6)' : 'rgba(8, 145, 178, 0.5)',
      magenta: isDark ? 'rgba(233, 30, 140, 0.5)' : 'rgba(219, 39, 119, 0.4)',
      yellow: isDark ? 'rgba(250, 204, 21, 0.4)' : 'rgba(202, 138, 4, 0.35)',
    };

    const lineColor = isDark ? 'rgba(34, 211, 238, 0.1)' : 'rgba(8, 145, 178, 0.08)';

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update positions
      nodes.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;

        // Bounce off edges
        if (node.x <= 0 || node.x >= 100) node.vx *= -1;
        if (node.y <= 0 || node.y >= 100) node.vy *= -1;

        // Keep in bounds
        node.x = Math.max(0, Math.min(100, node.x));
        node.y = Math.max(0, Math.min(100, node.y));
      });

      // Draw connections
      nodes.forEach((nodeA, i) => {
        nodes.slice(i + 1).forEach((nodeB) => {
          const dx = (nodeA.x - nodeB.x) * canvas.width / 100;
          const dy = (nodeA.y - nodeB.y) * canvas.height / 100;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 150) {
            ctx.beginPath();
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 1 - dist / 150;
            ctx.moveTo(nodeA.x * canvas.width / 100, nodeA.y * canvas.height / 100);
            ctx.lineTo(nodeB.x * canvas.width / 100, nodeB.y * canvas.height / 100);
            ctx.stroke();
          }
        });
      });

      // Draw nodes
      nodes.forEach((node) => {
        ctx.beginPath();
        ctx.fillStyle = colors[node.color];
        ctx.arc(
          node.x * canvas.width / 100,
          node.y * canvas.height / 100,
          node.size,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodes, isDark]);

  return (
    <canvas
      ref={canvasRef}
      className="helix-floating-nodes"
      aria-hidden="true"
    />
  );
}

/**
 * Subtle Glow - CSS-only glow effects applied via class
 * This component just ensures the CSS is loaded and adds a marker class
 */
function SubtleGlow() {
  useEffect(() => {
    document.documentElement.classList.add('helix-glow-enabled');
    return () => {
      document.documentElement.classList.remove('helix-glow-enabled');
    };
  }, []);

  return null;
}

/**
 * Main HelixEffects Component
 */
export function HelixEffects() {
  const { themeId, effectToggles } = useTheme();

  // Don't render if not the default (helix) theme
  if (themeId !== 'default') {
    return null;
  }

  return (
    <>
      {/* Background effects */}
      {effectToggles.gradientMesh && <GradientMesh />}
      {effectToggles.dnaStrands && <DNAStrands />}

      {/* Floating elements */}
      {effectToggles.floatingNodes && <FloatingNodes />}

      {/* UI enhancements */}
      {effectToggles.subtleGlow && <SubtleGlow />}
    </>
  );
}

export default HelixEffects;
