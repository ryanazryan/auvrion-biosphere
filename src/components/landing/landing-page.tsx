import Image from "next/image";
import Link from "next/link";
import { LandingHeader } from "./landing-header";
import { LandingWebGis } from "./landing-map";
import { LandingMotion } from "./landing-motion";
import "./landing.css";

const roles = [
  {
    title: "Operator",
    icon: "operator",
    description: "Pantau data observasi dan kondisi perangkat di lapangan.",
  },
  {
    title: "Ranger",
    icon: "ranger",
    description: "Terima tugas verifikasi dan koordinasikan aksi di lapangan.",
  },
  {
    title: "Supervisor",
    icon: "supervisor",
    description:
      "Analisis data, kelola wilayah, dan dukung pengambilan keputusan.",
  },
  {
    title: "Admin / Organisasi",
    icon: "admin",
    description: "Kelola pengguna, hak akses, dan pengaturan organisasi.",
  },
] as const;

const benefits = [
  {
    title: "WebGIS Interaktif",
    detail: "Eksplorasi wilayah pada peta spasial.",
    icon: "map",
  },
  {
    title: "Analitik Lingkungan",
    detail: "Konteks data untuk pengambilan keputusan.",
    icon: "chart",
  },
  {
    title: "Integrasi Perangkat",
    detail: "Terhubung dengan pengamatan IoT.",
    icon: "radio",
  },
  {
    title: "Peringatan Dini",
    detail: "Tinjau indikasi risiko lebih cepat.",
    icon: "bell",
  },
  {
    title: "Kolaborasi",
    detail: "Alur lintas tim yang dapat ditelusuri.",
    icon: "users",
  },
  {
    title: "Keamanan Data",
    detail: "Izin dan informasi sesuai peran.",
    icon: "shield",
  },
] as const;

function Arrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 12h15m-6-6 6 6-6 6" />
    </svg>
  );
}

type RoleIconName = "operator" | "ranger" | "supervisor" | "admin";

