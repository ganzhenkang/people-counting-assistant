/**
 * Generates synthetic test images (plain street-like patterns, no people) into
 * tests/e2e/images. They exercise file handling only; they are not model test data.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(__dirname, "images");

function sceneSvg(w: number, h: number) {
  const stripes = Array.from({ length: 12 }, (_, i) => {
    const x = Math.round((i * w) / 12);
    return `<rect x="${x}" y="${h / 3}" width="${Math.round(w / 24)}" height="${h / 3}" fill="#f0f0f0"/>`;
  }).join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#5a5a5f"/><rect width="100%" height="${h / 4}" fill="#96bee6"/>${stripes}</svg>`,
  );
}

export default async function globalSetup() {
  fs.mkdirSync(OUT, { recursive: true });
  const write = (name: string, data: Buffer | string) => fs.writeFileSync(path.join(OUT, name), data);

  write("small.jpg", await sharp(sceneSvg(1200, 800)).jpeg({ quality: 90 }).toBuffer());
  write("large-4000x3000.jpg", await sharp(sceneSvg(4000, 3000)).jpeg({ quality: 95 }).toBuffer());
  write("photo.png", await sharp(sceneSvg(1000, 700)).png().toBuffer());
  write("photo.webp", await sharp(sceneSvg(900, 600)).webp().toBuffer());
  // Stored 400x200 with EXIF orientation 6, which displays as 200x400.
  write("exif-rot6-400x200.jpg", await sharp(sceneSvg(400, 200)).jpeg().withMetadata({ orientation: 6 }).toBuffer());
  // Random noise compresses badly, so it tests the JPEG quality step-down.
  write(
    "noise-1800.png",
    await sharp(randomBytes(1800 * 1800 * 3), { raw: { width: 1800, height: 1800, channels: 3 } })
      .png({ compressionLevel: 1 })
      .toBuffer(),
  );
  write("broken.jpg", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("not really a jpeg".repeat(20))]));
  write("notes.txt", "hello");
  write("huge-11mb.jpg", Buffer.concat([Buffer.from([0xff, 0xd8]), randomBytes(11 * 1024 * 1024)]));
}
