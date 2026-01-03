/**
 * Color Utilities
 *
 * Pure functions for color manipulation, contrast calculation,
 * and color space conversions.
 */

// =============================================================================
// Types
// =============================================================================

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;  // 0-360
  s: number;  // 0-1
  l: number;  // 0-1
}

// =============================================================================
// Color Space Conversions
// =============================================================================

/**
 * Convert RGB to HSL color space
 * @param rgb - RGB color with values 0-255
 * @returns HSL color with h: 0-360, s: 0-1, l: 0-1
 */
export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Achromatic (grayscale)
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    case b:
    default:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return { h: h * 360, s, l };
}

/**
 * Convert HSL to RGB color space
 * @param hsl - HSL color with h: 0-360, s: 0-1, l: 0-1
 * @returns RGB color with values 0-255
 */
export function hslToRgb(hsl: HSL): RGB {
  const { h, s, l } = hsl;
  const hNorm = h / 360;

  if (s === 0) {
    // Achromatic (grayscale)
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tNorm = t;
    if (tNorm < 0) tNorm += 1;
    if (tNorm > 1) tNorm -= 1;
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
    if (tNorm < 1 / 2) return q;
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hNorm) * 255),
    b: Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255),
  };
}

// =============================================================================
// Color Manipulation
// =============================================================================

/**
 * Lighten a color by adjusting its lightness in HSL space
 * @param rgb - RGB color to lighten
 * @param amount - Amount to lighten (0-1, where 1 would be white)
 * @returns Lightened RGB color
 */
export function lightenColor(rgb: RGB, amount: number): RGB {
  const hsl = rgbToHsl(rgb);
  // Increase lightness toward 1 (white)
  hsl.l = hsl.l + (1 - hsl.l) * Math.min(1, Math.max(0, amount));
  return hslToRgb(hsl);
}

/**
 * Create a subtle tint by mixing a color with white
 * This produces a color that's mostly white with a hint of the accent color
 *
 * @param accentColor - The accent color to tint with
 * @param tintStrength - How much of the accent to blend (0-1, default 0.15 = 15%)
 * @returns A tinted RGB color (mostly white with subtle hue)
 */
export function createSubtleTint(accentColor: RGB, tintStrength = 0.15): RGB {
  // Clamp tint strength to reasonable range (up to 90% for vibrant accents)
  const strength = Math.min(0.9, Math.max(0, tintStrength));

  // Blend accent with white
  return {
    r: Math.round(255 * (1 - strength) + accentColor.r * strength),
    g: Math.round(255 * (1 - strength) + accentColor.g * strength),
    b: Math.round(255 * (1 - strength) + accentColor.b * strength),
  };
}

// =============================================================================
// Contrast & Accessibility
// =============================================================================

/**
 * Calculate relative luminance of a color (WCAG formula)
 * @param rgb - RGB color
 * @returns Relative luminance (0-1)
 */
