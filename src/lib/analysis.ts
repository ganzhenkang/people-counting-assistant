/**
 * Pure functions for filtering detections and computing the distraction rating.
 * No browser or network access here, so everything is unit tested.
 */
import { CLASS_INFO, PERSON_CLASSES, type PersonClass, isPersonClass } from "@/config/classes";
import { iou } from "@/lib/geometry";
import type { Prediction } from "@/lib/types";

/**
 * DEFAULT CONFIDENCE THRESHOLD (percent) used when the page loads.
 * Set from the peak of the current model's F1-confidence curve (BoxF1_curve.png for
 * people-counting-activity-v2-2-yolo26n-t6: "all classes 0.83 at 0.402"), so 40.2% rounded to 40%.
 */
export const DEFAULT_CONFIDENCE_THRESHOLD_PERCENT = 40;

export const SLIDER_MIN = 10;
export const SLIDER_MAX = 95;

/** Boxes overlapping MORE than this (IoU) are treated as the same person. */
export const DUPLICATE_IOU_THRESHOLD = 0.5;

/** Small tolerance so 0.57 * 100 = 56.99999 is treated as 57. */
const EPSILON = 1e-6;

/** Confidence (0-1) as a whole percentage, rounded down so it never overstates. */
export function confidencePercent(confidence: number): number {
  return Math.floor(confidence * 100 + EPSILON);
}

/** Keep detections whose confidence is at or above the threshold (a percentage). */
export function filterByConfidence(predictions: Prediction[], thresholdPercent: number): Prediction[] {
  return predictions.filter((p) => confidencePercent(p.confidence) >= thresholdPercent);
}

/**
 * Remove duplicate boxes. When two boxes have an IoU above `iouThreshold`, only the
 * higher-confidence box is kept, even if their classes differ. Boxes with an IoU at or
 * below the threshold are never merged. Greedy: boxes are visited from highest to lowest
 * confidence and kept unless they duplicate a box already kept. Does not mutate the input.
 */
export function mergeDuplicates(
  predictions: Prediction[],
  iouThreshold: number = DUPLICATE_IOU_THRESHOLD,
): Prediction[] {
  const ordered = predictions
    .map((p, index) => ({ p, index }))
    .sort((a, b) => b.p.confidence - a.p.confidence || a.index - b.index);
  const kept: { p: Prediction; index: number }[] = [];
  for (const item of ordered) {
    if (!kept.some((k) => iou(k.p, item.p) > iouThreshold)) kept.push(item);
  }
  // Return in the original order so results are stable.
  return kept.sort((a, b) => a.index - b.index).map((k) => k.p);
}

export type ClassCounts = Record<PersonClass, number>;

export function emptyCounts(): ClassCounts {
  return Object.fromEntries(PERSON_CLASSES.map((c) => [c, 0])) as ClassCounts;
}

/** Count detections per known class. Unknown classes are not counted (see findUnknownClasses). */
export function countByClass(predictions: Prediction[]): ClassCounts {
  const counts = emptyCounts();
  for (const p of predictions) {
    if (isPersonClass(p.class)) counts[p.class] += 1;
  }
  return counts;
}

/** Unknown class names and how many detections each has, sorted by name. */
export function findUnknownClasses(predictions: Prediction[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const p of predictions) {
    if (!isPersonClass(p.class)) map.set(p.class, (map.get(p.class) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type RatingLevel = "none" | "low" | "medium" | "high";

export interface Rating {
  totalPeople: number;
  phoneUsers: number;
  /** Exact score (phone users / total people x 100), or null when nobody was detected. */
  percent: number | null;
  /** Score as shown on screen, e.g. "40%" or "66.6%". Empty when nobody was detected. */
  percentText: string;
  level: RatingLevel;
  label: string;
  summary: string;
}

export const RATING_LABELS: Record<RatingLevel, string> = {
  none: "No pedestrians detected",
  low: "Low",
  medium: "Medium",
  high: "High",
};

/**
 * Rating band for an exact score:
 *   under 34% -> Low, 34% up to (not including) 67% -> Medium, 67% or above -> High
 */
export function ratingLevelForPercent(percent: number): Exclude<RatingLevel, "none"> {
  if (percent < 34) return "low";
  if (percent < 67) return "medium";
  return "high";
}

/**
 * Format a score for display, truncated (not rounded) to one decimal place so the
 * shown number never crosses a band boundary: 2 of 3 = 66.67% shows as "66.6%" (Medium),
 * never "67%". Whole numbers have no decimal: "40%".
 */
export function formatPercent(percent: number): string {
  const truncated = Math.floor(percent * 10 + EPSILON) / 10;
  return `${Number.isInteger(truncated) ? truncated : truncated.toFixed(1)}%`;
}

export function computeRating(counts: ClassCounts): Rating {
  const totalPeople = PERSON_CLASSES.reduce((sum, c) => sum + counts[c], 0);
  const phoneUsers = PERSON_CLASSES.filter((c) => CLASS_INFO[c].usesPhone).reduce(
    (sum, c) => sum + counts[c],
    0,
  );

  if (totalPeople === 0) {
    return {
      totalPeople: 0,
      phoneUsers: 0,
      percent: null,
      percentText: "",
      level: "none",
      label: RATING_LABELS.none,
      summary: RATING_LABELS.none,
    };
  }

  const percent = (phoneUsers / totalPeople) * 100;
  const level = ratingLevelForPercent(percent);
  const percentText = formatPercent(percent);
  const noun = totalPeople === 1 ? "pedestrian" : "pedestrians";
  return {
    totalPeople,
    phoneUsers,
    percent,
    percentText,
    level,
    label: RATING_LABELS[level],
    summary: `${phoneUsers} of ${totalPeople} ${noun} using a phone (${percentText}) - ${RATING_LABELS[level]}`,
  };
}

/**
 * Everything the results view needs for a given threshold, in this fixed order:
 *   1. filter by confidence  2. merge duplicates (IoU > 0.5)  3. count and rate.
 * `filtered` (the merged boxes) drives the display, counts, rating and download.
 */
export function analyse(predictions: Prediction[], thresholdPercent: number) {
  const aboveThreshold = filterByConfidence(predictions, thresholdPercent);
  const merged = mergeDuplicates(aboveThreshold);
  const counts = countByClass(merged);
  return {
    filtered: merged,
    counts,
    rating: computeRating(counts),
    unknown: findUnknownClasses(merged),
    hiddenByThreshold: predictions.length - aboveThreshold.length,
    mergedDuplicates: aboveThreshold.length - merged.length,
  };
}
