# AUVRION BIOSPHERE — LISTEN V2 Compact Enclosure

**Tanggal:** 4 November 2026  
**Status:** desain CAD prototipe, **lolos pemeriksaan solid dan watertight STL**, **belum fit-test fisik**, **tidak IP-rated**.  
**Referensi visual:** UI LISTEN terbaru dan logo resmi yang diberikan pemilik proyek.  
**Target aplikasi:** `ryanazryan/auvrion-biosphere`, firmware `firmware/listen-esp32`.  
**Satuan:** **mm**.

## 1. Desain dan ukuran

| Item | Dimensi / keterangan |
|---|---|
| Enclosure luar tanpa mast | 126 x 124 x 53,5 mm (lebar x tinggi x kedalaman) |
| Tinggi vertikal keseluruhan dengan mast dan kaki | ±161,6 mm (dari ujung kaki y=-65,8 ke ujung mast y=95,8) |
| Dua mast kosmetik | panjang total ±41 mm termasuk peg, diameter stem 6,7 mm |
| Radius sudut bodi | 15,5 mm |
| Ketebalan dinding / belakang | 3,4 mm |
| Lid polos | 4,0 mm + alignment skirt 4,6 mm |
| Logo relief | tinggi 0,72 mm di atas cover; skala wordmark ±96 mm lebar |
| Tray elektronik | 112 x 106 x 2,8 mm |
| Ruang powerbank dalam CAD | 84 x 58 x 18 mm, **ini clearance, bukan dimensi merek tertentu** |
| Ukuran powerbank target pembelian | **maksimal 80 x 54 x 17 mm** untuk toleransi kabel dan pemasangan; ukur dahulu |
| Mini breadboard | 170 tie-point, ±47 x 35 x 9 mm |
| ESP32 DevKit V1 30 pin | envelope 53 x 29 x 11 mm, cocokkan dengan fisik yang dimiliki |
| RTC DS3231 | envelope 38 x 22 x 14 mm (modul umum; clone bisa berbeda) |
| MicroSD SPI module | envelope awal 42 x 24 x 11 mm (perlu verifikasi) |
| INMP441 I2S | 14 x 14 mm; panduan terpasang di sisi bawah, bukan di atas tray |
| Outlet akustik mic | bore Ø2,9 mm pada dinding bawah, counterbore membran Ø6,9 mm |
| USB servis ESP32 | bukaan generik 19 x 11 mm di sisi kiri; **bukan port panel presisi** |
| Powerbank cable pass-through | bukaan generik 17 x 9 mm di sisi bawah |
| Pengunci penutup | 4 sekrup M3 (self-tapping plastik) dari sisi samping |
| Dudukan tray | 4 sekrup M3 (pilot 2,64 mm pada pilar) |

**Perbedaan dari desain V1:** desain baru mengikuti preview UI (rounded square), bukan ilustrasi exploded V1 yang jauh lebih panjang. ESP32 dipasang **di tray**, bukan pada mini breadboard 170-point. Breadboard mini hanya menjadi area sambungan jumper.

## 2. FILE CAD dan orientasi cetak

### Untuk FreeCAD / modifikasi

- `STEP_CAD/00_LISTEN_V2_FULL_ASSEMBLY.step` — assembly semua komponen, logo relief sudah berada pada penutup.
- `STEP_CAD/02B_LID_EMBOSSED_SINGLE_COLOR.step` — penutup dengan relief menyatu, lebih mudah dicetak satu warna.
- `STEP_CAD/01_LISTEN_BASE.step`, `02_LISTEN_FRONT_LID.step`, `03_LISTEN_TRAY.step`, dll — komponen individual.
- `STEP_CAD/09_ELECTRONICS_FIT_REFERENCE_NOT_FOR_PRINT.step` — visualisasi envelope komponen (jangan dicetak).
- `FREECAD/IMPORT_ASSEMBLY_TO_FCSTD.FCMacro` — helper untuk FreeCAD menyimpan assembly STEP ke FCStd lokal.
- `FREECAD/generate_listen_v2.py` — **source parametrik** untuk menghasilkan ulang CAD. Membutuhkan Python + CadQuery + OpenCV + Pillow + trimesh.

