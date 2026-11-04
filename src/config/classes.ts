/**
 * Single source of truth for the Roboflow model's class names.
 * These must match the class names in the trained model exactly.
 */

export const PERSON_CLASSES = [
  "person_left",
  "person_right",
  "person_left_phone",
  "person_right_phone",
] as const;

export type PersonClass = (typeof PERSON_CLASSES)[number];

export interface ClassInfo {
  /** Short human-readable description shown next to the class name. */
  description: string;
  usesPhone: boolean;
}

export const CLASS_INFO: Record<PersonClass, ClassInfo> = {
  person_left: { description: "Walking left", usesPhone: false },
  person_right: { description: "Walking right", usesPhone: false },
  person_left_phone: { description: "Walking left, using phone", usesPhone: true },
  person_right_phone: { description: "Walking right, using phone", usesPhone: true },
};

/**
 * Box colours. Walkers and phone users use a blue/orange pair, which stays
 * distinguishable for the most common forms of colour blindness. Labels always
 * show the class name too, so colour is never the only cue.
 */
export const BOX_STYLES = {
  walker: { stroke: "#1d4ed8", labelBg: "#1d4ed8", labelText: "#ffffff" },
  phone: { stroke: "#f97316", labelBg: "#f97316", labelText: "#000000" },
  unknown: { stroke: "#6b7280", labelBg: "#374151", labelText: "#ffffff" },
} as const;

export function isPersonClass(name: string): name is PersonClass {
  return (PERSON_CLASSES as readonly string[]).includes(name);
}

export function boxStyleFor(name: string) {
  if (!isPersonClass(name)) return BOX_STYLES.unknown;
  return CLASS_INFO[name].usesPhone ? BOX_STYLES.phone : BOX_STYLES.walker;
}
