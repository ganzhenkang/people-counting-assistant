import type { DetectErrorCode } from "@/lib/types";

/** Plain-English messages for every detection error. Never include secrets here. */
export const DETECT_ERROR_MESSAGES: Record<DetectErrorCode, string> = {
  CONFIG_MISSING:
    "The app is not set up yet: the Roboflow settings are missing on the server. Add ROBOFLOW_API_KEY and ROBOFLOW_MODEL, then restart or redeploy.",
  CONFIG_INVALID:
    "The app is not set up correctly: ROBOFLOW_MODEL must be a full Roboflow model ID in the form workspace/model-slug (for example my-workspace/my-project-2-yolo26n-t1). Fix it, then restart or redeploy.",
  AUTH_FAILED:
    "Roboflow rejected the request. The API key may be wrong, or it may not have access to this model. Check ROBOFLOW_API_KEY and ROBOFLOW_MODEL.",
  MODEL_NOT_FOUND:
    "Roboflow could not find this model. Check that ROBOFLOW_MODEL is the full model ID from the project's Models page (workspace/model-slug).",
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
