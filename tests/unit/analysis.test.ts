import { describe, expect, it } from "vitest";
import {
  type ClassCounts,
  DEFAULT_CONFIDENCE_THRESHOLD_PERCENT,
  DUPLICATE_IOU_THRESHOLD,
  analyse,
  computeRating,
  confidencePercent,
  countByClass,
  emptyCounts,
  filterByConfidence,
  findUnknownClasses,
  formatPercent,
  mergeDuplicates,
  ratingLevelForPercent,
} from "@/lib/analysis";
import { iou } from "@/lib/geometry";
import type { Prediction } from "@/lib/types";

const p = (cls: string, confidence: number): Prediction => ({ x: 50, y: 50, width: 10, height: 20, confidence, class: cls });

/** Box helper: x, y are the CENTRE. */
const box = (cls: string, confidence: number, x: number, y: number, width = 100, height = 100): Prediction => ({
  x,
  y,
  width,
  height,
  confidence,
  class: cls,
});

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
    expect(r.percentText).toBe("");
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
    it("33.9% (339 of 1000) is Low", () => {
      const r = computeRating(mix(339, 1000));
      expect(r.level).toBe("low");
      expect(r.percentText).toBe("33.9%");
    });
    it("exactly 34% is Medium", () => expect(computeRating(mix(34, 100)).level).toBe("medium"));
    it("17 of 50 (exactly 34%) is Medium", () => {
      const r = computeRating(mix(17, 50));
      expect(r.level).toBe("medium");
      expect(r.summary).toBe("17 of 50 pedestrians using a phone (34%) - Medium");
    });
    it("1 of 3 (33.3%) is Low", () => {
      const r = computeRating(mix(1, 3));
      expect(r.level).toBe("low");
      expect(r.summary).toBe("1 of 3 pedestrians using a phone (33.3%) - Low");
    });
  });

  describe("67% boundary", () => {
    it("66% is Medium", () => expect(computeRating(mix(66, 100)).level).toBe("medium"));
    it("2 of 3 (66.67%) is Medium, because 67% is not reached", () => {
      const r = computeRating(mix(2, 3));
      expect(r.percent).toBeCloseTo(66.667, 2);
      expect(r.level).toBe("medium");
      // Shown truncated, so the number never appears to cross the boundary.
      expect(r.summary).toBe("2 of 3 pedestrians using a phone (66.6%) - Medium");
    });
    it("669 of 1000 (66.9%) is Medium", () => expect(computeRating(mix(669, 1000)).level).toBe("medium"));
    it("exactly 67% is High", () => {
      const r = computeRating(mix(67, 100));
      expect(r.level).toBe("high");
      expect(r.percentText).toBe("67%");
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
    [33.99, "low"],
    [34, "medium"],
    [50, "medium"],
    [66, "medium"],
    [66.99, "medium"],
    [67, "high"],
    [100, "high"],
  ])("%d%% -> %s", (pct, level) => {
    expect(ratingLevelForPercent(pct)).toBe(level);
  });
});

describe("formatPercent", () => {
  it("shows whole numbers without decimals and truncates others to one decimal", () => {
    expect(formatPercent(40)).toBe("40%");
    expect(formatPercent(100)).toBe("100%");
    expect(formatPercent(57)).toBe("57%");
    expect(formatPercent(200 / 3)).toBe("66.6%");
    expect(formatPercent(66.96)).toBe("66.9%");
  });
});

describe("default slider threshold", () => {
  it("is 40%, the F1-curve peak (0.402) rounded", () => {
    expect(DEFAULT_CONFIDENCE_THRESHOLD_PERCENT).toBe(40);
  });
});

describe("iou", () => {
  it("is 1 for identical boxes and 0 for separate or edge-touching boxes", () => {
    expect(iou(box("a", 1, 50, 50), box("b", 1, 50, 50))).toBe(1);
    expect(iou(box("a", 1, 50, 50), box("b", 1, 300, 50))).toBe(0);
    expect(iou(box("a", 1, 50, 50), box("b", 1, 150, 50))).toBe(0);
  });

  it("uses centre coordinates", () => {
    // Shifted 50 px: intersection 50x100 = 5000, union 15000 -> 1/3
    expect(iou(box("a", 1, 50, 50), box("b", 1, 100, 50))).toBeCloseTo(1 / 3, 6);
  });
});

