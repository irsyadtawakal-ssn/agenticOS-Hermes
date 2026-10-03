# Spesifikasi Desain: The Sims 2 3D Isometric Office

**Dokumen**: `docs/sims2-office-spec.md`  
**Status**: Disetujui melalui sesi `/grill-me` (2026-10-03)  
**Target Modul**: `apps/office` (@aos/office)

---

## 1. Visi & Konsep Utama

Merombak total tampilan kantor virtual Agentic OS menjadi **True 3D Isometric ala The Sims 2**, ditenagai oleh **Three.js (WebGL)**. Kantor virtual ini mensimulasikan kehidupan sehari-hari para agent AI di dalam ruang kantor 3D yang interaktif, hangat, dan ekspresif.

Para agen tidak hanya terpaku di satu titik, melainkan memiliki *"Free Will"* otonom saat santai (idle) dan bekerja fokus di workstation saat ada tugas kanban yang masuk. Pengguna berperan sebagai observer/CEO dengan kendali kamera isometrik khas The Sims 2, dinding cutaway dinamis, dan kristal Plumbob 3D ikonik.

---

## 2. Keputusan Desain Terkunci (Hasil Grilling)

| # | Komponen / Aspek | Keputusan Terpilih | Detail Implementasi |
|---|---|---|---|
| **1** | **Engine Render** | **True 3D Isometric (Three.js WebGL)** | Scene 3D orthographic/isometric di-mount di React 19 (`apps/office`). Render 60 FPS halus, pencahayaan lembut (ambient + directional shadow). |
| **2** | **Denah & Ruangan** | **4 Zona Fungsional** | 1. **Ruang Eksekutif Chief** (meja kayu besar, sofa tamu, tanaman hias)<br/>2. **Open Workstations & Dev Lab** (meja kerja agen + server rack dengan LED kedip)<br/>3. **Pantry / Breakroom Sims** (mesin kopi espresso, kulkas, sofa empuk, dispenser)<br/>4. **Meeting Room** (meja rapat panjang, kursi ergonomis, whiteboard tugas) |
| **3** | **Visual Karakter** | **Low-Poly Stylized Humanoids ala The Sims 2** | Model 3D manusia proporsional bergaya The Sims 2:<br/>• `chief`: Blazer eksekutif, postur kepemimpinan.<br/>• `dev`: Hoodie santai / tech t-shirt, kacamata anti-radiasi.<br/>• `researcher`: Pakaian smart-casual, kacamata, map dokumen.<br/>• `secretary`: Busana kerja rapi profesional, agenda/tablet.<br/>• `content`: Pakaian stylish/trendy modern. |
| **4** | **Animasi & State** | **Sims State Machine** | • **Walking**: Walk cycle di navmesh/grid lantai menuju tujuan.<br/>• **Working**: Duduk di kursi workstation, mengetik di keyboard, monitor menyala.<br/>• **Idle Rest ("Free Will")**: Berjalan ke pantry, menyeduh kopi, duduk santai di sofa breakroom, atau berdiri mengobrol.<br/>• **Waiting Approval**: Mengangkat tangan / gestur bingung di depan meja Chief. |
| **5** | **The Plumbob** | **3D Rotating Crystal** | Kristal berlian hijau 3D berputar halus di atas kepala agent aktif/terpilih:<br/>• 🟢 **Hijau**: Idle / Ready / Mood sehat.<br/>• 🔵 **Biru / Cyan**: Working / Thinking (menjalankan tugas).<br/>• 🟡 **Kuning**: Waiting for Approval (butuh izin owner di HUD/Telegram).<br/>• 🔴 **Merah**: Error / Blocked.<br/>• ⚫ **Abu-abu**: Offline. |
| **6** | **Thought Bubbles** | **Simlish Floating Bubbles** | Balon pikiran 3D/billboard melayang dengan ikon ekspresif:<br/>• ☕ Saat di pantry / minum kopi.<br/>• 💻 Saat Dev coding / terminal jalan.<br/>• 🔍 Saat Researcher mencari informasi web.<br/>• 💡 Saat Content merancang ide.<br/>• ⚠️ / 🔐 Saat menunggu izin approval. |
| **7** | **Kamera & Dinding** | **Kamera 90° Snap + Wall Cutaway** | • Rotasi kamera 4 sudut 90° (tombol Q / E & UI compass dial) + drag orbit bebas.<br/>• **3 Mode Dinding**:<br/>  - *Cutaway* (Default): Dinding depan yang menghalangi kamera otomatis turun/transparan.<br/>  - *Down*: Semua dinding turun rata lantai.<br/>  - *Full*: Semua dinding berdiri tegak penuh.<br/>• Klik potret Sim di roster: Kamera meluncur halus (*smooth pan*) fokus ke agen tersebut. |
| **8** | **Interaksi & Klik** | **Point & Click ala The Sims** | • Klik lantai: Agen berjalan ke lokasi (*"Go Here"*).<br/>• Klik agen / meja agen: Membuka dock chat langsung & status task.<br/>• Klik mesin kopi: Memicu agen membuat kopi.<br/>• Klik whiteboard meeting: Membuka drawer Kanban board. |
| **9** | **Audio & Efek Suara** | **Sims Audio Cues (Opsional, ada Mute)** | Efek audio lembut menggunakan Web Audio API (synthesizer ringan tanpa aset audio berat):<br/>• Klik UI & tombol rotasi.<br/>• Suara mesin kopi saat seduh.<br/>• Chime merdu saat approval diminta atau task selesai.<br/>• Tombol Mute di HUD bawah. |
| **10** | **Integrasi Antarmuka** | **Primary Default View di AosShell** | Menjadi tampilan visual utama di `apps/office/src/shell/AosShell.tsx`. Tersedia tombol switch untuk melihat versi klasik (*Star Office asli* atau *Claude Office*) jika diinginkan. |

