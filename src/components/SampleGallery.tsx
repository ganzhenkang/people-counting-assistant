"use client";

import { useEffect, useState } from "react";
import { parseManifest, type SampleEntry } from "@/lib/samples";

interface Props {
  disabled: boolean;
  onPick: (file: File) => void;
  onError: (message: string) => void;
}

export function SampleGallery({ disabled, onPick, onError }: Props) {
  const [samples, setSamples] = useState<SampleEntry[]>([]);
  const [broken, setBroken] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch("/samples/manifest.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((json) => {
        if (!cancelled) setSamples(parseManifest(json));
      })
      .catch(() => undefined); // no manifest -> section stays hidden
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = samples.filter((s) => !broken.has(s.file));
  if (shown.length === 0) return null;

  async function pick(sample: SampleEntry) {
    try {
      const res = await fetch(`/samples/${encodeURIComponent(sample.file)}`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      onPick(new File([blob], sample.file, { type: blob.type }));
    } catch {
      onError(`The sample image "${sample.label}" could not be loaded.`);
    }
  }

  return (
    <section aria-labelledby="samples-heading" className="mt-6">
      <h2 id="samples-heading" className="text-lg font-semibold text-slate-900">
        Or try a sample image
      </h2>
      <p className="text-sm text-slate-600">Clicking a sample runs a real prediction with the model.</p>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shown.map((s) => (
          <li key={s.file}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => pick(s)}
              className="group w-full overflow-hidden rounded-lg border border-slate-300 bg-white text-left focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- files are user-supplied at runtime */}
              <img
                src={`/samples/${encodeURIComponent(s.file)}`}
                alt=""
                className="aspect-video w-full object-cover"
                onError={() => setBroken((b) => new Set(b).add(s.file))}
              />
              <span className="block px-3 py-2 font-medium text-slate-900 group-hover:underline">{s.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
