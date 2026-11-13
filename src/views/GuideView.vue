<script setup>
import { nextTick, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useMetaStore } from '../stores/meta'
import AppIcon from '../components/AppIcon.vue'

/**
 * Panduan singkat kasir & gudang (alur harian toko), bisa dicetak 1–2 halaman A4 untuk pelatihan.
 * Tombol "?" di header membuka bagian yang sesuai halaman yang sedang dibuka (#anchor).
 */
const route = useRoute()
const meta = useMetaStore()
const print = () => window.print()

const sections = [
  { id: 'mulai', title: 'Mulai hari', icon: 'clock' },
  { id: 'titipan-masuk', title: 'Pagi: titipan masuk', icon: 'inbox' },
  { id: 'kasir', title: 'Kasir (POS)', icon: 'cart' },
  { id: 'bon', title: 'Bon karyawan', icon: 'book' },
  { id: 'penyelesaian', title: 'Sore: penyelesaian titipan', icon: 'clipboard' },
  { id: 'bayar-titipan', title: 'Bayar penitip', icon: 'handover' },
  { id: 'pembelian', title: 'Pembelian barang', icon: 'truck' },
  { id: 'kas', title: 'Kas, setor & pengeluaran', icon: 'cash' },
  { id: 'closing', title: 'Tutup hari: closing', icon: 'lock' },
  { id: 'masalah', title: 'Bila ada masalah', icon: 'alert' },
]

onMounted(async () => {
  await nextTick()
  if (route.hash) document.querySelector(route.hash)?.scrollIntoView({ block: 'start' })
})
</script>