---

## 3. Rencana Arsitektur Teknis (`apps/office`)

```
apps/office/src/sims-office/
├── SimsOfficeView.tsx       # Root React Component untuk The Sims 2 View
├── SimsScene.ts             # Three.js Scene, Renderer, Lights, Shadow Map
├── CameraController.ts      # Kontrol kamera isometrik (90° Snap, Zoom, Pan, Orbit)
├── WallManager.ts           # Logika Cutaway Wall (deteksi sudut kamera & potong dinding)
├── RoomBuilder.ts           # Konstruksi geometri 3D 4 zona kantor & furnitur
├── SimsAgent.ts             # Rigs model 3D agen, animasi dasar (walk, sit, type, idle)
├── Plumbob.ts               # Kristal Plumbob 3D berputar dengan warna status reaktif
├── ThoughtBubble.ts         # Gelembung pikiran melayang Simlish
├── SimsAudio.ts             # Web Audio API generator untuk efek suara interaktif
├── NavigationMesh.ts        # Grid jalan 3D & obstacle avoidance
└── sims.css                 # Styling kontrol kamera & tombol mode dinding
```

---

## 4. Tahapan Eksekusi (Implementation Milestones)

- [x] **Fase 1: Fondasi 3D & Ruangan (Three.js Setup)**
  - Pasang dependency `three` dan `@types/three` di `apps/office`.
  - Buat `SimsScene.ts` dengan orthographic/isometric camera, directional light dengan soft shadows, dan lantai grid.
  - Buat `RoomBuilder.ts` untuk membangun denah 4 zona (Chief Office, Workstation, Pantry, Meeting Room).
  - Implementasikan `WallManager.ts` dengan mode Cutaway, Down, dan Full.

- [x] **Fase 2: Karakter, Plumbob, & Navigasi**
  - Implementasikan model 3D low-poly agen bergaya The Sims 2 (`SimsAgent.ts`).
  - Pasang kristal `Plumbob.ts` 3D berputar yang terikat pada status live Core/Hermes.
  - Tambahkan pathfinding/navigasi lantai untuk "Go Here" dan perpindahan posisi.

- [x] **Fase 3: Free Will, Animasi, & Thought Bubbles**
  - Integrasikan transisi state: duduk mengetik saat kerja vs jalan ngopi di pantry saat idle.
  - Implementasikan gelembung ikon melayang `ThoughtBubble.ts`.
  - Tambahkan efek suara `SimsAudio.ts` dengan tombol mute.

- [x] **Fase 4: Integrasi AosShell & Polish**
  - Pasang `SimsOfficeView` sebagai tampilan default di `AosShell.tsx`.
  - Hubungkan klik karakter ke Chat Dock & Kanban Drawer.
  - Jalankan test typecheck dan vitest untuk memastikan stabilitas 100%.

- [x] **Fase 5: Karakter rigged (upgrade dari primitive)**
  - `CharacterRig.ts`: GLB rigged CC0 Quaternius (`public/sims/characters/`, lihat `NOTICE.md`) + `THREE.AnimationMixer`, slot animasi idle / walk / sit / wave / interact / talk / clap. Sit tanpa klip dibuat dari pose tulang kaki; mengetik = overlay lengan.
  - `SimsAgent.ts`: outfit per profil (model + recolour material) untuk 10 profil roster.
  - `NavigationMesh.ts` jadi sumber tunggal layout: `DESK_LAYOUT` (2 baris × 4 meja saling membelakangi), `MEETING_CHAIRS`, kursi Chief; setiap anchor punya `approach` yang walkable. Pathfinding diganti grid A* (sel 0,25 m) + string-pulling.
  - Keterbatasan: belum ada model perempuan; 4 model dasar dibedakan lewat warna.

