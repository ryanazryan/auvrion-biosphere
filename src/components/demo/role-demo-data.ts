/** All records stay within the visitor's browser session. No private identifiers. */
export type Role = "operator" | "supervisor" | "ranger";
export type DemoCaseStatus =
  | "awaiting_decision"
  | "assigned"
  | "submitted"
  | "completed";
export type DemoTaskStatus =
  | "assigned"
  | "accepted"
  | "in_progress"
  | "submitted"
  | "completed";
export type DemoObservation = {
  id: string;
  title: string;
  domain: "biodiversity" | "environmental_risk";
  source: string;
  status: "unreviewed" | "reviewed" | "forwarded";
};
export type DemoState = {
  observations: DemoObservation[];
  caseStatus: DemoCaseStatus;
  taskStatus: DemoTaskStatus;
  finding: string;
  activity: string[];
};
export const START: DemoState = {
  observations: [
    {
      id: "OBS-2048",
      title: "Indikasi termal area pengamatan",
      domain: "environmental_risk",
      source: "NASA FIRMS",
      status: "forwarded",
    },
    {
      id: "OBS-2049",
      title: "Rekaman akustik pagi hari",
      domain: "biodiversity",
      source: "LISTEN-01",
      status: "unreviewed",
    },
    {
      id: "OBS-2050",
      title: "Tinjauan kualitas udara wilayah",
      domain: "environmental_risk",
      source: "Referensi lingkungan",
      status: "reviewed",
    },
  ],
  caseStatus: "awaiting_decision",
  taskStatus: "assigned",
  finding: "",
  activity: [
    "Observasi OBS-2048 diteruskan kepada Supervisor",
    "Case CASE-2048 menunggu keputusan Supervisor",
  ],
};
export const DEMO_STORAGE_KEY = "auvrion-guest-role-flow-v1";
export const ROLE_NAMES: Record<Role, string> = {
  operator: "Operator",
  supervisor: "Supervisor",
  ranger: "Ranger",
};
export const CASE_LABEL: Record<DemoCaseStatus, string> = {
  awaiting_decision: "Menunggu keputusan",
  assigned: "Dalam penugasan",
  submitted: "Menunggu evaluasi",
  completed: "Selesai",
};
export const TASK_LABEL: Record<DemoTaskStatus, string> = {
  assigned: "Ditugaskan",
  accepted: "Diterima",
  in_progress: "Di lapangan",
  submitted: "Laporan masuk",
  completed: "Selesai",
};
