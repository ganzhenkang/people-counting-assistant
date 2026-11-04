/** Canvas drawing of detections. Box maths lives in geometry.ts (unit tested). */
import { boxStyleFor } from "@/config/classes";
import { confidencePercent } from "@/lib/analysis";
import { predictionToRect } from "@/lib/geometry";
import type { ImageSize, Prediction } from "@/lib/types";

/**
 * Draw the image and boxes at the processed image's full resolution. The canvas is
 * then scaled for display with CSS, which scales boxes and image together.
 */
export function drawAnnotations(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  imageSize: ImageSize,
  modelSize: ImageSize,
  predictions: Prediction[],
) {
  canvas.width = imageSize.width;
  canvas.height = imageSize.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(image, 0, 0, imageSize.width, imageSize.height);

  const base = Math.max(imageSize.width, imageSize.height);
  // Sized so labels stay legible when the canvas is shown at half width on a projector.
  const fontSize = Math.max(14, Math.round(base / 36));
  const lineWidth = Math.max(3, Math.round(base / 260));
  const pad = Math.round(fontSize * 0.3);
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, "Segoe UI", Arial, sans-serif`;
  ctx.textBaseline = "top";

  // Draw lower-confidence boxes first so the strongest labels end up on top.
  const ordered = [...predictions].sort((a, b) => a.confidence - b.confidence);
  for (const p of ordered) {
    const style = boxStyleFor(p.class);
    const r = predictionToRect(p, modelSize, imageSize);

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = "#ffffff"; // thin white halo keeps boxes visible on dark and light backgrounds
    ctx.strokeRect(r.left - lineWidth / 2, r.top - lineWidth / 2, r.width + lineWidth, r.height + lineWidth);
    ctx.strokeStyle = style.stroke;
    ctx.strokeRect(r.left, r.top, r.width, r.height);

    const label = `${p.class} ${confidencePercent(p.confidence)}%`;
    const textWidth = ctx.measureText(label).width;
    const labelW = textWidth + pad * 2;
    const labelH = fontSize + pad * 2;
    // Above the box when there is room, otherwise just inside its top edge.
    const labelY = r.top - labelH >= 0 ? r.top - labelH : r.top;
    const labelX = Math.min(Math.max(0, r.left), Math.max(0, imageSize.width - labelW));
    ctx.fillStyle = style.labelBg;
    ctx.fillRect(labelX, labelY, labelW, labelH);
    ctx.fillStyle = style.labelText;
    ctx.fillText(label, labelX + pad, labelY + pad);
  }
}

/** Copy of the annotated canvas with a caption strip recording the current settings. */
export function buildExportCanvas(annotated: HTMLCanvasElement, captionLines: string[]): HTMLCanvasElement {
  const width = annotated.width;
  const fontSize = Math.max(16, Math.round(width / 60));
  const lineHeight = Math.round(fontSize * 1.4);
  const pad = Math.round(fontSize * 0.8);
  const stripHeight = pad * 2 + lineHeight * captionLines.length;

  const out = document.createElement("canvas");
  out.width = width;
  out.height = annotated.height + stripHeight;
  const ctx = out.getContext("2d");
  if (!ctx) return annotated;
  ctx.drawImage(annotated, 0, 0);
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, annotated.height, width, stripHeight);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  captionLines.forEach((line, i) => {
    ctx.font = `${i === 0 ? "bold " : ""}${fontSize}px system-ui, -apple-system, "Segoe UI", Arial, sans-serif`;
    ctx.fillText(line, pad, annotated.height + pad + i * lineHeight, width - pad * 2);
  });
  return out;
}
