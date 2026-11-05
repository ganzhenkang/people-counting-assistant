/** Canvas drawing of detections. Box maths lives in geometry.ts (unit tested). */
import { boxStyleFor } from "@/config/classes";
import { confidencePercent } from "@/lib/analysis";
import { labelConnector, placeLabels, predictionToRect } from "@/lib/geometry";
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

  // Highest confidence first, so the strongest detections get the best label spots.
  const ordered = [...predictions].sort((a, b) => b.confidence - a.confidence);
  const rects = ordered.map((p) => predictionToRect(p, modelSize, imageSize));
  const texts = ordered.map((p) => `${p.class} ${confidencePercent(p.confidence)}%`);
  const labelH = fontSize + pad * 2;
  const labels = placeLabels(
    rects,
    texts.map((t) => ({ width: Math.ceil(ctx.measureText(t).width) + pad * 2, height: labelH })),
    imageSize,
    Math.max(2, Math.round(lineWidth / 2)),
  );

  // All boxes first, then all labels, so no box line is drawn across a label.
  ordered.forEach((p, i) => {
    const r = rects[i];
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = "#ffffff"; // thin white halo keeps boxes visible on dark and light backgrounds
    ctx.strokeRect(r.left - lineWidth / 2, r.top - lineWidth / 2, r.width + lineWidth, r.height + lineWidth);
    ctx.strokeStyle = boxStyleFor(p.class).stroke;
    ctx.strokeRect(r.left, r.top, r.width, r.height);
  });

  // Connectors for labels moved away from their box, drawn under every label.
  ordered.forEach((p, i) => {
    const conn = labelConnector(rects[i], labels[i]);
    if (!conn) return;
    ctx.lineWidth = Math.max(2, Math.round(lineWidth * 0.75));
    ctx.strokeStyle = boxStyleFor(p.class).stroke;
    ctx.beginPath();
    ctx.moveTo(conn.x, conn.y1);
    ctx.lineTo(conn.x, conn.y2);
    ctx.stroke();
  });

  ordered.forEach((p, i) => {
    const style = boxStyleFor(p.class);
    const l = labels[i];
    ctx.fillStyle = style.labelBg;
    ctx.fillRect(l.left, l.top, l.width, l.height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(l.left + 0.5, l.top + 0.5, l.width - 1, l.height - 1);
    ctx.fillStyle = style.labelText;
    ctx.fillText(texts[i], l.left + pad, l.top + pad);
  });
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
