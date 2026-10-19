"use client";

import { useEffect, useMemo, useState } from "react";

import { SearchIcon } from "@/components/admin/admin-icons";
import { AdminShell } from "@/components/admin/admin-shell";
import { ApplicationDecisionActions } from "@/components/admin/application-decision-actions";
import { ApplicationProvisioningActions } from "@/components/admin/application-provisioning-actions";

type Status = "submitted" | "email_verified" | "approved" | "rejected";

type Application = {
  id: string;
  applicantName: string;
  email: string;
  status: Status;
  createdAt: string;
  emailVerifiedAt: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  accessStatus: "pending_activation" | "active" | "disabled" | null;
  invitationUsedAt: string | null;
};

const STATUS: Record<Status, { label: string; cls: string }> = {
  submitted: {
    label: "Menunggu Verifikasi",
    cls: "bg-[#f3f6f4] text-[#506057]",
  },
  email_verified: {
    label: "Menunggu Peninjauan",
    cls: "bg-warn-50 text-warn",
  },
  approved: {
    label: "Disetujui",
    cls: "bg-brand-50 text-brand",
  },
  rejected: {
    label: "Ditolak",
    cls: "bg-danger-50 text-danger",
  },
};

const PAGE_SIZE = 6;

function formatted(iso: string | null): string {
  if (!iso) return "Belum";

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Makassar",
  }).format(new Date(iso));
}

