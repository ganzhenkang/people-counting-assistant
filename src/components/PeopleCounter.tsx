"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BOX_STYLES, PERSON_CLASSES, isPersonClass } from "@/config/classes";
import { CountsTable } from "@/components/CountsTable";
import { FlagPanel } from "@/components/FlagPanel";
import { RatingCard } from "@/components/RatingCard";
import { SampleGallery } from "@/components/SampleGallery";
import { UploadArea } from "@/components/UploadArea";
import { SLIDER_DEFAULT, SLIDER_MAX, SLIDER_MIN, analyse, findUnknownClasses } from "@/lib/analysis";
import { DetectError, detect } from "@/lib/detectClient";
import { downloadBlob } from "@/lib/download";
import { buildExportCanvas, drawAnnotations } from "@/lib/draw";
import { RETRYABLE_ERRORS } from "@/lib/errors";
import {
  FILE_PROBLEM_MESSAGES,
  FileProblemError,
  type ProcessedImage,
  processImage,
  validateFile,
} from "@/lib/imageProcessing";
import type { DetectSuccess } from "@/lib/types";

interface Source {
  filename: string;
  processed: ProcessedImage;
  url: string;
}

type Status = "idle" | "preparing" | "ready" | "analysing" | "done" | "error";

/** Toggle key for any class the app does not recognise. */
const UNKNOWN_KEY = "__unknown__";
type VisibilityKey = (typeof PERSON_CLASSES)[number] | typeof UNKNOWN_KEY;

function allVisible(): Record<VisibilityKey, boolean> {
  return { person_left: true, person_right: true, person_left_phone: true, person_right_phone: true, [UNKNOWN_KEY]: true };
}

