/** One detection as returned by Roboflow. x and y are the CENTRE of the box. */
export interface Prediction {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0 to 1 */
  confidence: number;
  class: string;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** Successful response from POST /api/detect. */
export interface DetectSuccess {
  predictions: Prediction[];
  /** Size of the image as Roboflow saw it (predictions are in this space). */
  image: ImageSize | null;
  /** Detections Roboflow returned that were malformed and could not be drawn. */
  malformedCount: number;
}

export type DetectErrorCode =
  | "CONFIG_MISSING"
  | "CONFIG_INVALID"
  | "AUTH_FAILED"
  | "MODEL_NOT_FOUND"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UPSTREAM_ERROR"
  | "BAD_RESPONSE"
  | "BAD_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "NETWORK";

export interface DetectFailure {
  error: { code: DetectErrorCode; message: string };
}
