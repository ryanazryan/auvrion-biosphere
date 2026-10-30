/** Pure report functions, deliberately independent of server and DB authorization. */
export type ReportPeriod = "month" | "year";

export const CASE_STATUS_LABELS: Record<string, string> = {
  received: "Diterima",
  under_review: "Dalam review",
  awaiting_decision: "Menunggu keputusan",
  monitoring: "Dalam pemantauan",
  assigned: "Ditugaskan",
  closed: "Selesai",
};

export function caseHandlingStatus(
  caseId: string | null,
  caseStatus: string | null,
): string {
  return caseId
    ? (CASE_STATUS_LABELS[caseStatus ?? ""] ?? caseStatus ?? "Tidak diketahui")
    : "Belum dibuat Case";
}

export function witaReportRange(
  year: number,
  period: ReportPeriod,
  month: number,
) {
  const start = new Date(
    Date.UTC(year, period === "month" ? month - 1 : 0, 1) - 8 * 3600000,
  );
  const end = new Date(
    Date.UTC(
      year + (period === "year" ? 1 : 0),
      period === "month" ? month : 0,
      1,
    ) -
      8 * 3600000,
  );
  const label =
    period === "month"
      ? `${String(month).padStart(2, "0")}-${year}`
      : String(year);
  return { start, end, label };
}

export function neutralizeSpreadsheetValue(value: unknown) {
  const s = String(value ?? "");
  return /^[\s]*[=+@-]/.test(s) ? `'${s}` : s;
}
