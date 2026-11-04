/**
 * Pure functions for filtering detections and computing the distraction rating.
 * No browser or network access here, so everything is unit tested.
 */
import { CLASS_INFO, PERSON_CLASSES, type PersonClass, isPersonClass } from "@/config/classes";
import type { Prediction } from "@/lib/types";

export const SLIDER_MIN = 10;
export const SLIDER_MAX = 95;
export const SLIDER_DEFAULT = 40;

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
  /** Whole-number percentage, or null when nobody was detected. */
  percent: number | null;
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
 * The band is chosen from the rounded whole-number percentage that is shown on
 * screen, so the bands have no gaps (e.g. 2 of 3 = 66.7% shows as 67% and is High).
 *   under 34% -> Low, 34% to 66% -> Medium, 67% or above -> High
 */
export function ratingLevelForPercent(percent: number): Exclude<RatingLevel, "none"> {
  if (percent < 34) return "low";
  if (percent < 67) return "medium";
  return "high";
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
      level: "none",
      label: RATING_LABELS.none,
      summary: RATING_LABELS.none,
    };
  }

  const percent = Math.round((phoneUsers / totalPeople) * 100);
  const level = ratingLevelForPercent(percent);
  const noun = totalPeople === 1 ? "pedestrian" : "pedestrians";
  return {
    totalPeople,
    phoneUsers,
    percent,
    level,
    label: RATING_LABELS[level],
    summary: `${phoneUsers} of ${totalPeople} ${noun} using a phone (${percent}%) - ${RATING_LABELS[level]}`,
  };
}

/** Everything the results view needs for a given threshold. */
export function analyse(predictions: Prediction[], thresholdPercent: number) {
  const visible = filterByConfidence(predictions, thresholdPercent);
  const counts = countByClass(visible);
  return {
    filtered: visible,
    counts,
    rating: computeRating(counts),
    unknown: findUnknownClasses(visible),
    hiddenByThreshold: predictions.length - visible.length,
  };
}
