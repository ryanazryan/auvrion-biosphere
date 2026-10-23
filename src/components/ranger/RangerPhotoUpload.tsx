"use client";

import { useState } from "react";
import { PhotoFilePicker } from "@/components/shared/PhotoFilePicker";

/** Add/retry photo on an existing personal finding; server rechecks all permissions. */
export function RangerPhotoUpload({
  taskId,
  organizationId,
  findingId,
}: {
  taskId: string;
  organizationId: string;
  findingId: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload() {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size <= 0 ||
      file.size > 5 * 1024 * 1024
    ) {
      setMessage("Pilih gambar JPEG, PNG atau WebP maksimal 5 MB.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/ranger/tasks/${encodeURIComponent(taskId)}/findings/${encodeURIComponent(findingId)}/photos?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": file.type },
          body: file,
        },
      );
      const result: { mediaId?: string; error?: string } = await res.json();
      if (!res.ok || !result.mediaId) {
        setMessage(`Foto belum disimpan: ${result.error ?? "UPLOAD_FAILED"}`);
        return;
      }
      window.location.reload();
    } catch {
      setMessage(
        "Koneksi tidak pasti. Periksa daftar foto sebelum mencoba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
      <div className="min-w-0 flex-1">
        <PhotoFilePicker
          label="Tambahkan foto bukti (maks. 5 MB)"
          file={file}
          disabled={busy}
          onChange={(next) => {
            setFile(next);
            setMessage("");
          }}
        />
      </div>
      <button
        type="button"
        disabled={!file || busy}
        onClick={upload}
        className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Mengunggah…" : "Unggah foto"}
      </button>
      {message && (
        <p role="status" className="w-full text-xs text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