describe("mergeDuplicates", () => {
  it("uses an IoU limit of 0.5", () => expect(DUPLICATE_IOU_THRESHOLD).toBe(0.5));

  it("merges boxes of DIFFERENT classes above the IoU limit, keeping the higher confidence", () => {
    const walker = box("person_left", 0.6, 100, 100);
    const phone = box("person_left_phone", 0.8, 105, 100); // IoU ~0.90
    expect(iou(walker, phone)).toBeGreaterThan(0.5);
    expect(mergeDuplicates([walker, phone])).toEqual([phone]);
    expect(mergeDuplicates([phone, walker])).toEqual([phone]);
  });

  it("merges boxes of the same class above the IoU limit", () => {
    const a = box("person_right", 0.9, 100, 100);
    const b = box("person_right", 0.3, 110, 100);
    expect(mergeDuplicates([a, b])).toEqual([a]);
  });

  it("does NOT merge boxes below the IoU limit, even if they overlap", () => {
    const a = box("person_left", 0.9, 100, 100);
    const b = box("person_left_phone", 0.5, 150, 100); // IoU = 1/3
    expect(iou(a, b)).toBeGreaterThan(0);
    expect(iou(a, b)).toBeLessThan(0.5);
    expect(mergeDuplicates([a, b])).toEqual([a, b]);
  });

  it("does NOT merge boxes at exactly IoU 0.5 (must be above)", () => {
    // 100x100 vs 100x50 fully inside it: intersection 5000, union 10000 -> exactly 0.5
    const a = box("person_left", 0.9, 100, 100, 100, 100);
    const b = box("person_right", 0.5, 100, 75, 100, 50);
    expect(iou(a, b)).toBe(0.5);
    expect(mergeDuplicates([a, b])).toHaveLength(2);
  });

  it("does not chain: a box is only removed by a box that is kept", () => {
    const a = box("person_left", 0.9, 100, 100);
    const b = box("person_left", 0.8, 130, 100); // IoU with a ~0.54 -> removed
    const c = box("person_left", 0.7, 155, 100); // IoU with b 0.6 (b is gone), with a ~0.29 -> kept
    expect(iou(b, c)).toBeGreaterThan(0.5);
    expect(iou(a, c)).toBeLessThan(0.5);
    expect(mergeDuplicates([a, b, c])).toEqual([a, c]);
  });

  it("keeps the original order and does not mutate the input", () => {
    const input = [box("person_left", 0.2, 500, 100), box("person_right", 0.9, 100, 100)];
    const copy = structuredClone(input);
    expect(mergeDuplicates(input)).toEqual(input);
    expect(input).toEqual(copy);
  });

  it("handles an empty list", () => expect(mergeDuplicates([])).toEqual([]));
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
  // Spread out so none of them overlap.
  const preds = [
    box("person_left", 0.3, 100, 100),
    box("person_left_phone", 0.8, 400, 100),
    box("person_right", 0.5, 700, 100),
  ];

  it("recomputes counts and rating from the threshold alone", () => {
    const low = analyse(preds, 10);
    expect(low.rating.summary).toBe("1 of 3 pedestrians using a phone (33.3%) - Low");
    const high = analyse(preds, 60);
    expect(high.rating.summary).toBe("1 of 1 pedestrian using a phone (100%) - High");
    expect(high.hiddenByThreshold).toBe(2);
  });

  it("filters by confidence BEFORE merging, then counts the merged boxes", () => {
    const phone = box("person_left_phone", 0.3, 100, 100); // below 40%
    const walker = box("person_left", 0.5, 105, 100); // duplicate of `phone`
    // At 40%, the phone box is filtered out first, so the walker survives and is counted.
    const at40 = analyse([phone, walker], 40);
    expect(at40.filtered).toEqual([walker]);
    expect(at40.counts.person_left).toBe(1);
    expect(at40.mergedDuplicates).toBe(0);
    // At 10%, both pass the filter, then the higher-confidence walker wins the merge.
    const at10 = analyse([phone, walker], 10);
    expect(at10.filtered).toEqual([walker]);
    expect(at10.mergedDuplicates).toBe(1);
    expect(at10.rating.summary).toBe("0 of 1 pedestrian using a phone (0%) - Low");
  });

  it("removes cross-class duplicates from the counts and rating", () => {
    const r = analyse(
      [
        box("person_right_phone", 0.9, 100, 100),
        box("person_right", 0.7, 102, 100), // duplicate -> removed
        box("person_left", 0.8, 400, 100),
      ],
      40,
    );
    expect(r.counts).toEqual({ person_left: 1, person_right: 0, person_left_phone: 0, person_right_phone: 1 });
    expect(r.rating.summary).toBe("1 of 2 pedestrians using a phone (50%) - Medium");
  });

  it("returns 'No pedestrians detected' for an empty response", () => {
    const r = analyse([], 40);
    expect(r.rating.level).toBe("none");
    expect(r.filtered).toEqual([]);
  });
});
