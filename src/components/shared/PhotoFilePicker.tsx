"use client";

import type { ChangeEvent } from "react";

const MEGABYTE = 1024 * 1024;

/** Native file input for OS picker, with a distinguishable visible trigger. */
export function PhotoFilePicker({
  label,
  file,
  disabled = false,
  onChange,
}: {
  label: string;
  file: File | null;
  disabled?: boolean;
  onChange: (file: File | null) => void;
}) {
  function pick(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.files?.[0] ?? null);
  }

  return (
    <label className="block min-w-0 text-sm font-medium text-ink">
      <span className="block">{label}</span>
      <span className="mt-2 flex min-h-12 min-w-0 flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-white p-2 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={label}
          disabled={disabled}
          onChange={pick}
          className="sr-only"
        />
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center rounded-md border border-brand/30 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand"
        >
          Pilih foto
        </span>
        <span
          aria-hidden="true"
          className="min-w-0 flex-1 break-all text-xs font-normal text-muted"
        >
          {file
            ? `${file.name} · ${(file.size / MEGABYTE).toFixed(2)} MB`
            : "Belum ada foto dipilih"}
        </span>
      </span>
    </label>
  );
}
