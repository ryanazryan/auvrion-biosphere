# UINIC 8.0 — Demo Admin Auvrion Biosphere

**Akses:** `/demo/admin`, tanpa login. Gunakan navigasi sidebar untuk permohonan, pengguna, perangkat, dan peta.

Demo ini memakai komponen tampilan Admin asli, tetapi seluruh data permohonan, pengguna, perangkat, dan koordinat contoh bersifat **sintetis**. Aksi demo hanya mengubah state memori browser; tidak ada akun dibuat, tidak ada email dikirim, tidak ada DB atau perangkat nyata yang diubah. Layanan peta masih membutuhkan koneksi basemap publik. Data demo akan kembali ke contoh awal setelah halaman dimuat ulang.

Untuk menguji workflow operasional yang sesungguhnya, gunakan Request Access, email verification, Admin approval, aktivasi, lalu MFA. **Jangan memberikan kredensial Admin production kepada juri.**

## QA wajib sebelum deployment

- Mode guest: navigasi semua halaman `/demo/admin/*` tanpa sesi Admin.
- Mode guest: Developer Tools Network tidak boleh menghasilkan request ke `/api/admin/*`.
- Mode guest: tombol approve, reject, assign role, dan tambah perangkat hanya mengubah state demo, bukan database.
- Mode guest: link detail perangkat serta pengelolaan lokasi tidak boleh menuju `/admin/*`.
- Mode guest: halaman `admin/*` sebenarnya tetap 401/403 atau redirect tanpa izin & MFA.
- Gunakan data dan koordinat **sintetis**, bukan data lokasi perangkat rahasia.
- Jalankan lint, typecheck, test, build, dan verifikasi respons tidak menyimpan token / password.