**Di FreeCAD 1.1.4:** File > Open > pilih `00_LISTEN_V2_FULL_ASSEMBLY.step` > biarkan opsi STEP standar > OK > tekan `V` lalu `F` > File > Save As > `AUVRION_LISTEN_V2_COMPACT.FCStd`. FCStd hasil import adalah solid yang bisa dimodifikasi via operasi Part; riwayat sketch CadQuery aslinya tidak menjadi feature history otomatis. Untuk mengubah dimensi parameter, sunting generator Python dan jalankan ulang.

### UNTUK JASA CETAK 3D (pakai file diawali `PRINT_`)

| File | Jumlah | Warna | Status |
|---|---:|---|---|
| `PRINT_01_CASE_BASE.stl` | 1 | putih | WAJIB |
| `PRINT_02B_EMBOSSED_LID_ONE_COLOR.stl` | 1 | putih | WAJIB, opsi mudah. Relief logo dicat sesudah cetak |
| `PRINT_03_ELECTRONICS_TRAY.stl` | 1 | putih / hijau | WAJIB |
| `PRINT_04_COSMETIC_MAST_PRINT_2.stl` | 2 | hitam | OPSIONAL sesuai mockup (tidak berfungsi RF) |
| `PRINT_05_BOTTOM_FOOT_PRINT_2.stl` | 2 | hitam | OPSIONAL sesuai mockup |
| `PRINT_06_OPTIONAL_MAST_PLUG_PRINT_2.stl` | 2 | putih | OPSIONAL jika mast tidak dipasang |

**Jangan cetak `PRINT_02_PLAIN_LID.stl` bersamaan dengan `PRINT_02B_EMBOSSED_LID_ONE_COLOR.stl` untuk satu perangkat.** Keduanya alternatif. Untuk hasil dua warna, konsultasikan multi-material/painting dengan vendor. `07_BRANDING_GREEN.stl` dan `08_BRANDING_DARK.stl` adalah elemen relief alternatif untuk assembly dua warna, bukan komponen kecil yang harus dicetak sendiri lalu dilem satu-satu.

Bagian print-ready sudah dirotasi/ditranslasi agar dasar geometri berada di Z=0. MAST memiliki tapak kecil sehingga disarankan brim. Periksa ulang orientasi di slicer, khususnya part lid relief yang dicetak **logo menghadap bed** sehingga relief dapat dicat setelah dicetak.

Rekomendasi awal **FDM PETG**: nozzle 0,4 mm, layer 0,20 mm (logo lebih halus pada 0,12–0,16 mm), 4 perimeter, 5 top/bottom layers, infill 20–25%, brim untuk mast. Pastikan tray/side hole dan guide mikrofon tidak membutuhkan support lokal. Setting final tergantung printer & filamen vendor.

## 3. Daftar komponen/aksesoris tambahan

| Jumlah | Item | Catatan |
|---:|---|---|
| 1 | Breadboard mini SYB-170 170 titik | 47 x 35 x ±9 mm |
| 1 | Powerbank mini USB output 5V | **pilih hanya yang dimensinya terukur maksimal 80x54x17 mm**, mudah dilepas/diisi ulang, output minimal sesuai kebutuhan ESP32; jangan berasumsi semua 5000mAh muat |
| 4 | M3 x 10 mm self-tapping untuk plastik (round/pan head) | Pengunci tutup via samping, 4 pilot Ø2,54 mm, screw fit test wajib |
| 4 | M3 x 8 mm self-tapping untuk plastik | Baut tray; 4 pilot Ø2,64 mm, periksa diameter kepala sekrup |
| 1 | USB cable pendek sesuai ESP32 dan powerbank | Varian konektor ESP32 bisa berbeda, cocokkan USB Micro-B/Type-C yang dimiliki |
| 1 | Lem Velcro / mounting tape removable | Menahan powerbank; jangan menusuk/lem baterai secara permanen |
| 1 | Acoustic hydrophobic membrane untuk lubang mic | **Wajib untuk pengembangan luar ruang**, verifikasi atenuasi audio dan daya rekat |
| beberapa | Jumper wires pendek / kabel silikon | Pilih panjang sesuai hasil fit-check |
| opsional | Perfboard 3 x 5 cm | Pengganti breadboard setelah rangkaian stabil |

