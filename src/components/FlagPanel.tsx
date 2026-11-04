"use client";

import { useEffect, useState } from "react";
import type { ClassCounts, Rating } from "@/lib/analysis";
import { downloadBlob } from "@/lib/download";
import { type FlagRecord, clearFlags, flagsToJson, loadFlags, saveFlag } from "@/lib/flags";

interface Props {
  filename: string;
  counts: ClassCounts;
  rating: Rating;
  threshold: number;
}

export function FlagPanel({ filename, counts, rating, threshold }: Props) {
  const [flags, setFlags] = useState<FlagRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");

  // localStorage only exists in the browser, so read it after mount.
  useEffect(() => {
    setFlags(loadFlags()); // eslint-disable-line react-hooks/set-state-in-effect -- one-time sync from browser storage
  }, []);

  function submit() {
    const record: FlagRecord = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()),
      filename,
      timestamp: new Date().toISOString(),
      thresholdPercent: threshold,
      counts: { ...counts },
      totalPeople: rating.totalPeople,
      phoneUsers: rating.phoneUsers,
      ratingPercent: rating.percent,
      rating: rating.label,
      note: note.trim(),
    };
    const saved = saveFlag(record);
    setFlags((f) => [...f, record]);
    setStatus(
      saved
        ? "Flag saved in this browser."
        : "Browser storage is unavailable, so this flag is kept only until the page is closed. Export it now to keep it.",
    );
    setNote("");
    setOpen(false);
  }

  function clearAll() {
    if (!window.confirm(`Delete all ${flags.length} saved flags from this browser?`)) return;
    clearFlags();
    setFlags([]);
    setStatus("All saved flags were deleted.");
  }

  return (
    <section aria-labelledby="flag-heading" className="rounded-xl border border-slate-300 bg-white p-4">
      <h2 id="flag-heading" className="text-xl font-semibold text-slate-900">
        Report a problem
      </h2>
      {open ? (
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="flag-note" className="font-medium text-slate-900">
            What looks wrong? (optional)
          </label>
          <textarea
            id="flag-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            className="rounded-md border border-slate-400 p-2 text-base"
            placeholder="e.g. Missed a person on the right, or a phone user was counted as a walker"
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary">
              Save flag
            </button>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
            Flag wrong result
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={flags.length === 0}
            onClick={() =>
              downloadBlob(
                `flags-${new Date().toISOString().slice(0, 10)}.json`,
                new Blob([flagsToJson(flags)], { type: "application/json" }),
              )
            }
          >
            Export flags as JSON ({flags.length})
          </button>
          {flags.length > 0 && (
            <button type="button" className="btn-link" onClick={clearAll}>
              Delete saved flags
            </button>
          )}
        </div>
      )}
      <p role="status" className="mt-2 min-h-6 text-sm text-slate-700">
        {status}
      </p>
    </section>
  );
}
