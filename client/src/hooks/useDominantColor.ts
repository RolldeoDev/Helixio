/**
 * useDominantColor Hook
 *
 * Extracts the dominant color from an image URL using canvas sampling.
 * Optimized for comic book covers with center-weighted sampling.
 */

import { useState, useEffect, useRef } from 'react';

interface UseDominantColorResult {
  color: string | null;
  rgb: { r: number; g: number; b: number } | null;
  loading: boolean;
  error: Error | null;
}

// Simple in-memory cache for extracted colors
const colorCache = new Map<string, { color: string; rgb: { r: number; g: number; b: number } }>();

/**
 * Extracts dominant color from an image, weighted toward the center
 * (where comic cover focal points typically are)
 */
async function extractDominantColor(
  imageUrl: string
): Promise<{ color: string; rgb: { r: number; g: number; b: number } }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Sample at reduced size for performance
        const sampleSize = 64;
        canvas.width = sampleSize;
        canvas.height = sampleSize;

        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);

        const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
        const { data } = imageData;

        // Center-weighted color averaging
        // Comic covers often have the important content in the center
        const centerX = sampleSize / 2;
        const centerY = sampleSize / 2;
        const maxDist = Math.sqrt(centerX ** 2 + centerY ** 2);

        let r = 0, g = 0, b = 0;
        let totalWeight = 0;

        // Color buckets for finding dominant hue
        const colorBuckets: Map<string, { r: number; g: number; b: number; weight: number }> = new Map();

        for (let y = 0; y < sampleSize; y++) {
          for (let x = 0; x < sampleSize; x++) {
            const idx = (y * sampleSize + x) * 4;
            const pixelR = data[idx] ?? 0;
            const pixelG = data[idx + 1] ?? 0;
            const pixelB = data[idx + 2] ?? 0;
            const alpha = data[idx + 3] ?? 0;

            // Skip transparent pixels
            if (alpha < 128) continue;

            // Calculate distance from center (0-1)
            const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2) / maxDist;
            // Weight: center pixels get 2x, edges get 1x
            const weight = 2 - dist;

            // Skip very dark or very light pixels (likely backgrounds)
            const brightness = (pixelR + pixelG + pixelB) / 3;
            if (brightness < 20 || brightness > 235) continue;

            // Calculate saturation - skip grayscale
            const max = Math.max(pixelR, pixelG, pixelB);
            const min = Math.min(pixelR, pixelG, pixelB);
            const saturation = max === 0 ? 0 : (max - min) / max;

            // Boost weight for saturated colors (more interesting)
            const satWeight = weight * (0.5 + saturation * 1.5);

            r += pixelR * satWeight;
            g += pixelG * satWeight;
            b += pixelB * satWeight;
            totalWeight += satWeight;

            // Bucket by hue for finding most common color family
            const bucketR = Math.floor(pixelR / 32) * 32;
            const bucketG = Math.floor(pixelG / 32) * 32;
            const bucketB = Math.floor(pixelB / 32) * 32;
            const bucketKey = `${bucketR}-${bucketG}-${bucketB}`;

            const existing = colorBuckets.get(bucketKey);
            if (existing) {
              existing.r += pixelR * satWeight;
              existing.g += pixelG * satWeight;
              existing.b += pixelB * satWeight;
              existing.weight += satWeight;
            } else {
              colorBuckets.set(bucketKey, {
                r: pixelR * satWeight,
                g: pixelG * satWeight,
                b: pixelB * satWeight,
                weight: satWeight,
              });
            }
          }
        }

        // Find the dominant color bucket
        let dominantBucket: { r: number; g: number; b: number; weight: number } | null = null;
        for (const bucket of colorBuckets.values()) {
          if (!dominantBucket || bucket.weight > dominantBucket.weight) {
            dominantBucket = bucket;
          }
        }

        let finalR: number, finalG: number, finalB: number;

        if (dominantBucket && dominantBucket.weight > totalWeight * 0.15) {
          // Use dominant bucket color if it's significant
          finalR = Math.round(dominantBucket.r / dominantBucket.weight);
          finalG = Math.round(dominantBucket.g / dominantBucket.weight);
          finalB = Math.round(dominantBucket.b / dominantBucket.weight);
        } else if (totalWeight > 0) {
          // Fall back to weighted average
          finalR = Math.round(r / totalWeight);
          finalG = Math.round(g / totalWeight);
          finalB = Math.round(b / totalWeight);
        } else {
          // Fallback to a neutral dark color
          finalR = 30;
          finalG = 30;
          finalB = 40;
        }

        // Ensure minimum saturation for visual interest
        const avgBrightness = (finalR + finalG + finalB) / 3;
        const maxChannel = Math.max(finalR, finalG, finalB);
        const minChannel = Math.min(finalR, finalG, finalB);
        const currentSat = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;

        // If too desaturated, boost the dominant channel slightly
        if (currentSat < 0.2 && avgBrightness > 30) {
          const boost = 1.3;
          if (finalR >= finalG && finalR >= finalB) {
            finalR = Math.min(255, Math.round(finalR * boost));
          } else if (finalG >= finalR && finalG >= finalB) {
            finalG = Math.min(255, Math.round(finalG * boost));
          } else {
            finalB = Math.min(255, Math.round(finalB * boost));
          }
        }

        // Darken for use as a background (multiply by 0.4-0.6 depending on brightness)
        const darkenFactor = avgBrightness > 128 ? 0.35 : 0.5;
        finalR = Math.round(finalR * darkenFactor);
        finalG = Math.round(finalG * darkenFactor);
        finalB = Math.round(finalB * darkenFactor);

        const result = {
          color: `rgb(${finalR}, ${finalG}, ${finalB})`,
          rgb: { r: finalR, g: finalG, b: finalB },
        };

        resolve(result);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    // Start loading
    img.src = imageUrl;
  });
}

/**
 * Hook to extract dominant color from an image URL
 * Results are cached in memory for performance
 */
export function useDominantColor(imageUrl: string | null): UseDominantColorResult {
  const [result, setResult] = useState<UseDominantColorResult>({
    color: null,
    rgb: null,
    loading: false,
    error: null,
  });

  const abortRef = useRef(false);

  useEffect(() => {
    if (!imageUrl) {
      setResult({ color: null, rgb: null, loading: false, error: null });
      return;
    }

    // Check cache first
    const cached = colorCache.get(imageUrl);
    if (cached) {
      setResult({ color: cached.color, rgb: cached.rgb, loading: false, error: null });
      return;
    }

    abortRef.current = false;
    setResult((prev) => ({ ...prev, loading: true, error: null }));

    extractDominantColor(imageUrl)
      .then((extracted) => {
        if (abortRef.current) return;

        // Cache the result
        colorCache.set(imageUrl, extracted);

        setResult({
          color: extracted.color,
          rgb: extracted.rgb,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (abortRef.current) return;
        setResult({
          color: null,
          rgb: null,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });

    return () => {
      abortRef.current = true;
    };
  }, [imageUrl]);

  return result;
}
