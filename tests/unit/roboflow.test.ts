import { describe, expect, it } from "vitest";
import {
  buildRoboflowUrl,
  mapRoboflowStatus,
  normaliseBase64,
  parseRoboflowResponse,
  readRoboflowConfig,
} from "@/lib/roboflow";

describe("readRoboflowConfig", () => {
  it("returns null when any variable is missing or blank", () => {
    expect(readRoboflowConfig({})).toBeNull();
    expect(readRoboflowConfig({ ROBOFLOW_API_KEY: "k", ROBOFLOW_MODEL_ID: "m", ROBOFLOW_MODEL_VERSION: " " })).toBeNull();
  });

  it("trims whitespace and stray slashes", () => {
    expect(
      readRoboflowConfig({ ROBOFLOW_API_KEY: " k ", ROBOFLOW_MODEL_ID: "/my-model/", ROBOFLOW_MODEL_VERSION: "3\n" }),
    ).toEqual({ apiKey: "k", modelId: "my-model", modelVersion: "3" });
  });

  it("ignores NEXT_PUBLIC_ variables", () => {
    expect(
      readRoboflowConfig({
        NEXT_PUBLIC_ROBOFLOW_API_KEY: "k",
        NEXT_PUBLIC_ROBOFLOW_MODEL_ID: "m",
        NEXT_PUBLIC_ROBOFLOW_MODEL_VERSION: "1",
      }),
    ).toBeNull();
  });
});

describe("buildRoboflowUrl", () => {
  it("builds the serverless URL with a 0-1 confidence of 0.1", () => {
    const url = new URL(buildRoboflowUrl({ apiKey: "abc 123", modelId: "zebra-xing", modelVersion: "2" }));
    expect(url.origin + url.pathname).toBe("https://serverless.roboflow.com/zebra-xing/2");
    expect(url.searchParams.get("api_key")).toBe("abc 123");
    expect(url.searchParams.get("confidence")).toBe("0.1");
  });
});

describe("normaliseBase64", () => {
  it("strips a data URL prefix", () => {
    expect(normaliseBase64("data:image/jpeg;base64,QUJD")).toBe("QUJD");
  });
  it("rejects non-strings, empty and invalid input", () => {
    expect(normaliseBase64(undefined)).toBeNull();
    expect(normaliseBase64("")).toBeNull();
    expect(normaliseBase64("not base64!")).toBeNull();
    expect(normaliseBase64("QUJ")).toBeNull();
  });
});

describe("mapRoboflowStatus", () => {
  it.each([
    [401, "AUTH_FAILED"],
    [403, "AUTH_FAILED"],
    [404, "MODEL_NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [504, "TIMEOUT"],
    [500, "UPSTREAM_ERROR"],
  ])("%i -> %s", (status, code) => {
    expect(mapRoboflowStatus(status)).toBe(code);
  });
});

describe("parseRoboflowResponse", () => {
  it("keeps valid predictions, including unknown classes", () => {
    const res = parseRoboflowResponse({
      image: { width: 1600, height: 1200 },
      predictions: [
        { x: 10, y: 20, width: 5, height: 6, confidence: 0.8, class: "person_left", class_id: 0 },
        { x: 10, y: 20, width: 5, height: 6, confidence: 0.5, class: "dog" },
      ],
    });
    expect(res).toEqual({
      ok: true,
      image: { width: 1600, height: 1200 },
      malformedCount: 0,
      predictions: [
        { x: 10, y: 20, width: 5, height: 6, confidence: 0.8, class: "person_left" },
        { x: 10, y: 20, width: 5, height: 6, confidence: 0.5, class: "dog" },
      ],
    });
  });

  it("counts malformed predictions instead of crashing", () => {
    const res = parseRoboflowResponse({ predictions: [{ x: "a" }, null, { x: 1, y: 1, width: 0, height: 1, confidence: 1, class: "c" }] });
    expect(res).toEqual({ ok: true, image: null, predictions: [], malformedCount: 3 });
  });

  it("accepts an empty predictions array (no detections)", () => {
    expect(parseRoboflowResponse({ predictions: [] })).toMatchObject({ ok: true, predictions: [] });
  });

  it("rejects responses without a predictions array", () => {
    expect(parseRoboflowResponse({ message: "error" })).toEqual({ ok: false });
    expect(parseRoboflowResponse(null)).toEqual({ ok: false });
  });
});
