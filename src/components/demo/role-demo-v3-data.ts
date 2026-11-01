export type GuestRole = "operator" | "supervisor" | "ranger";
export type ObservationDomain = "biodiversity" | "environmental_risk";
export type ObservationStage = "unreviewed" | "under_review" | "forwarded";
export type CaseStage =
  | "awaiting_decision"
  | "assigned"
  | "submitted"
  | "completed";
export type TaskStage =
  | "assigned"
  | "accepted"
  | "in_progress"
  | "blocked"
  | "submitted"
  | "completed";

export type GuestObservation = {
  id: string;
  title: string;
  domain: ObservationDomain;
  source: string;
  status: ObservationStage;
  note: string;
  zone: string;
};

export type GuestState = {
  observations: GuestObservation[];
  caseStage: CaseStage;
  taskStage: TaskStage;
  finding: string;
  outcome: string;
  events: string[];
  preventScenario: "normal" | "waspada" | "tinggi";
  aiAnalyzed: boolean;
  audioReviewed: boolean;
};

export const STORAGE_KEY = "auvrion-guest-role-showcase-v3";

export const INITIAL_STATE: GuestState = {
  observations: [
    {
      id: "OBS-2401",
      title: "Indikasi anomali termal di area pemantauan",
      domain: "environmental_risk",
      source: "NASA FIRMS",
      status: "forwarded",
      note: "Indikasi awal memerlukan verifikasi kondisi lapangan.",
      zone: "Kalimantan Selatan",
    },
    {
      id: "OBS-2402",
      title: "Rekaman bioakustik pagi — LISTEN-01",
      domain: "biodiversity",
      source: "listen-esp32-01",
      status: "under_review",
      note: "Rekaman historis; hasil analisis adalah kandidat, bukan identifikasi final.",
      zone: "Banjarbaru",
    },
    {
      id: "OBS-2403",
      title: "Pengamatan kualitas udara kawasan",
      domain: "environmental_risk",
      source: "Observasi manual",
      status: "unreviewed",
      note: "Tinjauan kualitas udara untuk pengamatan lingkungan.",
      zone: "Kalimantan Selatan",
    },
  ],
  caseStage: "awaiting_decision",
  taskStage: "assigned",
  finding: "",
  outcome: "",
  events: [
    "Operator mengirim OBS-2401 kepada Supervisor",
    "CASE-2401 menunggu peninjauan keputusan",
    "LISTEN-01 menerima rekaman historis",
  ],
  preventScenario: "normal",
  aiAnalyzed: false,
  audioReviewed: false,
};

export const SPECIES = [
  { name: "Merbah cerukcuk", scientific: "Pycnonotus goiavier", score: 0.82 },
  { name: "Kacer", scientific: "Copsychus saularis", score: 0.67 },
  { name: "Tuwur asia", scientific: "Eudynamys scolopaceus", score: 0.51 },
] as const;

export const ROLE_LABEL: Record<GuestRole, string> = {
  operator: "Operator",
  supervisor: "Supervisor",
  ranger: "Ranger",
};

export const CASE_LABEL: Record<CaseStage, string> = {
  awaiting_decision: "Menunggu keputusan",
  assigned: "Penugasan lapangan",
  submitted: "Menunggu evaluasi",
  completed: "Selesai",
};

export const TASK_LABEL: Record<TaskStage, string> = {
  assigned: "Baru ditugaskan",
  accepted: "Diterima Ranger",
  in_progress: "Di lapangan",
  blocked: "Terblokir",
  submitted: "Menunggu evaluasi",
  completed: "Selesai",
};

export type GuestTab =
  | "overview"
  | "observations"
  | "observation-new"
  | "review"
  | "handoffs"
  | "iot"
  | "listen"
  | "prevent"
  | "map"
  | "reports"
  | "analytics"
  | "decisions"
  | "outcomes"
  | "assignments"
  | "tasks"
  | "findings"
  | "history";

export type GuestNavItem = { tab: GuestTab; title: string; icon: string };
export type GuestNavGroup = { title: string; items: GuestNavItem[] };

export const NAVIGATION: Record<GuestRole, GuestNavGroup[]> = {
  operator: [
    {
      title: "PENGAMATAN",
      items: [
        { tab: "overview", title: "Ringkasan", icon: "layout-dashboard" },
        { tab: "observations", title: "Observasi", icon: "clipboard-list" },
        {
          tab: "observation-new",
          title: "Catat Observasi",
          icon: "plus-square",
        },
        { tab: "review", title: "Antrean Review", icon: "list-checks" },
        {
          tab: "handoffs",
          title: "Pelacakan Handoff",
          icon: "arrow-left-right",
        },
      ],
    },
    {
      title: "PERANGKAT & PETA",
      items: [
        { tab: "iot", title: "Alat IoT", icon: "radio-tower" },
        { tab: "listen", title: "LISTEN · Bioakustik", icon: "audio-lines" },
        { tab: "prevent", title: "PREVENT · Karhutla", icon: "flame" },
        { tab: "map", title: "Peta Observasi", icon: "map" },
      ],
    },
    {
      title: "PELAPORAN",
      items: [{ tab: "reports", title: "Laporan", icon: "file-text" }],
    },
  ],
  supervisor: [
    {
      title: "OPERASI",
      items: [
        { tab: "overview", title: "Ringkasan", icon: "layout-dashboard" },
        { tab: "map", title: "Peta lingkungan", icon: "map" },
        {
          tab: "analytics",
          title: "Analitik operasional",
          icon: "chart-column",
        },
      ],
    },
    {
      title: "KEPUTUSAN",
      items: [
        { tab: "decisions", title: "Antrean keputusan", icon: "inbox" },
        { tab: "outcomes", title: "Hasil kasus", icon: "clipboard-check" },
      ],
    },
    {
      title: "LAPANGAN",
      items: [
        {
          tab: "assignments",
          title: "Penugasan ranger",
          icon: "user-round-plus",
        },
        { tab: "tasks", title: "Tugas ranger", icon: "route" },
      ],
    },
  ],
  ranger: [
    {
      title: "OPERASI LAPANGAN",
      items: [
        { tab: "overview", title: "Beranda", icon: "house" },
        { tab: "map", title: "Peta Lingkungan", icon: "map-pin" },
        { tab: "tasks", title: "Tugas Saya", icon: "route" },
        { tab: "findings", title: "Temuan Lapangan", icon: "notebook-pen" },
        { tab: "history", title: "Riwayat", icon: "history" },
      ],
    },
  ],
};

