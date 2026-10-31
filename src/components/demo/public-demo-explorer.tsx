"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Map as MapInstance } from "maplibre-gl";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SelectMenu } from "@/components/ui/SelectMenu";

type Region = "Kalimantan" | "Sumatra" | "Jawa" | "Sulawesi" | "Papua";
type Device = "prevent" | "listen";
const regions: Record<Region, [number, number, number]> = {
  Kalimantan: [114.5, -1.8, 5],
  Sumatra: [101.3, -0.8, 4.5],
  Jawa: [110.4, -7.3, 6],
  Sulawesi: [121, -2.1, 5],
  Papua: [137.2, -3.9, 4.5],
};
const deviceInfo = {
  prevent: {
    title: "PREVENT",
    subtitle: "Pemantauan risiko lingkungan",
    image: "/device-illustrations/prevent-device.png",
    details: [
      "Referensi hotspot satelit",
      "Kondisi lingkungan",
      "Tinjauan petugas lapangan",
    ],
  },
  listen: {
    title: "LISTEN",
    subtitle: "Observasi akustik berbasis IoT",
    image: "/device-illustrations/listen-device.png",
    details: [
      "Rekaman suara lingkungan",
      "Bantuan analisis bioakustik",
      "Verifikasi manusia",
    ],
  },
} as const;

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}

