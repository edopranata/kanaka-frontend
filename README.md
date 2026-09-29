# Kanaka · Aplikasi Penjualan: Kasir, Inventory, Closing & Laporan

Aplikasi terdiri dari **2 repository** (README ini sama di keduanya):

| Repo | Isi |
| --- | --- |
| **backend** · [edopranata/kanaka-backend](https://github.com/edopranata/kanaka-backend) | Laravel 13 API (Sanctum token, PhpSpreadsheet untuk import/export Excel, scheduler untuk closing otomatis & tagihan bulanan). Juga menyajikan hasil build frontend di produksi. |
| **frontend** · [edopranata/kanaka-frontend](https://github.com/edopranata/kanaka-frontend) | Vue 3 SPA + PWA (Pinia, Vue Router, Tailwind 4). Bisa di-install di tablet kasir, HP, dan laptop. |

Untuk development, clone keduanya **berdampingan** dalam satu folder, karena proxy dev dan `npm run build:laravel`
mengasumsikan susunan ini:

```
kanaka/
├── backend/    ← kanaka-backend
└── frontend/   ← kanaka-frontend
```

## Fitur

| Modul | Isi |
| --- | --- |
| **Kasir (POS)** | Scan barcode / cari produk, keranjang, **promo otomatis** (tanpa input diskon manual), pajak (opsional), bayar tunai (hitung kembalian) / transfer / QRIS / kartu, cetak struk thermal 58/80mm, pelanggan. Shortcut: `F2` cari, `F8` bayar, `Enter` transaksi baru. |
| **Penjualan kredit (bon)** | Menu terpisah dari kasir untuk "ambil dulu bayar nanti": pilih pelanggan, input barang (per satuan), cetak nota bon. Batas kredit per pelanggan (opsional). |
| **Tagihan & piutang** | Tagihan bulanan per pelanggan dibuat **otomatis setiap tanggal 1 pukul 01:00** (atau manual kapan saja), cetak tagihan A4, pembayaran lunas/dicicil, saldo piutang per pelanggan, peringatan lewat jatuh tempo. |
| **Diskon & promo** | Potongan persen atau nominal per satuan untuk produk tertentu (bisa dibatasi satuan tertentu, mis. hanya BOX), dengan periode mulai–berakhir dan minimal beli. Otomatis diterapkan di kasir & bon. |
| **Riwayat penjualan** | Filter tanggal/status/metode, detail, cetak ulang struk, **void** (stok kembali, wajib alasan). |
| **Produk & kategori** | Master produk (SKU, barcode, kategori, satuan dasar, HPP, stok minimum) terpisah dari **satuan & harga jual**: satu produk bisa dijual per PCS, BOX isi 6, DUS isi 40, dst. dengan harga masing-masing (harga grosir tidak harus = isi × harga eceran) dan barcode per satuan. Import dari Excel (format iPOS). |
| **Paket / menu olahan** | Produk racikan dari beberapa bahan (mis. Indomie Telur = Indomie + Telur + jasa masak). Stok diambil dari bahan; ketersediaan dihitung dari bahan utama; bahan opsional bisa dihilangkan saat pesan dengan potongan harga. |
| **Pembelian** | Barang masuk dari supplier. Stok bertambah, **HPP rata-rata bergerak** dihitung ulang, diskon faktur dibebankan ke HPP. Dibayar **tunai** (mengurangi kas fisik pencatat) atau **non tunai** — Transfer, QRIS, Virtual Account, Kartu Debit (mengurangi rekening bank). Bisa dibatalkan (uang kembali ke akun pembayar). |
| **Barang titipan (konsinyasi)** | Supplier menitipkan barang; toko membayar hanya yang terjual saat penyelesaian (harian atau beberapa hari sekali). Sisa bisa diretur atau terbawa, harga setor FIFO, bayar langsung atau belakangan (dicicil). |
| **Penyesuaian & stok opname** | Stok masuk/keluar (rusak, hilang, bonus, dll.) dan opname (input stok fisik, selisih dicatat otomatis). |
| **Kartu stok** | Mutasi per produk: saldo awal, masuk, keluar, saldo akhir, dan tautan ke dokumen sumber. |
| **Kas & bank** | Kas fisik terpisah **per pengguna** (laci tiap kasir, admin, pemilik) dan rekening bank untuk transaksi non tunai. Mutasi & saldo berjalan per akun, **setor ke bank**, **serah terima kas** antar pengguna (dengan konfirmasi penerima), tarik tunai & penyesuaian saldo. |
| **Pengeluaran** | Biaya operasional per kategori (tunai mengurangi kas fisik pencatat, non tunai mengurangi rekening). |
| **Closing harian** | Manual (hitung kas fisik **per pengguna**, bisa per pecahan uang, selisih per kas) dan **otomatis setiap 24:00**. |
| **Laporan** | Penjualan harian, per produk, per kategori, per kasir, metode bayar, diskon & promo, rekap closing, laba rugi, pengeluaran, persediaan & nilai stok, pembelian. Semua bisa dicetak & **export Excel**. |
| **Dashboard** | Penjualan & laba hari ini/bulan ini, grafik 14 hari, produk terlaris, stok menipis, status closing. |
| **Administrasi** | Pengguna & level akses, log aktivitas (login, void, closing, perubahan harga, dll.), pengaturan aplikasi (khusus pemilik). |

## Satuan & harga jual

- **Stok dan HPP selalu dalam satuan dasar** produk (mis. PCS). Menjual 1 BOX isi 6 mengurangi stok 6 PCS; HPP transaksi = 6 × HPP per PCS.
- Harga jual disimpan per satuan di tabel `product_units`. Produk yang belum punya harga jual tetap tersimpan sebagai master
  (bisa dibeli/distok) tetapi **tidak muncul dan tidak bisa dijual di kasir**.
- Barcode satuan (mis. barcode dus) langsung memilih satuan tersebut saat discan di kasir.
- Pembelian boleh per satuan besar: beli 2 DUS isi 24 seharga Rp 60.000/DUS → stok +48 PCS, HPP Rp 2.500/PCS.

## Kode produk (SKU) & kategori otomatis

- Produk baru mendapat **SKU otomatis berurutan**, mis. `SKU-0000001` (barang) dan `PKT-0000001` (paket). Kolom SKU di form
  boleh dikosongkan; prefix & jumlah digit diatur di *Pengaturan Aplikasi → Penomoran & Kode*.
- Menomori ulang SKU semua produk (urut sesuai urutan input; barcode, stok & transaksi tidak berubah):
  `php artisan products:renumber-sku`
- **Kategori otomatis dari nama barang** memakai aturan kata kunci di `backend/config/product_categories.php`
  (30 kategori, mis. "INDOMIE" → Mie & Pasta Instan, awalan "O " → Obat & Kesehatan). Yang tidak dikenali masuk "Lain-lain".
  - Isi kategori produk yang belum berkategori: `php artisan products:categorize` (`--dry-run` untuk melihat hasil dulu)
  - Setelah menambah kata kunci, kategorikan ulang isi "Lain-lain": `php artisan products:categorize --fallback`
  - Kategorikan ulang semua barang: `php artisan products:categorize --all`

## Pengaturan aplikasi (khusus Pemilik)

Menu *Pengaturan Aplikasi*: nama & slogan aplikasi (tampil di halaman masuk), identitas toko & struk (kertas 58/80 mm),
prefix setiap dokumen (nota `INV`, bon `BON`, pembelian `PB`, penyesuaian `ADJ`, opname `SO`, tagihan `TG`), periode
pengulangan nomor urut (harian/bulanan/tahunan) & jumlah digit, prefix SKU, pajak, rekening default per metode non tunai, satuan & stok minimum
bawaan, stok minus, closing otomatis, serta tagihan otomatis & jatuh tempo.

## Import master produk dari Excel

Format template **iPOS** (sheet `DATA ITEM`): `KODE ITEM`, `BARCODE`, `NAMA ITEM`, `JENIS` (kategori), `SATUAN`,
`KONVERSI SATUAN DASAR`, `HARGA POKOK`, `HARGA JUAL`, `STOK`, `STOK MINIMUM`. Baris dengan `KODE ITEM` sama dan
`SATUAN` berbeda menjadi satuan tambahan (multi satuan). Nilai `NA` dianggap kosong. Produk baru mendapat SKU otomatis;
produk yang sudah ada dikenali dari barcode-nya. Bila `JENIS` kosong/NA, kategori ditebak dari nama barang.

```bash
cd backend
php artisan products:import "database/DATABASE 50.600+ DATA ITEM WARUNG IPOS4.xlsx"   # ±10 detik untuk 50.601 item
php artisan products:import file.xlsx --update   # perbarui nama/kategori/harga produk yang kodenya sudah ada
```

File kecil juga bisa diupload dari menu **Produk → Import Excel**. Produk yang kodenya sudah ada dilewati (kecuali mode
perbarui), barcode yang bentrok dengan produk lain dicatat di hasil import, dan stok produk lama tidak pernah diubah oleh import.

## Paket / menu olahan

- Menu *Paket / Menu Olahan*: tentukan harga jual per porsi dan bahannya. **Bahan utama** wajib dan menentukan jumlah porsi
  yang tersedia (mis. Indomie stok 40 → tersedia 40 porsi). **Bahan opsional** (mis. telur) boleh dihilangkan pemesan
  dengan potongan harga yang Anda tentukan, dan tidak membatasi ketersediaan.
- Form paket menampilkan nilai bahan (harga eceran), **jasa/olahan** (= harga paket − nilai bahan), HPP bahan, dan laba.
- Saat terjual (kasir maupun bon), stok bahan yang dipakai berkurang dan tercatat di kartu stok bahan ("Paket …").
  Void mengembalikan stok bahan sesuai yang benar-benar terpakai. Struk mencetak varian, mis. "(tanpa Telur Ayam)".
- Paket tidak memiliki stok sendiri: tidak bisa dibeli dari supplier, di-opname, atau menjadi bahan paket lain.
  Produk yang dipakai sebagai bahan tidak bisa dihapus.

## Diskon & promo

Kasir tidak lagi mengisi diskon manual. Potongan hanya berasal dari menu **Diskon & Promo** (Pemilik & Admin):

- **Jenis**: persen (mis. 10%) atau nominal per satuan (mis. Rp 1.000 per PCS).
- **Produk**: satu promo bisa berisi banyak produk; tiap produk berlaku untuk *semua satuan* atau *satuan tertentu* saja.
- **Periode**: tanggal mulai dan (opsional) berakhir, dicocokkan dengan **tanggal usaha**. Status: Terjadwal, Berjalan, Berakhir, Nonaktif.
- **Minimal beli**: promo baru berlaku bila qty baris ≥ nilai ini.
- Bila produk masuk beberapa promo sekaligus, dipakai **potongan terbesar** (tidak ditumpuk). Perhitungan akhir tetap di server.
- Nama promo tercatat di tiap item transaksi (tampil di struk & detail penjualan). Promo yang sudah dipakai tidak bisa dihapus, cukup dinonaktifkan atau diakhiri periodenya.
- Potongan promo masuk ke *diskon* pada closing, laporan penjualan, laba rugi, dan laporan **Diskon & Promo**.

## Barang titipan (konsinyasi)

1. **Titipan masuk** (menu *Barang Titipan → Titipan Masuk*): pilih supplier, barang, jumlah, dan harga setor. Stok bertambah,
   HPP mengikuti harga setor. **Belum menjadi hutang.** Produk ditandai sebagai titipan supplier tersebut (tidak bisa dibeli
   lewat menu Pembelian dan tidak bisa dititipkan supplier lain).
2. **Jual seperti biasa** (kasir, bon, atau sebagai bahan paket, mis. lauk pada paket makan siang).
3. **Penyelesaian** kapan saja (harian untuk lauk, beberapa hari sekali untuk kerupuk): isi **sisa fisik** dan **jumlah retur**.
   - Dibayar = titipan terbuka − sisa fisik (terjual atau hilang). Selisih stok sistem dicatat otomatis.
   - Sisa yang tidak diretur **terbawa** ke penyelesaian berikutnya.
   - Nilai dihitung FIFO: kiriman terlama (dengan harga setornya) dianggap terjual lebih dulu.
4. **Pembayaran**: langsung saat penyelesaian atau belakangan (dicicil) dari tab *Penyelesaian & Hutang*. Pembayaran **tunai**
   mengurangi *kas seharusnya* pada closing hari itu. Penyelesaian terakhir yang belum dibayar bisa dibatalkan (stok dikembalikan).

## Penjualan kredit & tagihan bulanan

1. **Bon**: menu *Penjualan Kredit* → *Bon Baru*. Stok langsung berkurang; transaksi tercatat dengan metode `piutang`
   (tidak menambah kas). Jika pelanggan punya batas kredit, bon ditolak bila total piutang melebihi batas.
2. **Tagihan**: `php artisan bills:generate` dijadwalkan setiap tanggal 1 pukul 01:00 untuk semua bon bulan sebelumnya
   yang belum ditagih (satu tagihan per pelanggan). Bisa juga manual dari menu *Tagihan & Piutang* (semua pelanggan atau
   satu pelanggan, mis. yang ingin melunasi di tengah bulan). Jatuh tempo = tanggal tagihan + N hari (Pengaturan Toko).
3. **Pembayaran**: boleh dicicil. Pembayaran tunai menambah *kas seharusnya* pada closing hari pembayaran.
4. **Closing harian** menampilkan bon sebagai penjualan pada hari barang diambil (baris "Bon (piutang)"), terpisah dari
   penjualan tunai, plus "Pelunasan piutang tunai".
5. Bon yang sudah masuk tagihan tidak bisa di-void sebelum tagihannya dibatalkan; tagihan yang sudah ada pembayarannya
   tidak bisa dibatalkan; pembayaran pada tanggal yang sudah di-closing tidak bisa dihapus.

## Kas & bank

Menu **Kas & Bank** memisahkan uang per akun:

| Akun | Isi |
| --- | --- |
| **Kas fisik** (satu per pengguna, dibuat otomatis) | Penjualan & pelunasan piutang **tunai** yang dicatat pengguna itu, pembelian, pengeluaran & bayar titipan tunai yang ia bayar, serta perpindahan kas. |
| **Rekening bank** (dikelola pemilik/admin) | Transaksi **Transfer, QRIS, Kartu, Virtual Account** (VA hanya untuk pembayaran keluar/pelunasan, tidak di kasir). Rekening tujuan per metode diatur di *Pengaturan → Closing, Kas & Tagihan*; pengeluaran/pembayaran non tunai bisa memilih rekening. |

Perpindahan kas (nomor `KAS-…`, prefix bisa diubah):

- **Setor ke bank**: kas fisik → rekening, langsung tercatat (isi no. slip bila ada).
- **Serah terima kas**: kas fisik → kas fisik pengguna lain (pemilik, admin, atau sesama kasir). Status *menunggu*
  sampai **penerima menekan Terima** (atau Tolak); pengirim bisa membatalkan selama masih menunggu. Saldo baru pindah
  setelah diterima, dan uang yang sedang menunggu tidak bisa diserahkan dua kali. Penerima melihat penanda di menu/top bar.
- **Tarik tunai** (pemilik/admin): rekening → kas fisik sendiri.
- **Penyesuaian saldo** (pemilik/admin): mis. saldo awal rekening atau koreksi, wajib alasan.

Kas fisik hanya bisa dipindahkan oleh pemegangnya. Kasir hanya melihat saldo & mutasi kasnya sendiri; pemilik/admin melihat
semua akun. Void penjualan, batal pelunasan/bayar titipan, serta ubah/hapus pengeluaran dibukukan sebagai **mutasi balik**
(riwayat tetap utuh).

Saat fitur ini dipasang (`php artisan migrate`, perintah `cash:init`), saldo laci closing terakhir dimasukkan ke kas
Pemilik dan transaksi yang belum di-closing dibukukan ke akun masing-masing. Saldo awal rekening bank diisi lewat
*Penyesuaian saldo*.

## Level user

| Level | Hak akses |
| --- | --- |
| **Pemilik** (`owner`) | Semua fitur, termasuk pengaturan toko dan **batal closing**. |
| **Admin / Manajer** (`admin`) | Semua data, laporan (termasuk laba), diskon & promo, kas & rekening semua pengguna, void transaksi, closing, tagihan & pembayaran piutang, dan kelola pengguna (kecuali akun pemilik). |
| **Staf Gudang** (`gudang`) | Produk, supplier, pembelian, barang titipan, penyesuaian/opname, kartu stok, laporan stok & pembelian. |
| **Kasir** (`kasir`) | POS, **bon (penjualan kredit)**, pelanggan, riwayat transaksi **miliknya sendiri**, kas fisik sendiri (setor bank / serah terima), dan closing manual. Tidak melihat HPP/laba maupun mengelola tagihan. |

Hak akses diatur di satu tempat: `backend/app/Enums/UserRole.php` (method `permissions()`).
Frontend menyesuaikan menu otomatis dari daftar permission yang dikirim API.

## Aturan closing harian

1. **Tanggal usaha.** Setiap transaksi punya tanggal usaha. Normalnya sama dengan hari ini.
   Jika hari ini **sudah di-closing manual**, transaksi berikutnya otomatis masuk ke tanggal usaha **besok**.
2. **Closing manual** (menu Closing Harian): uang fisik **tiap pengguna** yang memegang kas dihitung satu per satu.
   *Kas seharusnya* per orang = saldo akhir kemarin + mutasi hari ini (penjualan & pelunasan tunai, pengeluaran,
   bayar titipan, setor bank, serah terima). Selisih hitung dibukukan ke kas orang tersebut, sehingga saldo besok
   sesuai uang yang benar-benar ada. Saldo rekening bank ditampilkan sebagai rekap.
3. **Closing otomatis** berjalan **setiap pukul 00:00** (`php artisan closing:auto`). Semua tanggal sebelum hari ini
   yang belum di-closing manual akan ditutup otomatis (tanpa hitung kas fisik). Hari yang sudah di-closing manual dilewati.
   Bisa dimatikan di Pengaturan Toko.
4. Closing **berurutan** per tanggal. Setelah di-closing, transaksi dan pengeluaran pada tanggal itu **terkunci**
   (tidak bisa di-void/diubah).
5. Hanya **pemilik** yang bisa membatalkan closing, dan hanya closing terakhir (untuk koreksi).

## Menjalankan (development)

Kebutuhan: PHP 8.3+, Composer, Node 20.19+ / 22+.

```bash
mkdir kanaka && cd kanaka
git clone https://github.com/edopranata/kanaka-backend.git backend
git clone https://github.com/edopranata/kanaka-frontend.git frontend

# Backend (API): http://localhost:8020
cd backend
composer install
cp .env.example .env && php artisan key:generate    # lewati bila .env sudah ada
php artisan migrate --seed                           # akun pemilik: owner / password
# opsional, data contoh 30 hari + user tiap level: php artisan db:seed --class=DemoSeeder
# opsional, master 50.601 barcode (file Excel tidak ikut repo, letakkan di database/ atau import lewat menu):
#   php artisan products:import "database/DATABASE 50.600+ DATA ITEM WARUNG IPOS4.xlsx"
php artisan serve --port=8020

# Scheduler (closing otomatis harian & tagihan bulanan) di terminal lain
php artisan schedule:work

# Frontend: http://localhost:5174 (API di-proxy ke backend :8020)
cd ../frontend
npm install
npm run dev
```

Akun demo (setelah `DemoSeeder`), semua dengan kata sandi `password`:
`owner` (Pemilik), `admin` (Admin), `gudang` (Staf Gudang), `kasir1` & `kasir2` (Kasir).

Test backend: `cd backend && php artisan test`

## Produksi

> **Hostinger (Cloud Hosting / hPanel) dengan 2 repo private + deploy otomatis lewat GitHub Actions:**
> ikuti **`DEPLOY.md` di repo backend**. Branch `main` = produksi (push → dites & terbit otomatis),
> branch `dev` = pengembangan (push → dites / cek build saja, tanpa deploy). Rilis dengan merge `dev` → `main`.

1. **Backend**: deploy Laravel seperti biasa (MySQL: ubah `DB_*` di `.env`, pastikan `APP_TIMEZONE=Asia/Jakarta`),
   jalankan `php artisan migrate --force --seed`, lalu segera ganti kata sandi `owner` di menu Akun Saya.
2. **Cron (wajib untuk closing otomatis & tagihan bulanan)**:
   ```
   * * * * * cd /path/ke/backend && php artisan schedule:run >> /dev/null 2>&1
   ```
   Jika server sempat mati saat tengah malam, closing yang tertinggal akan dikerjakan pada jalannya perintah berikutnya
   (atau jalankan manual `php artisan closing:auto`).
3. **Frontend disajikan Laravel (paling sederhana, satu domain)**: di folder `frontend` jalankan
   ```
   npm run build:laravel
   ```
   Aset (JS/CSS, service worker PWA, manifest, ikon) masuk ke `backend/public`, sedangkan `index.html` ke
   `backend/resources/spa/index.html`. `routes/web.php` menyajikan halaman itu untuk semua alamat di luar `/api`,
   jadi `/kas`, `/pembelian/5`, dll. bisa dibuka langsung / di-refresh. Cukup deploy folder `backend`
   (document root = `backend/public`). Jalankan ulang perintah ini setiap ada perubahan frontend; file build lama
   dibersihkan otomatis. Tanpa build, halaman `/` menampilkan halaman bawaan Laravel.
4. **Frontend terpisah** (alternatif): `npm run build`, lalu upload isi `frontend/dist/` ke web server.
   - Domain sama (SPA di `/`, `/api` diteruskan ke Laravel): biarkan `VITE_API_URL=/api/v1`.
   - Domain berbeda: set `VITE_API_URL=https://api.tokoanda.com/api/v1` sebelum build dan atur CORS di Laravel.
   - Arahkan semua path yang tidak ditemukan ke `index.html` (SPA fallback).
