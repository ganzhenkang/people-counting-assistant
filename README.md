# People Counting Assistant (Team 5)

**Live app:** https://people-counting-assistant.vercel.app/

A web app that counts pedestrians at a zebra crossing and estimates how many are distracted by a phone.

Upload a photo of a crossing. The app sends it to Team 5's custom object detection model, which is
trained and hosted on [Roboflow](https://roboflow.com). It then shows:

- the original photo next to an annotated copy with labelled boxes
- counts for each detected class, plus the total
- a **crossing distraction rating** (Low / Medium / High) with the numbers behind it, for example
  *"2 of 5 pedestrians using a phone (40%) - Medium"*

> **Note:** The rating comes only from the model's detections. It is **not** a measure of real-world
> safety, and it can be wrong, for example when phones are small or hidden.

---

## Features

- **Upload:** drag and drop, or use the file picker. Accepts JPG, PNG and WEBP files up to 10 MB.
- **Image preparation in the browser:** fixes phone-camera rotation (EXIF), resizes to 1600 px on the
  longest side and re-encodes as JPEG, so uploads stay small and fast.
- **Detection classes**, colour-coded:

  | Class | Meaning | Box colour |
  | --- | --- | --- |
  | `person_left` | walking left | blue |
  | `person_right` | walking right | blue |
  | `person_left_phone` | walking left, using a phone | orange |
  | `person_right_phone` | walking right, using a phone | orange |

- **Confidence slider** (10–95%, default 40%). Results update instantly, with no new request.
  The default is `DEFAULT_CONFIDENCE_THRESHOLD_PERCENT` in [`src/lib/analysis.ts`](src/lib/analysis.ts);
  it is set to the peak of the model's F1-confidence curve ("all classes 0.83 at 0.402" for the `…-yolo26n-t6` model, rounded to 40%).
- **Duplicate merging:** when two boxes overlap with an IoU above 0.5, only the higher-confidence box
  is kept, even if their classes differ (e.g. the same person detected as both `person_left` and
  `person_left_phone`).
- **Visibility toggles** to show or hide box groups. These never change the counts.
- **Download the annotated image** as a PNG, with the counts and rating in a caption.
- **"Flag wrong result":** saves feedback in the browser and exports it as JSON for model improvement.
- **Optional sample images**, so a demo can run with one click.
- **Clear error messages** for wrong file types, files that are too large or unreadable, an invalid
  key or model, rate limits, timeouts and images with no detections.
- **Unknown classes are never hidden silently.** If the model returns any other class, the app shows a warning.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router), with TypeScript and Tailwind CSS 4
- Roboflow Serverless Inference API for detection
- Vitest for unit tests and Playwright for browser tests
- Deployed on [Vercel](https://vercel.com). There is no database and no login.

## Model weights

Final trained model (YOLO26n, 960 px): https://drive.google.com/file/d/1q-H4nFCceTW3VoyzXJdvDeCcKyZ-jSoT/view?usp=sharing

Training data, training runs and related materials: https://drive.google.com/drive/folders/1AfoPS0KSJzBZNHEmffheDwNeAm5ezoSo

---

## 1. Run it locally

**Requirements:** Node.js 20.9 or newer (check with `node -v`), and a Roboflow account with a trained model.

```bash
git clone <this-repo-url>
cd <repo-folder>
npm install
cp .env.example .env.local     # Windows PowerShell: Copy-Item .env.example .env.local
# edit .env.local and fill in the two values (see below)
npm run dev
```

Open http://localhost:3000.

After changing `.env.local`, stop the dev server (Ctrl+C) and start it again.

## 2. Environment variables

| Name | What it is | Where to find it |
| --- | --- | --- |
| `ROBOFLOW_API_KEY` | Private API key | Roboflow → Settings → API Keys (from the workspace that owns the model) |
| `ROBOFLOW_MODEL` | Full model ID, `workspace/model-slug`. Ours: `gans-workspace-efyfd/people-counting-activity-v2-2-yolo26n-t6` | The project's **Models** page in Roboflow |

The server calls `https://serverless.roboflow.com/{ROBOFLOW_MODEL}`. The model slug is
`{project}-{version}-{architecture}-t{training}`, so `…-2-yolo26n-t6` is the 6th YOLO26n training on version 2.

**Why the full model ID?** A Roboflow version can hold several models. The older `project/version`
ID (e.g. `people-counting-activity-v2/2`) only points at the version's first successful training,
or fails if the version holds several models and has no alias. The full model ID always calls
exactly the model named. If `ROBOFLOW_MODEL` is not in the `workspace/model-slug` form, the app
shows a setup error instead of calling Roboflow.

The old `ROBOFLOW_MODEL_ID` and `ROBOFLOW_MODEL_VERSION` variables are no longer read.

**Security:**

- The variables are **server-only**. Never add a `NEXT_PUBLIC_` prefix, because Next.js would then send them to the browser.
- `.env.local` is git-ignored. **Never commit real keys.** `.env.example` lists the names only.
- The key is used only in `src/app/api/detect/route.ts`, and is sent to Roboflow in an
  `Authorization: Bearer` header (never in the URL). It is never logged, and never returned in
  responses or error messages.

### Using a model trained by a teammate

- **Trained in Roboflow:** get the full model ID (from the **Models** page) and a private API key
  **from the same workspace as the model**. The simplest option is to train inside one shared workspace.
- **Trained elsewhere** (e.g. Colab or Ultralytics):
  1. Get the `best.pt` file, the model type (e.g. YOLO26n) and the `data.yaml` class list.
  2. Upload the weights to a Roboflow dataset version with the same classes.
  3. Use the model ID Roboflow shows for the uploaded model.
- The class names must match the four above **exactly**. If they don't, change them in
  [`src/config/classes.ts`](src/config/classes.ts).

## 3. Deploy to Vercel

1. Import this repository in Vercel (**Add New → Project**). The framework is detected as Next.js; keep the defaults.
2. Under **Settings → Environment Variables**, add `ROBOFLOW_API_KEY` and `ROBOFLOW_MODEL` for
   Production (and Preview if you use it). If the project still has the old `ROBOFLOW_MODEL_ID` and
   `ROBOFLOW_MODEL_VERSION` variables, you can delete them; the app no longer reads them.
3. Deploy. If you change the variables later, **redeploy** so they take effect.
4. Open the deployed URL and analyse one real photo before a demo, to warm up the model.

**Notes:**

- Vercel limits request bodies to 4.5 MB. The browser keeps each upload under 4 MB.
- `/api/detect` allows up to 60 seconds. The Roboflow call itself times out after 30 seconds.

## 4. Add sample images

Sample buttons run a **real** prediction when clicked. To add some:

1. Put up to 4 images (`.jpg`, `.jpeg`, `.png` or `.webp`) in `public/samples/`.
   Use simple filenames: letters, numbers, spaces, `-`, `_` and `.`.
2. List them in `public/samples/manifest.json`:

   ```json
   [
     { "file": "crossing-morning.jpg", "label": "Morning rush" },
     { "file": "crossing-evening.jpg", "label": "Evening" }
   ]
   ```

   A plain list of filenames (`["a.jpg", "b.jpg"]`) also works.
3. Refresh locally, or redeploy. You don't need to change any code.

If the manifest is empty (`[]`), the samples section is hidden.

Only use photos you have permission to publish, and avoid images where faces can be identified.

## 5. How it works

```
Browser                                   Server (Next.js route)            Roboflow
-------                                   ----------------------            --------
choose / drop image
validate type (JPG/PNG/WEBP) and size (10 MB)
fix EXIF orientation, resize to 1600 px,
JPEG ~85% (lower until under 4 MB)
POST /api/detect { image: base64 }  ───▶  read env vars, validate
                                          POST base64 body               ──▶ /{ROBOFLOW_MODEL}
                                          (x-www-form-urlencoded,             ?confidence=10
                                           30 s timeout)                 ◀──  predictions[]
                                    ◀───  { predictions, image }
1. filter by slider  2. merge duplicates (IoU > 0.5)
3. count, rate, draw boxes, download (no new request)
```

- **Request format** (from Roboflow's hosted object detection REST docs): `POST` the raw base64
  string as an `application/x-www-form-urlencoded` body, with the key in an
  `Authorization: Bearer` header. `confidence` and `overlap` are on a **0–100** scale.
- **Confidence:** the server requests every detection at 10% confidence or above (`confidence=10`). The slider then filters them in the browser.
- **Processing order:** (1) confidence filter, (2) duplicate merge: any two boxes with an IoU
  **above** 0.5 keep only the higher-confidence one, across classes; boxes at or below 0.5 are never
  merged, (3) the remaining boxes drive the display, counts, rating and download. All three steps are
  pure functions in `src/lib/analysis.ts`.
- **Box coordinates:** Roboflow returns `x` and `y` as the **centre** of each box. They are converted
  to a top-left corner in `src/lib/geometry.ts`. Boxes are drawn on a canvas at full resolution and
  scaled with CSS, so they stay aligned at any screen size.
- **No fake results:** the app never uses mock or hard-coded detections. If the model fails, it shows an error.

### Rating

- Phone users = `person_left_phone` + `person_right_phone`
- Total people = all four classes
- Score = phone users ÷ total people × 100

| Score | Rating |
| --- | --- |
| under 34% | Low |
| 34% up to, but not including, 67% | Medium |
| 67% or above | High |
| no people detected | "No pedestrians detected" (no score) |

The band comes from the **exact** score. The score is shown truncated to one decimal place, so the
number never appears to cross a boundary. For example, 2 of 3 people (66.67%) shows as
"66.6%" and is rated Medium.

### Flags

"Flag wrong result" saves the filename, counts, rating, threshold, timestamp and an optional note
in the browser's `localStorage`. "Export flags as JSON" downloads them. If storage is blocked
(e.g. in a private window), flags are kept until the page is closed and can still be exported.

## 6. Project structure

```
src/
  app/api/detect/route.ts   server route that calls Roboflow (the only place the key is used)
  app/page.tsx              page layout, title and subtitle
  components/               UI (upload, samples, rating, counts, flags, main view)
  config/classes.ts         class names, descriptions and colours
  lib/analysis.ts           filtering, merging, counting and rating logic (pure functions)
  lib/geometry.ts           centre → top-left box conversion, IoU and resize maths
  lib/roboflow.ts           Roboflow request and response helpers
  lib/imageProcessing.ts    browser resize, orientation and JPEG encoding
  lib/flags.ts, samples.ts  localStorage flags and the sample manifest parser
tests/unit/                 Vitest unit tests
tests/e2e/                  Playwright browser tests
public/samples/             sample images and manifest.json
```

## 7. Scripts and tests

```bash
npm run dev         # development server on http://localhost:3000
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm test            # unit tests (rating and its 34% / 67% boundaries, zero people, filtering, IoU,
                    # cross-class merging, boxes below the IoU limit, parsing, flags)
npm run build       # production build
npm run check       # lint + typecheck + test + build

npm run build && npm run test:e2e   # browser tests (uses installed Microsoft Edge)
```

The browser tests generate synthetic images in `tests/e2e/images/`. Tests labelled
**[stubbed API]** replace the `/api/detect` response *inside the test only*, so drawing, the slider,
the toggles, download and flags can be checked without credentials. Tests labelled **[real API]**
call the real route: with valid credentials they expect a real result, and without them a clear
error. To use Chrome instead of Edge, set `PW_CHANNEL=chrome`.

**Real-photo check before a demo** (needs credentials in `.env.local`; saves
`test-results/real-photo.png`):

```powershell
npm run build
$env:REAL_PHOTO = "C:\photos\crossing.jpg"; npx playwright test real-photo
```

## 8. Troubleshooting

| Message | Likely cause |
| --- | --- |
| "The app is not set up yet…" | One or more environment variables are missing. Restart or redeploy after adding them. |
| "Roboflow rejected the request…" | Wrong API key, or the key's workspace does not own the model. |
| "…ROBOFLOW_MODEL must be a full Roboflow model ID…" | `ROBOFLOW_MODEL` is not in the `workspace/model-slug` form. Copy it from the project's **Models** page. |
| "Roboflow could not find this model…" | Wrong model ID, or the model has not finished training or processing yet (an upload takes a few minutes). |
| "too many requests" | Roboflow rate limit. Wait a few seconds, then press Try again. |
| "took too long" | Model cold start or slow network. Press Try again. |
| Warning about an unknown class | The model's class names differ from `src/config/classes.ts`. |

**Switching to a different trained model.** Change `ROBOFLOW_MODEL` to that model's ID from
the **Models** page, then restart locally or redeploy on Vercel.

## Limitations

- Accuracy depends entirely on the trained model and its training data. Photos taken from very
  different angles, in different lighting, or with very small figures may be missed.
- "Using a phone" means a phone is visible to the model. Earphones, smartwatches and other
  distractions are not detected.
- Each photo is analysed on its own. There is no video, and no tracking across frames.

## About

Built by Team 5 for the *AI Solution Design and Implementation* module.
This is a student project, not an official product of any institution.
