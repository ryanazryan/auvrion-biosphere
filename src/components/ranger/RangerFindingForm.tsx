"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { PhotoFilePicker } from "@/components/shared/PhotoFilePicker";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Save the text finding first, then attach its optional private photo. */
export function RangerFindingForm({
  taskId,
  organizationId,
}: {
  taskId: string;
  organizationId: string;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedFinding, setSavedFinding] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (summary.trim().length < 20) {
      setError("Tuliskan temuan minimal 20 karakter.");
      return;
    }
    if (
      photo &&
      (!TYPES.has(photo.type) ||
        photo.size > MAX_PHOTO_BYTES ||
        photo.size === 0)
    ) {
      setError("Foto harus JPEG, PNG, atau WebP berukuran maksimal 5 MB.");
      return;
    }
    setBusy(true);
    setError("");
    let findingId = savedFinding;
    try {
      if (!findingId) {
        const key = requestId.current ?? crypto.randomUUID();
        requestId.current = key;
        const response = await fetch(
          `/api/ranger/tasks/${encodeURIComponent(taskId)}/findings?organizationId=${encodeURIComponent(organizationId)}`,
          {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": key,
            },
            body: JSON.stringify({ summary: summary.trim() }),
          },
        );
        const data: { error?: string; findingId?: string } =
          await response.json();
        if (!response.ok) {
          setError(data.error ?? "Gagal menyimpan temuan.");
          return;
        }
        if (!data.findingId) {
          setError("Respons tidak lengkap, periksa riwayat.");
          return;
        }
        findingId = data.findingId;
        setSavedFinding(findingId);
      }
      if (photo) {
        const response = await fetch(
          `/api/ranger/tasks/${encodeURIComponent(taskId)}/findings/${encodeURIComponent(findingId)}/photos?organizationId=${encodeURIComponent(organizationId)}`,
          {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": photo.type },
            body: photo,
          },
        );
        const data: { error?: string; mediaId?: string } =
          await response.json();
        if (!response.ok || !data.mediaId) {
          setError(
            `Temuan sudah disimpan, tetapi foto gagal diunggah (${data.error ?? "UPLOAD_FAILED"}). Coba Simpan lagi, atau buka Riwayat Tugas.`,
          );
          return;
        }
      }
      requestId.current = null;
      router.push(`/ranger/tasks/${taskId}/history`);
      router.refresh();
    } catch {
      setError(
        savedFinding || findingId
          ? "Temuan sudah tersimpan; koneksi foto belum pasti. Periksa Riwayat sebelum mengulang."
          : "Jaringan tidak pasti. Periksa riwayat sebelum mencoba ulang.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="max-w-2xl space-y-4 rounded-lg border border-line bg-white p-5"
    >
      <label className="block text-sm font-medium text-ink">
        Hasil verifikasi / temuan lapangan
        <textarea
          value={summary}
          rows={7}
          maxLength={2000}
          minLength={20}
          required
          disabled={busy || !!savedFinding}
          onChange={(event) => {
            setSummary(event.target.value);
            setError("");
            requestId.current = null;
          }}
          placeholder="Tuliskan apa yang benar-benar diamati, keterbatasan verifikasi, dan rekomendasi. Jangan membuat klaim kejadian yang belum diperiksa."
          className="mt-2 block w-full rounded-md border border-line-strong p-3 text-sm focus-visible:outline-2 focus-visible:outline-brand"
        />
      </label>
      <PhotoFilePicker
        label="Foto bukti lapangan (opsional)"
        file={photo}
        disabled={busy}
        onChange={(next) => {
          setPhoto(next);
          setError("");
        }}
      />
      <p className="text-xs leading-5 text-muted">
        Maksimum 5 MB · JPEG/PNG/WebP. Foto disimpan privat dan ditautkan dengan
        temuan. Foto mungkin mengandung metadata lokasi (EXIF); hindari data
        sensitif dan gunakan hanya bukti yang berwenang Anda ambil. Upload
        memerlukan koneksi internet.
      </p>
      <p className="text-xs text-muted">
        Dalam keadaan berbahaya, hentikan pekerjaan dan hubungi pos atau
        Supervisor melalui kanal darurat yang disepakati. Sesudah aman,
        dokumentasikan di Auvrion.
      </p>
      {savedFinding && (
        <p role="status" className="text-xs text-brand">
          Temuan tersimpan.{" "}
          {photo
            ? "Foto dapat dicoba unggah ulang."
            : "Anda dapat membuka riwayat."}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        disabled={busy || summary.trim().length < 20}
        type="submit"
        className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy
          ? "Menyimpan…"
          : savedFinding
            ? "Selesaikan unggah foto"
            : "Simpan temuan"}
      </button>
    </form>
  );
}
