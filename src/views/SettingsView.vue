<script setup>
import { computed, onMounted, ref } from 'vue'
import http, { errorMessage, validationErrors } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import AppIcon from '../components/AppIcon.vue'
import PageHeader from '../components/PageHeader.vue'

const meta = useMetaStore()
const toast = useToastStore()
const form = ref(null)
const serverPreview = ref({})
const errors = ref({})
const saving = ref(false)
const tab = ref('app')

const tabs = [
  { key: 'app', label: 'Aplikasi', icon: 'cog' },
  { key: 'store', label: 'Toko & Struk', icon: 'receipt' },
  { key: 'numbering', label: 'Penomoran & Kode', icon: 'tag' },
  { key: 'transaction', label: 'Transaksi & Stok', icon: 'cube' },
  { key: 'closing', label: 'Closing, Kas & Tagihan', icon: 'lock' },
]

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
    app: ['app_name', 'app_tagline'],
    store: ['store_name', 'store_address', 'store_phone', 'receipt_footer', 'receipt_paper'],
    numbering: ['prefix_', 'doc_number', 'sku_', 'package_sku'],
    transaction: ['tax_percent', 'default_', 'package_default', 'expense_categories', 'allow_negative'],
    closing: ['auto_closing', 'auto_billing', 'bill_due_days', 'cash_account_'],
  }
  return Object.keys(fields).filter((tabKey) => keys.some((key) => fields[tabKey].some((field) => key.startsWith(field))))
})

async function save() {
  saving.value = true
  errors.value = {}
  try {
    const { data } = await http.put('/settings', form.value)
    form.value = data.data
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
  const { data } = await http.get('/settings')
  form.value = data.data
  serverPreview.value = data.preview
  http.get('/cash/accounts').then(({ data }) => (banks.value = data.data.filter((account) => account.type === 'bank'))).catch(() => {})
})
</script>

<template>
  <div class="stagger">
    <PageHeader title="Pengaturan Aplikasi" subtitle="Hanya dapat diakses dan diubah oleh Pemilik">
      <template #actions>
        <button class="btn-primary" :disabled="saving || !form" @click="save"><AppIcon name="check" :size="16" /> {{ saving ? 'Menyimpan…' : 'Simpan Pengaturan' }}</button>
      </template>
    </PageHeader>

    <div v-if="form" class="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
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

      <form @submit.prevent="save">
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
          </section>

          <!-- Toko & struk -->
          <section v-else-if="tab === 'store'" key="store" class="card space-y-4 p-5">
            <h2 class="font-semibold">Identitas toko & struk</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="label">Nama toko</label>
                <input v-model="form.store_name" class="input" :class="{ 'input-error': errors.store_name }" required />
              </div>
              <div>
                <label class="label">Telepon</label>
                <input v-model="form.store_phone" class="input" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Alamat</label>
                <input v-model="form.store_address" class="input" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Catatan kaki struk</label>
                <input v-model="form.receipt_footer" class="input" />
              </div>
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
          <section v-else key="closing" class="card space-y-4 p-5">
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
        </Transition>

        <div class="mt-4 flex justify-end">
          <button class="btn-primary" type="submit" :disabled="saving">{{ saving ? 'Menyimpan…' : 'Simpan Pengaturan' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
