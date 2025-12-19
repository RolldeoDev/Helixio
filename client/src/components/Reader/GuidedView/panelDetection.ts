/**
 * Panel Detection Utilities
 *
 * Provides basic panel detection for comic pages using edge detection
 * and region analysis. Works with canvas-based image analysis.
 */

// =============================================================================
// Types
// =============================================================================

export interface Panel {
  id: string;
  x: number;      // Left position as percentage (0-100)
  y: number;      // Top position as percentage (0-100)
  width: number;  // Width as percentage
  height: number; // Height as percentage
  order: number;  // Reading order (0-based)
}

export interface PanelDetectionConfig {
  minPanelWidth: number;   // Minimum panel width as percentage
  minPanelHeight: number;  // Minimum panel height as percentage
  gutterThreshold: number; // Minimum gutter width in pixels
  edgeThreshold: number;   // Edge detection sensitivity (0-255)
  readingDirection: 'ltr' | 'rtl';
}

export interface PanelDetectionResult {
  panels: Panel[];
  method: 'auto' | 'grid' | 'manual';
  confidence: number; // 0-1
}

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_CONFIG: PanelDetectionConfig = {
  minPanelWidth: 15,      // At least 15% of page width
  minPanelHeight: 15,     // At least 15% of page height
  gutterThreshold: 5,     // 5 pixels minimum gutter
  edgeThreshold: 200,     // White/near-white threshold for gutters
  readingDirection: 'ltr',
};

// =============================================================================
// Panel Detection Functions
// =============================================================================

/**
 * Detect panels from an image using edge-based analysis
 * Uses a simple but effective algorithm:
 * 1. Scan for vertical white gutters
 * 2. Scan for horizontal white gutters
 * 3. Create panel grid from intersections
 */
export async function detectPanels(
  imageUrl: string,
  config: Partial<PanelDetectionConfig> = {}
): Promise<PanelDetectionResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  try {
    // Load image into canvas
    const img = await loadImage(imageUrl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return fallbackToSinglePanel();
    }

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = imageData;

    // Find vertical gutters (white columns)
    const verticalGutters = findGutters(
      data,
      width,
      height,
      'vertical',
      cfg.gutterThreshold,
      cfg.edgeThreshold
    );

    // Find horizontal gutters (white rows)
    const horizontalGutters = findGutters(
      data,
      width,
      height,
      'horizontal',
      cfg.gutterThreshold,
      cfg.edgeThreshold
    );

    // Build panel grid from gutters
    const panels = buildPanelGrid(
      verticalGutters,
      horizontalGutters,
      width,
      height,
      cfg
    );

    // Calculate confidence based on number and uniformity of panels
    const confidence = calculateConfidence(panels, cfg);

    // If confidence is too low, fall back to simple analysis
    if (confidence < 0.3 || panels.length < 2) {
      // Try grid-based fallback
      const gridPanels = createGridFallback(width, height, cfg);
      return {
        panels: orderPanels(gridPanels, cfg.readingDirection),
        method: 'grid',
        confidence: 0.5,
      };
    }

    return {
      panels: orderPanels(panels, cfg.readingDirection),
      method: 'auto',
      confidence,
    };
  } catch (err) {
    console.error('Panel detection failed:', err);
    return fallbackToSinglePanel();
  }
}

/**
 * Load an image from URL into an HTMLImageElement
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Find gutters (white columns or rows) in the image
 */
function findGutters(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  direction: 'vertical' | 'horizontal',
  minGutterSize: number,
  threshold: number
): number[] {
  const gutters: number[] = [];
  const scanLines = direction === 'vertical' ? width : height;
  const perpLines = direction === 'vertical' ? height : width;

  let gutterStart: number | null = null;

  for (let i = 0; i < scanLines; i++) {
    let whiteCount = 0;

    // Count white pixels along this scan line
    for (let j = 0; j < perpLines; j++) {
      const pixelIndex = direction === 'vertical'
        ? (j * width + i) * 4
        : (i * width + j) * 4;

      const r = data[pixelIndex]!;
      const g = data[pixelIndex + 1]!;
      const b = data[pixelIndex + 2]!;

      // Check if pixel is white/near-white
      if (r >= threshold && g >= threshold && b >= threshold) {
        whiteCount++;
      }
    }

    // Line is considered a gutter if >90% white
    const isGutter = whiteCount / perpLines > 0.9;

    if (isGutter && gutterStart === null) {
      gutterStart = i;
    } else if (!isGutter && gutterStart !== null) {
      // Gutter ended
      if (i - gutterStart >= minGutterSize) {
        gutters.push(Math.floor((gutterStart + i) / 2));
      }
      gutterStart = null;
    }
  }

  return gutters;
}

/**
 * Build panel grid from detected gutters
 */
