<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import http, { errorMessage, validationErrors } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import AppIcon from '../components/AppIcon.vue'
import PageHeader from '../components/PageHeader.vue'
import PrinterSettings from '../components/PrinterSettings.vue'

const auth = useAuthStore()
const meta = useMetaStore()
const toast = useToastStore()
// Pengaturan aplikasi hanya pemilik; tab Printer (per perangkat) untuk semua pengguna.
const canManage = auth.can('settings.manage')
const form = ref(null)
const serverPreview = ref({})
const errors = ref({})
const saving = ref(false)
// ?tab=printer dari pemberitahuan printer di halaman kasir.
const tab = ref(canManage && useRoute().query.tab !== 'printer' ? 'app' : 'printer')

// Catatan kaki struk diatur per baris (disimpan sebagai teks dipisah baris baru).
const FOOTER_LINES = 6
const FOOTER_WIDTH = 32
const footer = ref([])
watch(footer, (lines) => form.value && (form.value.receipt_footer = lines.join('\n')), { deep: true })
const footerPreview = computed(() => {
  const lines = footer.value.map((line) => line.trim()).filter(Boolean)
  return ['-'.repeat(FOOTER_WIDTH), ...lines.map((line) => center(line)), ...(form.value?.receipt_qr ? ['', center('[QR]'), center('Scan untuk struk digital')] : [])].join('\n')
})
const setFooter = (text) => (footer.value = String(text || '').split('\n').filter((line) => line !== '') || [])

// Header struk: nama toko, alamat, alamat 2 (opsional), kontak (Telp / Email), lalu jarak ke isi struk.
const HEADER_WIDTH = 48
const addressSplit = ref(false)
const center = (text, width = FOOTER_WIDTH) => ' '.repeat(Math.max(0, Math.floor((width - text.length) / 2))) + text
/** Lipat teks per kata selebar struk 58 mm (sama seperti cetak ESC/POS). */
function wrapWords(text, width = FOOTER_WIDTH) {
  const lines = []
  let current = ''
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (current && (current + ' ' + word).length > width) {
      lines.push(current)
      current = ''
    }
    current = current ? `${current} ${word}` : word
    while (current.length > width) {
      lines.push(current.slice(0, width))
      current = current.slice(width)
    }
  }
  if (current) lines.push(current)
  return lines
}
// Pratinjau header mengikuti ukuran kertas yang dipilih (58 mm = 32 karakter, 80 mm = 48).
const headerWidth = computed(() => (form.value?.receipt_paper === '80' ? 48 : FOOTER_WIDTH))
const headerPreview = computed(() => {
  const f = form.value
  if (!f) return ''
  const width = headerWidth.value
  const contact = f.receipt_contact === 'email' ? (f.store_email ? `Email: ${f.store_email}` : '') : f.store_phone ? `Telp. ${f.store_phone}` : ''
  const lines = [f.store_name, f.store_address, f.store_address2, contact].filter((line) => String(line || '').trim())
  return [...lines.flatMap((line) => wrapWords(line, width).map((part) => center(part, width))), ...Array(Number(f.receipt_header_gap) || 1).fill(''), '-'.repeat(width), 'No   : INV-20261027-0001'].join('\n')
})
/**
 * Alamat lama (satu baris panjang) dipecah menjadi Alamat + Alamat 2, utamakan setelah tanda baca yang
 * paling dekat ke tengah. Tersimpan setelah klik Simpan.
 */
function splitAddress(values) {
  addressSplit.value = false
  const address = String(values.store_address || '').trim()
  if (address.length <= HEADER_WIDTH || values.store_address2) return
  const breaks = [...address.matchAll(/[.,;]?\s+/g)]
    .map((match) => ({ at: match.index, end: match.index + match[0].length, punct: match[0].trim() !== '' }))
    .filter(({ at, end }) => at <= HEADER_WIDTH && address.length - end <= HEADER_WIDTH)
  if (!breaks.length) return
  const middle = address.length / 2
  const best = breaks.sort((a, b) => b.punct - a.punct || Math.abs(a.at - middle) - Math.abs(b.at - middle))[0]
  const punct = address.slice(best.at, best.end).trim()
  values.store_address = address.slice(0, best.at) + punct
  values.store_address2 = address.slice(best.end)
  addressSplit.value = true
}

const appTabs = [
  { key: 'app', label: 'Aplikasi', icon: 'cog' },
  { key: 'store', label: 'Toko & Struk', icon: 'receipt' },
  { key: 'numbering', label: 'Penomoran & Kode', icon: 'tag' },
  { key: 'transaction', label: 'Transaksi & Stok', icon: 'cube' },
  { key: 'closing', label: 'Closing, Kas & Tagihan', icon: 'lock' },
  { key: 'security', label: 'Keamanan & Email', icon: 'shield' },
  { key: 'maintenance', label: 'Pemeliharaan', icon: 'archive' },
]
const printerTab = { key: 'printer', label: 'Printer (perangkat ini)', icon: 'printer' }
const tabs = canManage ? [...appTabs, printerTab] : [printerTab]

