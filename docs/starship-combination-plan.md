# Rencana Odyssey Starship 2.5D

Status: implementasi awal, 3 Oktober 2026. Kelanjutan dari `starship.md`.

Keputusan terbaru pengguna: Star Office UI sebagai basis frontend. Renderer aktif
sekarang Phaser 3.80.1 dengan guest renderer upstream yang diadaptasi, background
kapal original detail dan jalur yang dikalibrasi. Lihat `star-office-integration.md`.
Keputusan PixiJS di bawah adalah rencana sebelumnya yang sudah digantikan.

Iterasi pertama sudah menambahkan proyeksi isometrik, artwork procedural original,
console/dinding berpintu, depth sorting, obstacle routing, dan kamera berdasarkan
batas render untuk seluruh roster. Klik kru dan editor existing diuji di browser;
40 test office, typecheck, dan production build lulus. Artwork detail berbasis
generated asset, A*, editor visual yang diperluas, persistensi Core, kolaborasi,
serta editor layout modular masih merupakan milestone berikutnya.

## Keputusan utama

Gabungkan pendekatan visual dan interaksi beberapa proyek dalam satu frontend
Agentic OS. Engine render utama adalah PixiJS; identitas, chat, task, approval,
dan aktivitas tetap berasal dari Core/Hermes.

Target visual: interior kapal isometrik dengan pencahayaan dan furnitur detail,
karakter chibi dengan seragam sci-fi, serta bubble aktivitas yang mudah dibaca.
Background dan sprite harus memiliki perspektif, skala, dan arah cahaya konsisten.

## Engine dan package

| Komponen | Pilihan | Keputusan |
| --- | --- | --- |
| UI, editor, chat dock | React 19 + TypeScript + Vite | Pakai stack yang sudah ada |
| Render kapal dan kru | `pixi.js` 7.4.3 | Pakai versi terpasang; Sprite, AnimatedSprite, Container, Assets, ticker |
| Pergerakan | Modul geometri AI Town yang sudah di-vendor + pathfinder lokal | Pertahankan interpolasi; tambah grid penghalang dan A* lokal |
| Kamera | Transform Container PixiJS | Zoom, pan, fit; gunakan kontrol yang sudah ada |
| Animasi panel | CSS | Transisi panel sederhana |
| State dan data runtime | Shell store + transport Core yang sudah ada | Satu sumber status untuk scene dan panel |
| Persistensi karakter/layout | Core + SQLite yang sudah ada | Tambahkan resource visual terpisah; migrasi preferensi localStorage |
| Pengujian | Vitest + typecheck + Vite build | Pakai tool terpasang, tambah validasi perilaku yang berubah |

Tidak ada dependency runtime baru yang wajib untuk fase pertama. Renderer PixiJS
tetap di-mount melalui lifecycle React yang sekarang. Konversi ke PixiJS 8 atau
React renderer binding merupakan pekerjaan terpisah jika nanti dibutuhkan.

## Pembagian referensi GitHub