function buildPanelGrid(
  verticalGutters: number[],
  horizontalGutters: number[],
  width: number,
  height: number,
  config: PanelDetectionConfig
): Panel[] {
  const panels: Panel[] = [];

  // Add edges
  const xPoints = [0, ...verticalGutters, width];
  const yPoints = [0, ...horizontalGutters, height];

  const minWidth = (config.minPanelWidth / 100) * width;
  const minHeight = (config.minPanelHeight / 100) * height;

  let panelIndex = 0;

  for (let row = 0; row < yPoints.length - 1; row++) {
    for (let col = 0; col < xPoints.length - 1; col++) {
      const x1 = xPoints[col]!;
      const x2 = xPoints[col + 1]!;
      const y1 = yPoints[row]!;
      const y2 = yPoints[row + 1]!;

      const panelWidth = x2 - x1;
      const panelHeight = y2 - y1;

      // Filter out panels that are too small
      if (panelWidth >= minWidth && panelHeight >= minHeight) {
        panels.push({
          id: `panel-${panelIndex}`,
          x: (x1 / width) * 100,
          y: (y1 / height) * 100,
          width: (panelWidth / width) * 100,
          height: (panelHeight / height) * 100,
          order: panelIndex,
        });
        panelIndex++;
      }
    }
  }

  return panels;
}

/**
 * Order panels based on reading direction
 */
function orderPanels(panels: Panel[], direction: 'ltr' | 'rtl'): Panel[] {
  // Sort by row (top to bottom), then by column
  const sorted = [...panels].sort((a, b) => {
    const rowA = Math.floor(a.y / 25); // Group into ~4 rows
    const rowB = Math.floor(b.y / 25);

    if (rowA !== rowB) {
      return rowA - rowB;
    }

    // Within same row, sort by x position
    return direction === 'ltr' ? a.x - b.x : b.x - a.x;
  });

  // Reassign order
  return sorted.map((panel, index) => ({
    ...panel,
    order: index,
  }));
}

/**
 * Calculate confidence score for detection result
 */
function calculateConfidence(panels: Panel[], _config: PanelDetectionConfig): number {
  if (panels.length === 0) return 0;
  if (panels.length === 1) return 0.3;

  // More panels with reasonable sizes = higher confidence
  const avgPanelSize = panels.reduce((sum, p) => sum + p.width * p.height, 0) / panels.length;

  // Ideal panel coverage is between 10-50% of page
  const coverageScore = avgPanelSize > 10 && avgPanelSize < 50 ? 1 : 0.5;

  // Having 2-9 panels is typical
  const countScore = panels.length >= 2 && panels.length <= 9 ? 1 : 0.7;

  return (coverageScore + countScore) / 2;
}

/**
 * Create a simple grid-based fallback when detection fails
 */
function createGridFallback(
  width: number,
  height: number,
  config: PanelDetectionConfig
): Panel[] {
  const aspectRatio = width / height;
  const panels: Panel[] = [];

  // Guess grid based on aspect ratio
  let cols: number;
  let rows: number;

  if (aspectRatio > 1.3) {
    // Wide page - likely a spread
    cols = 2;
    rows = 2;
  } else if (aspectRatio > 0.8) {
    // Square-ish - typical comic page
    cols = 2;
    rows = 3;
  } else {
    // Tall page
    cols = 1;
    rows = 3;
  }

  const panelWidth = 100 / cols;
  const panelHeight = 100 / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      panels.push({
        id: `panel-${row * cols + col}`,
        x: col * panelWidth,
        y: row * panelHeight,
        width: panelWidth,
        height: panelHeight,
        order: config.readingDirection === 'ltr'
          ? row * cols + col
          : row * cols + (cols - 1 - col),
      });
    }
  }

  return panels;
}

/**
 * Fallback to single panel (full page)
 */
function fallbackToSinglePanel(): PanelDetectionResult {
  return {
    panels: [{
      id: 'panel-0',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      order: 0,
    }],
    method: 'auto',
    confidence: 0.2,
  };
}

// =============================================================================
// Manual Panel Definition
// =============================================================================

/**
 * Create panels from ComicInfo.xml Pages element data
 * This uses the panel data if present in the ComicInfo
 */
export function panelsFromComicInfo(
  pageData: {
    panels?: Array<{ x: number; y: number; w: number; h: number }>;
  },
  readingDirection: 'ltr' | 'rtl' = 'ltr'
): Panel[] {
  if (!pageData.panels || pageData.panels.length === 0) {
    return [];
  }

  const panels = pageData.panels.map((p, index) => ({
    id: `panel-${index}`,
    x: p.x,
    y: p.y,
    width: p.w,
    height: p.h,
    order: index,
  }));

  return orderPanels(panels, readingDirection);
}
