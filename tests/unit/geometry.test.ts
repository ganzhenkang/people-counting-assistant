import { describe, expect, it } from "vitest";
import { fitWithin, labelConnector, placeLabels, predictionToRect } from "@/lib/geometry";

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

describe("placeLabels", () => {
  const bounds = { width: 1000, height: 800 };
  const size = { width: 200, height: 30 };
  const overlap = (a: { left: number; top: number; width: number; height: number }, b: typeof a) =>
    a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

  it("puts a lone label directly above its box", () => {
    const [l] = placeLabels([{ left: 100, top: 300, width: 50, height: 150 }], [size], bounds);
    expect(l).toMatchObject({ left: 100, top: 270, attached: true });
  });

  it("never overlaps labels for people standing close together", () => {
    const boxes = [0, 1, 2, 3].map((i) => ({ left: 400 + i * 40, top: 300, width: 35, height: 150 }));
    const labels = placeLabels(boxes, boxes.map(() => size), bounds);
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) expect(overlap(labels[i], labels[j])).toBe(false);
    }
    expect(labels[0].attached).toBe(true);
    expect(labels.some((l) => !l.attached || l.top > 300)).toBe(true);
    // Each label starts at its own box's left edge, so it is clear which person it names.
    labels.forEach((l, i) => expect(l.left).toBe(boxes[i].left));
  });

  it("stacks a label further away, with a connector, when both nearest spots are taken", () => {
    const boxes = [
      { left: 100, top: 300, width: 40, height: 100 },
      { left: 120, top: 300, width: 40, height: 100 },
      { left: 140, top: 300, width: 40, height: 100 },
    ];
    const labels = placeLabels(boxes, boxes.map(() => size), bounds);
    expect(labels[0]).toMatchObject({ top: 270, attached: true });
    expect(labels[1]).toMatchObject({ top: 400, attached: true });
    expect(labels[2].attached).toBe(false);
    expect(labelConnector(boxes[2], labels[2])).not.toBeNull();
  });

  it("gives attached labels no connector and detached labels one that reaches the box", () => {
    const box = { left: 100, top: 300, width: 50, height: 150 };
    expect(labelConnector(box, { left: 100, top: 270, width: 200, height: 30, attached: true })).toBeNull();
    expect(labelConnector(box, { left: 100, top: 200, width: 200, height: 30, attached: false })).toEqual({
      x: 125,
      y1: 230,
      y2: 300,
    });
  });

  it("keeps labels inside the image", () => {
    const boxes = [
      { left: 950, top: 0, width: 50, height: 100 },
      { left: 940, top: 5, width: 50, height: 100 },
    ];
    const labels = placeLabels(boxes, boxes.map(() => size), bounds);
    for (const l of labels) {
      expect(l.left).toBeGreaterThanOrEqual(0);
      expect(l.left + l.width).toBeLessThanOrEqual(bounds.width);
      expect(l.top).toBeGreaterThanOrEqual(0);
      expect(l.top + l.height).toBeLessThanOrEqual(bounds.height);
    }
    expect(overlap(labels[0], labels[1])).toBe(false);
  });

  it("falls back to above-the-box when there is no free space", () => {
    const tiny = { width: 200, height: 40 };
    const boxes = [0, 1, 2].map(() => ({ left: 0, top: 0, width: 200, height: 40 }));
    const labels = placeLabels(boxes, boxes.map(() => size), tiny);
    expect(labels).toHaveLength(3);
    expect(labels[2]).toMatchObject({ left: 0, top: 0, attached: true });
  });
});
