# Auvrion Biosphere — Evidence Display & Handoff Repair Kit

**Patch lokal kandidat (label WC026 untuk paket ini, belum dianggap Work Control resmi di Notion).**
Target: baseline source `develop` sekitar 26 Oktober 2026 + perubahan lokal owner pada branch `fix/ab-wc-025-mfa-recovery-ranger-aqi`.

## Mengapa perbaikan ini diperlukan

- `environmental_measurements.measured_value` tersimpan sebagai Postgres NUMERIC(16,6), sehingga `34.5` kembali dari API sebagai `34.500000`. Nilai mentah tetap dipertahankan untuk akurasi dan audit; UI menampilkan `34,5`.
- Panel Analisis lingkungan sebelumnya mengunci `WITA` untuk waktu unduh BMKG dan menampilkan berlaku BMKG/terakhir NASA sebagai ISO UTC. Kini seluruh timestamp panel mengikuti **preferensi WIB/WITA/WIT** dari header Operator.
- NASA FIRMS dinyatakan sebagai *titik anomali termal dalam rentang waktu*, dan waktu terakhir ditampilkan lokal bila tersedia. Nol deteksi **tidak** menjamin tidak ada kebakaran.
- `WC009-MANUAL-DEV` adalah **kode sumber manual yang didaftarkan organisasi**; bukan ESP32 maupun data BMKG. `sourceRecordId` = **identitas rekaman pada sumber**; untuk manual berarti ID rekaman/entri manual, bukan selalu berkas WAV.
- Operator membuat observasi manual. IoT LISTEN (WAV) memakai `POST /api/device/recordings` dan membuat observasi biodiversitas terkait pada backend yang ada. **IoT PREVENT lingkungan belum dilengkapi ingestion pembacaan otomatis oleh paket ini.**
- Status `quality=unreviewed` adalah kualitas data; transisi Case (WC-012) **tidak** otomatis mengubah kualitas.
- Supervisor dan Ranger sebelumnya melihat metadata tipis saja. Patch menambahkan bukti ringkas berdasarkan ID observasi yang sudah terkait Case dan lolos otorisasi/tenant-scoping.

## Implementasi dalam paket

1. `src/figma-operator/gis/observation-evidence-display.ts` — helper angka, tanggal, label sumber, label mode (baru).
2. `src/figma-operator/gis/observation-evidence-display.test.ts` — tes format angka, waktu dan sumber (baru).
3. `src/figma-operator/screens/operator/ObservationDetail.tsx` — format pengukuran, identitas sumber, kualitas, keterangan lokasi.
4. `src/figma-operator/demo/EnvironmentalAdvisory.tsx` — BMKG/NASA lokal, ringkasan sensor yang tidak misleading, nilai terformat.
5. `src/server/workflow/observation-evidence.ts` — read-only projection tenant-scoped **tanpa lintang/bujur/titik presisi/URL privat**, dibatasi 50 observasi dan 6 pengukuran per observasi (baru).
6. `src/server/workflow/workspace-queries.ts` — Supervisor mengambil projection terkait Case.
7. `src/app/supervisor/decisions/[id]/page.tsx` — bukti dan batasan untuk keputusan Supervisor.
8. `src/server/ranger/ranger-case-observations.ts` — projection hanya sesudah verifikasi tugas milik Ranger bersangkutan.
9. `src/app/ranger/tasks/[id]/page.tsx` — rincian suhu/satuan, asal manual vs IoT, simulasi, batasan dan penjelasan Operational Zone.

**Paket tidak membuat perubahan database, tidak mengubah kontrak device upload, tidak membuat Case otomatis, tidak menyisipkan data sensor palsu, dan tidak mengizinkan akses koordinat yang sebelumnya ditahan.**

## Cara pakai pada Windows / Git Bash

Dari root repo `/d/project/auvrion-biosphere`:

```bash
# 1. Cek working tree dan siapkan branch sesuai prosedur tim.
git status -sb

# 2. Extract isi ZIP ke root repo (folder scripts/ dan docs/).
# Jangan unzip dengan mode yang menimpa file aplikasi secara langsung.

# 3. Dry-run memvalidasi anchor dan file; tidak ada perubahan:
python scripts/apply-wc026-evidence-handoff.py --check

# 4. Apply, dengan backup di dalam .git/wc026-evidence-backup/:
python scripts/apply-wc026-evidence-handoff.py --apply

# 5. Format kode otomatis sesuai Biome repo:
npx biome check --write \
  src/figma-operator/gis/observation-evidence-display.ts \
  src/figma-operator/gis/observation-evidence-display.test.ts \
  src/figma-operator/screens/operator/ObservationDetail.tsx \
  src/figma-operator/demo/EnvironmentalAdvisory.tsx \
  src/server/workflow/observation-evidence.ts \
  src/server/workflow/workspace-queries.ts \
  'src/app/supervisor/decisions/[id]/page.tsx' \
  src/server/ranger/ranger-case-observations.ts \
  'src/app/ranger/tasks/[id]/page.tsx'

# 6. Gates:
npm run lint
npm run typecheck
npx vitest run src/figma-operator/gis/observation-evidence-display.test.ts
npm test
npm run build
git diff --check
git status -sb
```

