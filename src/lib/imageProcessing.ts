/**
 * Browser-side image preparation: validate, fix orientation, resize to at most
 * 1600 px on the longest side and re-encode as JPEG so the request stays under
 * Vercel's 4.5 MB function body limit.
 */
import { fitWithin } from "@/lib/geometry";
import { MAX_BASE64_LENGTH } from "@/lib/limits";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SIDE = 1600;
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45];

export type FileProblem = "WRONG_TYPE" | "TOO_LARGE" | "UNREADABLE";

export const FILE_PROBLEM_MESSAGES: Record<FileProblem, string> = {
  WRONG_TYPE: "This file type is not supported. Please choose a JPG, PNG or WEBP image.",
  TOO_LARGE: "This image is larger than 10 MB. Please choose a smaller image.",
  UNREADABLE:
    "This image could not be opened. The file may be damaged or in an unsupported format. Please try a different image.",
};

export class FileProblemError extends Error {
  constructor(public problem: FileProblem) {
    super(FILE_PROBLEM_MESSAGES[problem]);
    this.name = "FileProblemError";
  }
}

/** Check type and size before reading the file. Pure, so it is unit tested. */
export function validateFile(file: { name: string; type: string; size: number }): FileProblem | null {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  const typeOk = (ACCEPTED_TYPES as readonly string[]).includes(type);
  // Some systems give no MIME type, so fall back to the extension only in that case.
  const extOk = type === "" && ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!typeOk && !extOk) return "WRONG_TYPE";
  if (file.size > MAX_FILE_BYTES) return "TOO_LARGE";
  return null;
}

/** Length of the base64 encoding of n bytes. */
export function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

export interface ProcessedImage {
  blob: Blob;
  base64: string;
  width: number;
  height: number;
  quality: number;
}

type Drawable = ImageBitmap | HTMLImageElement;

/** Decode with EXIF orientation applied. Falls back to <img>, which also honours EXIF in modern browsers. */
async function decodeImage(file: Blob): Promise<{ source: Drawable; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty image");
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } catch {
    throw new FileProblemError("UNREADABLE");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function processImage(file: Blob): Promise<ProcessedImage> {
  const decoded = await decodeImage(file);
  try {
    let maxSide = MAX_SIDE;
    // Shrink further only in the unlikely case that even low quality is too big.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { width, height } = fitWithin(decoded.width, decoded.height, maxSide);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new FileProblemError("UNREADABLE");
      ctx.fillStyle = "#ffffff"; // transparent PNG areas become white, not black
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(decoded.source, 0, 0, width, height);

      for (const quality of QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, quality);
        // Leave room for the JSON wrapper around the base64 string.
        if (base64Length(blob.size) <= MAX_BASE64_LENGTH - 1024) {
          return { blob, base64: await blobToBase64(blob), width, height, quality };
        }
      }
      maxSide = Math.round(maxSide * 0.75);
    }
    throw new FileProblemError("TOO_LARGE");
  } catch (err) {
    if (err instanceof FileProblemError) throw err;
    throw new FileProblemError("UNREADABLE");
  } finally {
    decoded.close();
  }
}