export function AccessApplicationsWorkspace({
  records,
  organizationName,
  adminEmail,
}: {
  records: Application[];
  organizationName: string;
  adminEmail: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [sort, setSort] = useState<"new" | "old">("new");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Application | null>(null);

  useEffect(() => {
    if (!selected) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selected]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return records
      .filter(
        (record) =>
          (status === "all" || record.status === status) &&
          `${record.applicantName} ${record.email}`
            .toLowerCase()
            .includes(term),
      )
      .sort(
        (a, b) =>
          (sort === "new" ? -1 : 1) *
          (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      );
  }, [records, query, status, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);

  const current = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const total = (kind: Status) =>
    records.filter((record) => record.status === kind).length;

  const stats = [
    ["Menunggu Peninjauan", total("email_verified")],
    ["Disetujui", total("approved")],
    ["Ditolak", total("rejected")],
    ["Total Permohonan", records.length],
  ] as const;

  return (
    <AdminShell organizationName={organizationName} adminEmail={adminEmail}>
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-[-0.015em] text-ink sm:text-2xl">
          Manajemen Permohonan Akses
        </h1>

        <p className="mt-1 text-sm text-muted">
          Tinjau permohonan akses pengguna Auvrion Biosphere.
        </p>
      </div>

      {/* Summary statistics */}
      <dl className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {stats.map(([label, number]) => (
          <div
            key={label}
            className="rounded-lg border border-line bg-white px-3.5 py-3"
          >
            <dt className="text-xs text-muted">{label}</dt>

            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {number}
            </dd>
          </div>
        ))}
      </dl>

      {/* Search and filters */}
      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />

          <input
            type="search"
            placeholder="Cari nama atau email"
            aria-label="Cari nama atau email"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            className="h-10 w-full rounded-md border border-line-strong bg-white pr-3 pl-9 text-sm focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
          />
        </div>

        <select
          value={status}
          aria-label="Filter status"
          onChange={(event) => {
            setStatus(event.target.value as Status | "all");
            setPage(1);
          }}
          className="h-10 rounded-md border border-line-strong bg-white px-3 text-sm lg:w-52"
        >
          <option value="all">Semua status</option>

          {(Object.keys(STATUS) as Status[]).map((key) => (
            <option key={key} value={key}>
              {STATUS[key].label}
            </option>
          ))}
        </select>

        <select
          value={sort}
          aria-label="Urutan tanggal"
          onChange={(event) => {
            setSort(event.target.value as "new" | "old");
            setPage(1);
          }}
          className="h-10 rounded-md border border-line-strong bg-white px-3 text-sm lg:w-48"
        >
          <option value="new">Terbaru dulu</option>
          <option value="old">Terlama dulu</option>
        </select>
      </div>

      {/* Desktop applications table */}
      <section
        className="hidden overflow-x-auto rounded-lg border border-line bg-white md:block"
        aria-label="Tabel permohonan akses"
      >
        <table className="w-full min-w-305 table-fixed text-left text-sm">
          <caption className="sr-only">
            Permohonan akses dari database development
          </caption>

          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[29%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[15%]" />
            <col className="w-[8%]" />
          </colgroup>

          <thead className="border-b border-line bg-bg text-xs text-muted">
            <tr>
              {[
                "Pemohon",
                "Email",
                "Tanggal Pengajuan",
                "Verifikasi Email",
                "Status",
                "Tindakan",
              ].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="whitespace-nowrap px-4 py-3 font-medium"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-line">
            {current.map((record) => (
              <tr key={record.id} className="hover:bg-bg">
                <th scope="row" className="px-4 py-3 font-medium">
                  <span className="block truncate" title={record.applicantName}>
                    {record.applicantName}
                  </span>
                </th>

                <td className="px-4 py-3 text-muted">
                  <span className="block truncate" title={record.email}>
                    {record.email}
                  </span>
                </td>

                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">
                  {formatted(record.createdAt)}
                </td>

                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">
                  {record.emailVerifiedAt
                    ? formatted(record.emailVerifiedAt)
                    : "Belum"}
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${
                      STATUS[record.status].cls
                    }`}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-current"
                      aria-hidden="true"
                    />

                    {STATUS[record.status].label}
                  </span>
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelected(record)}
                    className="font-semibold text-brand hover:underline"
                  >
                    Tinjau
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Mobile applications cards */}
      <ul className="space-y-3 md:hidden">
        {current.map((record) => (
          <li
            key={record.id}
            className="rounded-lg border border-line bg-white px-3.5 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{record.applicantName}</p>

                <p className="break-all text-sm text-muted">{record.email}</p>
              </div>

              <span
                className={`rounded-md px-2 py-1 text-xs ${
                  STATUS[record.status].cls
                }`}
              >
                {STATUS[record.status].label}
              </span>
            </div>

            <p className="mt-3 text-xs text-muted">
              Diajukan: {formatted(record.createdAt)}
            </p>

            <button
              type="button"
              onClick={() => setSelected(record)}
              className="mt-3 w-full rounded-md border border-line-strong p-2.5 text-sm font-semibold text-brand"
            >
              Tinjau
            </button>
          </li>
        ))}
      </ul>

      {/* Empty state */}
      {filtered.length === 0 && (
        <p className="rounded-xl border border-line bg-white p-10 text-center text-sm text-muted">
          Tidak ada permohonan yang sesuai pencarian atau filter.
        </p>
      )}

      {/* Pagination */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          Menampilkan {current.length} dari {filtered.length} permohonan
          (maksimal 200 terbaru).
        </span>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
            className="rounded-md border border-line bg-white px-3 py-2 disabled:opacity-40"
          >
            Sebelumnya
          </button>

          <span className="tabular-nums">
            {currentPage}/{pages}
          </span>

          <button
            type="button"
            disabled={currentPage >= pages}
            onClick={() => setPage(currentPage + 1)}
            className="rounded-md border border-line bg-white px-3 py-2 disabled:opacity-40"
          >
            Berikutnya
          </button>
        </div>
      </div>

      {/* Development notice */}
      <p className="mt-5 text-xs text-muted">
        Workspace development AUVRION-LOCAL. Approval/penolakan dicatat di
        database lokal; aktivasi akun dilakukan terpisah.
      </p>

      {/* Application review drawer */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="presentation"
        >
          {/* Backdrop */}
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label="Tutup detail"
            className="absolute inset-0 bg-ink/45"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-6 shadow-2xl sm:p-8"
          >
            {/* Applicant identity */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                  Permohonan Akses
                </p>

                <h2
                  id="review-title"
                  className="mt-2 text-2xl font-semibold text-ink"
                >
                  {selected.applicantName}
                </h2>

                <p className="mt-1 break-all text-sm text-muted">
                  {selected.email}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Tutup drawer"
                className="rounded-lg border border-line px-3 py-2"
              >
                ✕
              </button>
            </div>

            {/* Applicant details */}
            <dl className="mt-8 space-y-4 text-sm">
              {(
                [
                  ["Status", STATUS[selected.status].label],
                  ["Diajukan", formatted(selected.createdAt)],
                  ["Email terverifikasi", formatted(selected.emailVerifiedAt)],
                  [
                    "Waktu keputusan",
                    selected.reviewedAt
                      ? formatted(selected.reviewedAt)
                      : "Belum ditinjau",
                  ],
                  ["Organisasi (development)", organizationName],
                  ["Application ID", selected.id],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="border-b border-line pb-3">
                  <dt className="text-xs text-muted">{label}</dt>

                  <dd className="mt-1 break-all font-medium">{value}</dd>
                </div>
              ))}

              {selected.decisionReason && (
                <div>
                  <dt className="text-xs text-muted">Alasan keputusan</dt>

                  <dd className="mt-1 whitespace-pre-wrap">
                    {selected.decisionReason}
                  </dd>
                </div>
              )}
            </dl>

            {/* Real PostgreSQL approval/rejection actions */}
            {selected.status === "approved" ? (
              <ApplicationProvisioningActions
                key={`provision-${selected.id}`}
                applicationId={selected.id}
                applicantName={selected.applicantName}
                accessStatus={selected.accessStatus}
                invitationUsedAt={selected.invitationUsedAt}
                onClose={() => setSelected(null)}
              />
            ) : (
              <ApplicationDecisionActions
                key={selected.id}
                applicationId={selected.id}
                applicantName={selected.applicantName}
                status={selected.status}
                onClose={() => setSelected(null)}
              />
            )}
          </section>
        </div>
      )}
    </AdminShell>
  );
}