const documents = [
  { key: 'prefix_sale', type: 'sale', label: 'Nota penjualan (kasir)' },
  { key: 'prefix_credit', type: 'credit', label: 'Bon (penjualan kredit)' },
  { key: 'prefix_purchase', type: 'purchase', label: 'Pembelian' },
  { key: 'prefix_adjustment', type: 'adjustment', label: 'Penyesuaian stok' },
  { key: 'prefix_opname', type: 'opname', label: 'Stok opname' },
  { key: 'prefix_bill', type: 'bill', label: 'Tagihan piutang' },
  { key: 'prefix_consignment', type: 'consignment', label: 'Titipan masuk' },
  { key: 'prefix_consignment_settlement', type: 'consignment_settlement', label: 'Penyelesaian titipan' },
  { key: 'prefix_cash_transfer', type: 'cash_transfer', label: 'Perpindahan kas (setor / serah terima)' },
]

const bankMethods = [
  { key: 'cash_account_transfer', label: 'Transfer Bank' },
  { key: 'cash_account_qris', label: 'QRIS' },
  { key: 'cash_account_kartu', label: 'Kartu Debit/Kredit' },
  { key: 'cash_account_va', label: 'Virtual Account' },
]
const banks = ref([])

// Contoh nomor langsung dari isian (tanpa menunggu simpan).
const today = new Date()
const pad = (value) => String(value).padStart(2, '0')
const period = computed(() => {
  const ymd = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`
  return { daily: ymd, monthly: ymd.slice(0, 6), yearly: ymd.slice(0, 4) }[form.value?.doc_number_reset] || ymd
})
const docPreview = (prefix) => `${(prefix || '').toUpperCase()}-${period.value}-${'1'.padStart(form.value.doc_number_digits || 4, '0')}`
const skuPreview = (prefix) => `${(prefix || '').toUpperCase()}${'1'.padStart(form.value.sku_digits || 7, '0')}`
const errorTabs = computed(() => {
  const keys = Object.keys(errors.value)
  const fields = {
    app: ['app_name', 'app_tagline', 'report_'],
    store: ['store_', 'receipt_'],
    numbering: ['prefix_', 'doc_number', 'sku_', 'package_sku'],
    transaction: ['tax_percent', 'default_', 'package_default', 'expense_categories', 'allow_negative'],
    closing: ['auto_closing', 'auto_billing', 'bill_due_days', 'cash_account_'],
    security: ['temp_password'],
    maintenance: ['retention_'],
  }
  return Object.keys(fields).filter((tabKey) => keys.some((key) => fields[tabKey].some((field) => key.startsWith(field))))
})

// Pemeliharaan: pemakaian penyimpanan & pembersihan (log, cache, session, login lama).
const retention = [
  { key: 'retention_log_days', label: 'File log', unit: 'hari', min: 1, max: 365, hint: 'Isi laravel.log & log lain yang lebih lama dihapus; juga catatan job gagal.' },
  { key: 'retention_cache_days', label: 'Cache', unit: 'hari', min: 1, max: 90, hint: 'Cache kedaluwarsa dihapus tiap hari; seluruh cache dikosongkan setiap N hari (dibangun ulang otomatis).' },
  { key: 'retention_session_hours', label: 'Session browser', unit: 'jam', min: 1, max: 720, hint: 'Session yang tidak aktif lebih lama dihapus. Tidak memengaruhi login kasir.' },
  { key: 'retention_token_days', label: 'Login tidak dipakai', unit: 'hari', min: 0, max: 365, hint: 'Perangkat yang tidak membuka aplikasi selama N hari harus login ulang. 0 = tidak pernah dihapus.' },
]
const maintenance = ref(null)
const cleaning = ref(false)
const cleanupResults = ref(null)
const fileSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(0, Math.round(bytes / 1024))} KB`)
const lastRun = computed(() => maintenance.value?.last_run?.ran_at ? new Date(maintenance.value.last_run.ran_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : null)

async function loadMaintenance() {
  try {
    maintenance.value = (await http.get('/maintenance')).data.data
  } catch {
    // tidak kritis
  }
}

async function cleanup() {
  cleaning.value = true
  try {
    const { data } = await http.post('/maintenance/cleanup')
    cleanupResults.value = data.results
    maintenance.value = data.data
    toast.success('Pembersihan selesai.')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    cleaning.value = false
  }
}
watch(tab, (value) => value === 'maintenance' && canManage && loadMaintenance())

// Keamanan: konfigurasi email & login Google dari .env (hanya ditampilkan) + email uji.
const system = ref(null)
const sendingTestMail = ref(false)
const tempPasswordLabel = computed(() => {
  const hours = Number(form.value?.temp_password_hours) || 0
  return hours % 24 === 0 && hours ? `${hours / 24} hari` : `${hours} jam`
})

async function testMail() {
  sendingTestMail.value = true
  try {
    const { data } = await http.post('/settings/test-mail')
    toast.success(data.message)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    sendingTestMail.value = false
  }
}

async function save() {
  saving.value = true
  errors.value = {}
  try {
    const { data } = await http.put('/settings', form.value)
    form.value = data.data
    system.value = data.system
    addressSplit.value = false
    setFooter(data.data.receipt_footer)
    serverPreview.value = data.preview
    meta.load(true)
    toast.success('Pengaturan disimpan.')
  } catch (e) {
    errors.value = validationErrors(e)
    toast.error(errorMessage(e))
    if (errorTabs.value.length && !errorTabs.value.includes(tab.value)) tab.value = errorTabs.value[0]
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  if (!canManage) return
  const { data } = await http.get('/settings')
  form.value = data.data
  system.value = data.system
  splitAddress(form.value)
  setFooter(data.data.receipt_footer)
  if (!footer.value.length) footer.value.push('')
  serverPreview.value = data.preview
  http.get('/cash/accounts').then(({ data }) => (banks.value = data.data.filter((account) => account.type === 'bank'))).catch(() => {})
})
</script>

<template>
  <div class="stagger">
    <PageHeader :title="canManage ? 'Pengaturan Aplikasi' : 'Pengaturan'" :subtitle="canManage ? 'Pengaturan aplikasi hanya oleh Pemilik; printer diatur per perangkat' : 'Printer struk di perangkat ini'">
      <template v-if="canManage && tab !== 'printer'" #actions>
        <button class="btn-primary" :disabled="saving || !form" @click="save"><AppIcon name="check" :size="16" /> {{ saving ? 'Menyimpan…' : 'Simpan Pengaturan' }}</button>
      </template>
    </PageHeader>

    <div v-if="form || !canManage" class="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <!-- Navigasi tab -->
      <nav class="flex gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1 lg:flex-col lg:self-start lg:bg-transparent lg:p-0">
        <button
          v-for="item in tabs"
          :key="item.key"
          type="button"
          class="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition duration-200"
          :class="tab === item.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:bg-white/70'"
          @click="tab = item.key"
        >
          <AppIcon :name="item.icon" :size="18" />
          {{ item.label }}
          <span v-if="errorTabs.includes(item.key)" class="ml-auto h-2 w-2 rounded-full bg-red-500" />
        </button>
      </nav>

      <Transition v-if="tab === 'printer'" name="page" appear>
        <PrinterSettings />
      </Transition>
      <form v-else @submit.prevent="save">
        <Transition name="page" mode="out-in">
          <!-- Aplikasi -->
          <section v-if="tab === 'app'" key="app" class="card space-y-4 p-5">
            <h2 class="font-semibold">Identitas aplikasi</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="label">Nama aplikasi</label>
                <input v-model="form.app_name" class="input" :class="{ 'input-error': errors.app_name }" required />
                <p v-if="errors.app_name" class="error-text">{{ errors.app_name }}</p>
                <p class="mt-1 text-xs text-slate-500">Tampil di halaman masuk dan menu samping.</p>
              </div>
              <div>
                <label class="label">Slogan / keterangan</label>
                <input v-model="form.app_tagline" class="input" />
              </div>
            </div>
            <div class="rounded-xl bg-gradient-to-br from-brand-800 to-brand-600 p-5 text-white">
              <p class="text-xs tracking-wide text-brand-100 uppercase">Pratinjau halaman masuk</p>
              <p class="mt-2 text-xl font-semibold">{{ form.app_name || 'Nama aplikasi' }}</p>
              <p class="text-sm text-brand-100">{{ form.app_tagline }}</p>
            </div>

            <h2 class="border-t border-slate-100 pt-4 font-semibold">Kertas laporan (Export PDF)</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="label">Ukuran kertas</label>
                <div class="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
                  <button v-for="paper in ['A4', 'F4', 'Letter', 'Legal']" :key="paper" type="button" class="tab justify-center" :class="{ 'tab-active': form.report_paper === paper }" @click="form.report_paper = paper">{{ paper }}</button>
                </div>
                <p class="mt-1 text-xs text-slate-500">{{ { A4: 'A4 · 210 × 297 mm', F4: 'F4 / Folio · 215 × 330 mm', Letter: 'Letter · 216 × 279 mm', Legal: 'Legal · 216 × 356 mm' }[form.report_paper] }}</p>
              </div>
              <div>
                <label class="label">Orientasi</label>
                <div class="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                  <button v-for="(label, value) in { auto: 'Otomatis', portrait: 'Portrait', landscape: 'Landscape' }" :key="value" type="button" class="tab justify-center" :class="{ 'tab-active': form.report_orientation === value }" @click="form.report_orientation = value">{{ label }}</button>
                </div>
                <p class="mt-1 text-xs text-slate-500">Otomatis: landscape bila kolom laporan terlalu lebar untuk portrait.</p>
              </div>
            </div>
          </section>

          <!-- Toko & struk -->
          <section v-else-if="tab === 'store'" key="store" class="card space-y-4 p-5">
            <h2 class="font-semibold">Identitas toko & struk</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <p class="label">Header struk</p>
                <div class="grid gap-3" :class="headerWidth > FOOTER_WIDTH ? 'xl:grid-cols-[minmax(0,1fr)_22rem]' : 'lg:grid-cols-[minmax(0,1fr)_16rem]'">
                  <div class="space-y-3">
                    <div>
                      <label class="mb-1 block text-xs font-medium text-slate-500">Baris 1 · Nama toko</label>
                      <input v-model="form.store_name" class="input" :class="{ 'input-error': errors.store_name }" maxlength="100" required />
                      <p v-if="errors.store_name" class="error-text">{{ errors.store_name }}</p>
                    </div>
                    <div v-for="field in [{ key: 'store_address', label: 'Baris 2 · Alamat', placeholder: 'mis. Jl. Jend. Sudirman No 12' }, { key: 'store_address2', label: 'Baris 3 · Alamat 2 (opsional)', placeholder: 'mis. Pekanbaru, Riau' }]" :key="field.key">
                      <label class="mb-1 block text-xs font-medium text-slate-500">{{ field.label }}</label>
                      <div class="relative">
                        <input v-model="form[field.key]" class="input pr-14" :class="{ 'input-error': errors[field.key] }" :maxlength="HEADER_WIDTH" :placeholder="field.placeholder" />
                        <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs tabular-nums" :class="(form[field.key] || '').length > FOOTER_WIDTH ? 'text-amber-600' : 'text-slate-400'">{{ (form[field.key] || '').length }}/{{ FOOTER_WIDTH }}</span>
                      </div>
                      <p v-if="errors[field.key]" class="error-text">{{ errors[field.key] }}</p>
                    </div>
                    <p v-if="addressSplit" class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Alamat lama terlalu panjang untuk satu baris, sudah dipecah otomatis menjadi Alamat &amp; Alamat 2. Periksa lalu klik Simpan.</p>
                    <div>
                      <p class="mb-1 block text-xs font-medium text-slate-500">Baris terakhir · Kontak yang dicetak</p>
                      <div class="mb-2 grid max-w-xs grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                        <button type="button" class="tab justify-center" :class="{ 'tab-active': form.receipt_contact === 'phone' }" @click="form.receipt_contact = 'phone'">Telp</button>
                        <button type="button" class="tab justify-center" :class="{ 'tab-active': form.receipt_contact === 'email' }" @click="form.receipt_contact = 'email'">Email</button>
                      </div>
                      <div class="grid gap-2 sm:grid-cols-2">
                        <div>
                          <input v-model="form.store_phone" class="input" :class="{ 'input-error': errors.store_phone, 'ring-1 ring-brand-300': form.receipt_contact === 'phone' }" maxlength="30" placeholder="Telepon, mis. 0812-3456-7890" />
                          <p v-if="errors.store_phone" class="error-text">{{ errors.store_phone }}</p>
                        </div>
                        <div>
                          <input v-model="form.store_email" type="email" class="input" :class="{ 'input-error': errors.store_email, 'ring-1 ring-brand-300': form.receipt_contact === 'email' }" maxlength="100" placeholder="Email, mis. toko@contoh.id" />
                          <p v-if="errors.store_email" class="error-text">{{ errors.store_email }}</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p class="mb-1 block text-xs font-medium text-slate-500">Jarak header ke isi struk</p>
                      <div class="grid max-w-xs grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                        <button v-for="gap in [1, 2, 3]" :key="gap" type="button" class="tab justify-center" :class="{ 'tab-active': Number(form.receipt_header_gap) === gap }" @click="form.receipt_header_gap = gap">{{ gap }} baris</button>
                      </div>
                    </div>
                    <p class="text-xs text-slate-500">Alamat maks. {{ HEADER_WIDTH }} karakter per baris; lebih dari {{ FOOTER_WIDTH }} karakter akan dilipat menjadi 2 baris di kertas 58 mm. Kontak kosong tidak dicetak.</p>
                  </div>
                  <div>
                    <p class="mb-1 text-xs text-slate-500">Pratinjau ({{ form.receipt_paper }} mm)</p>
                    <pre class="overflow-x-auto rounded-lg border border-dashed border-slate-300 bg-white p-2 font-mono text-[11px] leading-snug text-slate-700">{{ headerPreview }}</pre>
                  </div>
                </div>
              </div>
              <div class="sm:col-span-2">
                <label class="label">Catatan kaki struk</label>
                <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
                  <div class="space-y-2">
                    <div v-for="(line, index) in footer" :key="index" class="flex items-center gap-2">
                      <span class="w-5 shrink-0 text-right text-xs text-slate-400">{{ index + 1 }}</span>
                      <div class="relative min-w-0 flex-1">
                        <input v-model="footer[index]" class="input pr-14" :maxlength="FOOTER_WIDTH" placeholder="mis. Terima kasih atas kunjungan Anda" />
                        <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs tabular-nums" :class="line.length >= FOOTER_WIDTH ? 'text-amber-600' : 'text-slate-400'">{{ line.length }}/{{ FOOTER_WIDTH }}</span>
                      </div>
                      <button type="button" class="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus baris" @click="footer.splice(index, 1)"><AppIcon name="trash" :size="16" /></button>
                    </div>
                    <button type="button" class="btn-secondary btn-sm" :disabled="footer.length >= FOOTER_LINES" @click="footer.push('')">
                      <AppIcon name="plus" :size="14" /> Tambah baris
                    </button>
                    <p class="text-xs text-slate-500">Maks. {{ FOOTER_LINES }} baris × {{ FOOTER_WIDTH }} karakter (lebar struk 58 mm). Baris kosong diabaikan.</p>
                    <p v-if="errors.receipt_footer" class="error-text">{{ errors.receipt_footer }}</p>
                  </div>
                  <div>
                    <p class="mb-1 text-xs text-slate-500">Pratinjau (58 mm)</p>
                    <pre class="rounded-lg border border-dashed border-slate-300 bg-white p-2 font-mono text-[11px] leading-snug text-slate-700">{{ footerPreview }}</pre>
                  </div>
                </div>
              </div>
              <label class="flex items-start gap-3 sm:col-span-2">
                <input v-model="form.receipt_qr" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
                <span>
                  <span class="block text-sm font-medium">Tampilkan QR struk digital</span>
                  <span class="block text-xs text-slate-500">QR di bawah struk; pembeli scan untuk membuka struk ini secara online (tanpa login).</span>
                </span>
              </label>
              <div>
                <label class="label">Ukuran kertas struk</label>
                <div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                  <button type="button" class="tab justify-center" :class="{ 'tab-active': form.receipt_paper === '58' }" @click="form.receipt_paper = '58'">58 mm</button>
                  <button type="button" class="tab justify-center" :class="{ 'tab-active': form.receipt_paper === '80' }" @click="form.receipt_paper = '80'">80 mm</button>
                </div>
              </div>
            </div>
          </section>

          <!-- Penomoran & kode -->
          <section v-else-if="tab === 'numbering'" key="numbering" class="space-y-5">
            <div class="card p-5">
              <h2 class="font-semibold">Nomor dokumen</h2>
              <p class="mb-4 text-sm text-slate-500">Format: <code>PREFIX-PERIODE-URUT</code>. Prefix hanya huruf besar & angka. Perubahan berlaku untuk dokumen baru.</p>
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="label">Nomor urut diulang setiap</label>
                  <select v-model="form.doc_number_reset" class="input">
                    <option value="daily">Hari (INV-20260928-0001)</option>
                    <option value="monthly">Bulan (INV-202609-0001)</option>
                    <option value="yearly">Tahun (INV-2026-0001)</option>
                  </select>
                </div>
                <div>
                  <label class="label">Jumlah digit nomor urut</label>
                  <input v-model.number="form.doc_number_digits" type="number" min="3" max="8" class="input" :class="{ 'input-error': errors.doc_number_digits }" />
                  <p v-if="errors.doc_number_digits" class="error-text">{{ errors.doc_number_digits }}</p>
                </div>
              </div>
              <div class="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                <div v-for="doc in documents" :key="doc.key" class="grid items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)]">
                  <label class="text-sm font-medium text-slate-700" :for="doc.key">{{ doc.label }}</label>
                  <div>
                    <input :id="doc.key" v-model="form[doc.key]" class="input uppercase" maxlength="10" :class="{ 'input-error': errors[doc.key] }" @input="form[doc.key] = form[doc.key].toUpperCase()" />
                    <p v-if="errors[doc.key]" class="error-text">{{ errors[doc.key] }}</p>
                  </div>
                  <code class="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 tabular-nums">{{ docPreview(form[doc.key]) }}</code>
                </div>
              </div>
            </div>

            <div class="card p-5">
              <h2 class="font-semibold">Kode produk (SKU)</h2>
              <p class="mb-4 text-sm text-slate-500">
                SKU dibuat otomatis & berurutan untuk produk baru. SKU berikutnya: <b class="tabular-nums">{{ serverPreview.next_sku }}</b>.
              </p>
              <div class="grid gap-4 sm:grid-cols-3">
                <div>
                  <label class="label">Prefix SKU barang</label>
                  <input v-model="form.sku_prefix" class="input uppercase" maxlength="10" :class="{ 'input-error': errors.sku_prefix }" @input="form.sku_prefix = form.sku_prefix.toUpperCase()" />
                  <p v-if="errors.sku_prefix" class="error-text">{{ errors.sku_prefix }}</p>
                  <p class="mt-1 text-xs text-slate-500">Contoh: <code>{{ skuPreview(form.sku_prefix) }}</code></p>
                </div>
                <div>
                  <label class="label">Prefix kode paket</label>
                  <input v-model="form.package_sku_prefix" class="input uppercase" maxlength="10" :class="{ 'input-error': errors.package_sku_prefix }" @input="form.package_sku_prefix = form.package_sku_prefix.toUpperCase()" />
                  <p v-if="errors.package_sku_prefix" class="error-text">{{ errors.package_sku_prefix }}</p>
                  <p class="mt-1 text-xs text-slate-500">Contoh: <code>{{ skuPreview(form.package_sku_prefix) }}</code></p>
                </div>
                <div>
                  <label class="label">Jumlah digit</label>
                  <input v-model.number="form.sku_digits" type="number" min="3" max="10" class="input" :class="{ 'input-error': errors.sku_digits }" />
                </div>
              </div>
              <p class="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                Mengubah prefix tidak mengganti SKU produk lama. Untuk menomori ulang semua produk jalankan di server:
                <code>php artisan products:renumber-sku</code>
              </p>
            </div>
          </section>

          <!-- Transaksi & stok -->
          <section v-else-if="tab === 'transaction'" key="transaction" class="card space-y-4 p-5">
            <h2 class="font-semibold">Transaksi & stok</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="label">Pajak penjualan (%)</label>
                <input v-model.number="form.tax_percent" type="number" min="0" max="100" step="0.01" class="input" :class="{ 'input-error': errors.tax_percent }" />
                <p class="mt-1 text-xs text-slate-500">Isi 0 jika tidak memungut pajak (mis. PPN 11).</p>
              </div>

              <div>
                <label class="label">Satuan bawaan produk baru</label>
                <input v-model="form.default_unit" class="input uppercase" @input="form.default_unit = form.default_unit.toUpperCase()" />
              </div>
              <div>
                <label class="label">Stok minimum bawaan produk baru</label>
                <input v-model.number="form.default_min_stock" type="number" min="0" class="input" />
              </div>
              <div>
                <label class="label">Satuan bawaan paket / menu olahan</label>
                <input v-model="form.package_default_unit" class="input uppercase" @input="form.package_default_unit = form.package_default_unit.toUpperCase()" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Kategori pengeluaran (pisahkan dengan koma)</label>
                <textarea v-model="form.expense_categories" rows="2" class="input" />
              </div>
            </div>
            <label class="flex items-start gap-3">
              <input v-model="form.allow_negative_stock" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
              <span>
                <span class="block text-sm font-medium">Izinkan stok minus</span>
                <span class="block text-xs text-slate-500">Jika aktif, kasir tetap bisa menjual walau stok di sistem kosong.</span>
              </span>
            </label>
          </section>

          <!-- Closing & tagihan -->
          <section v-else-if="tab === 'closing'" key="closing" class="card space-y-4 p-5">
            <h2 class="font-semibold">Closing harian & tagihan</h2>
            <label class="flex items-start gap-3">
              <input v-model="form.auto_closing" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
              <span>
                <span class="block text-sm font-medium">Closing otomatis setiap pukul 24:00</span>
                <span class="block text-xs text-slate-500">Hari yang belum di-closing manual akan ditutup otomatis oleh sistem. Membutuhkan scheduler (cron) aktif di server.</span>
              </span>
            </label>
            <label class="flex items-start gap-3">
              <input v-model="form.auto_billing" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
              <span>
                <span class="block text-sm font-medium">Tagihan bulanan otomatis (tanggal 1 pukul 01:00)</span>
                <span class="block text-xs text-slate-500">Semua bon penjualan kredit bulan sebelumnya dibuatkan tagihan per pelanggan.</span>
              </span>
            </label>
            <div class="rounded-xl border border-slate-200 p-4">
              <p class="text-sm font-medium">Rekening tujuan transaksi non tunai</p>
              <p class="mb-3 text-xs text-slate-500">
                Uang tunai masuk ke kas fisik kasir masing-masing; transaksi non tunai masuk ke rekening di bawah ini.
                Rekening dikelola di menu <RouterLink :to="{ name: 'cash' }" class="text-brand-700 underline">Kas &amp; Bank</RouterLink>.
              </p>
              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div v-for="item in bankMethods" :key="item.key">
                  <label class="label">{{ item.label }}</label>
                  <select v-model.number="form[item.key]" class="input" :class="{ 'input-error': errors[item.key] }">
                    <option :value="0">Rekening pertama{{ banks[0] ? ` (${banks[0].name})` : '' }}</option>
                    <option v-for="bank in banks" :key="bank.id" :value="bank.id">{{ bank.name }}</option>
                  </select>
                  <p v-if="errors[item.key]" class="error-text">{{ errors[item.key] }}</p>
                </div>
              </div>
            </div>
            <div class="max-w-xs">
              <label class="label">Jatuh tempo tagihan (hari setelah tagihan dibuat)</label>
              <input v-model.number="form.bill_due_days" type="number" min="0" max="90" class="input" :class="{ 'input-error': errors.bill_due_days }" />
            </div>
          </section>

          <!-- Keamanan & email -->
          <section v-else-if="tab === 'security'" key="security" class="space-y-5">
            <div class="card space-y-4 p-5">
              <div>
                <h2 class="font-semibold">Pengguna baru &amp; atur ulang kata sandi</h2>
                <p class="text-sm text-slate-500">Saat pengguna dibuat (atau pemilik mengirim ulang dari menu Pengguna), kata sandi sementara dikirim ke email pengguna. Pengguna wajib membuat kata sandi sendiri saat pertama masuk.</p>
              </div>
              <div class="max-w-xs">
                <label class="label">Masa berlaku kata sandi sementara</label>
                <div class="relative">
                  <input v-model.number="form.temp_password_hours" type="number" min="1" max="168" class="input pr-14" :class="{ 'input-error': errors.temp_password_hours }" />
                  <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-400">jam</span>
                </div>
                <p v-if="errors.temp_password_hours" class="error-text">{{ errors.temp_password_hours }}</p>
                <p v-else class="mt-1 text-xs text-slate-500">= {{ tempPasswordLabel }}. Maks. 168 jam (7 hari). Setelah lewat, pengguna memakai "Lupa kata sandi?" atau minta dikirim ulang.</p>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="hours in [12, 24, 48, 72]" :key="hours" type="button" class="tab" :class="{ 'tab-active': Number(form.temp_password_hours) === hours }" @click="form.temp_password_hours = hours">{{ hours % 24 ? `${hours} jam` : `${hours / 24} hari` }}</button>
              </div>
            </div>

            <div v-if="system" class="card space-y-4 p-5">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="font-semibold">Email &amp; login (dari file .env server)</h2>
                  <p class="text-sm text-slate-500">Diubah di file .env (MAIL_*, FRONTEND_URL, GOOGLE_CLIENT_ID), lalu jalankan <code class="rounded bg-slate-100 px-1">php artisan config:clear</code>.</p>
                </div>
                <button type="button" class="btn-secondary btn-sm" :disabled="sendingTestMail || !auth.user?.email" :title="auth.user?.email ? '' : 'Akun Anda belum memiliki email'" @click="testMail">
                  <AppIcon name="inbox" :size="14" /> {{ sendingTestMail ? 'Mengirim…' : `Kirim email uji${auth.user?.email ? ` ke ${auth.user.email}` : ''}` }}
                </button>
              </div>
              <dl class="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                <div class="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-3 py-2">
                  <dt class="text-slate-500">Pengiriman email</dt>
                  <dd class="font-medium">
                    {{ system.mailer }}{{ system.mail_host ? ` · ${system.mail_host}` : '' }}
                    <span v-if="['log', 'array'].includes(system.mailer)" class="ml-1 text-xs font-normal text-amber-700">(email tidak benar-benar dikirim)</span>
                  </dd>
                </div>
                <div class="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-3 py-2"><dt class="text-slate-500">Alamat pengirim</dt><dd class="font-medium">{{ system.mail_from }}</dd></div>
                <div class="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-3 py-2"><dt class="text-slate-500">Alamat aplikasi di email</dt><dd class="font-medium break-all">{{ system.frontend_url }}</dd></div>
                <div class="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-3 py-2"><dt class="text-slate-500">Tautan lupa kata sandi berlaku</dt><dd class="font-medium">{{ system.reset_link_minutes }} menit</dd></div>
                <div class="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-3 py-2">
                  <dt class="text-slate-500">Masuk dengan Google</dt>
                  <dd class="font-medium" :class="system.google_enabled ? 'text-emerald-700' : 'text-slate-500'">{{ system.google_enabled ? 'Aktif' : 'Tidak aktif (GOOGLE_CLIENT_ID kosong)' }}</dd>
                </div>
              </dl>
              <p class="text-xs text-slate-500">Verifikasi 2 langkah (MFA) dan tautan akun Google diatur masing-masing pengguna di menu Akun Saya.</p>
            </div>
          </section>

          <!-- Pemeliharaan -->
          <section v-else key="maintenance" class="space-y-5">
            <div class="card space-y-4 p-5">
              <div>
                <h2 class="font-semibold">Masa simpan</h2>
                <p class="text-sm text-slate-500">Dibersihkan otomatis setiap hari pukul 02:30 oleh scheduler (cron). Data transaksi &amp; Log Aktivitas tidak dihapus.</p>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div v-for="item in retention" :key="item.key">
                  <label class="label">{{ item.label }}</label>
                  <div class="relative">
                    <input v-model.number="form[item.key]" type="number" :min="item.min" :max="item.max" class="input pr-14" :class="{ 'input-error': errors[item.key] }" />
                    <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-400">{{ item.unit }}</span>
                  </div>
                  <p v-if="errors[item.key]" class="error-text">{{ errors[item.key] }}</p>
                  <p class="mt-1 text-xs text-slate-500">{{ item.hint }}</p>
                </div>
              </div>
            </div>

            <div class="card space-y-4 p-5">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="font-semibold">Penyimpanan saat ini</h2>
                  <p class="text-sm text-slate-500">{{ lastRun ? `Pembersihan terakhir: ${lastRun}` : 'Belum pernah dibersihkan.' }}</p>
                </div>
                <button type="button" class="btn-secondary btn-sm" :disabled="cleaning" @click="cleanup"><AppIcon name="refresh" :size="14" :class="{ 'animate-spin': cleaning }" /> {{ cleaning ? 'Membersihkan…' : 'Bersihkan sekarang' }}</button>
              </div>
              <div v-if="maintenance" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div class="rounded-xl bg-slate-50 p-3">
                  <p class="text-xs text-slate-500">File log</p>
                  <p class="text-lg font-semibold tabular-nums">{{ fileSize(maintenance.logs.bytes) }}</p>
                  <p class="text-xs text-slate-500">{{ maintenance.logs.files }} file</p>
                </div>
                <div class="rounded-xl bg-slate-50 p-3">
                  <p class="text-xs text-slate-500">Cache</p>
                  <p class="text-lg font-semibold tabular-nums">{{ maintenance.cache.entries ?? '-' }}</p>
                  <p class="text-xs text-slate-500">entri · {{ maintenance.cache.driver }}</p>
                </div>
                <div class="rounded-xl bg-slate-50 p-3">
                  <p class="text-xs text-slate-500">Session browser</p>
                  <p class="text-lg font-semibold tabular-nums">{{ maintenance.sessions.entries ?? '-' }}</p>
                  <p class="text-xs text-slate-500">session · {{ maintenance.sessions.driver }}</p>
                </div>
                <div class="rounded-xl bg-slate-50 p-3">
                  <p class="text-xs text-slate-500">Login (token)</p>
                  <p class="text-lg font-semibold tabular-nums">{{ maintenance.tokens.entries }}</p>
                  <p class="text-xs text-slate-500">perangkat / sesi login</p>
                </div>
              </div>
              <p v-else class="text-sm text-slate-400">Memuat…</p>
              <div v-if="cleanupResults || maintenance?.last_run?.results" class="table-wrap">
                <table class="table">
                  <thead><tr><th>Bagian</th><th>Aturan</th><th class="num">Dihapus</th><th class="num">Ukuran</th></tr></thead>
                  <tbody>
                    <tr v-for="row in cleanupResults || maintenance.last_run.results" :key="row.key">
                      <td class="font-medium">{{ row.label }}</td>
                      <td class="text-slate-500">{{ row.detail }}</td>
                      <td class="num">{{ row.count }}</td>
                      <td class="num">{{ row.bytes ? fileSize(row.bytes) : '-' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="text-xs text-slate-500">Perubahan masa simpan berlaku setelah klik <b>Simpan Pengaturan</b>. Di hosting, pastikan cron menjalankan <code>scripts/cron-schedule.sh</code> setiap menit.</p>
            </div>
          </section>
        </Transition>

        <div class="mt-4 flex justify-end">
          <button class="btn-primary" type="submit" :disabled="saving">{{ saving ? 'Menyimpan…' : 'Simpan Pengaturan' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