function RoleIcon({ name }: { name: RoleIconName }) {
  const symbols = {
    operator: (
      <>
        <rect x="2.5" y="3.5" width="19" height="14" rx="2" />
        <path d="M6.5 11h2l1.5-3 3 6 1.5-3h3M9 21h6M12 17.5V21" />
      </>
    ),
    ranger: (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
        <path d="M9 3v15M15 6v15" />
        <circle cx="12" cy="11" r="2" />
      </>
    ),
    supervisor: (
      <>
        <path d="M3.5 20.5h17" />
        <rect x="5" y="12" width="3" height="6" rx="0.5" />
        <rect x="10.5" y="8" width="3" height="10" rx="0.5" />
        <rect x="16" y="4" width="3" height="14" rx="0.5" />
      </>
    ),
    admin: (
      <>
        <path d="m12 2.5 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 16.5l9 5 9-5" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {symbols[name]}
    </svg>
  );
}

function Logo() {
  return (
    <Image
      src="/branding/auvrion-biosphere-wordmark.png"
      alt="Auvrion Biosphere"
      width={300}
      height={65}
      className="ab-footer-brand"
    />
  );
}

function Feather({
  name,
}: {
  name: "map" | "chart" | "radio" | "bell" | "users" | "shield";
}) {
  const paths = {
    map: (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18M7 16V9m5 7V6m5 10V4" />
      </>
    ),
    radio: (
      <>
        <circle cx="12" cy="12" r="2" />
        <path d="M7.5 7.5a6.4 6.4 0 0 0 0 9m9-9a6.4 6.4 0 0 1 0 9M4.3 4.3a11 11 0 0 0 0 15.4m15.4-15.4a11 11 0 0 1 0 15.4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 21h4" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2M17 7a3 3 0 0 1 0 6m1 2c2 1 3 2 3 5" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 8 4v6c0 5-3.3 8.3-8 10-4.7-1.7-8-5-8-10V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function BarIllustration() {
  const bars = [27, 49, 65, 42, 77, 56, 85, 34, 67, 53, 79, 46];
  return (
    <div className="ab-bars" aria-hidden="true">
      {bars.map((height) => (
        <span key={height} style={{ height: `${height}%` }} />
      ))}
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="ab-landing" id="atas">
      <LandingMotion />
      <LandingHeader />

      <section
        className="ab-hero"
        id="tentang"
        aria-labelledby="ab-hero-heading"
      >
        <Image
          src="/landing/hero-conservation.webp"
          alt="Lembah hutan tropis dengan burung rangkong, sungai, dan ilustrasi dua perangkat IoT Auvrion"
          fill
          priority
          className="ab-hero-image"
        />
        <div className="ab-hero-mist" aria-hidden="true" />
        <div className="ab-hero-copy" data-reveal>
          <h1 id="ab-hero-heading">
            Memantau,
            <br />
            Melindungi,
            <br />
            <em>Melestarikan.</em>
          </h1>
          <span className="ab-hero-rule" aria-hidden="true" />
          <p className="ab-hero-description">
            Auvrion Biosphere menghubungkan teknologi, data, dan aksi nyata di
            lapangan untuk mendukung pengelolaan lingkungan yang lebih efektif.
          </p>
          <div className="ab-hero-actions">
            <a href="#solusi" className="ab-button ab-button-solid">
              Jelajahi Demo <Arrow />
            </a>
            <a href="#teknologi" className="ab-button ab-button-frost">
              Lihat Teknologi{" "}
              <span className="ab-play-mark" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  aria-hidden="true"
                >
                  <title>Putar video</title>
                  <path d="m9 5 10 7-10 7V5Z" />
                </svg>
              </span>
            </a>
          </div>
        </div>
        <div
          className="ab-hero-annotation ab-hero-annotation-one"
          aria-hidden="true"
        >
          <i />{" "}
          <span>
            LISTEN
            <br />
            <small>Pemantauan akustik lapangan</small>
          </span>
        </div>
        <div
          className="ab-hero-annotation ab-hero-annotation-two"
          aria-hidden="true"
        >
          <i />{" "}
          <span>
            PREVENT
            <br />
            <small>Indikator kondisi lingkungan</small>
          </span>
        </div>
        <div className="ab-hero-bottom-glow" aria-hidden="true" />
      </section>

      <main>
        <section
          className="ab-roles ab-glass-section"
          id="solusi"
          aria-labelledby="ab-roles-heading"
          data-reveal
        >
          <div className="ab-section-top">
            <div>
              <h2 id="ab-roles-heading">Masuk ke Auvrion Biosphere</h2>
            </div>
            <Link href="/request-access" className="ab-inline-link">
              Ajukan akses <Arrow />
            </Link>
          </div>
          <div className="ab-roles-grid">
            {roles.map((role) => (
              <Link
                key={role.title}
                href={`/demo/${role.icon}`}
                aria-label={`Buka workspace ${role.title}`}
                className="ab-role-card"
              >
                <div className="ab-role-icon" aria-hidden="true">
                  <RoleIcon name={role.icon} />
                </div>
                <div className="ab-role-details">
                  <h3>{role.title}</h3>
                  <p>{role.description}</p>
                </div>
                <div className="ab-role-action">
                  <span className="ab-role-link" aria-hidden="true">
                    <Arrow />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section
          className="ab-tech ab-container"
          id="teknologi"
          aria-labelledby="ab-tech-heading"
        >
          <div className="ab-tech-description" data-reveal>
            <h2 id="ab-tech-heading">
              Dua Perangkat,
              <br />
              Satu Ekosistem.
            </h2>
            <p className="ab-muted">
              Dirancang untuk kondisi lapangan yang nyata, terhubung secara
              aman, dan terintegrasi dengan WebGIS serta analitik AI.
            </p>
            <a href="#webgis" className="ab-button ab-button-outline">
              Pelajari Teknologi <Arrow />
            </a>
          </div>
          <div className="ab-tech-visual" data-reveal>
            <Image
              src="/landing/device-exploded.png"
              alt="Ilustrasi komponen internal perangkat PREVENT dan LISTEN, ditampilkan terpisah dalam tampilan exploded-view"
              width={1176}
              height={774}
              sizes="(max-width:900px) 95vw, 64vw"
              className="ab-tech-render"
            />
          </div>
        </section>

        <section
          className="ab-platform ab-glass-section"
          id="webgis"
          aria-labelledby="ab-webgis-heading"
          data-reveal
        >
          <div className="ab-platform-head">
            <div>
              <h2 id="ab-webgis-heading">Dari Lapangan ke Keputusan.</h2>
              <p className="ab-muted">
                Data spasial dan pemetaan Indonesia dalam satu pengalaman
                eksplorasi langsung. Peta dapat digeser, diperbesar, dan
                dipindah wilayahnya.
              </p>
            </div>
          </div>
          <div className="ab-dashboard-grid">
            <section
              className="ab-laptop"
              aria-label="Laptop dengan WebGIS Indonesia interaktif"
            >
              <div className="ab-laptop-lid">
                <div className="ab-laptop-content">
                  <div className="ab-map-topbar">
                    <strong>Peta Observasi</strong>
                  </div>
                  <LandingWebGis />
                </div>
              </div>
              <div className="ab-laptop-base">
                <div />
              </div>
            </section>
            <aside
              className="ab-analytics"
              aria-label="Contoh visual modul analitik, bukan data live"
            >
              <article className="ab-analytics-card">
                <div className="ab-analytics-head">
                  <h3>Indikasi risiko kebakaran</h3>
                  <span>Pratinjau UI</span>
                </div>
                <BarIllustration />
                <div className="ab-analytics-years">
                  <span>Jan</span>
                  <span>Mar</span>
                  <span>Mei</span>
                  <span>Jul</span>
                  <span>Sep</span>
                  <span>Nov</span>
                </div>
              </article>
              <article className="ab-analytics-card">
                <div className="ab-analytics-head">
                  <h3>Komposisi sinyal</h3>
                  <span>Pratinjau UI</span>
                </div>
                <div className="ab-donut-layout">
                  <div className="ab-donut" aria-hidden="true">
                    <span>DEMO</span>
                  </div>
                  <div className="ab-legend">
                    <span>
                      <i />
                      Bioakustik
                    </span>
                    <span>
                      <i />
                      Sensor lingkungan
                    </span>
                    <span>
                      <i />
                      Satelit
                    </span>
                    <span>
                      <i />
                      Verifikasi lapangan
                    </span>
                  </div>
                </div>
              </article>
            </aside>
          </div>
        </section>

        <section
          className="ab-impact ab-glass-section"
          id="dampak"
          aria-labelledby="ab-impact-heading"
          data-reveal
        >
          <div className="ab-impact-copy">
            <h2 id="ab-impact-heading">Dari Pengamatan ke Aksi.</h2>
          </div>
          <div className="ab-impact-facts">
            <div>
              <strong>LISTEN</strong>
              <span>Pemantauan bioakustik</span>
            </div>
            <div>
              <strong>PREVENT</strong>
              <span>Pendukung peninjauan risiko</span>
            </div>
            <div>
              <strong>3 Peran</strong>
              <span>Operator, Supervisor, Ranger</span>
            </div>
            <div>
              <strong>WebGIS</strong>
              <span>Konteks spasial terpadu</span>
            </div>
          </div>
          <div className="ab-impact-photo" aria-hidden="true" />
        </section>

        <section
          className="ab-features ab-container"
          id="sumber-daya"
          aria-labelledby="ab-feature-heading"
        >
          <div className="ab-features-title" data-reveal>
            <h2 id="ab-feature-heading">Dari Data Menjadi Dampak Nyata.</h2>
            <p className="ab-muted">
              Pemantauan, analisis, dan kolaborasi dengan keputusan yang tetap
              dapat ditelusuri oleh manusia.
            </p>
          </div>
          <div className="ab-features-grid" data-reveal>
            {benefits.map((feature) => (
              <article key={feature.title} className="ab-feature">
                <div className="ab-feature-icon">
                  <Feather name={feature.icon} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="ab-collaboration"
          id="kolaborasi"
          aria-labelledby="ab-collaboration-heading"
        >
          <Image
            src="/landing/closing-forest.jpg"
            alt=""
            fill
            className="ab-collaboration-image"
          />
          <div className="ab-collaboration-gradient" aria-hidden="true" />
          <div className="ab-collaboration-body ab-container" data-reveal>
            <div>
              <h2 id="ab-collaboration-heading">
                Kolaborasi untuk
                <br />
                Aksi Nyata di Lapangan.
              </h2>
              <p>
                Terhubung dengan komunitas, pemerintah, dan organisasi untuk
                memperkuat perlindungan lingkungan.
              </p>
              <Link
                href="/request-access"
                className="ab-button ab-button-solid"
              >
                Ajukan Akses <Arrow />
              </Link>
            </div>
            <div className="ab-collaboration-roles">
              <span>
                Komunitas<small>Partisipasi masyarakat</small>
              </span>
              <span>
                Pemerintah<small>Dukungan kebijakan</small>
              </span>
              <span>
                Organisasi<small>Kolaborasi konservasi</small>
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="ab-footer">
        <div className="ab-container ab-footer-layout">
          <div className="ab-footer-about">
            <Logo />
            <p>
              Menghubungkan teknologi, data, dan aksi nyata untuk mendukung
              pengelolaan lingkungan yang lebih efektif.
            </p>
          </div>
          <div>
            <h3>Produk</h3>
            <a href="#webgis">WebGIS</a>
            <a href="#teknologi">Perangkat IoT</a>
            <a href="#sumber-daya">Analitik AI</a>
          </div>
          <div>
            <h3>Perusahaan</h3>
            <a href="#tentang">Tentang</a>
            <a href="#kolaborasi">Kolaborasi</a>
            <Link href="/login">Masuk</Link>
          </div>
          <div>
            <h3>Sumber Daya</h3>
            <a href="#webgis">Eksplorasi Peta</a>
            <Link href="/request-access">Ajukan Akses</Link>
            <a href="#teknologi">Teknologi</a>
          </div>
          <div className="ab-footer-access">
            <h3>Mulai Eksplorasi</h3>
            <p>
              Akses demo publik tanpa akun. Fitur operasional hanya untuk akun
              yang disetujui.
            </p>
            <a href="#webgis" className="ab-footer-cta">
              Jelajahi WebGIS <Arrow />
            </a>
          </div>
        </div>
        <div className="ab-footer-bottom ab-container">
          <span>© 2026 Auvrion Biosphere. Prototipe UINIC 8.0.</span>
        </div>
      </footer>
    </div>
  );
}