Jika `--check` menolak *anchor mismatch*, **jangan paksa** atau melakukan overwrite manual. File lokalmu mungkin telah berubah dari baseline `develop` dan perlu patch ulang berdasarkan konten sebenarnya. `--check` dan `--apply` harus dijalankan **sekali**, karena installer sengaja tidak menimpa helper yang sudah ada.

## Rollback (jika diperlukan)

Backup otomatis disimpan di `.git/wc026-evidence-backup/<UTC>/` untuk enam file asli. File baru belum ada di backup. Jika belum commit, kamu juga bisa memakai `git diff` dan restore file terpilih secara hati-hati. Jangan menghapus/restore perubahan WC025 milikmu sendiri secara massal.

## Acceptance tests manual

1. **Operator detail observasi simulasi** `/operator/observations/[id]`: suhu `34.500000` tampil `34,5 °C` di tabel dan kartu Analisis. `sourceRecordId` dijelaskan sebagai ID sumber, bukan file audio.
2. Di header pilih **WIB → WITA → WIT**: waktu berlaku BMKG, waktu diperiksa, dan waktu deteksi satelit berganti sesuai preferensi. UTC dari API tidak berubah.
3. **Supervisor Case** `/supervisor/decisions/[id]`: tampil *source kind*, mode `simulation`, ID rekaman sumber, suhu, provenance, limitations, dan keterangan lokasi dibatasi. Tidak tampil koordinat presisi.
4. **Ranger Task** `/ranger/tasks/[id]`: hanya ranger penerima yang bisa membaca ringkasan bukti Case. Jangan ada lintang/bujur, lokasi privat, dan media privat yang bocor.
5. **Unauthorized tests**: Ranger lain/tidak punya penugasan tak boleh melihat detail observasi; Supervisor dari organisasi lain tidak boleh melihat Case. Konfirmasi hasil otorisasi via response HTTP.
6. **IoT LISTEN**: rekaman WAV yang benar-benar di-upload menghasilkan observasi biodiversitas terpisah (bukan ditambahkan secara fiktif ke kartu BMKG/NASA).

## Fitur yang dengan sengaja BELUM dilaksanakan

### Pin koordinat presisi / mini-map titik

API Operator `GET observation detail` memang sengaja menyembunyikan latitude/longitude. Karena ini guard privasi, paket **tidak** mengambil koordinat lewat akses SQL yang dilebarkan ke client dan **tidak** menganggap `WC013-DEMO` sama dengan lokasi observasi. Perlu `location-disclosure` policy terpisah: explicit grants/role, public-vs-sensitive species classification, zone-scoped authorization, audit akses, sanitized responses, map clustering/coarsening, E2E adversarial tests. Sampai kebijakan selesai, UI menjelaskan bahwa titik disimpan tetapi ditahan.

### BMKG/NASA dalam bukti keputusan Supervisor

Panel BMKG/NASA sebelumnya berasal dari endpoint Operator untuk **region demo server**, bukan evidence snapshot yang pasti terkait titik observasi. Menyalin data mutakhir langsung ke Case historis akan misleading. Implementasi berikutnya memerlukan snapshot per observation/context dengan as-of timestamp, coverage, URL source, provenance, dan role-safe read. Paket ini meneruskan **observasi yang tersimpan** saja, tidak memindahkan BMKG/NASA seolah-olah pengukuran di titik kejadian.

### PREVENT ESP32 (BME280/PMS5003) otomatis

Perlu device protocol terautentikasi, idempotency, replay protection, timestamp quality, calibrations, measurement units, raw readings storage and compact aggregation, observation creation policy, UI monitoring, tests and hardware acceptance. Sensor readings **tidak** otomatis mengonfirmasi karhutla; operator membuat Case hanya setelah review manusia.

### Kualitas `unreviewed`

Kualitas data tidak berubah melalui AB-TR-010–013 yang mengatur Case. Workflow review kualitas memerlukan aksi review terpisah dan kebijakan audit. Karena itu, label *Belum ditinjau* dapat tetap ada meskipun Case sudah `assigned`.

## Keamanan

Paket tidak mengubah `.env.local`, migration, role policy, device credential, API upload, maupun data store. Hanya query read-only tambahan setelah otorisasi Case/Task yang sudah ada. Lakukan E2E lintas peran sebelum PR atau produksi; unit tests formatter **bukan** pengganti DB/integration security tests.

## Catatan kualitas kandidat

- Installer berhasil diuji `--check` + `--apply` pada repositori sintetis untuk memastikan preflight sebelum penulisan dan pembuatan backup; ini **bukan pengganti** tes pada branch pengguna.
- File TypeScript baru lolos pemeriksaan sintaks lewat TypeScript transpiler dan uji fungsi dasar formatter WITA/WIB/WIT.
- Perubahan 6 berkas existing bergantung pada anchor kode develop per 26 Okt 2026, sehingga local branch bisa berbeda. Jika preflight gagal, file asli **tidak** dimodifikasi.
- Folder `reference/generated-files` berisi 3 source file baru untuk audit manual. Tidak perlu disalin secara terpisah karena installer otomatis membuatnya. Jangan stage folder `reference/` saat commit kode aplikasi.
- Halaman Supervisor/Ranger yang masih menggunakan format WITA statis tidak otomatis mendapat preferensi zona waktu akun dari patch ini. Panel referensi Operator mengikuti pilihan header WIB/WITA/WIT.
