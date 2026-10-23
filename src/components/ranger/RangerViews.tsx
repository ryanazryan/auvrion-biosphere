import Link from "next/link";
import type { ReactNode } from "react";
import { RangerIcon } from "./RangerIcons";

export type RangerTaskItem = {
  id: string;
  caseId: string;
  title: string;
  status: string;
  version: number;
  instructions: string | null;
  safetyNotes: string | null;
  createdAt: Date;
  assignedAt: Date;
};

export const ACTIONABLE = ["assigned", "accepted", "in_progress", "blocked"];

export function taskCode(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}
export function formattedDate(date: Date | string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Makassar",
  }).format(new Date(date));
}
export function taskZone(instructions: string | null) {
  const found = instructions?.match(/^Operational zone:\s*([^\r\n]+)/m)?.[1];
  return found ?? null;
}
export function statusLabel(status: string) {
  return (
    (
      {
        assigned: "Baru ditugaskan",
        accepted: "Diterima",
        in_progress: "Di lapangan",
        blocked: "Terblokir",
        submitted: "Menunggu evaluasi",
        completed: "Selesai",
        cancelled: "Dibatalkan",
      } as Record<string, string>
    )[status] ?? status
  );
}
export function RangerStatus({ status }: { status: string }) {
  const color =
    status === "blocked"
      ? "bg-danger-50 text-danger"
      : status === "assigned" || status === "submitted"
        ? "bg-warn-50 text-warn"
        : status === "completed"
          ? "bg-brand-50 text-brand"
          : "bg-[#eff5f2] text-[#28785c]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold ${color}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {statusLabel(status)}
    </span>
  );
}
export function Heading({
  title,
  note,
  eyebrow,
}: {
  title: string;
  note?: string;
  eyebrow?: string;
}) {
  return (
    <header className="mb-5">
      {eyebrow && <p className="mb-1 text-xs text-muted">{eyebrow}</p>}
      <h1 className="text-[25px] font-semibold tracking-tight text-ink sm:text-[28px]">
        {title}
      </h1>
      {note && <p className="mt-1.5 text-[13px] text-muted">{note}</p>}
    </header>
  );
}
export function TaskCard({ task }: { task: RangerTaskItem }) {
  const zone = taskZone(task.instructions);
  return (
    <Link
      href={`/ranger/tasks/${task.id}`}
      className="group block min-w-0 rounded-lg border border-line bg-white p-4 transition-[border-color,box-shadow] duration-200 hover:border-brand/40 hover:shadow-[0_5px_18px_-12px_rgb(20_45_37/0.3)] focus-visible:outline-2 focus-visible:outline-brand"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-xs text-muted">
          <span className="font-semibold text-fg">{taskCode(task.id)}</span>
          <span className="mx-2 text-line-strong">·</span>Tugas lapangan
        </span>
        <RangerStatus status={task.status} />
      </div>
      <h2 className="mt-2 text-[15px] font-semibold leading-6 text-ink group-hover:text-brand">
        {task.title}
      </h2>
      <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {zone && (
          <span className="inline-flex items-center gap-1.5">
            <RangerIcon name="map-pin" className="size-3.5" />
            {zone}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <RangerIcon name="calendar" className="size-3.5" />
          {formattedDate(task.assignedAt)} WITA
        </span>
      </p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-[13px] text-muted">
        <span>
          {task.status === "assigned"
            ? "Baca instruksi dan keselamatan"
            : "Lihat detail penugasan"}
        </span>
        <RangerIcon name="chevron" className="size-4 shrink-0 text-brand" />
      </div>
    </Link>
  );
}
export function TaskList({ tasks }: { tasks: RangerTaskItem[] }) {
  if (!tasks.length)
    return (
      <EmptyState
        title="Belum ada tugas"
        text="Tugas dari Supervisor muncul di sini."
      />
    );
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {tasks.map((task) => (
        <li key={task.id} className="min-w-0">
          <TaskCard task={task} />
        </li>
      ))}
    </ul>
  );
}
export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-line bg-white px-5 py-8 text-center">
      <RangerIcon name="inbox" className="mb-3 size-6 text-muted/60" />
      <p className="text-[14px] font-medium text-fg">{title}</p>
      {text && <p className="mt-1 max-w-md text-xs text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function InfoCard({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      <div className="p-4 text-[13px] leading-6 text-fg">{children}</div>
    </section>
  );
}
export function SafetyPanel({ safety }: { safety: string | null }) {
  return (
    <section
      aria-label="Informasi keselamatan"
      className="overflow-hidden rounded-lg border border-[#e9d4b4] bg-[#fbf3e8] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full border border-[#e9c9a3] bg-white text-warn">
          <RangerIcon name="shield" className="size-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-warn">
            Keselamatan lebih dulu
          </p>
          <p className="mt-1 text-[14px] font-semibold leading-6 text-ink">
            Jangan lanjutkan verifikasi jika kondisi lapangan tidak aman.
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Jika berbahaya, hentikan pekerjaan dan hubungi Supervisor/pos atau
            kanal darurat yang disepakati. Setelah aman, catat kejadian dan
            tindak lanjutnya di Auvrion.
          </p>
        </div>
      </div>
      {safety?.trim() && (
        <div className="mt-4 border-t border-[#e9d4b4] pt-3">
          <h3 className="mb-1 text-xs font-semibold text-warn">
            Instruksi keselamatan tugas
          </h3>
          <p className="whitespace-pre-wrap text-[13px] leading-6">
            {safety.trim()}
          </p>
        </div>
      )}
    </section>
  );
}
export function ReadOnlyAction({ status }: { status: string }) {
  return (
    <section className="rounded-lg border border-warn/30 bg-warn-50 p-4">
      <p className="text-[13px] font-semibold text-warn">
        Tindakan belum aktif
      </p>
      <p className="mt-1 text-xs leading-5 text-fg">
        Status {statusLabel(status)}. Perubahan status dan pengajuan temuan
        menunggu persetujuan kebijakan Task.
      </p>
      <span
        className="mt-3 inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-warn/25 bg-white px-3 py-2 text-xs text-muted"
        aria-disabled="true"
      >
        <RangerIcon name="lock" className="size-4" />
        Tindakan terkunci
      </span>
    </section>
  );
}