/** Lightweight 3D illustration; not a CAD model. No WebGL, GLTF, or 3D library loaded. */
function DeviceTurntable({ device }: { device: Device }) {
  const [angle, setAngle] = useState({ x: -16, y: -28 });
  const drag = useRef<{ x: number; y: number; ax: number; ay: number } | null>(
    null,
  );
  const details = deviceInfo[device];
  return (
    <div className="relative isolate overflow-hidden rounded-[28px] border border-emerald-900/10 bg-[radial-gradient(circle_at_50%_30%,#f8fffa_0%,#dcece4_53%,#c9ddd2_100%)] p-5 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_95%,#2a644510_95%),linear-gradient(90deg,transparent_95%,#2a644510_95%)] bg-size-[26px_26px]" />
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold tracking-[0.16em] text-emerald-900/65">
        <span>PERANGKAT · VISUALISASI KONSEP</span>
        <span>DRAG UNTUK MEMUTAR 360°</span>
      </div>
      <div
        className="relative mx-auto mt-3 flex h-56 max-w-[420px] touch-none cursor-grab items-center justify-center active:cursor-grabbing sm:h-72"
        onPointerDown={(event) => {
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            ax: angle.x,
            ay: angle.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          setAngle({
            x: Math.max(
              -55,
              Math.min(
                55,
                drag.current.ax - (event.clientY - drag.current.y) * 0.4,
              ),
            ),
            y: drag.current.ay + (event.clientX - drag.current.x) * 0.55,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div className="absolute bottom-4 h-10 w-56 rounded-full bg-emerald-950/20 blur-xl" />
        <div
          className="relative h-40 w-52 sm:h-44 sm:w-60"
          style={{ perspective: "850px" }}
        >
          <div
            className="absolute inset-0 transition-transform duration-75 motion-reduce:transition-none"
            style={{
              transformStyle: "preserve-3d",
              transform: `rotateX(${angle.x}deg) rotateY(${angle.y}deg)`,
            }}
          >
            <div
              className="absolute inset-0 flex items-center justify-center rounded-[26px] border border-emerald-950/15 bg-linear-to-br from-white via-[#edf5f1] to-[#bdcfc6] shadow-[0_26px_38px_#0b35252b]"
              style={{
                transform: "translateZ(36px)",
                backfaceVisibility: "hidden",
              }}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="grid size-12 place-items-center rounded-2xl bg-emerald-900 text-2xl font-bold text-white">
                  A
                </div>
                <strong className="text-xl tracking-tight text-emerald-950">
                  Auvrion
                </strong>
                <span className="text-[10px] font-semibold tracking-[0.2em] text-emerald-950/60">
                  {details.title} · IoT
                </span>
              </div>
            </div>
            <div
              className="absolute inset-0 rounded-[26px] border border-emerald-950/20 bg-[#a8c4b5]"
              style={{
                transform: "rotateY(180deg) translateZ(36px)",
                backfaceVisibility: "hidden",
              }}
            />
            <div
              className="absolute inset-y-0 left-0 w-[72px] origin-left rounded-l-xl bg-[#9cb7a8]"
              style={{ transform: "translateZ(-36px) rotateY(-90deg)" }}
            />
            <div
              className="absolute inset-y-0 right-0 w-[72px] origin-right rounded-r-xl bg-[#a5beb0]"
              style={{ transform: "translateZ(-36px) rotateY(90deg)" }}
            />
            <div
              className="absolute inset-x-0 top-0 h-[72px] origin-top rounded-t-xl bg-white"
              style={{ transform: "translateZ(-36px) rotateX(90deg)" }}
            />
            <div
              className="absolute inset-x-0 bottom-0 h-[72px] origin-bottom rounded-b-xl bg-[#8ca79a]"
              style={{ transform: "translateZ(-36px) rotateX(-90deg)" }}
            />
          </div>
        </div>
      </div>
      <div className="relative z-10 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setAngle((a) => ({ ...a, y: a.y - 45 }))}
          className="rounded-full border border-emerald-950/20 bg-white/80 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-white"
          aria-label="Putar ke kiri"
        >
          ← Putar
        </button>
        <button
          type="button"
          onClick={() => setAngle({ x: -16, y: -28 })}
          className="rounded-full border border-emerald-950/20 bg-white/80 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-white"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => setAngle((a) => ({ ...a, y: a.y + 45 }))}
          className="rounded-full border border-emerald-950/20 bg-white/80 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-white"
          aria-label="Putar ke kanan"
        >
          Putar →
        </button>
      </div>
      <p className="relative z-10 mt-4 text-center text-xs leading-5 text-emerald-950/70">
        Model 3D ilustratif, bukan rekonstruksi akurat komponen hardware. Bentuk
        perangkat aktual ditunjukkan pada foto ilustrasi di samping.
      </p>
    </div>
  );
}

export function PublicDemoExplorer() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const [region, setRegion] = useState<Region>("Kalimantan");
  const [mapFailed, setMapFailed] = useState(false);
  const [device, setDevice] = useState<Device>("prevent");
  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    let active: MapInstance | null = null;
    void import("maplibre-gl")
      .then((maplibregl) => {
        if (disposed || !container.current) return;
        maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
        const instance = new maplibregl.Map({
          container: container.current,
          style:
            process.env.NEXT_PUBLIC_AUVRION_BASEMAP_STYLE_URL?.trim() ||
            "https://tiles.openfreemap.org/styles/liberty",
          center: [114.5, -1.8],
          zoom: 5,
          attributionControl: { compact: true },
        });
        instance.addControl(new maplibregl.NavigationControl(), "top-right");
        instance.on("error", () => {
          if (!disposed) setMapFailed(true);
        });
        active = instance;
        map.current = instance;
      })
      .catch(() => {
        if (!disposed) setMapFailed(true);
      });
    return () => {
      disposed = true;
      active?.remove();
      if (map.current === active) map.current = null;
    };
  }, []);
  function navigate(next: Region) {
    setRegion(next);
    const [longitude, latitude, zoom] = regions[next];
    map.current?.flyTo({
      center: [longitude, latitude],
      zoom,
      essential: false,
      duration: 900,
    });
  }
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f3f8f5] text-[#102a22]">
      <div className="relative overflow-hidden bg-[#103b2c] text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_88%_30%,#56a67f80,transparent_48%),radial-gradient(ellipse_at_10%_100%,#40946c66,transparent_50%),linear-gradient(130deg,#0b2c23,#164633_60%,#0c2921)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 top-28 size-96 rounded-full border border-white/10 shadow-[0_0_0_60px_#ffffff08,0_0_0_120px_#ffffff06]"
        />
        <nav className="relative z-10 mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8">
          <Link
            href="/demo"
            className="flex items-center gap-2 text-lg font-bold tracking-tight"
          >
            <span className="grid size-8 place-items-center rounded-full bg-[#72d2a0] text-[#073c2a]">
              ✦
            </span>
            Auvrion<span className="font-normal text-[#a1e3bc]">Biosphere</span>
          </Link>
          <div className="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm">
            <a
              href="#webgis"
              className="hidden text-white/80 hover:text-white sm:block"
            >
              WebGIS
            </a>
            <a
              href="#teknologi"
              className="hidden text-white/80 hover:text-white sm:block"
            >
              Teknologi
            </a>
            <Link
              href="/login"
              className="rounded-full border border-white/25 px-4 py-2 hover:bg-white/10"
            >
              Masuk
            </Link>
            <Link
              href="/request-access"
              className="rounded-full bg-[#b3eec9] px-4 py-2 font-semibold text-[#073c2a] transition hover:bg-white"
            >
              Ajukan Akses <Arrow />
            </Link>
          </div>
        </nav>
        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:pb-24 lg:pt-20">
          <div className="motion-safe:animate-[fade-in_650ms_ease-out_both]">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#9debc0]/35 bg-white/10 px-4 py-2 text-xs font-semibold tracking-[0.12em] text-[#b6f1d0]">
              <span className="size-2 rounded-full bg-[#7ce0a2]" /> DEMO PUBLIK
              · READ ONLY
            </span>
            <h1 className="mt-7 max-w-2xl text-[clamp(2.6rem,6vw,5.4rem)] font-bold leading-[1.04] tracking-[-0.055em]">
              Memantau.
              <br />
              Melindungi.
              <br />
              <span className="text-[#91dcb1]">Melestarikan.</span>
            </h1>
            <p className="mt-6 max-w-lg text-sm leading-7 text-white/75 sm:text-base">
              Jelajahi cara Auvrion Biosphere menghubungkan pemantauan
              lingkungan, teknologi IoT, WebGIS, dan verifikasi manusia—tanpa
              membuka akses ke sistem operasional.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#webgis"
                className="rounded-full bg-[#b3eec9] px-6 py-3 text-sm font-bold text-[#0b3828] transition hover:-translate-y-0.5 hover:bg-white"
              >
                Jelajahi Demo <Arrow />
              </a>
              <a
                href="#teknologi"
                className="rounded-full border border-white/35 px-6 py-3 text-sm font-semibold transition hover:bg-white/10"
              >
                Lihat Teknologi
              </a>
            </div>
          </div>
          <div className="relative isolate motion-safe:animate-[fade-in_900ms_ease-out_both]">
            <div className="relative mx-auto max-w-xl rounded-[36px] border border-white/20 bg-white/10 p-4 shadow-[0_30px_80px_#031b1566] backdrop-blur-sm sm:p-6">
              <div className="rounded-[25px] bg-white p-5 text-[#123a2a] sm:p-8">
                <p className="text-xs font-bold tracking-[0.19em] text-emerald-700">
                  MONITORING ECOSYSTEM
                </p>
                <p className="mt-2 text-2xl font-bold">LISTEN + PREVENT</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="flex min-h-48 flex-col justify-between rounded-2xl bg-[#e3f1e9] p-3">
                    <Image
                      src="/device-illustrations/listen-device.png"
                      alt="Ilustrasi perangkat LISTEN dari aset Auvrion"
                      width={400}
                      height={300}
                      className="h-32 w-full object-contain transition-transform duration-500 hover:scale-105"
                    />
                    <span className="text-center text-xs font-bold tracking-widest">
                      LISTEN
                    </span>
                  </div>
                  <div className="flex min-h-48 flex-col justify-between rounded-2xl bg-[#e3f1e9] p-3">
                    <Image
                      src="/device-illustrations/prevent-device.png"
                      alt="Ilustrasi perangkat PREVENT dari aset Auvrion"
                      width={400}
                      height={300}
                      className="h-32 w-full object-contain transition-transform duration-500 hover:scale-105"
                    />
                    <span className="text-center text-xs font-bold tracking-widest">
                      PREVENT
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-emerald-950/65">
                  <span className="size-2 rounded-full bg-emerald-600" />{" "}
                  Ilustrasi perangkat · bukan telemetri langsung
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section
        className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24"
        aria-label="Alur operasional"
      >
        <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_.8fr]">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Dari lapangan
            <br />
            ke keputusan.
          </h2>
          <p className="max-w-xl text-sm leading-7 text-[#5d7369]">
            Setiap peran memiliki izin tersendiri. Demo ini menjelaskan alurnya,
            bukan memberi hak akses otomatis atau memperlihatkan informasi
            organisasi.
          </p>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {(
            [
              [
                "01",
                "Operator",
                "Mengamati, menelaah sumber informasi, dan mengajukan observasi.",
              ],
              [
                "02",
                "Supervisor",
                "Meninjau, mengambil keputusan, dan menugaskan pemeriksaan.",
              ],
              [
                "03",
                "Ranger",
                "Memverifikasi di lokasi dan mengunggah bukti lapangan.",
              ],
            ] as const
          ).map(([number, title, description]) => (
            <article
              key={title}
              className="group rounded-[25px] border border-[#dce9df] bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <span className="text-xs font-bold tracking-widest text-emerald-600">
                {number} / WORKFLOW
              </span>
              <h3 className="mt-9 text-2xl font-bold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#5d7369]">
                {description}
              </p>
              <div className="mt-7 flex items-center justify-between border-t border-[#e9f0ea] pt-4 text-xs font-semibold text-emerald-800">
                <span>Akses melalui persetujuan Admin</span>
                <Arrow diagonal />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="teknologi" className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-emerald-700">
                TEKNOLOGI LAPANGAN
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Dua perangkat.
                <br />
                Satu ekosistem.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[#607268]">
                Putar model ilustratif secara interaktif. Efek 3D menggunakan
                CSS tanpa mengunduh mesin 3D atau model berukuran besar.
              </p>
            </div>
            <div className="flex rounded-full bg-[#e9f2ec] p-1">
              <button
                type="button"
                aria-pressed={device === "prevent"}
                onClick={() => setDevice("prevent")}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${device === "prevent" ? "bg-[#0d503b] text-white shadow-md" : "text-emerald-900 hover:bg-white/70"}`}
              >
                PREVENT
              </button>
              <button
                type="button"
                aria-pressed={device === "listen"}
                onClick={() => setDevice("listen")}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${device === "listen" ? "bg-[#0d503b] text-white shadow-md" : "text-emerald-900 hover:bg-white/70"}`}
              >
                LISTEN
              </button>
            </div>
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
            <DeviceTurntable key={device} device={device} />
            <div className="flex flex-col justify-between rounded-[28px] border border-[#e1ebe5] bg-[#f7faf8] p-6 sm:p-8">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] text-emerald-700">
                  {deviceInfo[device].title}
                </p>
                <h3 className="mt-3 text-2xl font-bold">
                  {deviceInfo[device].subtitle}
                </h3>
                <Image
                  src={deviceInfo[device].image}
                  alt={`Ilustrasi perangkat ${deviceInfo[device].title}`}
                  width={600}
                  height={450}
                  className="mx-auto my-5 h-40 w-full object-contain"
                />
                <ul className="space-y-3">
                  {deviceInfo[device].details.map((label) => (
                    <li
                      key={label}
                      className="flex items-center gap-3 text-sm text-[#506c5f]"
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#deefe4] text-emerald-700">
                        ✓
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-6 border-t border-[#dce8df] pt-4 text-xs leading-5 text-[#687b71]">
                Perangkat ditampilkan sebagai ilustrasi konsep. Data operasional
                memerlukan autentikasi dan otorisasi.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="webgis"
        className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24"
      >
        <p className="text-xs font-bold tracking-[0.2em] text-emerald-700">
          PLATFORM · WEBGIS
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Jelajahi peta Indonesia.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5d7369]">
          Peta dasar interaktif untuk mengenal cakupan geografis platform. Tidak
          menampilkan titik hotspot langsung, posisi Ranger, maupun observasi
          privat.
        </p>
        <div className="mt-7 overflow-hidden rounded-[28px] border border-[#dce8df] bg-white shadow-[0_25px_75px_#0b3e2720]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e2ece5] p-4 sm:px-6">
            <div>
              <h3 className="font-bold">Eksplorasi wilayah</h3>
              <p className="text-xs text-[#708378]">
                Basemap OpenFreeMap / OpenStreetMap
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium text-[#5d7369]">Wilayah</span>
              <SelectMenu
                label="Pilih wilayah peta"
                value={region}
                onChange={navigate}
                options={(Object.keys(regions) as Region[]).map((value) => ({
                  value,
                  label: value,
                }))}
                className="w-44"
              />
            </div>
          </div>
          <div
            ref={container}
            className="h-[420px] w-full bg-[#dcece3] sm:h-[510px]"
            role="img"
            aria-label="Peta dasar interaktif wilayah Indonesia tanpa titik insiden"
          />
          {mapFailed && (
            <p role="status" className="px-5 py-3 text-sm text-[#596f62]">
              Sebagian data peta tidak dapat dimuat. Periksa koneksi ke penyedia
              tiles.
            </p>
          )}
          <p className="border-t border-[#e2ece5] px-5 py-4 text-xs leading-6 text-[#687b71]">
            Peta dasar publik saja. Indikator NASA FIRMS, BMKG, rekaman LISTEN,
            data organisasi, dan hasil pemeriksaan lapangan tidak dibuka pada
            demo ini. Anomali satelit tidak sama dengan kejadian kebakaran
            terverifikasi.
          </p>
        </div>
      </section>
      <section className="bg-[#103b2c] py-16 text-white sm:py-20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-5 sm:px-8">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-[#91dcb1]">
              KOLABORASI UNTUK KONSERVASI
            </p>
            <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
              Siap menjelajahi lebih dalam?
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-white/70">
              Ajukan akses dengan email Anda. Setelah verifikasi, Admin akan
              meninjau dan menetapkan role. Demo tidak membuat akun operasional.
            </p>
          </div>
          <Link
            href="/request-access"
            className="rounded-full bg-[#b3eec9] px-6 py-3 font-bold text-[#0b3828] transition hover:-translate-y-0.5 hover:bg-white"
          >
            Ajukan Akses <Arrow />
          </Link>
        </div>
      </section>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-[#64796e] sm:px-8">
        <span>© 2026 Auvrion Biosphere · Prototype kompetisi</span>
        <div className="flex gap-5">
          <Link href="/login" className="hover:text-emerald-800">
            Masuk
          </Link>
          <Link href="/request-access" className="hover:text-emerald-800">
            Ajukan akses
          </Link>
          <a href="#webgis" className="hover:text-emerald-800">
            WebGIS
          </a>
        </div>
      </footer>
    </main>
  );
}
