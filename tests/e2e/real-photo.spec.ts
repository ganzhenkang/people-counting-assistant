/**
 * [real API] Opt-in end-to-end check with a real crossing photo and the real Roboflow model.
 * Skipped unless REAL_PHOTO is set, e.g. (PowerShell):
 *   $env:REAL_PHOTO = "C:\path\to\crossing.jpg"; npx playwright test real-photo
 * Needs valid credentials in .env.local. Saves a screenshot to test-results/real-photo.png.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";

const photo = process.env.REAL_PHOTO;

test.skip(!photo, "Set REAL_PHOTO to a real crossing photo to run this test");

test("[real API] real photo gives boxes, counts and a rating", async ({ page }) => {
  expect(fs.existsSync(photo!), `REAL_PHOTO not found: ${photo}`).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(photo!);
  await page.getByRole("button", { name: "Analyse" }).click();

  const errorBox = page.getByTestId("error-box");
  const label = page.getByTestId("rating-label");
  await expect(errorBox.or(label)).toBeVisible({ timeout: 40_000 });
  await expect(errorBox, "The real model returned an error").toHaveCount(0);

  const total = Number(await page.getByTestId("count-total").textContent());
  const summary = (await page.getByTestId("rating-summary").count())
    ? await page.getByTestId("rating-summary").textContent()
    : await label.textContent();
  const merged = (await page.getByTestId("merged-note").count()) ? await page.getByTestId("merged-note").textContent() : "none";
  console.log(`Real photo result at default threshold: ${summary} | total=${total} | merged: ${merged}`);

  // Slider changes must not trigger another request.
  let calls = 0;
  page.on("request", (r) => r.url().endsWith("/api/detect") && calls++);
  await page.getByLabel("Minimum confidence").fill("10");
  await page.getByLabel("Minimum confidence").fill("80");
  expect(calls).toBe(0);
  await page.getByLabel("Minimum confidence").fill("40");

  await page.getByTestId("results").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/real-photo.png", fullPage: true });
});