| Proyek | Bagian yang digunakan | Cara menggabungkan |
| --- | --- | --- |
| [Star Office UI](https://github.com/ringhyacinth/Star-Office-UI) | Background detail, karakter terpisah, lokasi berdasarkan status | Terapkan pola layer dengan artwork kapal sendiri |
| [wickedapp/openclaw-office](https://github.com/wickedapp/openclaw-office) | Scene custom dan visualisasi delegasi | Jadikan referensi desain scene serta hubungan antar kru |
| [AI Town](https://github.com/a16z-infra/ai-town) | Interpolasi jalur, arah sprite, dunia karakter yang bergerak | Lanjutkan modul MIT yang sudah dipin di proyek |
| [W17ant/Claude-Office](https://github.com/W17ant/Claude-Office) | Perspektif isometrik, karakter datang/bekerja, bubble dan chat | Adaptasi perilaku ke renderer PixiJS dan dock yang sekarang |
| [My Virtual Office](https://github.com/eliautobot/my-virtual-office) | Editor penampilan, penataan ruang, meeting, pengalaman Hermes | Jadikan referensi fitur; implementasikan di kode Agentic OS |
| [paulrobello/claude-office](https://github.com/paulrobello/claude-office) | Monitoring, hierarki main/subagent, Kanban | Terapkan pola interaksi pada HUD dan mission board |

Star Office UI membatasi penggunaan aset seni bawaannya untuk nonkomersial.
My Virtual Office menggunakan AGPL dan distribusi resminya mengunci sebagian
fitur dengan aktivasi. Rencana ini memakai aset original dan implementasi editor
sendiri. Jika nanti mengimpor source dari repo lain, pin revisi, periksa lisensi
kode/aset terkait, dan simpan atribusi sebelum menggabungkannya.

## Arsitektur scene

Aliran data: Hermes -> Core -> transport/store -> model scene -> PixiJS.
Klik kru -> chat dock yang sudah ada -> Core -> Hermes.
Animasi visual mengikuti aktivitas; idle wandering tidak memicu panggilan LLM.

Layer scene:

1. Space backdrop dan pencahayaan ambient.
2. Floor/background kapal.
3. Furnitur serta kru dengan urutan kedalaman berdasarkan posisi kaki.
4. Dinding depan/objek tinggi sebagai foreground untuk menutupi kru secara tepat.
5. Nama, indikator status, dan bubble sebagai overlay yang tetap terbaca.

Satu gambar background yang sudah memuat seluruh furnitur tidak cukup untuk
occlusion yang benar. Buat layer foreground terpisah dan data penghalang yang
cocok dengan artwork. Dekorasi besar yang dapat dipindahkan harus menjadi aset
terpisah. Background awal adalah layout tetap; editor lengkap datang setelah
aset modular tersedia.

Gunakan koordinat logis grid untuk routing. Proyeksikan grid ke layar isometrik
dengan fungsi `gridToScreen` dan inversnya untuk hit testing. Tentukan proyeksi
serta ukuran tile sebelum membuat artwork, kemudian kalibrasi titik stasiun,
pintu, jalur, dan area foreground terhadap aset. Kru tidak berjalan melewati
console, meja, dinding, atau ruang yang tidak terhubung.

Manifest scene berisi ukuran gambar, asal proyeksi, ukuran tile, walkability,
obstacle footprints, room IDs, station anchors, meeting seats, dan foreground
layers. Identitas karakter menggunakan profile ID dari roster Core.

## Tahapan dan hasil yang harus terlihat

### 1. Vertical slice visual

- Buat satu bridge isometrik lengkap dengan corridor, dua stasiun, dan lounge kecil.
- Buat background serta sprite kru original dengan gaya yang konsisten.
- Implementasikan proyeksi, urutan kedalaman, foreground, serta obstacle grid.
- Hubungkan status dua profil nyata dan klik kru ke chat dock.
- Kriteria selesai: kru berjalan lewat pintu, terlihat di depan/belakang objek
  dengan benar, dan status Core terbaca; preview tetap nyaman saat zoom/resize.

Ini menguji kualitas visual dan integrasi sebelum memproduksi seluruh kapal.

### 2. Seluruh kapal dan roster

- Tambah bridge, science lab, engineering, communications, crew quarters,
  serta mission bay sesuai pemetaan peran saat ini.
- Tampilkan semua profil roster; tambahkan A* dan kebijakan tujuan/seat agar
  beberapa kru tidak menumpuk di satu titik.
- Working menuju station, idle menuju lounge, waiting menampilkan approval,
  error menampilkan perhatian, offline tetap ditandai jelas.
- Bubble menampilkan ringkasan aktivitas yang aman, dibatasi panjangnya;
  log detail tetap di panel.
- Kriteria selesai: setiap profil bisa mencapai station; koneksi putus dan
  data terlambat ditampilkan jelas tanpa mengarang aktivitas.

### 3. Editor karakter dan penyimpanan

- Perluas editor: rambut, warna kulit, seragam, aksesori, nama tampilan, preview.
- Sprite compositing dari layer badan/rambut/seragam/aksesori dengan frame seragam.
- Simpan konfigurasi visual per profile ID melalui resource Core, terpisah
  dari persona dan kredensial Hermes.
- Migrasikan preferensi browser sekali, dengan validasi dan fallback default.
- Kriteria selesai: penampilan yang sama muncul setelah reload dan di browser lain.

### 4. Interaksi kolaborasi

- Tambah area meeting dan visualisasi delegasi berdasarkan event/task nyata.
- Jika Core belum menyediakan event delegasi yang diperlukan, definisikan
  kontraknya lebih dulu; jangan menebak hubungan dari gerakan karakter.
- Klik station membuka mission board; approval membuka panel yang sudah ada.
- Meeting dekoratif dibedakan dari diskusi agent yang benar-benar dijalankan.
- Kriteria selesai: event delegasi dapat ditelusuri ke task/session asal.

### 5. Editor layout modular

- Furnitur terpisah: console, kursi, tanaman, core, storage, meeting table.
- Snap ke grid, rotasi yang didukung aset, validasi pintu dan jalur.
- Import/export manifest layout dan penyimpanan melalui Core.
- Kriteria selesai: layout baru tidak memutus akses ke station; konfigurasi
  rusak ditolak dengan pesan yang jelas.

## Validasi dan batas scope

- Test proyeksi/invers, jalur di sekitar obstacle, seluruh station reachable,
  prioritas approval, dan pemulihan konfigurasi karakter/layout yang invalid.
- Periksa browser: depth/occlusion, zoom/pan, klik kru, editor, resize,
  keyboard melalui daftar kru, reduced motion, dan koneksi terputus.
- Jalankan typecheck, test office, dan production build setelah perubahan.
- Ukur performa dengan seluruh roster; target 60 FPS pada desktop referensi,
  lalu sesuaikan resolusi dan efek jika perangkat lebih lambat.
- AI Town saat ini menyediakan adaptasi visual/pergerakan. Convex dan autonomous
  social simulation upstream tidak termasuk rencana ini.
- Fase pertama menghasilkan satu scene yang dapat direview; fase layout editor
  membutuhkan aset modular tambahan, bukan hanya pergantian background.
