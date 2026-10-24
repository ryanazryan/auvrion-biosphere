"use client";

import { useRouter } from "next/navigation";
import { Fragment, useRef, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { SelectMenu } from "@/components/ui/SelectMenu";
import type { OperationalRole } from "@/server/account-activation/policy";
import { filterAccessUsers } from "./access-users-filter";

type ManagedUser = {
  userId: string;
  name: string;
  email: string;
  accessStatus: "pending_activation" | "active" | "disabled";
  activeRoles: OperationalRole[];
  lastLifecycleAuditId: string | null;
  protectedAdmin: boolean;
  mfaEnabled: boolean;
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
          <SelectMenu
            id={`role-${user.userId}`}
            label="Role operasional"
            value={role}
            disabled={busy}
            onChange={setRole}
            options={(Object.keys(LABELS) as OperationalRole[]).map(
              (value) => ({
                value,
                label: LABELS[value],
              }),
            )}
          />
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
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = filterAccessUsers(users, query, status);

  const toggle = (id: string) =>
    setSelectedId((current) => (current === id ? null : id));
  const accessBadge = (user: ManagedUser) => (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium ${user.accessStatus === "active" ? "bg-brand-50 text-brand" : user.accessStatus === "disabled" ? "bg-danger-50 text-danger" : "bg-warn-50 text-warn"}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {user.accessStatus === "active"
        ? "Aktif"
        : user.accessStatus === "disabled"
          ? "Nonaktif"
          : "Menunggu aktivasi"}
    </span>
  );
  const mfaBadge = (user: ManagedUser) => (
    <span
      className={`inline-flex rounded px-2 py-1 text-[11px] font-medium ${user.mfaEnabled ? "bg-brand-50 text-brand" : "bg-bg text-muted"}`}
    >
      {user.mfaEnabled ? "TOTP terdaftar" : "Belum terdaftar"}
    </span>
  );
  const roles = (user: ManagedUser) =>
    user.activeRoles.length
      ? user.activeRoles.map((role) => LABELS[role]).join(", ")
      : "—";
  const actions = (user: ManagedUser) => (
    <UserActions
      key={`${user.userId}-${user.accessStatus}-${user.activeRoles.join("-")}-${user.lastLifecycleAuditId ?? "initial"}`}
      user={user}
    />
  );

  return (
    <AdminShell adminEmail={adminEmail} organizationName={organizationName}>
      <div className="mb-5">
        <h1 className="text-[25px] font-semibold tracking-tight text-ink">
          Pengguna
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          Status akun dan hak akses.
        </p>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="min-w-0">
          <span className="sr-only">Cari pengguna</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari nama atau email"
            className="h-10 w-full min-w-0 rounded-md border border-line-strong bg-white px-3 text-[13px] outline-none focus:border-brand"
          />
        </label>
        <label className="min-w-0">
          <span className="sr-only">Status akun</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-10 w-full rounded-md border border-line-strong bg-white px-3 text-[13px]"
          >
            <option value="all">Semua status akun</option>
            <option value="active">Aktif</option>
            <option value="pending_activation">Menunggu aktivasi</option>
            <option value="disabled">Nonaktif</option>
          </select>
        </label>
      </div>
      {(query !== "" || status !== "all") && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-xs text-muted">
            {filtered.length} dari {users.length} akun cocok dengan filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatus("all");
              setSelectedId(null);
            }}
            className="rounded-md border border-line-strong px-3 py-2 text-xs font-medium text-brand hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand"
          >
            Reset filter
          </button>
        </div>
      )}
      <div className="hidden overflow-hidden rounded-lg border border-line bg-white lg:block">
        <table className="w-full table-fixed text-left text-[13px]">
          <caption className="sr-only">
            Akun yang berada dalam organisasi ini
          </caption>
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[24%]" />
            <col className="w-[15%]" />
            <col className="w-[14%]" />
            <col className="w-[17%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead className="bg-bg text-[12px] text-muted">
            <tr>
              <th scope="col" className="px-3 py-3 font-medium">
                Nama
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Email
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Status akun
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                MFA
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Peran
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Tindakan
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((user) => (
              <Fragment key={user.userId}>
                <tr className="hover:bg-bg/60">
                  <th scope="row" className="break-words px-3 py-3 font-medium">
                    {user.name}
                  </th>
                  <td className="break-all px-3 py-3 text-muted">
                    {user.email}
                  </td>
                  <td className="px-3 py-3">{accessBadge(user)}</td>
                  <td className="px-3 py-3">{mfaBadge(user)}</td>
                  <td className="break-words px-3 py-3 text-muted">
                    {roles(user)}
                    {user.protectedAdmin && (
                      <span className="mt-1 block text-[11px] text-warn">
                        Admin terlindungi
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      aria-expanded={selectedId === user.userId}
                      aria-controls={
                        selectedId === user.userId
                          ? `admin-access-desktop-${user.userId}`
                          : undefined
                      }
                      onClick={() => toggle(user.userId)}
                      className="font-semibold text-brand hover:underline"
                    >
                      {selectedId === user.userId ? "Tutup" : "Lihat detail"}
                    </button>
                  </td>
                </tr>
                {selectedId === user.userId && (
                  <tr id={`admin-access-desktop-${user.userId}`}>
                    <td colSpan={6} className="bg-bg px-4 pb-5">
                      {actions(user)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 lg:hidden">
        {filtered.map((user) => (
          <article
            key={user.userId}
            className="rounded-lg border border-line bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{user.name}</h2>
                <p className="break-all text-xs text-muted">{user.email}</p>
              </div>
              {accessBadge(user)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{roles(user)}</span>
              {mfaBadge(user)}
            </div>
            <button
              type="button"
              aria-expanded={selectedId === user.userId}
              aria-controls={
                selectedId === user.userId
                  ? `admin-access-mobile-${user.userId}`
                  : undefined
              }
              onClick={() => toggle(user.userId)}
              className="mt-3 rounded-md border border-line px-3 py-2 text-xs font-medium text-brand"
            >
              {selectedId === user.userId ? "Tutup detail" : "Kelola akses"}
            </button>
            {selectedId === user.userId && (
              <div id={`admin-access-mobile-${user.userId}`}>
                {actions(user)}
              </div>
            )}
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="rounded-lg border border-line bg-white p-8 text-center text-[13px] text-muted">
          Tidak ada akun yang cocok.
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Menampilkan {filtered.length} akun dalam cakupan organisasi.
      </p>
      <section className="mt-7 rounded-lg border border-line bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Audit terakhir</h2>
        <ol className="mt-3 divide-y divide-line">
          {audit.map((entry) => (
            <li key={entry.id} className="py-3 text-[13px]">
              <strong className="font-medium">{entry.action}</strong>
              <span className="ml-2 text-xs text-muted">
                {new Date(entry.createdAt).toLocaleString("id-ID", {
                  timeZone: "Asia/Makassar",
                })}{" "}
                WITA
              </span>
              <p className="mt-1 text-xs text-muted">{entry.reason}</p>
            </li>
          ))}
          {audit.length === 0 && (
            <li className="py-3 text-xs text-muted">
              Belum ada audit lifecycle.
            </li>
          )}
        </ol>
      </section>
    </AdminShell>
  );
}
