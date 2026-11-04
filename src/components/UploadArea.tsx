"use client";

import { useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS, ACCEPTED_TYPES } from "@/lib/imageProcessing";

interface Props {
  disabled: boolean;
  onFile: (file: File) => void;
}

export function UploadArea({ disabled, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
        dragging ? "border-blue-700 bg-blue-50" : "border-slate-400 bg-white"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <p className="text-lg font-semibold text-slate-900">Drag and drop a photo of a zebra crossing here</p>
      <p className="text-slate-700">or</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="btn-secondary"
      >
        Choose an image
      </button>
      <p className="text-sm text-slate-600">JPG, PNG or WEBP, up to 10 MB</p>
      <input
        ref={inputRef}
        type="file"
        accept={[...ACCEPTED_TYPES, ...ACCEPTED_EXTENSIONS].join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose an image file"
        data-testid="file-input"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = ""; // allow choosing the same file again
        }}
      />
    </div>
  );
}
