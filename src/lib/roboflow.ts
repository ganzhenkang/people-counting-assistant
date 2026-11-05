/**
 * Pure helpers for talking to the Roboflow Serverless Hosted API.
 *
 * Request format, from Roboflow's REST docs for object detection
 * (docs.roboflow.com, "Object Detection" hosted API, checked 2026-11-05):
 *   POST https://serverless.roboflow.com/{model_id}/{version}?confidence=10&overlap=30&format=json
 *   Authorization: Bearer <API key>
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: the raw base64 string of the image (no "data:" prefix, no form field name)
 * `confidence` and `overlap` are on a scale of 0-100 (defaults 40 and 30).
 * Response: { predictions: [{ x, y, width, height, confidence (0-1), class, ... }], image: { width, height } }
 * where x and y are the CENTRE of the box.
 *
 * The key is sent in a header (as the docs recommend), never in the URL, so it cannot
 * leak through URL logging.
 */
import type { DetectErrorCode, ImageSize, Prediction } from "@/lib/types";

export { MAX_BASE64_LENGTH } from "@/lib/limits";

export const ROBOFLOW_BASE_URL = "https://serverless.roboflow.com";
/** Ask for everything at or above 10% (0-100 scale) so the browser slider can filter without new requests. */
export const REQUEST_CONFIDENCE = 10;
/** Roboflow's own same-class overlap merge (0-100 scale, its default). Cross-class duplicates are merged in the browser. */
export const REQUEST_OVERLAP = 30;
export const ROBOFLOW_TIMEOUT_MS = 30_000;

export interface RoboflowConfig {
  apiKey: string;
  modelId: string;
  modelVersion: string;
}

/** Read the server-only env vars. Returns null if any are missing or blank. */
export function readRoboflowConfig(env: Record<string, string | undefined>): RoboflowConfig | null {
  const apiKey = env.ROBOFLOW_API_KEY?.trim();
  const modelId = env.ROBOFLOW_MODEL_ID?.trim().replace(/^\/+|\/+$/g, "");
  const modelVersion = env.ROBOFLOW_MODEL_VERSION?.trim().replace(/^\/+|\/+$/g, "");
  if (!apiKey || !modelId || !modelVersion) return null;
  return { apiKey, modelId, modelVersion };
}

export function buildRoboflowUrl(config: RoboflowConfig): string {
  const url = new URL(
    `${ROBOFLOW_BASE_URL}/${encodeURIComponent(config.modelId)}/${encodeURIComponent(config.modelVersion)}`,
  );
  url.searchParams.set("confidence", String(REQUEST_CONFIDENCE));
  url.searchParams.set("overlap", String(REQUEST_OVERLAP));
  url.searchParams.set("format", "json");
  return url.toString();
}

export function buildRoboflowHeaders(config: RoboflowConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

/** Remove a "data:image/...;base64," prefix and whitespace. Returns null if not valid base64. */
export function normaliseBase64(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const stripped = input.replace(/^data:[^;,]*;base64,/, "").replace(/\s+/g, "");
  if (stripped.length === 0 || stripped.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(stripped)) return null;
  return stripped;
}

/** Map a non-OK Roboflow HTTP status to one of our error codes. */
export function mapRoboflowStatus(status: number): DetectErrorCode {
  if (status === 401 || status === 403) return "AUTH_FAILED";
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 408 || status === 504) return "TIMEOUT";
  return "UPSTREAM_ERROR";
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function parsePrediction(raw: unknown): Prediction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const x = toFiniteNumber(r.x);
  const y = toFiniteNumber(r.y);
  const width = toFiniteNumber(r.width);
  const height = toFiniteNumber(r.height);
  const confidence = toFiniteNumber(r.confidence);
  if (x === null || y === null || width === null || height === null || confidence === null) return null;
  if (typeof r.class !== "string" || width <= 0 || height <= 0) return null;
  return { x, y, width, height, confidence, class: r.class };
}

export type ParsedRoboflowResponse =
  | { ok: true; predictions: Prediction[]; image: ImageSize | null; malformedCount: number }
  | { ok: false };

/** Validate Roboflow's JSON. Unknown classes are kept; only structurally broken entries are skipped (and counted). */
export function parseRoboflowResponse(body: unknown): ParsedRoboflowResponse {
  if (!body || typeof body !== "object") return { ok: false };
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.predictions)) return { ok: false };

  const predictions: Prediction[] = [];
  let malformedCount = 0;
  for (const raw of b.predictions) {
    const p = parsePrediction(raw);
    if (p) predictions.push(p);
    else malformedCount += 1;
  }

  let image: ImageSize | null = null;
  if (b.image && typeof b.image === "object") {
    const img = b.image as Record<string, unknown>;
    const width = toFiniteNumber(img.width);
    const height = toFiniteNumber(img.height);
    if (width && height && width > 0 && height > 0) image = { width, height };
  }
  return { ok: true, predictions, image, malformedCount };
}