export type TourStep = {
  tab: GuestTab;
  title: string;
  body: string;
  anchor: string;
};

export const TOURS: Record<GuestRole, TourStep[]> = {
  operator: [
    {
      tab: "overview",
      anchor: "metrics",
      title: "Ringkasan Operator",
      body: "Pantau jumlah observasi dan buka kasus yang perlu ditinjau.",
    },
    {
      tab: "observations",
      anchor: "records",
      title: "Daftar observasi",
      body: "Buka detail data dan lihat bukti serta status kualitasnya.",
    },
    {
      tab: "observation-new",
      anchor: "form",
      title: "Catat observasi",
      body: "Buat observasi baru memakai data lokal, lalu tinjau sebelum diteruskan.",
    },
    {
      tab: "review",
      anchor: "review",
      title: "Peninjauan",
      body: "Tandai observasi telah ditelaah dan kirim Case kepada Supervisor.",
    },
    {
      tab: "iot",
      anchor: "devices",
      title: "Hub IoT",
      body: "Buka LISTEN untuk audio bioakustik atau PREVENT untuk panel sensor konseptual.",
    },
    {
      tab: "listen",
      anchor: "perch",
      title: "Analisis Perch 2.0",
      body: "Tampilkan kandidat satwa beserta skor model dan keterbatasan verifikasi.",
    },
    {
      tab: "handoffs",
      anchor: "handoff",
      title: "Pelacakan Handoff",
      body: "Lanjutkan lintas-role ke Supervisor untuk memutuskan tindak lanjut.",
    },
  ],
  supervisor: [
    {
      tab: "overview",
      anchor: "metrics",
      title: "Ringkasan Supervisor",
      body: "Periksa kasus menunggu keputusan dan aktivitas lapangan.",
    },
    {
      tab: "decisions",
      anchor: "decision",
      title: "Tinjau Case",
      body: "Evaluasi konteks observasi, bukti dan status sebelum mengirim penugasan.",
    },
    {
      tab: "assignments",
      anchor: "assignment",
      title: "Tugaskan Ranger",
      body: "Pilih Ranger dan kirim tugas ke dashboard lapangan.",
    },
    {
      tab: "tasks",
      anchor: "task",
      title: "Pantau penugasan",
      body: "Status berpindah saat Ranger menerima, memulai, dan mengirim hasil.",
    },
    {
      tab: "outcomes",
      anchor: "outcome",
      title: "Evaluasi hasil",
      body: "Setelah laporan diterima, tinjau hasil dan tutup Case.",
    },
  ],
  ranger: [
    {
      tab: "overview",
      anchor: "metrics",
      title: "Beranda Ranger",
      body: "Lihat tugas, prioritas, dan perkembangan pemeriksaan.",
    },
    {
      tab: "tasks",
      anchor: "task",
      title: "Terima tugas",
      body: "Baca instruksi, terima tugas dan mulai pekerjaan lapangan.",
    },
    {
      tab: "map",
      anchor: "map",
      title: "Peta Lingkungan",
      body: "Gunakan basemap publik untuk memperkirakan konteks lokasi.",
    },
    {
      tab: "findings",
      anchor: "finding",
      title: "Temuan Lapangan",
      body: "Catat hasil pemeriksaan, foto lokal bila perlu, lalu serahkan ke Supervisor.",
    },
    {
      tab: "history",
      anchor: "history",
      title: "Riwayat aktivitas",
      body: "Semua perubahan dalam sesi browser muncul di linimasa.",
    },
  ],
};

export function readGuestState(value: unknown): GuestState {
  if (!value || typeof value !== "object") return INITIAL_STATE;
  const record = value as Partial<GuestState>;
  if (!Array.isArray(record.observations) || !Array.isArray(record.events)) {
    return INITIAL_STATE;
  }
  return {
    ...INITIAL_STATE,
    ...record,
    observations: record.observations
      .filter((item): item is GuestObservation =>
        Boolean(
          item && typeof item.id === "string" && typeof item.title === "string",
        ),
      )
      .slice(0, 40),
    events: record.events
      .filter((item): item is string => typeof item === "string")
      .slice(0, 60),
  };
}
