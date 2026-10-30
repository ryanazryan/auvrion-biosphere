# Auvrion — pembersihan audio lama & zona LISTEN

**Tujuan**: untuk database development `auvrion_dev` di komputer pengguna. Bukan untuk dijalankan di hosting/produksi.

## Batas waktu audio

`30 Oktober 2026, 00:00 WITA` = `2026-10-29T16:00:00Z`. Hanya media audio dan data ingest yang **diterima/dibuat** sebelum cutoff yang dipilih; semua audio yang tercatat tanggal 30 Oktober dipertahankan. Observasi dan audit Case tidak dihapus. Tanggal `observed_at` yang berbeda dari `created_at` perlu diperiksa khusus dari hasil audit.

Skrip membersihkan baris `bioacoustic_analysis_snapshots` terkait, `ingestion_recordings`, `evidence_upload_requests`, `evidence_links`, `evidence_media`, dan WAV privat yang terdaftar. Akan membatalkan eksekusi ketika menemukan dependensi database yang belum dipetakan, checksum file tak cocok, file WAV hilang, direktori storage tidak diketahui, atau target bukan DB lokal.

Sebelum menghapus, buat **backup offline** database. Saat berjalan, script juga **mengarsipkan salinan WAV lama** di folder sebelah file backup `auvrion_removed_wav_backup_before_20261030`, lalu menghapus WAV dari penyimpanan live setelah transaksi DB berhasil. File yang tidak terdaftar pada DB tidak dihapus otomatis.

## Instalasi

Ekstrak ZIP di root repo `D:\project\auvrion-biosphere` agar tersedia folder `scripts/maintenance`. Jalankan dengan Git Bash dari root repo.

```bash
# Docker DB local dev harus hidup.
docker exec auvrion-biosphere-dev-db-1 pg_dump -U auvrion_dev -d auvrion_dev -Fc > ../auvrion_pre_cleanup_20261030.backup

# Lihat kandidat pembersihan dahulu (hanya membaca):
node --env-file=.env.local scripts/maintenance/clean-old-audio.mjs

# Eksekusi pembersihan audio dan media sebelum 30 Okt 00:00 WITA:
node --env-file=.env.local scripts/maintenance/clean-old-audio.mjs --execute --backup=../auvrion_pre_cleanup_20261030.backup

# Periksa lokasi LISTEN terakhir yang disetujui (hanya membaca):
node --env-file=.env.local scripts/maintenance/sync-listen-zone.mjs

# HANYA setelah memastikan koordinat/lokasi terbaru benar:
node --env-file=.env.local scripts/maintenance/sync-listen-zone.mjs --execute --backup=../auvrion_pre_cleanup_20261030.backup

# Sembunyikan WC013-DEMO dari pilihan zona jika DB perlu mempertahankan referensi lamanya:
python scripts/maintenance/hide-demo-zone.py
npx biome check --write src/server/workflow/workspace-queries.ts src/server/gis/zone-service.ts
npm run lint && npm run typecheck
```

Kedua skrip Node menggunakan `pg` yang sudah terinstal di root repository. Node v24 mendukung `--env-file`. `.env.local` harus memuat `DATABASE_URL` untuk `auvrion_dev` dan, untuk penghapusan audio, absolute path `PRIVATE_EVIDENCE_DIR` yang berisi WAV; kalau aplikasi memakai file env lain, sediakan nilai yang sama untuk process ini. Jangan memasukkan rahasia env ke dalam chat.

## Perhatian lokasi perangkat

Zona operasi ini adalah polygon radius **500 meter** dari **lokasi instalasi LISTEN terakhir yang telah diverifikasi dan disetujui** dalam `listen_device_installations`, bukan pembacaan GPS realtime. Perangkat boleh dipindahkan, tetapi catatan lokasi instalasinya harus diperbarui dan divalidasi terlebih dahulu. Setelah berpindah, jalankan ulang `sync-listen-zone.mjs` sehingga geometri terbaru dibuat sebagai **versi baru**, sementara versi lama tetap dipertahankan untuk audit. Jangan asumsikan label lama seperti 'Kebun' masih benar jika alat sudah dibawa pulang.

Zona `WC013-DEMO` hanya dihapus ketika tidak memiliki `observation_zone_matches`; jika ada referensi historis, skrip mempertahankan data fisiknya dan skrip `hide-demo-zone.py` menyembunyikannya dari pilihan Operator/Supervisor. Jika ada FK lain tak terduga, transaksi rollback; audit dan konsultasikan dependensi sebelum lanjut.

## Setelah eksekusi

1. Refresh `/supervisor/decisions/<case-id>`; zona `Area Operasional LISTEN ESP32-01` tersedia jika lokasi approved dapat dibaca.
2. Periksa `/operator/observations/<observation-id>` (30 Okt) dan putar WAV untuk memastikan file tetap ada.
3. Periksa observasi sebelum cutoff; audio lama tidak muncul di daftar sumber audio.
4. Verifikasi `npm run typecheck && npm run build` sebelum deploy.

**Tidak ada perubahan terhadap database lokal pengguna hingga skrip dijalankan di komputer mereka**. Skrip ini disiapkan dari skema branch repo yang dapat dilihat, dan memvalidasi asumsi runtime; jika fitur lokal Anda berbeda dari versi GitHub atau ada error, JANGAN paksa `CASCADE`, `DROP CONSTRAINT`, atau menghapus file secara manual. Kirim output error dan auditnya untuk disesuaikan.
