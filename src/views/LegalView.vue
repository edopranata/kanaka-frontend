<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { appInfo, loadAppInfo } from '../utils/appInfo'

/**
 * Halaman publik Kebijakan Privasi & Ketentuan Layanan (dibutuhkan layar persetujuan Google untuk login Google &
 * backup ke Google Drive). Aplikasi internal koperasi; isi mengikuti fitur yang benar-benar ada.
 */
const route = useRoute()
const kind = computed(() => (route.name === 'terms' ? 'terms' : 'privacy'))
const updated = '13 November 2026'
const appName = computed(() => appInfo.value.app_name || 'Kanaka POS')
const owner = computed(() => appInfo.value.store_name || 'pengelola toko')
const contacts = computed(() => [appInfo.value.store_email, appInfo.value.store_phone, appInfo.value.store_address].filter(Boolean))

onMounted(async () => {
  await loadAppInfo()
  document.title = `${kind.value === 'terms' ? 'Ketentuan Layanan' : 'Kebijakan Privasi'} · ${appName.value}`
})
</script>

<template>
  <div class="min-h-dvh bg-slate-50 px-4 py-8 text-slate-700 sm:py-12">
    <article class="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-10">
      <p class="text-sm font-semibold text-brand-700">{{ appName }}</p>
      <h1 class="mt-1 text-2xl font-bold text-slate-900">{{ kind === 'terms' ? 'Ketentuan Layanan' : 'Kebijakan Privasi' }}</h1>
      <p class="mt-1 text-sm text-slate-500">Berlaku sejak {{ updated }} · Dikelola oleh {{ owner }}</p>

      <div class="legal mt-6 space-y-5 text-sm leading-relaxed">
        <template v-if="kind === 'privacy'">
          <p>
            {{ appName }} adalah aplikasi kasir, persediaan, dan keuangan yang dipakai <b>secara internal</b> oleh {{ owner }}. Aplikasi hanya dapat
            digunakan oleh pengguna yang akunnya dibuat oleh pengelola. Kebijakan ini menjelaskan data apa yang disimpan dan bagaimana data tersebut digunakan.
          </p>
          <section>
            <h2>1. Data yang kami simpan</h2>
            <ul>
              <li><b>Akun pengguna</b>: nama, nama pengguna, email, peran (role), foto profil (opsional), dan catatan aktivitas (log masuk & perubahan data) untuk keamanan.</li>
              <li><b>Data transaksi toko</b>: penjualan, bon/piutang pelanggan, pembelian, barang titipan, stok, kas, dan laporan.</li>
              <li><b>Data pelanggan & pemasok</b> yang dicatat pengelola (mis. nama dan nomor telepon) untuk keperluan transaksi dan tagihan.</li>
            </ul>
          </section>
          <section>
            <h2>2. Login dengan Google</h2>
            <p>
              Bila pengguna memilih menautkan akun Google, kami menerima <b>ID akun Google, alamat email, dan nama</b> dari Google semata-mata untuk
              mencocokkan dan memasukkan pengguna ke akunnya. Kami tidak menerima atau menyimpan kata sandi Google. Tautan dapat dilepas kapan saja di menu Profil Saya.
            </p>
          </section>
          <section>
            <h2>3. Backup ke Google Drive</h2>
            <p>
              Pemilik toko dapat menghubungkan Google Drive miliknya untuk menyimpan <b>salinan backup database aplikasi</b>. Aplikasi meminta izin
              <code>drive.file</code>, yaitu hanya dapat membuat dan mengelola file yang dibuat oleh aplikasi ini sendiri (folder "Kanaka Backup"); aplikasi
              <b>tidak dapat melihat, membaca, atau mengubah file lain</b> di Google Drive pengguna. Backup lama dihapus otomatis sesuai masa simpan yang diatur
              pemilik. Hubungan dapat diputuskan kapan saja di Pengaturan → Pemeliharaan atau di pengaturan keamanan akun Google.
            </p>
            <p>
              Penggunaan dan pemindahan informasi yang diterima dari Google API oleh {{ appName }} mematuhi
              <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Kebijakan Data Pengguna Layanan Google API</a>,
              termasuk persyaratan <i>Limited Use</i>.
            </p>
          </section>
          <section>
            <h2>4. Penggunaan & pembagian data</h2>
            <p>
              Data hanya digunakan untuk operasional toko (transaksi, laporan, tagihan, backup) dan keamanan akun. Data <b>tidak dijual, tidak dibagikan</b>
              kepada pihak lain, dan tidak digunakan untuk iklan. Pihak ketiga yang terlibat hanya penyedia layanan teknis: penyedia hosting server, layanan
              email untuk pengiriman kata sandi sementara/tagihan, dan Google (login & Google Drive) sesuai pilihan pengguna.
            </p>
          </section>
          <section>
            <h2>5. Penyimpanan & keamanan</h2>
            <p>
              Data disimpan di server aplikasi dengan koneksi terenkripsi (HTTPS). Akses dibatasi per peran, tersedia verifikasi dua langkah, dan kredensial
              Google Drive disimpan terenkripsi. Data transaksi disimpan selama diperlukan untuk pembukuan toko; log teknis dihapus berkala sesuai Pengaturan.
            </p>
          </section>
          <section>
            <h2>6. Hak pengguna</h2>
            <p>Pengguna dapat meminta pengelola untuk melihat, memperbaiki, atau menghapus data akunnya, serta melepas tautan Google kapan saja.</p>
          </section>
        </template>

        <template v-else>
          <p>Dengan menggunakan {{ appName }}, pengguna menyetujui ketentuan berikut.</p>
          <section>
            <h2>1. Penggunaan</h2>
            <p>
              {{ appName }} adalah aplikasi internal {{ owner }}. Akun dibuat oleh pengelola dan hanya boleh dipakai oleh pemiliknya untuk keperluan
              operasional toko sesuai peran yang diberikan.
            </p>
          </section>
          <section>
            <h2>2. Kewajiban pengguna</h2>
            <ul>
              <li>Menjaga kerahasiaan kata sandi dan tidak meminjamkan akun.</li>
              <li>Mencatat transaksi dengan benar dan jujur.</li>
              <li>Tidak mencoba mengakses data atau fitur di luar hak aksesnya.</li>
            </ul>
          </section>
          <section>
            <h2>3. Layanan Google</h2>
            <p>
              Login dengan Google dan backup ke Google Drive bersifat opsional dan tunduk pula pada ketentuan Google. Ketentuan penggunaan data Google dijelaskan
              di <RouterLink :to="{ name: 'privacy' }">Kebijakan Privasi</RouterLink>.
            </p>
          </section>
          <section>
            <h2>4. Ketersediaan & tanggung jawab</h2>
            <p>
              Pengelola berupaya menjaga aplikasi tetap tersedia dan data dicadangkan setiap hari, namun aplikasi disediakan sebagaimana adanya. Pengelola dapat
              menonaktifkan akun yang melanggar ketentuan ini.
            </p>
          </section>
          <section>
            <h2>5. Perubahan</h2>
            <p>Ketentuan dapat diperbarui sewaktu-waktu; tanggal berlaku di atas menunjukkan versi terbaru.</p>
          </section>
        </template>

        <section>
          <h2>Kontak</h2>
          <p>
            Pertanyaan atau permintaan terkait data dapat disampaikan kepada pengelola {{ owner }}<template v-if="contacts.length">: {{ contacts.join(' · ') }}</template>.
          </p>
        </section>
      </div>

      <p class="mt-8 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-4 text-sm">
        <RouterLink :to="{ name: kind === 'terms' ? 'privacy' : 'terms' }" class="text-brand-700 hover:underline">{{ kind === 'terms' ? 'Kebijakan Privasi' : 'Ketentuan Layanan' }}</RouterLink>
        <RouterLink :to="{ name: 'login' }" class="text-brand-700 hover:underline">Masuk ke aplikasi</RouterLink>
      </p>
    </article>
  </div>
</template>

<style scoped>
.legal h2 {
  margin-bottom: 0.375rem;
  font-weight: 600;
  color: var(--color-slate-900);
}
.legal ul {
  list-style: disc;
  padding-left: 1.25rem;
}
.legal li + li {
  margin-top: 0.25rem;
}
.legal a {
  color: var(--color-brand-700);
  text-decoration: underline;
}
.legal p + p {
  margin-top: 0.5rem;
}
</style>
