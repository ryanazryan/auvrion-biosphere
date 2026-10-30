"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { SelectMenu } from "@/components/ui/SelectMenu";
import {
  APPROVED_TASK_EDGES,
  type TaskTransitionId,
} from "@/server/workflow/approved-task-policy";

type Actor = "ranger" | "supervisor";
const labels: Record<TaskTransitionId, string> = {
  "AB-TR-024": "Terima tugas",
  "AB-TR-025": "Mulai pekerjaan lapangan",
  "AB-TR-026": "Laporkan kendala / blokir tugas",
  "AB-TR-027": "Lanjutkan pekerjaan",
  "AB-TR-028": "Ajukan hasil ke Supervisor",
  "AB-TR-029": "Setujui dan selesaikan tugas",
  "AB-TR-030": "Kembalikan untuk perbaikan",
  "AB-TR-031": "Batalkan penugasan",
  "AB-TR-032": "Batalkan pekerjaan lapangan",
  "AB-TR-033": "Batalkan tugas terblokir",
};

export function TaskActionPanel({
  taskId,
  organizationId,
  status,
  version,
  actor,
}: {
  taskId: string;
  organizationId: string;
  status: string;
  version: number;
  actor: Actor;
}) {
  const router = useRouter();
  const choices = (Object.keys(APPROVED_TASK_EDGES) as TaskTransitionId[])
    .filter(
      (id) =>
        APPROVED_TASK_EDGES[id].actor === actor &&
        APPROVED_TASK_EDGES[id].from === status,
    )
    .map((id) => ({ value: id, label: labels[id] }));
  const [selected, setSelected] = useState<TaskTransitionId | "">(
    choices[0]?.value ?? "",
  );
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  if (!choices.length) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !choices.some((c) => c.value === selected) ||
      reason.trim().length < 10
    ) {
      setError("Pilih tindakan dan tuliskan alasan minimal 10 karakter.");
      return;
    }
    const key = requestId.current ?? crypto.randomUUID();
    requestId.current = key;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/tasks/${encodeURIComponent(taskId)}/transitions?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify({
            transitionId: selected,
            expectedVersion: version,
            reason: reason.trim(),
          }),
        },
      );
      const data = (await response.json()) as {
        error?: string;
        status?: string;
        version?: number;
        taskId?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Transisi gagal. Data tidak diubah.");
        if (response.status === 409) router.refresh();
        return;
      }
      if (
        data.taskId !== taskId ||
        typeof data.status !== "string" ||
        !Number.isSafeInteger(data.version) ||
        (data.version ?? 0) <= version
      ) {
        setError(
          "Respons tidak konsisten; periksa riwayat sebelum mengirim ulang.",
        );
        router.refresh();
        return;
      }
      requestId.current = null;
      setReason("");
      router.refresh();
    } catch {
      setError(
        "Jaringan tidak pasti. Periksa status tugas sebelum mencoba ulang.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="min-w-0">
      <h2 className="text-[14px] font-semibold text-ink">Tindakan tugas</h2>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <div>
          <span className="mb-1 block text-xs font-medium text-muted">
            Pilih tindakan
          </span>
          <SelectMenu
            label="Tindakan tugas"
            value={selected}
            options={choices}
            disabled={pending}
            onChange={(v) => {
              setSelected(v);
              setError("");
              requestId.current = null;
            }}
          />
        </div>
        <label className="block text-xs font-medium text-muted">
          Alasan / laporan tindakan
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={reason}
            disabled={pending}
            onChange={(e) => {
              setReason(e.target.value);
              setError("");
              requestId.current = null;
            }}
            placeholder={
              selected === "AB-TR-028"
                ? "Rangkum hasil pemeriksaan dan referensikan temuan yang sudah disimpan."
                : "Jelaskan alasan tindakan dan kondisi lapangan."
            }
            className="mt-1 w-full rounded-md border border-line-strong bg-white p-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-brand"
          />
        </label>
        {selected === "AB-TR-028" && (
          <p className="text-xs text-muted">
            Pengajuan membutuhkan minimal satu temuan yang sudah tersimpan.
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || !selected || reason.trim().length < 10}
          className="min-h-10 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Menyimpan…" : "Simpan tindakan"}
        </button>
      </form>
    </section>
  );
}
