import { DETECT_ERROR_MESSAGES } from "@/lib/errors";
import type { DetectErrorCode, DetectFailure, DetectSuccess } from "@/lib/types";

/** Slightly longer than the server's 30 s Roboflow timeout so the server's message wins. */
const CLIENT_TIMEOUT_MS = 35_000;

export class DetectError extends Error {
  constructor(public code: DetectErrorCode, message?: string) {
    super(message ?? DETECT_ERROR_MESSAGES[code]);
    this.name = "DetectError";
  }
}

function codeForStatus(status: number): DetectErrorCode {
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  if (status === 504 || status === 408) return "TIMEOUT";
  return "UPSTREAM_ERROR";
}

export async function detect(base64: string): Promise<DetectSuccess> {
  let res: Response;
  try {
    res = await fetch("/api/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64 }),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    throw new DetectError(name === "TimeoutError" || name === "AbortError" ? "TIMEOUT" : "NETWORK");
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // e.g. a platform error page that is not JSON
  }

  if (!res.ok) {
    const err = (body as DetectFailure | null)?.error;
    if (err && typeof err.code === "string" && err.code in DETECT_ERROR_MESSAGES) {
      throw new DetectError(err.code);
    }
    throw new DetectError(codeForStatus(res.status));
  }

  const data = body as DetectSuccess | null;
  if (!data || !Array.isArray(data.predictions)) throw new DetectError("BAD_RESPONSE");
  return data;
}
