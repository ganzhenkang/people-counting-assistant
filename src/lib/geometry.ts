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

/**
 * Intersection over union of two Roboflow boxes (x, y = CENTRE). Returns 0 to 1.
 * Both boxes must be in the same image space.
 */
export function iou(a: Prediction, b: Prediction): number {
  const ix = Math.min(a.x + a.width / 2, b.x + b.width / 2) - Math.max(a.x - a.width / 2, b.x - b.width / 2);
  const iy = Math.min(a.y + a.height / 2, b.y + b.height / 2) - Math.max(a.y - a.height / 2, b.y - b.height / 2);
  if (ix <= 0 || iy <= 0) return 0;
  const intersection = ix * iy;
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

export interface LabelPlacement extends Rect {
  /** False when the label sits away from its box and needs a connector line. */
  attached: boolean;
}

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.left < b.left + b.width + gap &&
    b.left < a.left + a.width + gap &&
    a.top < b.top + b.height + gap &&
    b.top < a.top + a.height + gap
  );
}

/**
 * Vertical connector from a detached label to its box, at the box's horizontal
 * centre (kept within the label's width). Empty for attached labels.
 */
export function labelConnector(box: Rect, label: LabelPlacement): { x: number; y1: number; y2: number } | null {
  if (label.attached) return null;
  const x = Math.min(Math.max(box.left + box.width / 2, label.left + 4), label.left + label.width - 4);
  const above = label.top + label.height <= box.top;
  return above
    ? { x, y1: label.top + label.height, y2: box.top }
    : { x, y1: box.top + box.height, y2: label.top };
}

/**
 * Place one label per box so that no two labels overlap. Labels are placed in the
 * order given (put the most important first).
 *
 * Each label starts at its own box's left edge, so it is clear which box it names.
 * It tries just above the box, just below it, then further above / below in
 * label-height steps with a connector line. A spot is rejected if it overlaps another
 * label or connector, and preferably also if its connector would pass behind another
 * label. Right-aligned spots are tried after left-aligned ones. If nothing fits, the
 * label falls back to just above the box (or inside its top edge) and may overlap.
 */
export function placeLabels(
  boxes: Rect[],
  sizes: { width: number; height: number }[],
  bounds: ImageSize,
  gap = 2,
): LabelPlacement[] {
  const placed: LabelPlacement[] = [];
  const lines: Rect[] = []; // connectors already drawn, as thin rectangles
  const maxSteps = 6;
  const clampX = (x: number, w: number) => Math.min(Math.max(0, x), Math.max(0, bounds.width - w));

  boxes.forEach((box, i) => {
    const { width: w, height: h } = sizes[i];
    const candidates: LabelPlacement[] = [];
    for (const x of [clampX(box.left, w), clampX(box.left + box.width - w, w)]) {
      for (let step = 0; step < maxSteps; step++) {
        const above = box.top - h - step * (h + gap);
        const below = box.top + box.height + step * (h + gap);
        for (const y of [above, below]) candidates.push({ left: x, top: y, width: w, height: h, attached: step === 0 });
      }
    }
    let line: Rect | null = null;
    const fits = (c: LabelPlacement, strict: boolean) => {
      if (c.top < 0 || c.top + c.height > bounds.height) return false;
      if (placed.some((p) => overlaps(c, p, gap)) || lines.some((l) => overlaps(c, l, gap))) return false;
      const conn = labelConnector(box, c);
      line = conn ? { left: conn.x - 1, top: conn.y1, width: 2, height: conn.y2 - conn.y1 } : null;
      return !(strict && line && placed.some((p) => overlaps(line!, p, 0)));
    };
    // In a tight crowd a clean connector may be impossible; a connector passing behind
    // another label is still better than labels covering each other.
    let chosen = candidates.find((c) => fits(c, true)) ?? candidates.find((c) => fits(c, false));
    if (chosen) {
      if (line) lines.push(line);
    } else {
      chosen = {
        left: clampX(box.left, w),
        top: box.top - h >= 0 ? box.top - h : Math.min(box.top, Math.max(0, bounds.height - h)),
        width: w,
        height: h,
        attached: true,
      };
    }
    placed.push(chosen);
  });
  return placed;
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
