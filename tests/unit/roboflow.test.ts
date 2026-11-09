import { describe, expect, it } from "vitest";
import {
  buildRoboflowHeaders,
  buildRoboflowUrl,
  mapRoboflowStatus,
  normaliseBase64,
  parseRoboflowResponse,
  readRoboflowConfig,
} from "@/lib/roboflow";

const MODEL = "gans-workspace-efyfd/people-counting-activity-v2-2-yolo26n-t6";
const missing = { ok: false, code: "CONFIG_MISSING" };
const invalid = { ok: false, code: "CONFIG_INVALID" };

describe("readRoboflowConfig", () => {
  it("reads the API key and the full model ID", () => {
    expect(readRoboflowConfig({ ROBOFLOW_API_KEY: "k", ROBOFLOW_MODEL: MODEL })).toEqual({
      ok: true,
      config: { apiKey: "k", model: MODEL },
    });
  });

  it("reports missing config when either variable is missing or blank", () => {
    expect(readRoboflowConfig({})).toEqual(missing);
    expect(readRoboflowConfig({ ROBOFLOW_API_KEY: "k", ROBOFLOW_MODEL: " " })).toEqual(missing);
    expect(readRoboflowConfig({ ROBOFLOW_MODEL: MODEL })).toEqual(missing);
  });

  it("no longer reads the old ROBOFLOW_MODEL_ID / ROBOFLOW_MODEL_VERSION pair", () => {
    expect(
      readRoboflowConfig({ ROBOFLOW_API_KEY: "k", ROBOFLOW_MODEL_ID: "people-counting-activity-v2", ROBOFLOW_MODEL_VERSION: "2" }),
    ).toEqual(missing);
  });

  it("trims whitespace and stray slashes", () => {
    expect(readRoboflowConfig({ ROBOFLOW_API_KEY: " k ", ROBOFLOW_MODEL: ` /${MODEL}/\n` })).toEqual({
      ok: true,
      config: { apiKey: "k", model: MODEL },
    });
  });

  it.each(["just-a-slug", "a/b/c", "a//b", "work space/model", "ws/model?x=1", "../model"])(
    "rejects a malformed model ID: %s",
    (model) => {
      expect(readRoboflowConfig({ ROBOFLOW_API_KEY: "k", ROBOFLOW_MODEL: model })).toEqual(invalid);
    },
  );

  it("ignores NEXT_PUBLIC_ variables", () => {
    expect(readRoboflowConfig({ NEXT_PUBLIC_ROBOFLOW_API_KEY: "k", NEXT_PUBLIC_ROBOFLOW_MODEL: MODEL })).toEqual(missing);
  });
});

describe("buildRoboflowUrl", () => {
  const config = { apiKey: "secret-key-123", model: MODEL };

  it("calls the full model ID, keeping the slash between workspace and model slug", () => {
    const url = new URL(buildRoboflowUrl(config));
    expect(url.origin + url.pathname).toBe(
      "https://serverless.roboflow.com/gans-workspace-efyfd/people-counting-activity-v2-2-yolo26n-t6",
    );
  });

  it("requests confidence 10 on Roboflow's 0-100 scale", () => {
    const url = new URL(buildRoboflowUrl(config));
    expect(url.searchParams.get("confidence")).toBe("10");
    expect(url.searchParams.get("overlap")).toBe("30");
  });

  it("never puts the API key in the URL", () => {
    const url = buildRoboflowUrl(config);
    expect(url).not.toContain("secret-key-123");
    expect(url).not.toContain("api_key");
  });

  it("sends the key as a Bearer header with a form-urlencoded body type", () => {
    expect(buildRoboflowHeaders(config)).toEqual({
      Authorization: "Bearer secret-key-123",
      "Content-Type": "application/x-www-form-urlencoded",
    });
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
