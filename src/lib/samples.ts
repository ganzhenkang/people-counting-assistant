/** Sample images are listed in public/samples/manifest.json so they can change without code edits. */

export const MAX_SAMPLES = 4;

export interface SampleEntry {
  file: string;
  label: string;
}

const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]*\.(jpe?g|png|webp)$/i;

/**
 * Accepts either `[{ "file": "a.jpg", "label": "..." }]`, `["a.jpg"]`, or
 * `{ "samples": [...] }`. Entries that are not plain image filenames are ignored.
 */
export function parseManifest(json: unknown): SampleEntry[] {
  const list = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { samples?: unknown }).samples)
      ? (json as { samples: unknown[] }).samples
      : [];

  const entries: SampleEntry[] = [];
  for (const item of list) {
    const file = typeof item === "string" ? item : (item as { file?: unknown })?.file;
    if (typeof file !== "string" || !SAFE_FILENAME.test(file) || file.includes("..")) continue;
    const rawLabel = typeof item === "object" && item ? (item as { label?: unknown }).label : undefined;
    const label = typeof rawLabel === "string" && rawLabel.trim() ? rawLabel.trim() : file.replace(/\.[^.]+$/, "");
    entries.push({ file, label });
    if (entries.length === MAX_SAMPLES) break;
  }
  return entries;
}