export function PeopleCounter() {
  const [source, setSource] = useState<Source | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [problem, setProblem] = useState<{ message: string; retryable: boolean } | null>(null);
  const [result, setResult] = useState<DetectSuccess | null>(null);
  const [threshold, setThreshold] = useState(SLIDER_DEFAULT);
  const [visible, setVisible] = useState(allVisible);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestId = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  const busy = status === "preparing" || status === "analysing";

  // Release the previous image's object URL when it changes or on unmount.
  useEffect(() => {
    if (!source) return;
    return () => URL.revokeObjectURL(source.url);
  }, [source]);

  // Load the processed image so it can be drawn on the canvas.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => !cancelled && setImageEl(img);
    img.src = source.url;
    return () => {
      cancelled = true;
    };
  }, [source]);

  const runAnalysis = useCallback(async (src: Source) => {
    const id = ++requestId.current;
    setStatus("analysing");
    setProblem(null);
    setResult(null);
    try {
      const data = await detect(src.processed.base64);
      if (id !== requestId.current) return;
      setResult(data);
      setStatus("done");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      if (id !== requestId.current) return;
      const e = err instanceof DetectError ? err : new DetectError("NETWORK");
      setProblem({ message: e.message, retryable: RETRYABLE_ERRORS.has(e.code) });
      setStatus("error");
    }
  }, []);

  const handleFile = useCallback(
    async (file: File, autoAnalyse = false) => {
      const id = ++requestId.current;
      setResult(null);
      setProblem(null);
      const invalid = validateFile(file);
      if (invalid) {
        setProblem({ message: FILE_PROBLEM_MESSAGES[invalid], retryable: false });
        setStatus("error");
        return;
      }
      setStatus("preparing");
      try {
        const processed = await processImage(file);
        if (id !== requestId.current) return;
        const src: Source = { filename: file.name, processed, url: URL.createObjectURL(processed.blob) };
        setImageEl(null);
        setSource(src);
        setVisible(allVisible());
        if (autoAnalyse) await runAnalysis(src);
        else setStatus("ready");
      } catch (err) {
        if (id !== requestId.current) return;
        const message =
          err instanceof FileProblemError ? err.message : FILE_PROBLEM_MESSAGES.UNREADABLE;
        setSource(null);
        setProblem({ message, retryable: false });
        setStatus("error");
      }
    },
    [runAnalysis],
  );

  const analysis = useMemo(
    () => (result ? analyse(result.predictions, threshold) : null),
    [result, threshold],
  );
  const unknownAll = useMemo(() => (result ? findUnknownClasses(result.predictions) : []), [result]);

  // Redraw boxes whenever the slider, toggles or result change. No new API call.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageEl || !source || !analysis || !result) return;
    const imageSize = { width: source.processed.width, height: source.processed.height };
    const shown = analysis.filtered.filter((p) => visible[isPersonClass(p.class) ? p.class : UNKNOWN_KEY]);
    drawAnnotations(canvas, imageEl, imageSize, result.image ?? imageSize, shown);
  }, [analysis, imageEl, result, source, visible]);

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas || !analysis || !source) return;
    const hidden = (Object.keys(visible) as VisibilityKey[])
      .filter((k) => !visible[k])
      .map((k) => (k === UNKNOWN_KEY ? "unknown classes" : k));
    const countsLine = PERSON_CLASSES.map((c) => `${c}: ${analysis.counts[c]}`).join("   ");
    const out = buildExportCanvas(canvas, [
      `People Counting Assistant (Team 5) - ${analysis.rating.summary}`,
      `Confidence threshold: ${threshold}%   |   Hidden boxes: ${hidden.length ? hidden.join(", ") : "none"}`,
      `${countsLine}   |   Total people: ${analysis.rating.totalPeople}`,
      `Image: ${source.filename}   |   ${new Date().toLocaleString()}   |   Based on model detections; may be wrong.`,
    ]);
    out.toBlob((blob) => {
      if (!blob) return;
      const base = source.filename.replace(/\.[^.]+$/, "") || "image";
      downloadBlob(`${base}-annotated-${threshold}pct.png`, blob);
    }, "image/png");
  }

  const toggleKeys: VisibilityKey[] = [...PERSON_CLASSES, ...(unknownAll.length ? [UNKNOWN_KEY as VisibilityKey] : [])];

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="upload-heading" className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:p-6">
        <h2 id="upload-heading" className="mb-3 text-xl font-semibold text-slate-900">
          1. Choose a photo
        </h2>
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <UploadArea disabled={busy} onFile={(f) => handleFile(f)} />
          <div className="flex flex-col items-stretch gap-2 md:w-64">
            {source && (
              <p className="truncate text-sm text-slate-700" title={source.filename}>
                Selected: <span className="font-semibold">{source.filename}</span>
              </p>
            )}
            <button
              type="button"
              className="btn-primary text-xl"
              disabled={!source || busy}
              onClick={() => source && runAnalysis(source)}
              aria-describedby="analyse-hint"
            >
              {status === "analysing" ? "Analysing…" : "Analyse"}
            </button>
            <p id="analyse-hint" className="text-sm text-slate-600">
              {source ? "Sends the image to our Roboflow model." : "Choose an image first."}
            </p>
          </div>
        </div>
        <SampleGallery
          disabled={busy}
          onPick={(f) => handleFile(f, true)}
          onError={(message) => {
            setProblem({ message, retryable: false });
            setStatus("error");
          }}
        />
      </section>

      <div aria-live="polite" className="contents">
        {busy && (
          <div role="status" className="flex items-center gap-4 rounded-xl border border-blue-300 bg-blue-50 p-5">
            <span aria-hidden="true" className="h-8 w-8 shrink-0 animate-spin rounded-full border-4 border-blue-700 border-t-transparent" />
            <div>
              <p className="text-lg font-semibold text-blue-950">
                {status === "preparing" ? "Preparing image…" : "Analysing image…"}
              </p>
              {status === "analysing" && (
                <p className="text-blue-900">The first request can take up to 30 seconds while the model starts up.</p>
              )}
            </div>
          </div>
        )}

        {problem && (
          <div role="alert" className="rounded-xl border-l-8 border-red-700 bg-red-50 p-5 text-red-950" data-testid="error-box">
            <p className="text-lg font-semibold">Something went wrong</p>
            <p className="mt-1">{problem.message}</p>
            {problem.retryable && source && (
              <button type="button" className="btn-primary mt-3" onClick={() => runAnalysis(source)}>
                Try again
              </button>
            )}
          </div>
        )}
      </div>

      {source && (status === "ready" || status === "analysing") && !result && (
        <section aria-label="Selected image preview" className="rounded-xl border border-slate-200 bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          <img src={source.url} alt="Selected image, ready to analyse" className="mx-auto max-h-[50vh] w-auto rounded-md" />
        </section>
      )}

      {result && analysis && source && (
        <div ref={resultsRef} className="flex scroll-mt-4 flex-col gap-6" data-testid="results">
          <RatingCard rating={analysis.rating} threshold={threshold} />

          {result.predictions.length === 0 ? (
            <p className="rounded-xl border border-slate-300 bg-white p-4 text-lg" data-testid="no-detections">
              The model did not detect any people in this image. Try a clearer photo where pedestrians are fully in view.
            </p>
          ) : (
            analysis.rating.totalPeople === 0 &&
            analysis.hiddenByThreshold > 0 && (
              <p className="rounded-xl border border-slate-300 bg-white p-4 text-lg" data-testid="all-filtered">
                No pedestrians at {threshold}% confidence or higher. {analysis.hiddenByThreshold} lower-confidence{" "}
                {analysis.hiddenByThreshold === 1 ? "detection is" : "detections are"} hidden. Lower the confidence slider to
                see {analysis.hiddenByThreshold === 1 ? "it" : "them"}.
              </p>
            )
          )}

          {unknownAll.length > 0 && (
            <div role="alert" className="rounded-xl border-l-8 border-amber-600 bg-amber-50 p-4 text-amber-950" data-testid="unknown-warning">
              <p className="font-semibold">Warning: the model returned a class this app does not recognise.</p>
              <ul className="mt-1 list-disc pl-6">
                {unknownAll.map((u) => (
                  <li key={u.name}>
                    <code className="font-mono font-semibold">{u.name}</code>: {u.count}{" "}
                    {u.count === 1 ? "detection" : "detections"}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-sm">
                These boxes are drawn in grey but are not included in the counts or rating. Check that the class names in{" "}
                <code>src/config/classes.ts</code> match the model exactly.
              </p>
            </div>
          )}

          {result.malformedCount > 0 && (
            <p role="alert" className="rounded-xl border-l-8 border-amber-600 bg-amber-50 p-4 text-amber-950">
              Warning: {result.malformedCount} detection(s) from the model were incomplete and could not be shown.
            </p>
          )}

          <section aria-labelledby="images-heading">
            <h2 id="images-heading" className="sr-only">
              Original and annotated images
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <figure className="rounded-xl border border-slate-200 bg-white p-3">
                <figcaption className="mb-2 text-lg font-semibold text-slate-900">Original</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                <img src={source.url} alt={`Original photo: ${source.filename}`} className="h-auto w-full rounded-md" />
              </figure>
              <figure className="rounded-xl border-2 border-slate-900 bg-white p-3">
                <figcaption className="mb-2 text-lg font-semibold text-slate-900">Annotated</figcaption>
                <canvas
                  ref={canvasRef}
                  className="h-auto w-full rounded-md"
                  role="img"
                  aria-label={`Annotated photo with ${analysis.filtered.length} detection boxes. ${analysis.rating.summary}`}
                  data-testid="annotated-canvas"
                />
              </figure>
            </div>
            <p className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-base text-slate-800">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-4 w-6 rounded-sm" style={{ background: BOX_STYLES.walker.stroke }} />
                Blue boxes: walking, no phone
              </span>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-4 w-6 rounded-sm" style={{ background: BOX_STYLES.phone.stroke }} />
                Orange boxes: using a phone
              </span>
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="controls-heading" className="rounded-xl border border-slate-300 bg-white p-4">
              <h2 id="controls-heading" className="text-xl font-semibold text-slate-900">
                Adjust results
              </h2>
              <label htmlFor="confidence" className="mt-3 flex items-baseline justify-between font-medium text-slate-900">
                <span>Minimum confidence</span>
                <span className="text-2xl font-bold tabular-nums" data-testid="threshold-value">
                  {threshold}%
                </span>
              </label>
              <input
                id="confidence"
                type="range"
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                step={1}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                aria-valuetext={`${threshold} percent`}
                className="mt-2 w-full accent-blue-700"
              />
              <p className="flex justify-between text-sm text-slate-600">
                <span>{SLIDER_MIN}%</span>
                <span>{SLIDER_MAX}%</span>
              </p>
              <p className="mt-1 text-sm text-slate-700">Updates boxes, counts and rating instantly. No new request is sent.</p>

              <fieldset className="mt-4">
                <legend className="font-medium text-slate-900">Show boxes for</legend>
                <p className="text-sm text-slate-700">These only hide boxes on the image. Counts and rating stay the same.</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {toggleKeys.map((k) => (
                    <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-blue-700"
                        checked={visible[k]}
                        onChange={(e) => setVisible((v) => ({ ...v, [k]: e.target.checked }))}
                      />
                      <code className="font-mono text-sm">{k === UNKNOWN_KEY ? "unknown classes" : k}</code>
                    </label>
                  ))}
                </div>
              </fieldset>

              <button type="button" className="btn-primary mt-4 w-full" onClick={downloadPng}>
                Download annotated image (PNG)
              </button>
            </section>

            <div className="flex flex-col gap-6">
              <CountsTable counts={analysis.counts} rating={analysis.rating} />
              <FlagPanel
                filename={source.filename}
                counts={analysis.counts}
                rating={analysis.rating}
                threshold={threshold}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
