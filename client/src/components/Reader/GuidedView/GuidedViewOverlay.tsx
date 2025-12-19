/**
 * Guided View Overlay Component
 *
 * Provides panel-by-panel navigation with smooth pan/zoom transitions.
 * Overlays on top of the regular page view when Guided View mode is active.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Panel, detectPanels, PanelDetectionResult } from './panelDetection';
import './GuidedView.css';

// =============================================================================
// Types
// =============================================================================

interface GuidedViewOverlayProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  isActive: boolean;
  readingDirection: 'ltr' | 'rtl';
  onPanelChange?: (panelIndex: number, totalPanels: number) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  onExit: () => void;
}

interface ViewState {
  scale: number;
  x: number;
  y: number;
}

// =============================================================================
// Animation Helpers
// =============================================================================

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

// =============================================================================
// Component
// =============================================================================

export function GuidedViewOverlay({
  imageUrl,
  imageWidth,
  imageHeight,
  isActive,
  readingDirection,
  onPanelChange,
  onNextPage,
  onPrevPage,
  onExit,
}: GuidedViewOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0);
  const [viewState, setViewState] = useState<ViewState>({ scale: 1, x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const [detectionResult, setDetectionResult] = useState<PanelDetectionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const animationRef = useRef<number | null>(null);

  // Detect panels when image changes
  useEffect(() => {
    if (!isActive || !imageUrl) return;

    setIsLoading(true);

    detectPanels(imageUrl, { readingDirection })
      .then((result) => {
        setDetectionResult(result);
        setPanels(result.panels);
        setCurrentPanelIndex(0);
        setIsLoading(false);
      })
      .catch(() => {
        // Fallback to single panel on error
        setPanels([{
          id: 'panel-0',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          order: 0,
        }]);
        setCurrentPanelIndex(0);
        setIsLoading(false);
      });
  }, [imageUrl, isActive, readingDirection]);

  // Calculate view state for a panel
  const calculatePanelView = useCallback((panel: Panel): ViewState => {
    if (!containerRef.current) {
      return { scale: 1, x: 0, y: 0 };
    }

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Panel dimensions in pixels
    const panelPixelWidth = (panel.width / 100) * imageWidth;
    const panelPixelHeight = (panel.height / 100) * imageHeight;
    const panelPixelX = (panel.x / 100) * imageWidth;
    const panelPixelY = (panel.y / 100) * imageHeight;

    // Calculate scale to fit panel in container with some padding
    const padding = 0.9; // 90% of container
    const scaleX = (containerWidth * padding) / panelPixelWidth;
    const scaleY = (containerHeight * padding) / panelPixelHeight;
    const scale = Math.min(scaleX, scaleY, 3); // Cap at 3x zoom

    // Calculate center position
    const panelCenterX = panelPixelX + panelPixelWidth / 2;
    const panelCenterY = panelPixelY + panelPixelHeight / 2;

    // Calculate offset to center panel in container
    const x = containerWidth / 2 - panelCenterX * scale;
    const y = containerHeight / 2 - panelCenterY * scale;

    return { scale, x, y };
  }, [imageWidth, imageHeight]);

  // Animate to a panel
  const animateToPanel = useCallback((panelIndex: number) => {
    const panel = panels[panelIndex];
    if (!panel || isAnimating) return;

    const targetView = calculatePanelView(panel);
    const startView = { ...viewState };
    const duration = 400; // ms

    setIsAnimating(true);
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      setViewState({
        scale: lerp(startView.scale, targetView.scale, eased),
        x: lerp(startView.x, targetView.x, eased),
        y: lerp(startView.y, targetView.y, eased),
      });

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [panels, viewState, isAnimating, calculatePanelView]);

  // Go to next panel
  const nextPanel = useCallback(() => {
    if (isAnimating) return;

    if (currentPanelIndex < panels.length - 1) {
      const nextIndex = currentPanelIndex + 1;
      setCurrentPanelIndex(nextIndex);
      animateToPanel(nextIndex);
      onPanelChange?.(nextIndex, panels.length);
    } else {
      // At last panel - go to next page
      onNextPage();
    }
  }, [currentPanelIndex, panels.length, isAnimating, animateToPanel, onPanelChange, onNextPage]);

  // Go to previous panel
  const prevPanel = useCallback(() => {
    if (isAnimating) return;

    if (currentPanelIndex > 0) {
      const prevIndex = currentPanelIndex - 1;
      setCurrentPanelIndex(prevIndex);
      animateToPanel(prevIndex);
      onPanelChange?.(prevIndex, panels.length);
    } else {
      // At first panel - go to previous page
      onPrevPage();
    }
  }, [currentPanelIndex, isAnimating, animateToPanel, onPanelChange, onPrevPage]);

  // Initialize view when panels are loaded
  useEffect(() => {
    if (panels.length > 0 && !isLoading) {
      animateToPanel(0);
      onPanelChange?.(0, panels.length);
    }
  }, [panels, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (readingDirection === 'ltr') {
            nextPanel();
          } else {
            prevPanel();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (readingDirection === 'ltr') {
            prevPanel();
          } else {
            nextPanel();
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          nextPanel();
          break;
        case 'ArrowUp':
          e.preventDefault();
          prevPanel();
          break;
        case 'Escape':
          e.preventDefault();
          onExit();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, nextPanel, prevPanel, readingDirection, onExit]);

  // Touch handling
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0]!.clientX,
        y: e.touches[0]!.clientY,
        time: Date.now(),
      };
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0]!;
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;

    // Swipe detection
    const minSwipeDistance = 50;
    const maxSwipeTime = 300;

    if (deltaTime < maxSwipeTime) {
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
        // Horizontal swipe
        if (deltaX < 0) {
          // Swipe left
          readingDirection === 'ltr' ? nextPanel() : prevPanel();
        } else {
          // Swipe right
          readingDirection === 'ltr' ? prevPanel() : nextPanel();
        }
      } else if (Math.abs(deltaY) > minSwipeDistance) {
        // Vertical swipe
        if (deltaY < 0) {
          nextPanel();
        } else {
          prevPanel();
        }
      }
    }

    touchStartRef.current = null;
  }, [nextPanel, prevPanel, readingDirection]);

  // Click to advance
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const containerWidth = rect.width;

    // Click on left third = prev, right two-thirds = next
    if (clickX < containerWidth / 3) {
      readingDirection === 'ltr' ? prevPanel() : nextPanel();
    } else {
      readingDirection === 'ltr' ? nextPanel() : prevPanel();
    }
  }, [nextPanel, prevPanel, readingDirection]);

  // Panel indicator dots
  const panelIndicators = useMemo(() => {
    if (panels.length <= 1) return null;

    return (
      <div className="guided-view-indicators">
        {panels.map((_, index) => (
          <button
            key={index}
            className={`guided-view-indicator ${index === currentPanelIndex ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (!isAnimating) {
                setCurrentPanelIndex(index);
                animateToPanel(index);
                onPanelChange?.(index, panels.length);
              }
            }}
            aria-label={`Go to panel ${index + 1}`}
          />
        ))}
      </div>
    );
  }, [panels, currentPanelIndex, isAnimating, animateToPanel, onPanelChange]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  if (!isActive) return null;

  return (
    <div
      ref={containerRef}
      className="guided-view-overlay"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Loading State */}
      {isLoading && (
        <div className="guided-view-loading">
          <div className="guided-view-spinner" />
          <span>Detecting panels...</span>
        </div>
      )}

      {/* Transformed Image */}
      {!isLoading && (
        <div
          className="guided-view-image-container"
          style={{
            transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <img
            src={imageUrl}
            alt=""
            className="guided-view-image"
            draggable={false}
          />

          {/* Debug: Panel outlines (hidden in production) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="guided-view-debug-panels">
              {panels.map((panel, index) => (
                <div
                  key={panel.id}
                  className={`guided-view-debug-panel ${index === currentPanelIndex ? 'current' : ''}`}
                  style={{
                    left: `${panel.x}%`,
                    top: `${panel.y}%`,
                    width: `${panel.width}%`,
                    height: `${panel.height}%`,
                  }}
                >
                  <span>{index + 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Panel Indicators */}
      {panelIndicators}

      {/* Info Overlay */}
      <div className="guided-view-info">
        <span>Panel {currentPanelIndex + 1}/{panels.length}</span>
        {detectionResult && (
          <span className="guided-view-confidence">
            {detectionResult.method === 'auto' ? 'Auto' : 'Grid'} ({Math.round(detectionResult.confidence * 100)}%)
          </span>
        )}
      </div>

      {/* Exit Button */}
      <button
        className="guided-view-exit"
        onClick={(e) => {
          e.stopPropagation();
          onExit();
        }}
        title="Exit Guided View (Esc)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Navigation Hints */}
      <div className="guided-view-hints">
        <div className="guided-view-hint left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </div>
        <div className="guided-view-hint right">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
