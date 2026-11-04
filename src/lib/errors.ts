import type { DetectErrorCode } from "@/lib/types";

/** Plain-English messages for every detection error. Never include secrets here. */
export const DETECT_ERROR_MESSAGES: Record<DetectErrorCode, string> = {
  CONFIG_MISSING:
    "The app is not set up yet: the Roboflow settings are missing on the server. Add ROBOFLOW_API_KEY, ROBOFLOW_MODEL_ID and ROBOFLOW_MODEL_VERSION, then restart or redeploy.",
  AUTH_FAILED:
    "Roboflow rejected the request. The API key may be wrong, or it may not have access to this model. Check ROBOFLOW_API_KEY, ROBOFLOW_MODEL_ID and ROBOFLOW_MODEL_VERSION.",
  MODEL_NOT_FOUND:
    "Roboflow could not find this model. Check that ROBOFLOW_MODEL_ID and ROBOFLOW_MODEL_VERSION match a trained, deployed model version.",
  RATE_LIMITED: "Roboflow is receiving too many requests right now. Wait a few seconds, then try again.",
  TIMEOUT:
    "The model took too long to respond (over 30 seconds). The first request after a quiet period can be slow, so please try again.",
  UPSTREAM_ERROR: "Roboflow had a problem processing this image. Please try again in a moment.",
  BAD_RESPONSE: "Roboflow sent back a response the app could not understand. Please try again.",
  BAD_REQUEST: "The image could not be sent for analysis. Try choosing the image again.",
  PAYLOAD_TOO_LARGE: "The image is still too large to send after compression. Try a smaller image.",
  NETWORK: "Could not reach the server. Check your internet connection and try again.",
};

/** Errors where pressing "Try again" with the same image might succeed. */
export const RETRYABLE_ERRORS: ReadonlySet<DetectErrorCode> = new Set<DetectErrorCode>([
  "RATE_LIMITED",
  "TIMEOUT",
  "UPSTREAM_ERROR",
  "BAD_RESPONSE",
  "NETWORK",
]);
