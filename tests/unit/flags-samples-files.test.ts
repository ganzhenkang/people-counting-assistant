import { describe, expect, it } from "vitest";
import { emptyCounts } from "@/lib/analysis";
import { FLAGS_STORAGE_KEY, type FlagRecord, clearFlags, flagsToJson, loadFlags, saveFlag } from "@/lib/flags";
import { MAX_FILE_BYTES, base64Length, validateFile } from "@/lib/imageProcessing";
import { parseManifest } from "@/lib/samples";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

const record: FlagRecord = {
  id: "1",
  filename: "crossing.jpg",
  timestamp: "2026-11-03T10:00:00.000Z",
  thresholdPercent: 40,
  counts: emptyCounts(),
  totalPeople: 0,
  phoneUsers: 0,
  ratingPercent: null,
  rating: "No pedestrians detected",
  note: "",
};

describe("flags storage", () => {
  it("saves, loads and clears flags", () => {
    const s = memoryStorage();
    expect(saveFlag(record, s)).toBe(true);
    expect(saveFlag({ ...record, id: "2" }, s)).toBe(true);
    expect(loadFlags(s).map((f) => f.id)).toEqual(["1", "2"]);
    expect(clearFlags(s)).toBe(true);
    expect(loadFlags(s)).toEqual([]);
  });

  it("does not throw when storage is unavailable or broken", () => {
    expect(loadFlags(null)).toEqual([]);
    expect(saveFlag(record, null)).toBe(false);
    expect(loadFlags(throwingStorage)).toEqual([]);
    expect(saveFlag(record, throwingStorage)).toBe(false);
    expect(clearFlags(throwingStorage)).toBe(false);
  });

  it("ignores corrupted stored data", () => {
    const s = memoryStorage();
    s.data.set(FLAGS_STORAGE_KEY, "{not json");
    expect(loadFlags(s)).toEqual([]);
  });

  it("exports flags as JSON", () => {
    const parsed = JSON.parse(flagsToJson([record]));
    expect(parsed.flags).toEqual([record]);
  });
});

describe("validateFile", () => {
  it("accepts JPG, PNG and WEBP", () => {
    expect(validateFile({ name: "a.jpg", type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateFile({ name: "a.png", type: "image/png", size: 1000 })).toBeNull();
    expect(validateFile({ name: "a.webp", type: "image/webp", size: 1000 })).toBeNull();
  });

  it("falls back to the extension only when the browser gives no type", () => {
    expect(validateFile({ name: "a.JPG", type: "", size: 1000 })).toBeNull();
    expect(validateFile({ name: "a.gif", type: "", size: 1000 })).toBe("WRONG_TYPE");
  });

  it("rejects other types", () => {
    expect(validateFile({ name: "a.gif", type: "image/gif", size: 1000 })).toBe("WRONG_TYPE");
    expect(validateFile({ name: "a.pdf", type: "application/pdf", size: 1000 })).toBe("WRONG_TYPE");
    expect(validateFile({ name: "a.jpg", type: "image/heic", size: 1000 })).toBe("WRONG_TYPE");
  });

  it("rejects files over 10 MB", () => {
    expect(validateFile({ name: "a.jpg", type: "image/jpeg", size: MAX_FILE_BYTES })).toBeNull();
    expect(validateFile({ name: "a.jpg", type: "image/jpeg", size: MAX_FILE_BYTES + 1 })).toBe("TOO_LARGE");
  });

  it("computes base64 length", () => {
    expect(base64Length(3)).toBe(4);
    expect(base64Length(4)).toBe(8);
  });
});

describe("parseManifest", () => {
  it("accepts objects, strings and a wrapped list, up to 4 entries", () => {
    expect(parseManifest([{ file: "a.jpg", label: "Morning" }, "b.png"])).toEqual([
      { file: "a.jpg", label: "Morning" },
      { file: "b.png", label: "b" },
    ]);
    expect(parseManifest({ samples: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"] })).toHaveLength(4);
  });

  it("rejects unsafe or non-image paths", () => {
    expect(parseManifest(["../secret.jpg", "sub/dir.jpg", "notes.txt", "", 42, { file: "/etc/x.png" }])).toEqual([]);
  });

  it("returns an empty list for an empty or invalid manifest", () => {
    expect(parseManifest([])).toEqual([]);
    expect(parseManifest(null)).toEqual([]);
    expect(parseManifest({})).toEqual([]);
  });
});
