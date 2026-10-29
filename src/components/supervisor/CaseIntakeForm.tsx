"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { SelectMenu } from "@/components/ui/SelectMenu";

type Choice = {
  id: string;
  sourceCode: string;
  domain: string;
  receivedAt: string;
  quality: string;
};
export function CaseIntakeForm({
  organizationId,
  observations,
}: {
  organizationId: string;
  observations: Choice[];
}) {
  const router = useRouter();
  const [observationId, setObservationId] = useState(observations[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          observationId,
          title: title.trim(),
          reason: reason.trim(),
        }),
        cache: "no-store",
      });
      const data = (await response.json()) as {
        caseId?: string;
        error?: string;
      };
      if (!response.ok || !data.caseId) {
        setError(
          response.status === 409
            ? "Observasi sudah terhubung dengan Case lain. Refresh daftar."
            : (data.error ?? "Gagal membuat Case."),
        );
        return;
      }
      router.push(`/operator/review/${encodeURIComponent(data.caseId)}`);
      router.refresh();
    } catch {
      setError(
        "Status jaringan belum dapat dipastikan. Refresh antrean sebelum mencoba lagi.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!observations.length) {
    return (
      <p className="rounded-md border border-line bg-bg px-4 py-3 text-sm text-muted">
        Belum ada observasi yang dapat dihubungkan. Buat observasi atau gunakan
        rekaman LISTEN yang sudah diterima, kemudian kembali ke sini.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="block text-[13px] font-medium text-fg">
        <span className="mb-1.5 block">Observasi yang belum terkait Case</span>
        <SelectMenu
          label="Observasi yang belum terkait Case"
          value={observationId}
          onChange={setObservationId}
          disabled={pending}
          options={observations.map((o) => ({
            value: o.id,
            label: `${o.sourceCode} · ${o.domain} · ${o.quality} · ${o.id.slice(0, 8)}`,
            description: `ID: ${o.id}`,
          }))}
        />
      </div>
      <label className="block text-[13px] font-medium text-fg">
        Judul Case
        <input
          required
          minLength={5}
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tinjau rekaman LISTEN atau observasi lapangan"
          className="mt-1.5 w-full rounded-md border border-line-strong bg-white p-2.5 text-sm"
        />
      </label>
      <label className="block text-[13px] font-medium text-fg">
        Alasan dan keterbatasan data
        <textarea
          required
          minLength={10}
          maxLength={2000}
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ringkas bukti WAV, dugaan sumber suara, hasil analisis AI (jika tersedia), dan ketidakpastiannya. Label AI bukan verifikasi spesies."
          className="mt-1.5 w-full rounded-md border border-line-strong bg-white p-2.5 text-sm"
        />
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger/25 bg-danger-50 p-3 text-xs text-danger"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-10 rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
      >
        {pending ? "Membuat Case..." : "Buat Case Received"}
      </button>
    </form>
  );
}