- [x] **Fase 6: World & Environment**
  - `Environment.ts`: siklus siang–malam mengikuti jam lokal (atau preset Pagi/Siang/Sore/Malam via tombol 🕒 di HUD), matahari/bulan + hemisphere light, warna langit & fog, lampu ruangan hangat, jendela/lampu jalan/gedung kota menyala malam hari, jam dinding live.
  - `Props.ts`: furnitur & props prosedural rounded (kursi kantor, sofa, rak buku berisi buku, tanaman, lampu, lukisan, TV, vending machine, printer, rug, barang meja per peran agent) + contact shadow (blob AO).
  - `RoomBuilder.ts`: lobby marmer + resepsionis, dinding luar bata, jendela/pintu/lukisan/logo/jam yang ikut tersembunyi saat cutaway (`WallManager.attachDecor`).
  - `Exterior.ts`: lot rumput + fondasi ala Sims, jalan dengan mobil lewat, zebra cross, parkiran, pohon, pagar tanaman, bangku, lampu jalan, skyline low-poly.
  - Debug: `?simsTime=noon|night|…` dan `?simsOverview=1`.
- [x] **Fase 7: Kenney Furniture Kit, Status Monitor, Ambience, & Mode Build/Buy**
  - **Aset Furnitur Kenney (CC0 2.0)**:
    - 140 model GLB disimpan di `public/sims/furniture/kenney/` (dengan `NOTICE.md`). Arsip mentah dipindahkan ke `assets-src/` agar tidak membengkak ke bundle build.
    - `KenneyModels.ts`: loader asinkron dengan fallback prosedural instan sehingga tidak ada jeda render atau kegagalan pada lingkungan test. Mendukung auto-centering, scaling proporsional, dan penyesuaian rotasi (yaw).
    - Kursi meja (`chairDesk`), sofa santai (`loungeDesignSofa`, `loungeSofa`), kulkas pantry (`kitchenFridgeLarge`), mesin kopi (`kitchenCoffeeMachine`), microwave, meja bistro bulat (`tableRound`), stool bar (`stoolBar`), meja kopi kaca/kayu, tempat sampah, standing coat rack, tanaman pot, serta pernak-pernik meja (keyboard, mouse, laptop, buku).
  - **Monitor Dinamis Sesuai Status Agen (#10)**:
    - `ScreenStates.ts`: canvas textures real-time per monitor untuk 5 status: `working` (layar IDE gelap dengan baris kode & kursor berkedip), `approval` (peringatan kuning/oranye berdenyut ⚠ APPROVAL REQUIRED), `error` (layar merah traceback crash), `idle` (screensaver biru AGENTIC OS dengan jam & grid), `offline` (layar hitam standby).
    - `ScreenManager`: memetakan material layar monitor meja & laptop Chief ke profil masing-masing agen, menggerakkan animasi offset scrolling baris kode dan pulsasi intensitas emissive.
  - **Office Ambience Audio (#11)**:
    - `SimsAmbience.ts`: generator audio latar prosedural berbasis Web Audio API (AC / HVAC room tone, gemerik tuts keyboard yang frekuensinya proporsional dengan jumlah agen yang sedang bekerja, jangkrik malam saat gelap di luar ruangan).
    - Musik latar The Sims 2 / bossa lounge (progresi akord lembut Fmaj7-G7-Em7-Am7 + walking bass + vibraphone) yang bisa dinyalakan/dimatikan lewat tombol 🎵 di HUD dan tersimpan di `localStorage`.
  - **Mode Build/Buy (#12)**:
    - `DecorLayout.ts` & `DecorManager.ts`: katalog furnitur (Tanaman, Lampu, Kursi, Meja, Utilitas) yang bisa dibeli, digeser, diputar 90° (tombol `R`), atau dihapus (`Delete`).
    - Footprint placement validator: menghitung collision box (menukar lebar/panjang saat diputar), memastikan tidak menabrak dinding, furnitur tetap, atau memblokir jalan/kursi agen.
    - `NavigationMesh.ts`: rintangan dinamis diperbarui seketika dan cache grid A* diinvaliasi otomatis saat tata letak furnitur berubah, sehingga agen langsung memutar mencari jalan baru.
    - Panel katalog The Sims 2 di bagian bawah dengan filter kategori, tombol putar, hapus, dan reset layout ke tata letak default.

- [x] **Fase 8: The Sims 2 Aqua/Steel Gloss Console & Motives / Needs System**
  - **The Sims 2 Aqua/Steel Console (`SimsConsole.tsx` & `sims.css`)**:
    - Konsol kontrol utama di sudut kiri bawah layar dengan gaya skeuomorphic khas The Sims 2: gradasi aqua metalik (`#1b588e` ke `#092341`), bingkai chrome berkilau (`#58b4f8`), tombol beveled, dan panel tab dinamis.
    - Tombol perkecil/perluas (`▲ Buka` / `▼ Kecilkan`) untuk memberi ruang pandang maksimal pada kantor 3D bila diinginkan.
    - **Sim Pod (Kiri)**: Lingkaran potret agen dengan ring mood Plumbob yang berdenyut (hijau, kuning, atau merah), kristal Plumbob 3D mini berputar di sudut potret, nama agen huruf tebal, peran/jabatan, pill status aksi live ("Standby di Kantor", "Sedang Menjalankan Tugas", "Menunggu Approval Izin"), serta tombol jalan pintas cepat `[💬 Chat]` dan `[📋 Tugas]`.
    - **Sub-panel Mode Sims (Tengah)**:
      1. **💚 Kebutuhan (The Sims 2 Motives)**:
         - Visualisasi 5 kebutuhan agen AI dengan bar kapsul glossy (hijau `> 65%`, kuning `30-65%`, merah `< 30%`):
           • **Konteks** (Analog Lapar/Hunger): sisa kapasitas context window agen (128k token budget).
           • **Anggaran** (Analog Finansial/Comfort): pemakaian biaya inferensi vs alokasi harian ($5.00 limit).
           • **Tenaga** (Analog Energi/Energy): beban antrian task Kanban dan status proses (segar saat idle/1 task, terkuras bila padat atau error).
           • **Sistem** (Analog Lingkungan/Environment): rasio kesehatan komponen backend (Docker, Hermes, Ollama, Core).
           • **Sosial** (Analog Hubungan Sosial): kelancaran izin approval (drop saat menunggu izin human, hijau saat semua izin beres).
      2. **👤 Simologi**:
         - Menampilkan Aspirasi Sim (Pengetahuan 💡, Finansial 💎, Kreativitas 🎨, Kerjasama 🤝), Zodiak Sim, lencana sifat/traits karakter (Tegas, Analitis, dsb.), rating keahlian 10 titik (Logika, Kreativitas, Karisma), dan kutipan biografi Soul agen.
      3. **💼 Pekerjaan**:
         - Ringkasan kartu tugas Kanban aktif yang sedang ditugaskan ke agen tersebut beserta tag status dan tombol langsung ke papan Kanban.
    - **Kendali Waktu & VCR Kecepatan Simulasi (Kanan)**:
      - Tombol kontrol kecepatan klasik The Sims 2: `⏸` Jeda (0x), `▶` Normal (1x), `⏩` Cepat (2x), `⏭` Ultra (3x).
      - Tombol jam & siklus waktu kantor (`🕒 14:24 - Siang`).
      - Tombol toggle cepat: Mode Dinding (Potong/Turun/Penuh), Mode Build/Buy, Musik Bossa Sims 2, Suara FX, dan Beralih ke Klasik.
    - **Household Selector Strip**:
      - Deretan potret sirkular seluruh 10 agen di bagian bawah konsol dengan dot status live (hijau, cyan, kuning, merah, abu-abu).
      - Klik potret langsung memainkan chime Sim terpilih dan mengarahkan kamera secara mulus ke agen tersebut.
  - **Efek Suara The Sims 2 Tambahan (`SimsAudio.ts`)**:
    - `playBubbleClick()`: pop gelembung kenyal khas klik tombol The Sims 2.
    - `playTabSwitch()`: snap binder/tab plastik saat berpindah sub-tab konsol.
    - `playSelectSim()`: chime merdu dua nada (A5 -> C#6) saat memilih Sim.
    - `playMotiveAlert()`: tanda peringatan nada minor saat kebutuhan Sim jatuh ke zona kritis.
  - **Pengujian & Kestabilan**:
    - `test/simsMotives.test.ts`: 5 pengujian unit untuk perhitungan matematis 5 motive bars, zodiak, aspirasi, dan mood Plumbob.
    - Seluruh **320 unit test** monorepo lolos 100%, typecheck bersih tanpa error, dan bundle build produksi rampung dalam < 1 detik.
