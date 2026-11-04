import type { ImageSize, Prediction } from "@/lib/types";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Convert a Roboflow box (x, y = CENTRE) in the model's image space into a
 * top-left rectangle in the target image space, clamped to the image bounds.
 */
export function predictionToRect(p: Prediction, source: ImageSize, target: ImageSize): Rect {
  const sx = target.width / source.width;
  const sy = target.height / source.height;
  const left = Math.max(0, (p.x - p.width / 2) * sx);
  const top = Math.max(0, (p.y - p.height / 2) * sy);
  const right = Math.min(target.width, (p.x + p.width / 2) * sx);
  const bottom = Math.min(target.height, (p.y + p.height / 2) * sy);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Scale (width, height) so the longest side is at most maxSide. Never upscales. */
export function fitWithin(width: number, height: number, maxSide: number): ImageSize {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
