export type ApplicationProgressStatus =
  | "submitted"
  | "email_verified"
  | "approved"
  | "rejected";

type StepState =
  | "complete"
  | "current"
  | "waiting"
  | "rejected"
  | "not_applicable";

type Props = {
  status: ApplicationProgressStatus;
};

const STEPS = [
  "Permohonan dikirim",
  "Verifikasi email",
  "Peninjauan administrator",
  "Aktivasi akun",
] as const;

const PROGRESS: Record<ApplicationProgressStatus, StepState[]> = {
  submitted: ["complete", "current", "waiting", "waiting"],
  email_verified: ["complete", "complete", "current", "waiting"],
  approved: ["complete", "complete", "complete", "waiting"],
  rejected: ["complete", "complete", "rejected", "not_applicable"],
};

function stepLabel(
  status: ApplicationProgressStatus,
  state: StepState,
  index: number,
): string {
  if (state === "complete") {
    if (index === 2 && status === "approved") {
      return "Disetujui";
    }

    return "Selesai";
  }

  if (state === "rejected") {
    return "Ditolak";
  }

  if (state === "not_applicable") {
    return "Tidak dilanjutkan";
  }

  if (state === "current") {
    return index === 1 ? "Perlu verifikasi" : "Sedang ditinjau";
  }

  if (index === 3 && status === "approved") {
    return "Menunggu aktivasi";
  }

  return "Belum dimulai";
}

export function AccessApplicationProgress({ status }: Props) {
  const states = PROGRESS[status];

  return (
    <section className="mt-6" aria-labelledby="application-progress-heading">
      <h2
        id="application-progress-heading"
        className="mb-3 text-sm font-semibold text-fg"
      >
        Perkembangan permohonan
      </h2>

      <ol className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
        {STEPS.map((step, index) => {
          const state = states[index];

          const finished = state === "complete";
          const current = state === "current";
          const rejected = state === "rejected";

          const markerStyle = finished
            ? "border-brand bg-brand text-white"
            : rejected
              ? "border-danger bg-danger-50 text-danger"
              : current
                ? "border-brand bg-brand-50 text-brand"
                : "border-line-strong bg-surface text-muted";

          const labelStyle =
            finished || current || rejected ? "text-fg" : "text-muted";

          const progressLabel = stepLabel(status, state, index);

          return (
            <li
              key={step}
              aria-current={current ? "step" : undefined}
              className="flex items-center gap-3 px-3.5 py-3"
            >
              <span
                aria-hidden="true"
                className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold ${markerStyle}`}
              >
                {finished ? "✓" : rejected ? "×" : index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p className={`font-medium ${labelStyle}`}>{step}</p>

                <p
                  className={`mt-0.5 text-xs ${
                    finished
                      ? "text-brand"
                      : rejected
                        ? "text-danger"
                        : "text-muted"
                  }`}
                >
                  {progressLabel}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {status === "approved" && (
        <p className="mt-3 text-xs leading-5 text-muted">
          Permohonan Anda telah disetujui. Akun sedang disiapkan. Instruksi
          aktivasi akan dikirim secara terpisah saat tersedia.
        </p>
      )}

      {status === "rejected" && (
        <p className="mt-3 text-xs leading-5 text-muted">
          Permohonan tidak disetujui sehingga proses aktivasi akun tidak
          dilanjutkan.
        </p>
      )}
    </section>
  );
}
