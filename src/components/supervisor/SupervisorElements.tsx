import Link from "next/link";
import type { ReactNode } from "react";

export function dateTime(value: Date | string | null | undefined) {
  if (!value) return "Tidak diketahui";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Tidak diketahui";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Makassar",
  }).format(date);
}
export function shortId(id: string) {
  return id.length > 13 ? `${id.slice(0, 8)}…` : id;
}
export function statusName(status: string) {
  return (
    (
      {
        received: "Diterima",
        under_review: "Dalam review",
        awaiting_decision: "Menunggu keputusan",
        monitoring: "Dipantau",
        assigned: "Ditugaskan",
        accepted: "Diterima Ranger",
        in_progress: "Dikerjakan",
        blocked: "Terblokir",
        submitted: "Diajukan",
        completed: "Selesai",
        cancelled: "Dibatalkan",
      } as Record<string, string>
    )[status] ?? status
  );
}
export function StatusChip({ status }: { status: string }) {
  const warning = [
    "awaiting_decision",
    "blocked",
    "submitted",
    "received",
  ].includes(status);
  const good = ["assigned", "completed", "accepted", "in_progress"].includes(
    status,
  );
  return (
    <span
      className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${warning ? "border-warn/20 bg-warn-50 text-warn" : good ? "border-brand/20 bg-brand-50 text-brand" : "border-line bg-bg text-muted"}`}
    >
      {statusName(status)}
    </span>
  );
}
export function PageHeading({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[25px] font-semibold tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-6 text-muted">
          {desc}
        </p>
      </div>
      {action}
    </div>
  );
}
export function Panel({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <p className="px-4 py-10 text-center text-[13px] leading-6 text-muted">
      {text}
    </p>
  );
}
export function NavButton({
  href,
  children,
  muted,
}: {
  href: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-9 items-center justify-center rounded-md px-4 text-[13px] font-semibold transition-colors ${muted ? "border border-line-strong bg-white text-fg hover:bg-bg" : "bg-brand text-white hover:bg-brand-hover"}`}
    >
      {children}
    </Link>
  );
}
export function Metric({
  label,
  value,
  href,
  note,
  lead,
}: {
  label: string;
  value: number;
  href: string;
  note: string;
  lead?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`min-w-0 p-4 transition-colors hover:bg-brand-50 ${lead ? "bg-brand-50/80" : "bg-white"}`}
    >
      <span className="block text-[12px] font-medium text-muted">{label}</span>
      <strong className="tnum mt-1 block text-[29px] font-semibold text-ink">
        {value}
      </strong>
      <span className="mt-1 block text-xs text-muted">{note} →</span>
    </Link>
  );
}
export function ReadOnlyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-warn/25 bg-warn-50 px-4 py-3 text-[12px] leading-6 text-fg">
      <strong className="text-warn">Baca-saja:</strong> {children}
    </p>
  );
}
