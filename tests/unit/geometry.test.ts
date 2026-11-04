import { describe, expect, it } from "vitest";
import { fitWithin, predictionToRect } from "@/lib/geometry";

describe("predictionToRect", () => {
  it("converts a centre-based box to a top-left rectangle", () => {
    const r = predictionToRect(
      { x: 100, y: 200, width: 40, height: 80, confidence: 0.9, class: "person_left" },
      { width: 1000, height: 800 },
      { width: 1000, height: 800 },
    );
    expect(r).toEqual({ left: 80, top: 160, width: 40, height: 80 });
  });

  it("scales boxes when the model image size differs from the drawn image", () => {
    const r = predictionToRect(
      { x: 100, y: 100, width: 40, height: 20, confidence: 0.9, class: "person_left" },
      { width: 800, height: 600 },
      { width: 1600, height: 1200 },
    );
    expect(r).toEqual({ left: 160, top: 180, width: 80, height: 40 });
  });

  it("clamps boxes that extend past the image edge", () => {
    const r = predictionToRect(
      { x: 5, y: 595, width: 20, height: 20, confidence: 0.9, class: "person_left" },
      { width: 800, height: 600 },
      { width: 800, height: 600 },
    );
    expect(r).toEqual({ left: 0, top: 585, width: 15, height: 15 });
  });
});

describe("fitWithin", () => {
  it("does not upscale small images", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("limits the longest side of a landscape image", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it("limits the longest side of a portrait image", () => {
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });
});
