"use client";

import { type FormEvent, useRef, useState } from "react";
import { SelectMenu } from "@/components/ui/SelectMenu";
import {
  SIGNAL_CLASSES,
  SIGNAL_LABELS,
  type SignalClass,
} from "@/server/analytics/signal-taxonomy";

/** Human-written, unverified signal. This is not an acoustic classifier. */
export function ObservationSignalForm({
  observationId,
  organizationId,
}: {
  observationId: string;
  organizationId: string;
}) {
  const [signalClass, setSignalClass] = useState<SignalClass>("unclassified");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (note.trim().length < 20) {
      setError("Tulis alasan dan sumber observasi minimal 20 karakter.");
      return;
    }
    setBusy(true);
    setError("");
    const key = requestId.current ?? crypto.randomUUID();
    requestId.current = key;
    try {
      const response = await fetch(
        `/api/observations/${encodeURIComponent(observationId)}/signals?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: key,
            signalClass,
            note: note.trim(),
          }),
        },
      );
      if (!response.ok) {
        setError(
          response.status === 409
            ? "ID permintaan sudah terpakai untuk sinyal lain."
            : `Penyimpanan gagal (${response.status}). Periksa sesi dan migrasi database.`,
        );
        return;
      }
      const data: { signalId?: string } = await response.json();
      if (!data.signalId) {
        setError("Respons server tidak lengkap; periksa sebelum mengulang.");
        return;
      }
      setSaved(data.signalId);
      requestId.current = null;
    } catch {
      setError(
        "Koneksi tidak pasti. Jangan mengulang sembarangan; request ID tetap dipertahankan.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <p className="text-xs leading-5 text-muted">
        Catat <strong>indikasi awal</strong> berdasarkan pengamatan manusia. Ini
        bukan hasil otomatis Perch dan tidak mengonfirmasi kebakaran, penebangan
        ilegal, atau perburuan.
      </p>
      <div className="space-y-1">
        <SelectMenu
          label="Kategori indikasi"
          value={signalClass}
          options={SIGNAL_CLASSES.map((kind) => ({
            value: kind,
            label: SIGNAL_LABELS[kind],
          }))}
          disabled={busy}
          onChange={(next) => {
            setSignalClass(next);
            requestId.current = null;
            setSaved(null);
          }}
        />
      </div>
      <label className="block text-xs font-medium text-ink">
        Dasar dugaan / sumber bukti
        <textarea
          required
          minLength={20}
          maxLength={1500}
          rows={3}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            requestId.current = null;
            setSaved(null);
          }}
          disabled={busy}
          placeholder="Jelaskan apa yang diamati atau terdengar, keterbatasan, serta alasan kategori."
          className="mt-1 w-full rounded-md border border-line bg-white p-2 text-xs"
        />
      </label>
      {saved && (
        <p
          role="status"
          className="rounded-md bg-brand-50 p-2 text-xs text-brand"
        >
          Indikasi tersimpan untuk ditinjau Supervisor. ID: {saved.slice(0, 8)}…
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || note.trim().length < 20 || Boolean(saved)}
        className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy
          ? "Menyimpan…"
          : saved
            ? "Tersimpan"
            : "Simpan indikasi untuk review"}
      </button>
    </form>
  );
}
