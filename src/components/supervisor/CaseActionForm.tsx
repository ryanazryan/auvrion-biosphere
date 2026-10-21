"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

type Ranger = { id: string; name: string };
type Zone = { id: string; code: string; name: string };

/** UI permits exactly approved V1 Case edges; server owns final authorization. */
export function CaseActionForm({
  caseId,
  organizationId,
  version,
  status,
  actorRole,
  rangers = [],
  zones = [],
}: {
  caseId: string;
  organizationId: string;
  version: number;
  status: string;
  actorRole: "operator" | "supervisor";
  rangers?: Ranger[];
  zones?: Zone[];
}) {
  const router = useRouter();
  // Confirmed server response is authoritative immediately, without browser reload.
  const [currentCase, setCurrentCase] = useState({ status, version });
  const allowed =
    actorRole === "operator"
      ? currentCase.status === "received"
        ? "AB-TR-010"
        : currentCase.status === "under_review"
          ? "AB-TR-011"
          : null
      : currentCase.status === "awaiting_decision"
        ? "AB-TR-012"
        : null;
  const [supervisorTransitionId, setSupervisorTransitionId] =
    useState("AB-TR-012");
  const [reason, setReason] = useState("");
  const [rangerUserId, setRangerUserId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [safetyNotes, setSafetyNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const requestKey = useRef<string | null>(null);
  const canAct =
    actorRole === "supervisor"
      ? currentCase.status === "awaiting_decision"
      : allowed !== null;
  if (!canAct)
    return (
      <p className="rounded-md border border-line bg-bg p-4 text-[13px] text-muted">
        Tidak ada transisi V1 yang diizinkan untuk peran dan status Case ini.
      </p>
    );

  function change() {
    requestKey.current = null;
    setError("");
    setMessage("");
  }
  const transitionId =
    actorRole === "operator" ? (allowed ?? "") : supervisorTransitionId;
  const isAssign = transitionId === "AB-TR-013";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (reason.trim().length < 10) {
      setError("Alasan minimal 10 karakter.");
      return;
    }
    if (
      isAssign &&
      (!rangerUserId ||
        !zoneId ||
        title.trim().length < 5 ||
        instructions.trim().length < 10 ||
        safetyNotes.trim().length < 10)
    ) {
      setError(
        "Lengkapi Ranger, zona, judul, instruksi, dan catatan keselamatan sesuai syarat.",
      );
      return;
    }
    const key = requestKey.current ?? crypto.randomUUID();
    requestKey.current = key;
    setPending(true);
    try {
      const body = {
        transitionId,
        expectedVersion: currentCase.version,
        reason: reason.trim(),
        ...(isAssign
          ? {
              assignment: {
                rangerUserId,
                zoneId,
                title: title.trim(),
                instructions: instructions.trim(),
                safetyNotes: safetyNotes.trim(),
              },
            }
          : {}),
      };
      const response = await fetch(
        `/api/cases/${encodeURIComponent(caseId)}/transitions?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(body),
          cache: "no-store",
        },
      );
      const data: {
        error?: string;
        replayed?: boolean;
        caseId?: string;
        status?: string;
        version?: number;
      } = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setError(
            `Konflik transisi: ${data.error ?? "CASE_CONFLICT"}. Data Case dimuat ulang otomatis.`,
          );
          router.refresh();
          return;
        }
        setError(
          data.error ??
            "Keputusan tidak dapat diproses. Tidak ada keberhasilan yang diasumsikan.",
        );
        return;
      }
      if (
        data.caseId !== caseId ||
        typeof data.status !== "string" ||
        !Number.isSafeInteger(data.version) ||
        (data.version ?? 0) < currentCase.version
      ) {
        setError(
          "Respons transisi tidak konsisten; data Case disinkronkan dari server.",
        );
        router.refresh();
        return;
      }
      // Response from the transaction contains the new, persisted version/status.
      // No stale AB-TR-010 or expectedVersion=v1 on the next submit.
      setCurrentCase({ status: data.status, version: data.version as number });
      setReason("");
      requestKey.current = null;
      setMessage(
        data.replayed
          ? "Permintaan sebelumnya sudah tersimpan."
          : "Keputusan berhasil dicatat.",
      );
      // Refresh server-rendered header and audit list automatically (no F5).
      router.refresh();
    } catch {
      setError(
        "Tidak bisa memastikan hasil jaringan. Periksa Case sebelum mencoba ulang; kunci idempotensi dipertahankan.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-[13px] font-medium text-fg">
        Tindakan yang disetujui
        <select
          value={transitionId}
          onChange={(event) => {
            setSupervisorTransitionId(event.target.value);
            change();
          }}
          className="mt-1.5 block w-full rounded-md border border-line-strong bg-white px-3 py-2.5"
          required
        >
          {actorRole === "operator" ? (
            <option value={allowed ?? ""}>
              {currentCase.status === "received"
                ? "AB-TR-010 · Mulai review"
                : "AB-TR-011 · Kirim ke Supervisor"}
            </option>
          ) : (
            <>
              <option value="AB-TR-012">
                AB-TR-012 · Pantau tanpa penugasan
              </option>
              <option value="AB-TR-013">AB-TR-013 · Tugaskan Ranger</option>
            </>
          )}
        </select>
      </label>
      <label className="block text-[13px] font-medium text-fg">
        Alasan keputusan (wajib)
        <textarea
          required
          minLength={10}
          maxLength={2000}
          rows={3}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            change();
          }}
          placeholder="Jelaskan sumber, ketidakpastian, dan pertimbangan operasional."
          className="mt-1.5 block w-full rounded-md border border-line-strong bg-white p-3 text-sm"
        />
      </label>
      {isAssign && (
        <div className="space-y-4 rounded-md border border-line bg-bg p-4">
          <p className="text-sm font-semibold text-ink">
            Instruksi tugas lapangan
          </p>
          {rangers.length === 0 && (
            <p className="text-xs text-danger">
              Tidak ada Ranger aktif yang memenuhi syarat. Penugasan
              dinonaktifkan.
            </p>
          )}
          {zones.length === 0 && (
            <p className="text-xs text-danger">
              Zona operasional belum tersedia. Penugasan dinonaktifkan.
            </p>
          )}
          <label className="block text-xs font-medium text-fg">
            Ranger aktif
            <select
              required
              value={rangerUserId}
              onChange={(e) => {
                setRangerUserId(e.target.value);
                change();
              }}
              className="mt-1 block w-full rounded-md border border-line-strong bg-white px-3 py-2.5"
            >
              <option value="">Pilih Ranger</option>
              {rangers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-fg">
            Zona operasi (bukan titik kejadian terverifikasi)
            <select
              required
              value={zoneId}
              onChange={(e) => {
                setZoneId(e.target.value);
                change();
              }}
              className="mt-1 block w-full rounded-md border border-line-strong bg-white px-3 py-2.5"
            >
              <option value="">Pilih zona</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.code} · {z.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-fg">
            Judul tugas
            <input
              required
              minLength={5}
              maxLength={160}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                change();
              }}
              className="mt-1 block w-full rounded-md border border-line-strong bg-white px-3 py-2.5"
            />
          </label>
          <label className="block text-xs font-medium text-fg">
            Instruksi lapangan
            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              value={instructions}
              onChange={(e) => {
                setInstructions(e.target.value);
                change();
              }}
              className="mt-1 block w-full rounded-md border border-line-strong bg-white px-3 py-2.5"
            />
          </label>
          <label className="block text-xs font-medium text-fg">
            Catatan keselamatan
            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              value={safetyNotes}
              onChange={(e) => {
                setSafetyNotes(e.target.value);
                change();
              }}
              className="mt-1 block w-full rounded-md border border-line-strong bg-white px-3 py-2.5"
            />
          </label>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger/25 bg-danger-50 px-3 py-2 text-[13px] text-danger"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-md border border-brand/25 bg-brand-50 px-3 py-2 text-[13px] text-brand"
        >
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || (isAssign && (!rangers.length || !zones.length))}
        className="inline-flex min-h-10 items-center rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Menyimpan..." : "Simpan keputusan dan audit"}
      </button>
    </form>
  );
}