Komponen elektronik yang dipakai ulang: ESP32 DevKit V1, INMP441, DS3231, MicroSD module dan kartu MicroSD.

**PENTING:** Jangan membeli battery/powerbank sebelum mengukur dimensi barang sebenarnya. Model ini tidak didesain untuk sel 18650 lepas; jangan memasang sel Li-ion tanpa modul proteksi dan penanganan kelistrikan yang benar. Pastikan powerbank dapat menghidupi ESP32 stabil, termasuk saat Wi-Fi aktif; sebagian powerbank melakukan auto cut-off pada arus kecil. Charging tidak dilakukan di bawah hujan/di casing tertutup tanpa prosedur keselamatan.

## 4. Posisi internal

- **Atas kiri:** ESP32 DevKit V1 30pin, footprint 53 x 29 mm.
- **Bawah kiri:** mini breadboard 170 titik, 47 x 35 mm.
- **Atas kanan:** modul MicroSD 42 x 24 mm.
- **Bawah kanan:** RTC DS3231 38 x 22 mm.
- **Dinding sisi bawah (x +28 mm):** INMP441 dengan lubang akustik mengarah ke bawah dan rel penuntun nominal 14 mm; gunakan penahan removable dan hindari menutup port dengan lem.
- **Di bawah tray:** powerbank envelope 84 x 58 x 18 mm. Slot USB charge dan jalur daya berada di tepi bawah/kiri.

Lihat `PREVIEW/05_COMPONENT_LAYOUT.png` untuk diagram envelope. Ini bukan gambar kelistrikan dan bukan jaminan semua ukuran modul clone cocok. Permukaan ESP32 dan perutean kabel perlu clearance tambahan yang hanya bisa ditentukan setelah pengukuran hardware.

## 5. Risiko dan kriteria penerimaan sebelum cetak produksi

1. **PLA tidak disarankan untuk panas langsung dan lapangan tropis**; gunakan PETG/ASA. PETG tetap bukan jaminan keawetan UV/panas ekstrem.
2. **Desain tidak waterproof/IP-rated.** Lubang kabel, microphone, baut dan sambungan cover belum diberi gasket, cable gland, seal, atau drainage-test. Idealnya prototipe dicoba indoor/berteduh dulu.
3. Dua tiang hitam adalah *cosmetic masts* saja, **bukan antena Wi-Fi eksternal**. Jangan mengklaim jangkauan Wi-Fi tambahan. ESP32 PCB antenna butuh ruang bebas di dekat antena.
4. **Uji toleransi**: lubang screw, tab sisi, fit cover/skirt, pemasangan mast, board 30pin vs 38pin, orientasi slot MicroSD dan USB.
5. **Akustik**: uji rekaman INMP441 dengan casing sebelum deployment; jangan memasang membran yang menutup microphone secara akustik.
6. **Power**: uji 5V stabil, suhu komponen, auto-off powerbank, sambungan USB pada beban Wi-Fi dan perekaman, serta kemampuan melepaskan baterai dengan aman.
7. Sebelum produksi lengkap, cetak satu base dan uji komponen fisik. Revisi CAD bila terjadi tabrakan. **Watertight STL bukan bukti assembly fisik pas.**

## 6. Referensi dimensi umum (silakan ukur komponen fisik Anda)

- Breadboard SYB170 47 x 35 x ~9 mm: https://www.yixincomponents.com/product/solderless-mini-breadboard-170-points.html
- ESP32 DevKit V1 30 pin 51 x 28 mm umum: https://openlabbench.gwark.dev/pinouts/esp32-devkit-v1/
- RTC DS3231 38 x 22 x 14 mm: https://www.parallax.com/product/ds3231-at24c32-real-time-clock-module/

Bentuk wordmark vektor pada relief diekstrak dari **PNG resmi yang disuplai user dalam percakapan ini**, bukan diciptakan ulang dengan font generik.