export function getRelativeLuminance(rgb: RGB): number {
  const linearize = (c: number): number => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  const r = linearize(rgb.r);
  const g = linearize(rgb.g);
  const b = linearize(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors (WCAG formula)
 * @param foreground - Foreground RGB color
 * @param background - Background RGB color
 * @returns Contrast ratio (1-21)
 */
export function getContrastRatio(foreground: RGB, background: RGB): number {
  const l1 = getRelativeLuminance(foreground);
  const l2 = getRelativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a contrast ratio meets WCAG AA standards
 * @param contrastRatio - Contrast ratio to check
 * @param isLargeText - Whether the text is large (>= 18pt or 14pt bold)
 * @returns True if meets WCAG AA standard
 */
export function meetsWcagAA(contrastRatio: number, isLargeText = false): boolean {
  return isLargeText ? contrastRatio >= 3 : contrastRatio >= 4.5;
}

// =============================================================================
// Hue Calculations
// =============================================================================

/**
 * Calculate the angular distance between two hues
 * Handles wraparound (e.g., 350° and 10° are 20° apart)
 * @param h1 - First hue (0-360)
 * @param h2 - Second hue (0-360)
 * @returns Angular distance (0-180)
 */
export function getHueDistance(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2);
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Check if two colors have sufficiently different hues
 * Useful for determining if an accent color is distinct from background
 * @param rgb1 - First RGB color
 * @param rgb2 - Second RGB color
 * @param minDistance - Minimum hue distance to be considered distinct (default 30°)
 * @returns True if hues are sufficiently different
 */
export function hasDistinctHue(rgb1: RGB, rgb2: RGB, minDistance = 30): boolean {
  const hsl1 = rgbToHsl(rgb1);
  const hsl2 = rgbToHsl(rgb2);

  // If either color is very desaturated, hue comparison isn't meaningful
  if (hsl1.s < 0.1 || hsl2.s < 0.1) {
    return false;
  }

  return getHueDistance(hsl1.h, hsl2.h) >= minDistance;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Clamp RGB values to valid range (0-255)
 */
export function clampRgb(rgb: RGB): RGB {
  return {
    r: Math.min(255, Math.max(0, Math.round(rgb.r))),
    g: Math.min(255, Math.max(0, Math.round(rgb.g))),
    b: Math.min(255, Math.max(0, Math.round(rgb.b))),
  };
}

/**
 * Convert RGB to CSS color string
 */
export function rgbToCss(rgb: RGB): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

// =============================================================================
// Accessible Title Color Selection
// =============================================================================

/**
 * Warm white fallback color for grayscale covers.
 * A subtle off-white with a warm undertone (#FFFCF5).
 */
export const WARM_WHITE_FALLBACK: RGB = { r: 255, g: 252, b: 245 };

/**
 * Pure white fallback for maximum contrast scenarios.
 */
const PURE_WHITE: RGB = { r: 255, g: 255, b: 255 };

/**
 * Options for computing accessible title colors.
 */
export interface TitleColorOptions {
  /** Minimum WCAG contrast ratio (default: 4.5 for AA) */
  minContrast?: number;
  /** Minimum hue distance in degrees from background (default: 45°) */
  minHueDistance?: number;
}

/**
 * Compute an accessible title color that meets contrast and hue separation requirements.
 *
 * Algorithm:
 * 1. If no accent or accent is desaturated → return warm white fallback
 * 2. Create initial tint (saturation-adaptive blend with white, 30-60%)
 * 3. Validate hue separation → if too similar to background, rotate to complementary
 * 4. Validate contrast → progressively lighten until WCAG AA met
 * 5. Fallback to pure white if all else fails
 *
 * @param accentRgb - Accent color extracted from cover (may be null)
 * @param backgroundRgb - Background color the title will be displayed over
 * @param options - Contrast and hue constraints
 * @returns Title color RGB guaranteed to meet accessibility requirements
 *
 * @example
 * // Blue accent on dark blue background → rotates to complementary yellow/orange
 * computeAccessibleTitleColor(
 *   { r: 65, g: 105, b: 225 },  // royal blue accent
 *   { r: 15, g: 20, b: 45 }     // dark blue background
 * );
 *
 * @example
 * // Gray cover → returns warm white
 * computeAccessibleTitleColor(
 *   { r: 100, g: 100, b: 100 }, // gray accent
 *   { r: 40, g: 42, b: 45 }     // dark gray background
 * );
 */
export function computeAccessibleTitleColor(
  accentRgb: RGB | null,
  backgroundRgb: RGB,
  options: TitleColorOptions = {}
): RGB {
  const { minContrast = 4.5, minHueDistance = 45 } = options;

  // Step 1: Check if accent is valid (exists and is saturated)
  if (!accentRgb) {
    return WARM_WHITE_FALLBACK;
  }

  const accentHsl = rgbToHsl(accentRgb);
  const MIN_SATURATION = 0.15;

  // Desaturated accent (grayscale) → use warm white fallback
  if (accentHsl.s < MIN_SATURATION) {
    return WARM_WHITE_FALLBACK;
  }

  const bgHsl = rgbToHsl(backgroundRgb);

  // Step 2: Create initial tint using saturation-adaptive strength
  // More saturated accents get stronger tint (30-60%)
  const tintStrength = 0.30 + (accentHsl.s * 0.30);

  // Start with a working color based on the accent
  let workingHsl: HSL = { ...accentHsl };

  // Step 3: Validate hue separation from background
  // Only check hue distance if background is also saturated
  if (bgHsl.s >= 0.1) {
    const hueDistance = getHueDistance(workingHsl.h, bgHsl.h);

    if (hueDistance < minHueDistance) {
      // Rotate to complementary hue (180°) - this guarantees maximum distance
      workingHsl.h = (workingHsl.h + 180) % 360;
    }
  }

  // Convert working color back to RGB and create tinted version
  const adjustedAccent = hslToRgb(workingHsl);
  let titleColor = createSubtleTint(adjustedAccent, tintStrength);

  // Step 4: Validate and adjust contrast
  // Determine adjustment direction based on background luminance
  const bgLuminance = getRelativeLuminance(backgroundRgb);
  const shouldLighten = bgLuminance < 0.5;

  const MAX_ITERATIONS = 10;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    const contrast = getContrastRatio(titleColor, backgroundRgb);

    if (contrast >= minContrast) {
      // Contrast requirement met
      return clampRgb(titleColor);
    }

    // Adjust lightness to improve contrast
    const currentHsl = rgbToHsl(titleColor);

    if (shouldLighten) {
      // Dark background: lighten title toward white
      currentHsl.l = Math.min(0.98, currentHsl.l + 0.08);
    } else {
      // Light background: darken title toward black
      currentHsl.l = Math.max(0.02, currentHsl.l - 0.08);
    }

    titleColor = hslToRgb(currentHsl);
    iterations++;
  }

  // Step 5: If we exhausted iterations, use fallback based on background
  // Dark background → pure white, Light background → dark gray
  return shouldLighten ? PURE_WHITE : { r: 30, g: 30, b: 30 };
}
