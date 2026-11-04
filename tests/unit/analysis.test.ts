import { describe, expect, it } from "vitest";
import {
  type ClassCounts,
  analyse,
  computeRating,
  confidencePercent,
  countByClass,
  emptyCounts,
  filterByConfidence,
  findUnknownClasses,
  ratingLevelForPercent,
} from "@/lib/analysis";
import type { Prediction } from "@/lib/types";

const p = (cls: string, confidence: number): Prediction => ({ x: 50, y: 50, width: 10, height: 20, confidence, class: cls });

function counts(partial: Partial<ClassCounts>): ClassCounts {
  return { ...emptyCounts(), ...partial };
}

/** Counts with `phone` phone users out of `total` people. */
function mix(phone: number, total: number): ClassCounts {
  return counts({ person_left_phone: phone, person_left: total - phone });
}

describe("computeRating", () => {
  it("shows 'No pedestrians detected' and no score when nobody is detected", () => {
    const r = computeRating(emptyCounts());
    expect(r.totalPeople).toBe(0);
    expect(r.phoneUsers).toBe(0);
    expect(r.percent).toBeNull();
    expect(r.level).toBe("none");
    expect(r.summary).toBe("No pedestrians detected");
    expect(r.summary).not.toMatch(/%/);
  });

  it("formats the summary with the numbers behind the rating", () => {
    expect(computeRating(mix(2, 5)).summary).toBe("2 of 5 pedestrians using a phone (40%) - Medium");
    expect(computeRating(mix(1, 1)).summary).toBe("1 of 1 pedestrian using a phone (100%) - High");
  });

  it("counts both phone classes as phone users and all four classes as people", () => {
    const r = computeRating({ person_left: 1, person_right: 2, person_left_phone: 3, person_right_phone: 4 });
    expect(r.totalPeople).toBe(10);
    expect(r.phoneUsers).toBe(7);
    expect(r.percent).toBe(70);
    expect(r.level).toBe("high");
  });

  it("is Low at 0%", () => {
    expect(computeRating(mix(0, 4)).level).toBe("low");
  });

  describe("34% boundary", () => {
    it("33% is Low", () => expect(computeRating(mix(33, 100)).level).toBe("low"));
    it("34% is Medium", () => expect(computeRating(mix(34, 100)).level).toBe("medium"));
    it("1 of 3 (33.3%, shown as 33%) is Low", () => {
      const r = computeRating(mix(1, 3));
      expect(r.percent).toBe(33);
      expect(r.level).toBe("low");
    });
  });

  describe("67% boundary", () => {
    it("66% is Medium", () => expect(computeRating(mix(66, 100)).level).toBe("medium"));
    it("67% is High", () => expect(computeRating(mix(67, 100)).level).toBe("high"));
    it("2 of 3 (66.7%, shown as 67%) is High, matching the displayed percentage", () => {
      const r = computeRating(mix(2, 3));
      expect(r.percent).toBe(67);
      expect(r.level).toBe("high");
    });
  });

  it("is High at 100%", () => {
    expect(computeRating(mix(5, 5)).level).toBe("high");
  });
});

describe("ratingLevelForPercent", () => {
  it.each([
    [0, "low"],
    [33, "low"],
    [34, "medium"],
    [50, "medium"],
    [66, "medium"],
    [67, "high"],
    [100, "high"],
  ])("%i%% -> %s", (pct, level) => {
    expect(ratingLevelForPercent(pct)).toBe(level);
  });
});

describe("filterByConfidence", () => {
  const preds = [p("person_left", 0.1), p("person_left", 0.399), p("person_left", 0.4), p("person_right", 0.95)];

  it("keeps detections at or above the threshold", () => {
    expect(filterByConfidence(preds, 40).map((x) => x.confidence)).toEqual([0.4, 0.95]);
  });

  it("keeps everything at the slider minimum of 10%", () => {
    expect(filterByConfidence(preds, 10)).toHaveLength(4);
  });

  it("handles floating-point edge cases (0.57 counts as 57%)", () => {
    expect(confidencePercent(0.57)).toBe(57);
    expect(filterByConfidence([p("person_left", 0.57)], 57)).toHaveLength(1);
  });

  it("never shows a percentage higher than the true confidence", () => {
    expect(confidencePercent(0.399)).toBe(39);
  });
});

describe("countByClass and unknown classes", () => {
  const preds = [
    p("person_left", 0.9),
    p("person_left", 0.9),
    p("person_right_phone", 0.9),
    p("bicycle", 0.9),
    p("Person_Left", 0.9),
  ];

  it("counts only the four known classes (case-sensitive)", () => {
    expect(countByClass(preds)).toEqual({ person_left: 2, person_right: 0, person_left_phone: 0, person_right_phone: 1 });
  });

  it("reports unknown classes instead of dropping them silently", () => {
    expect(findUnknownClasses(preds)).toEqual([
      { name: "bicycle", count: 1 },
      { name: "Person_Left", count: 1 },
    ]);
  });
});

describe("analyse", () => {
  const preds = [p("person_left", 0.3), p("person_left_phone", 0.8), p("person_right", 0.5)];

  it("recomputes counts and rating from the threshold alone", () => {
    const low = analyse(preds, 10);
    expect(low.rating.summary).toBe("1 of 3 pedestrians using a phone (33%) - Low");
    const high = analyse(preds, 60);
    expect(high.rating.summary).toBe("1 of 1 pedestrian using a phone (100%) - High");
    expect(high.hiddenByThreshold).toBe(2);
  });

  it("returns 'No pedestrians detected' for an empty response", () => {
    const r = analyse([], 40);
    expect(r.rating.level).toBe("none");
    expect(r.filtered).toEqual([]);
  });
});
