import { useLayoutEffect, useRef, useState } from 'react';
import type { HeatmapDay } from './heatmap-utils';
import { formatDurationShort } from './heatmap-utils';
import './ActivityHeatmap.css';

interface HeatmapTooltipProps {
  day: HeatmapDay | null;
  position: { x: number; y: number } | null;
}

export function HeatmapTooltip({ day, position }: HeatmapTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState<{ x: number; y: number } | null>(null);
  const [isPositioned, setIsPositioned] = useState(false);

  // Use useLayoutEffect to calculate position before paint, preventing visual jump
  useLayoutEffect(() => {
    if (!position || !tooltipRef.current) {
      setAdjustedPosition(null);
      setIsPositioned(false);
      return;
    }

    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    let x = position.x;
    let y = position.y;

    // Adjust if tooltip would go off-screen
    if (x + rect.width / 2 > viewportWidth - 16) {
      x = viewportWidth - rect.width / 2 - 16;
    }
    if (x - rect.width / 2 < 16) {
      x = rect.width / 2 + 16;
    }

    setAdjustedPosition({ x, y });
    setIsPositioned(true);
  }, [position]);

  if (!day || !position || day.intensity === -1) {
    return null;
  }

  const formattedDate = new Date(day.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      ref={tooltipRef}
      className="heatmap-tooltip"
      style={{
        left: adjustedPosition?.x ?? position.x,
        top: adjustedPosition?.y ?? position.y,
        // Hide tooltip until position is calculated to prevent visual jump
        visibility: isPositioned ? 'visible' : 'hidden',
      }}
    >
      <div className="heatmap-tooltip__date">{formattedDate}</div>
      <div className="heatmap-tooltip__stats">
        <span className="heatmap-tooltip__stat">
          <strong>{day.pagesRead.toLocaleString()}</strong> pages
        </span>
        <span className="heatmap-tooltip__divider">·</span>
        <span className="heatmap-tooltip__stat">
          <strong>{formatDurationShort(day.duration)}</strong> reading
        </span>
      </div>
    </div>
  );
}
