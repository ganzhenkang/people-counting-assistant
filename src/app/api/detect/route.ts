import { DETECT_ERROR_MESSAGES } from "@/lib/errors";
import {
  MAX_BASE64_LENGTH,
  ROBOFLOW_TIMEOUT_MS,
  buildRoboflowHeaders,
  buildRoboflowUrl,
  mapRoboflowStatus,
  normaliseBase64,
  parseRoboflowResponse,
  readRoboflowConfig,
} from "@/lib/roboflow";
import type { DetectErrorCode, DetectFailure, DetectSuccess } from "@/lib/types";

// Allow a slow first (cold-start) request; our own Roboflow timeout is 30 s.
export const maxDuration = 60;

const STATUS_FOR: Record<DetectErrorCode, number> = {
  CONFIG_MISSING: 500,
  CONFIG_INVALID: 500,
  AUTH_FAILED: 502,
  MODEL_NOT_FOUND: 502,
  RATE_LIMITED: 429,
  TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
  BAD_RESPONSE: 502,
  BAD_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
  NETWORK: 502,
};

function fail(code: DetectErrorCode, detail?: string) {
  // Log only our own error code and status details - never the URL, key or request body.
  console.error(`[api/detect] ${code}${detail ? ` (${detail})` : ""}`);
  const body: DetectFailure = { error: { code, message: DETECT_ERROR_MESSAGES[code] } };
  return Response.json(body, { status: STATUS_FOR[code] });
}

export async function POST(request: Request) {
  const configResult = readRoboflowConfig(process.env);
  if (!configResult.ok) return fail(configResult.code);
  const { config } = configResult;

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BASE64_LENGTH + 1024) return fail("PAYLOAD_TOO_LARGE");

  let image: string | null;
  try {
    const json = (await request.json()) as { image?: unknown };
    image = normaliseBase64(json?.image);
  } catch {
    return fail("BAD_REQUEST", "body is not JSON");
  }
  if (!image) return fail("BAD_REQUEST", "missing or invalid base64 image");
  if (image.length > MAX_BASE64_LENGTH) return fail("PAYLOAD_TOO_LARGE");

  let upstream: Response;
  try {
    upstream = await fetch(buildRoboflowUrl(config), {
      method: "POST",
      headers: buildRoboflowHeaders(config),
      body: image,
      signal: AbortSignal.timeout(ROBOFLOW_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") return fail("TIMEOUT");
    // Do not log `err` itself: keep logs limited to our own error codes.
    return fail("UPSTREAM_ERROR", `network error: ${name || "unknown"}`);
  }

  if (!upstream.ok) {
    // Drain the body without logging or forwarding it (it could echo request details).
    await upstream.body?.cancel().catch(() => undefined);
    return fail(mapRoboflowStatus(upstream.status), `Roboflow HTTP ${upstream.status}`);
  }

  let parsed;
  try {
    parsed = parseRoboflowResponse(await upstream.json());
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") return fail("TIMEOUT");
    return fail("BAD_RESPONSE", "response is not JSON");
  }
  if (!parsed.ok) return fail("BAD_RESPONSE", "no predictions array");

  const body: DetectSuccess = {
    predictions: parsed.predictions,
    image: parsed.image,
    malformedCount: parsed.malformedCount,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