<template>
  <div class="guide">
    <div class="no-print mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900">Panduan Kasir &amp; Gudang</h1>
        <p class="text-sm text-slate-500">Alur harian {{ meta.store?.name || 'toko' }} — dari titipan pagi sampai closing sore.</p>
      </div>
      <button type="button" class="btn-secondary" @click="print"><AppIcon name="printer" :size="16" /> Cetak panduan</button>
    </div>

    <nav class="no-print mb-5 flex flex-wrap gap-1.5">
      <a v-for="section in sections" :key="section.id" :href="`#${section.id}`" class="tab inline-flex items-center gap-1.5 bg-white ring-1 ring-slate-200">
        <AppIcon :name="section.icon" :size="14" /> {{ section.title }}
      </a>
    </nav>

    <!-- Judul hanya saat dicetak -->
    <div class="mb-3 hidden border-b border-slate-300 pb-2 print:block">
      <p class="text-base font-bold">Panduan Kasir &amp; Gudang — {{ meta.store?.name || '' }}</p>
      <p class="text-[10px] text-slate-600">Aplikasi: ksu.my.id · Jam toko 07.00–17.00 · Simpan di dekat kasir</p>
    </div>

    <div class="columns-1 gap-4 md:columns-2 xl:columns-3 2xl:columns-4 print:columns-2 print:gap-5 print:text-[10.5px] print:leading-snug">
      <section id="mulai" class="card scroll-mt-20">
        <h2><span>1</span> Mulai hari</h2>
        <ol>
          <li>Buka <b>ksu.my.id</b> (atau ikon aplikasi di layar HP/PC) lalu masuk dengan akun masing-masing — <b>jangan pakai akun teman</b>.</li>
          <li>Bila muncul <i>Versi baru tersedia</i>, klik <b>Perbarui</b> (sebelum mulai transaksi).</li>
          <li>Cek printer: menu nama Anda (kiri bawah) → <b>Printer struk</b>. Bila memakai dialog cetak browser, cukup pastikan printer menyala.</li>
          <li>Tanggal usaha tampil di atas layar — pastikan sesuai hari ini.</li>
        </ol>
      </section>

      <section id="titipan-masuk" class="card scroll-mt-20">
        <h2><span>2</span> Pagi: titipan masuk</h2>
        <p class="hint">Untuk makanan/cemilan titipan (nasi, lauk, gorengan, kerupuk…).</p>
        <ol>
          <li><b>Inventory → Barang Titipan → Titipan Masuk</b>.</li>
          <li>Pilih <b>penitip</b>, tambah barangnya, isi <b>jumlah</b> dan <b>harga setor</b> (harga yang dibayar ke penitip).</li>
          <li><b>Simpan Titipan</b>. Stok bertambah; belum menjadi hutang.</li>
        </ol>
        <p class="hint">Barang titipan tidak dicatat lewat Pembelian.</p>
      </section>

      <section id="kasir" class="card scroll-mt-20">
        <h2><span>3</span> Kasir (POS)</h2>
        <ol>
          <li>Menu <b>Kasir (POS)</b> atau tombol <b>Buka Kasir</b>.</li>
          <li>Cari / scan barang (<b>F2</b>) lalu klik barangnya. Ubah jumlah dengan + / −. Menu prasmanan dipilih dari menu paket (bahan opsional bisa dihilangkan).</li>
          <li>Klik <b>Bayar (F8)</b> → pilih metode:
            <ul>
              <li><b>Tunai</b>: isi <i>Uang diterima</i> (atau <i>Uang pas</i> / nominal cepat) — kembalian tampil otomatis.</li>
              <li><b>QRIS</b>: pastikan notifikasi dana masuk BRI sudah muncul <b>sebelum</b> menyimpan.</li>
              <li><b>Transfer</b>: cek bukti transfer.</li>
            </ul>
          </li>
          <li><b>Selesaikan Transaksi</b> → <b>Cetak Struk</b> bila perlu → <b>Transaksi Baru (Enter)</b>.</li>
        </ol>
        <p class="hint">Barang stok 0 disembunyikan; centang <i>Tampilkan stok 0</i> bila perlu.</p>
      </section>

      <section id="bon" class="card scroll-mt-20">
        <h2><span>4</span> Bon karyawan (bayar bulanan)</h2>
        <ol>
          <li><b>Penjualan → Penjualan Kredit (Bon) → Bon Baru</b>.</li>
          <li>Pilih <b>pelanggan</b> (lihat sisa bon & tagihannya di panel kiri), tambah barang.</li>
          <li><b>Simpan Bon</b> → periksa isi di dialog konfirmasi → <b>Ya, Simpan Bon</b> → <b>Cetak Nota</b> untuk ditandatangani.</li>
        </ol>
        <p class="hint">Bon ditagih otomatis tanggal 1. Pembayaran bon: <b>Keuangan → Tagihan &amp; Piutang</b> → <i>Bayar sebagian</i> (pilih baris yang dibayar).</p>
      </section>

      <section id="penyelesaian" class="card scroll-mt-20">
        <h2><span>5</span> Sore: penyelesaian titipan</h2>
        <ol>
          <li><b>Barang Titipan → Selesaikan Titipan</b> → pilih penitip.</li>
          <li>Hitung barang yang tersisa, isi <b>Sisa fisik</b>. Kolom <i>Dibayar</i> = yang terjual.</li>
          <li>Sisa dikembalikan ke penitip: klik <b>Retur semua</b> (per baris) atau <b>Retur semua sisa</b> (semua barang).</li>
          <li>Pilih <b>Bayar sekarang</b> (pilih metode: Tunai / Transfer / …) atau <b>Bayar nanti (hutang)</b> → <b>Simpan Penyelesaian</b>.</li>
        </ol>
      </section>

      <section id="bayar-titipan" class="card scroll-mt-20">
        <h2><span>6</span> Bayar penitip (2–3 hari sekali)</h2>
        <ol>
          <li><b>Barang Titipan</b> → tab <b>Per Supplier</b> → tombol <b>Bayar</b> pada penitip.</li>
          <li>Centang hari-hari yang dibayar → pilih metode → <b>Bayar</b>.</li>
          <li><b>Cetak bukti</b> dan minta tanda tangan penitip.</li>
        </ol>
      </section>

      <section id="pembelian" class="card scroll-mt-20">
        <h2><span>7</span> Pembelian barang (milik koperasi)</h2>
        <ol>
          <li><b>Inventory → Pembelian → Pembelian Baru</b>: pilih supplier, no. faktur, barang, jumlah &amp; harga beli.</li>
          <li><b>Lunas sekarang</b> (pilih metode bayar) atau <b>Tempo (bayar nanti)</b> + tanggal jatuh tempo (mis. dropship air mineral dibayar 3 hari kemudian).</li>
          <li>Membayar tempo: <b>Pembelian</b> → tab <b>Belum lunas</b> → buka pembelian → <b>Bayar Hutang</b>.</li>
        </ol>
        <p class="hint">Hutang yang jatuh tempo ≤ 3 hari tampil di Dashboard.</p>
      </section>

      <section id="kas" class="card scroll-mt-20">
        <h2><span>8</span> Kas, setor &amp; pengeluaran</h2>
        <ul>
          <li>Uang tunai masuk ke laci kasir (laci bersama bila diatur pemilik, mis. <i>Laci Depan</i>). Saldo: <b>Keuangan → Kas &amp; Bank</b>.</li>
          <li>Setor ke rekening: <b>Kas &amp; Bank → Setor ke Bank</b>.</li>
          <li>Menyerahkan uang ke pemilik/admin: <b>Serah Terima</b> — saldo pindah setelah penerima menekan <b>Terima</b>.</li>
          <li>Belanja operasional (gas, plastik, dll.): <b>Keuangan → Pengeluaran → Catat Pengeluaran</b>.</li>
        </ul>
      </section>

      <section id="closing" class="card scroll-mt-20">
        <h2><span>9</span> Tutup hari: closing</h2>
        <ol>
          <li>Pastikan penyelesaian titipan &amp; pengeluaran hari ini sudah dicatat.</li>
          <li><b>Keuangan → Closing Harian → Closing Manual</b>.</li>
          <li>Hitung uang di laci, isi per laci (<i>Hitung pecahan</i> membantu) → <b>Closing Sekarang</b>.</li>
          <li>Selisih uang tercatat otomatis — laporkan ke pemilik bila ada selisih.</li>
        </ol>
        <p class="hint">Lupa closing? Sistem closing otomatis pukul 24:00, tetapi tanpa hitung uang laci.</p>
      </section>

      <section id="masalah" class="card scroll-mt-20">
        <h2><span>10</span> Bila ada masalah</h2>
        <ul>
          <li><b>Layar macet / koneksi putus saat bayar</b>: tekan tombol bayar lagi — <b>aman</b>, transaksi tidak tercatat dua kali. Jangan input ulang dari awal.</li>
          <li><b>Salah transaksi</b>: minta pemilik/admin membatalkan di <b>Riwayat Penjualan</b> (wajib alasan), lalu buat transaksi baru.</li>
          <li><b>Printer tidak mencetak</b>: menu nama Anda → <b>Printer struk</b> → <i>Hubungkan printer</i>; sementara cetak lewat dialog browser.</li>
          <li><b>“Terlalu banyak percobaan”</b>: tunggu 1 menit lalu coba lagi.</li>
          <li><b>Internet mati</b>: catat sementara di buku, input ke aplikasi setelah tersambung.</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.guide section {
  display: inline-block;
  width: 100%;
  margin-bottom: 1rem;
  padding: 1rem 1.25rem;
  break-inside: avoid;
}
.guide h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: var(--color-slate-900);
}
.guide h2 span {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 9999px;
  background: var(--color-brand-50);
  color: var(--color-brand-700);
  font-size: 0.75rem;
}
.guide ol,
.guide ul {
  padding-left: 1.25rem;
  font-size: 0.875rem;
  color: var(--color-slate-700);
}
.guide ol {
  list-style: decimal;
}
.guide ul {
  list-style: disc;
}
.guide li + li {
  margin-top: 0.25rem;
}
.guide li ul {
  margin-top: 0.25rem;
}
.guide .hint {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-slate-500);
}
@media print {
  .guide section {
    margin-bottom: 0.5rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--color-slate-300);
    border-radius: 6px;
    box-shadow: none;
  }
  .guide h2 {
    margin-bottom: 0.2rem;
    font-size: 11.5px;
  }
  .guide h2 span {
    width: 1.1rem;
    height: 1.1rem;
    font-size: 9px;
  }
  .guide ol,
  .guide ul {
    font-size: 10.5px;
  }
  .guide li + li {
    margin-top: 0.1rem;
  }
  .guide .hint {
    margin-top: 0.2rem;
    font-size: 9.5px;
  }
}
</style>
