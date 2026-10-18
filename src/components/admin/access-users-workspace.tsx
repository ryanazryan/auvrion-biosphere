"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import type { OperationalRole } from "@/server/account-activation/policy";

type ManagedUser = {
  userId: string;
  name: string;
  email: string;
  accessStatus: "pending_activation" | "active" | "disabled";
  activeRoles: OperationalRole[];
  lastLifecycleAuditId: string | null;
  protectedAdmin: boolean;
};
type AuditEvent = {
  id: string;
  action: "role_granted" | "role_changed" | "role_revoked" | "account_disabled";
  targetUserId: string;
  reason: string;
  createdAt: string;
};

const LABELS: Record<OperationalRole, string> = {
  operator: "Operator",
  supervisor: "Supervisor",
  ranger: "Ranger",
};

function UserActions({ user }: { user: ManagedUser }) {
  const router = useRouter();
  const [role, setRole] = useState<OperationalRole>(
    user.activeRoles[0] ?? "ranger",
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const locked = user.accessStatus === "disabled" || user.protectedAdmin;

  async function act(action: "set_role" | "revoke_role" | "disable_account") {
    if (
      lock.current ||
      locked ||
      (user.activeRoles.length > 1 && action !== "disable_account")
    )
      return;
    if (reason.trim().length < 10 || reason.trim().length > 500) {
      setError("Alasan tindakan wajib 10–500 karakter.");
      return;
    }
    if (
      action === "disable_account" &&
      !window.confirm(
        `Nonaktifkan akun ${user.email}? Semua sesi akan dicabut.`,
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/access-users/${encodeURIComponent(user.userId)}/lifecycle`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            reason: reason.trim(),
            expectedLifecycleAuditId: user.lastLifecycleAuditId,
            ...(action === "set_role" ? { role } : {}),
          }),
        },
      );
      if (!response.ok) {
        setError(
          response.status === 401 || response.status === 403
            ? "Tidak diizinkan. Periksa MFA, capability admin, dan status target."
            : response.status === 409
              ? "Data akun telah berubah atau tindakan tidak valid. Muat ulang halaman sebelum mengulangi."
              : "Tindakan ditolak. Periksa kondisi akun dan muat ulang halaman.",
        );
        return;
      }
      setMessage(
        "Perubahan akses tercatat dan semua sesi target telah dicabut.",
      );
      setReason("");
      router.refresh();
    } catch {
      setError(
        "Layanan tidak tersedia. Tidak ada perubahan yang dikonfirmasi.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="mt-3 space-y-3 rounded-lg border border-line bg-bg p-4">
      {user.protectedAdmin ? (
        <p className="text-sm text-danger">
          Akun memiliki capability administrasi. Perubahan melalui modul ini
          ditolak.
        </p>
      ) : user.accessStatus === "disabled" ? (
        <p className="text-sm text-muted">
          Akun disabled tidak dapat diaktifkan kembali dari modul ini.
        </p>
      ) : (
        <>
          {user.activeRoles.length > 1 && (
            <p className="text-sm text-danger">
              Beberapa role aktif terdeteksi. Perubahan role diblokir; hanya
              disable akun yang diizinkan untuk containment.
            </p>
          )}
          <label
            className="block text-sm font-medium"
            htmlFor={`role-${user.userId}`}
          >
            Role operasional
          </label>
          <select
            id={`role-${user.userId}`}
            value={role}
            disabled={busy}
            onChange={(event) => setRole(event.target.value as OperationalRole)}
            className="h-10 w-full rounded border border-line-strong bg-white px-3 text-sm"
          >
            {(Object.keys(LABELS) as OperationalRole[]).map((value) => (
              <option key={value} value={value}>
                {LABELS[value]}
              </option>
            ))}
          </select>
          <label
            className="block text-sm font-medium"
            htmlFor={`reason-${user.userId}`}
          >
            Alasan perubahan (wajib untuk audit)
          </label>
          <textarea
            id={`reason-${user.userId}`}
            value={reason}
            maxLength={500}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-20 w-full rounded border border-line-strong bg-white p-3 text-sm"
            placeholder="Tuliskan alasan dan dasar persetujuan perubahan akses."
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm text-brand">
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || user.activeRoles.length > 1}
              onClick={() => act("set_role")}
              className="rounded bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Memproses..." : "Simpan role"}
            </button>
            <button
              type="button"
              disabled={busy || user.activeRoles.length !== 1}
              onClick={() => act("revoke_role")}
              className="rounded border border-line-strong px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              Cabut role
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act("disable_account")}
              className="rounded bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Nonaktifkan akun
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function AccessUsersWorkspace({
  adminEmail,
  organizationName,
  users,
  audit,
}: {
  adminEmail: string;
  organizationName: string;
  users: ManagedUser[];
  audit: AuditEvent[];
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = users.find((record) => record.userId === selectedId);
  const term = query.trim().toLowerCase();
  const filtered = users.filter((record) =>
    `${record.name} ${record.email}`.toLowerCase().includes(term),
  );

  return (
    <AdminShell adminEmail={adminEmail} organizationName={organizationName}>
      <h1 className="text-2xl font-semibold">Pengguna & Hak Akses</h1>
      <p className="mt-2 text-sm text-muted">
        Modul development: perubahan role, pencabutan grant, dan disable akun
        dengan audit.
      </p>
      <label
        htmlFor="access-user-search"
        className="mt-6 block text-sm font-medium"
      >
        Cari pengguna
      </label>
      <input
        id="access-user-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mt-2 h-10 w-full rounded border border-line-strong bg-white px-3 text-sm"
        placeholder="Nama atau email"
      />
      <div className="mt-4 space-y-3">
        {filtered.map((record) => (
          <article
            key={record.userId}
            className="rounded-xl border border-line bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold">{record.name}</h2>
                <p className="break-all text-sm text-muted">{record.email}</p>
                <p className="mt-2 text-xs text-muted">
                  Status: {record.accessStatus} · Role aktif:{" "}
                  {record.activeRoles.join(", ") || "Tidak ada"}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSelectedId(
                    selectedId === record.userId ? null : record.userId,
                  )
                }
                aria-expanded={selectedId === record.userId}
                className="rounded border border-line-strong px-3 py-2 text-sm font-medium text-brand"
              >
                {selectedId === record.userId ? "Tutup" : "Kelola akses"}
              </button>
            </div>
            {selected?.userId === record.userId && (
              <UserActions
                key={`${record.userId}-${record.accessStatus}-${record.activeRoles.join("-")}-${record.lastLifecycleAuditId ?? "initial"}`}
                user={record}
              />
            )}
          </article>
        ))}
        {filtered.length === 0 && (
          <p className="p-6 text-sm text-muted">
            Tidak ada akun dalam cakupan ini.
          </p>
        )}
      </div>
      <section className="mt-8 rounded-xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Audit terakhir</h2>
        <p className="mt-1 text-xs text-muted">
          Metadata terbatas, 20 kejadian terakhir.
        </p>
        <ul className="mt-4 space-y-3">
          {audit.map((entry) => (
            <li key={entry.id} className="border-b border-line pb-3 text-sm">
              <strong>{entry.action}</strong> · {entry.targetUserId}
              <p className="text-xs text-muted">
                {new Date(entry.createdAt).toLocaleString("id-ID", {
                  timeZone: "Asia/Makassar",
                })}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{entry.reason}</p>
            </li>
          ))}
          {audit.length === 0 && (
            <li className="text-sm text-muted">Belum ada audit lifecycle.</li>
          )}
        </ul>
      </section>
    </AdminShell>
  );
}
