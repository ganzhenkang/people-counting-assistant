/**
 * "Flag wrong result" records, kept in the browser's localStorage.
 * Every storage call is wrapped so the app still works when storage is blocked
 * (private browsing, disabled cookies, full quota).
 */
import type { ClassCounts } from "@/lib/analysis";

export const FLAGS_STORAGE_KEY = "people-counting-assistant.flags.v1";

export interface FlagRecord {
  id: string;
  filename: string;
  timestamp: string;
  thresholdPercent: number;
  counts: ClassCounts;
  totalPeople: number;
  phoneUsers: number;
  ratingPercent: number | null;
  rating: string;
  note: string;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadFlags(storage: StorageLike | null = getStorage()): FlagRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(FLAGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FlagRecord[]) : [];
  } catch {
    return [];
  }
}

/** Returns true when the flag was saved, false when storage is unavailable. */
export function saveFlag(record: FlagRecord, storage: StorageLike | null = getStorage()): boolean {
  if (!storage) return false;
  try {
    const all = [...loadFlags(storage), record];
    storage.setItem(FLAGS_STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function clearFlags(storage: StorageLike | null = getStorage()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(FLAGS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function flagsToJson(flags: FlagRecord[]): string {
  return JSON.stringify({ app: "People Counting Assistant (Team 5)", exportedAt: new Date().toISOString(), flags }, null, 2);
}
