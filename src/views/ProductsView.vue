<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import http, { errorMessage, validationErrors } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { number, rupiah } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import EmptyState from '../components/EmptyState.vue'
import MoneyInput from '../components/MoneyInput.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'
import StatusBadge from '../components/StatusBadge.vue'

const auth = useAuthStore()
const toast = useToastStore()
const meta = useMetaStore()
const route = useRoute()
const canManage = auth.can('products.manage')

// Status default: hanya produk aktif (tampil di kasir). '' = semua status.
const filters = reactive({ search: '', category_id: '', low_stock: route.query.low_stock === '1' ? 1 : 0, sellable: '', active: route.query.active ?? '1' })
const products = ref([])
const pagination = ref(null)
const categories = ref([])
const loading = ref(false)

async function load(page = 1) {
  loading.value = true
  try {
    const { data } = await http.get('/products', { params: { ...filters, type: 'barang', low_stock: filters.low_stock || undefined, page } })
    products.value = data.data
    pagination.value = data.meta
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

async function loadCategories() {
  const { data } = await http.get('/categories')
  categories.value = data.data
}

// ---- Form produk ----
const emptyForm = () => ({
  id: null, sku: '', barcode: '', name: '', category_id: '', unit: meta.defaults.unit,
  cost_price: 0, min_stock: meta.defaults.min_stock, initial_stock: 0, is_active: true,
  units: [{ id: null, name: meta.defaults.unit, conversion: 1, barcode: '', sell_price: 0 }],
})
const nextSku = ref('')
const form = ref(null)
const errors = ref({})
const saving = ref(false)

function openForm(product = null) {
  errors.value = {}
  if (!product) {
    form.value = emptyForm()
    nextSku.value = ''
    http.get('/products/next-sku').then(({ data }) => (nextSku.value = data.sku)).catch(() => {})
    return
  }
  const units = (product.units || []).map((unit) => ({ ...unit, barcode: unit.barcode || '' }))
  if (!units.some((unit) => unit.conversion === 1)) {
    units.unshift({ id: null, name: product.unit, conversion: 1, barcode: '', sell_price: 0 })
  }
  form.value = { ...emptyForm(), ...product, category_id: product.category_id || '', cost_price: Math.round(product.cost_price || 0), units }
}

// ---- Satuan & harga jual ----
const baseUnit = (form) => form.units.find((unit) => unit.conversion === 1)
const extraUnits = (form) => form.units.filter((unit) => unit.conversion !== 1)

function addUnit() {
  form.value.units.push({ id: null, name: '', conversion: 2, barcode: '', sell_price: 0 })
}

function removeUnit(unit) {
  form.value.units.splice(form.value.units.indexOf(unit), 1)
}

/**
 * Harga per satuan dasar dan hematnya dibanding membeli eceran.
 */
function unitInfo(form, unit) {
  const base = baseUnit(form)?.sell_price || 0
  if (!unit.sell_price || !unit.conversion) return ''
  const perBase = unit.sell_price / unit.conversion
  const text = `${rupiah(perBase)}/${form.unit}`
  if (!base) return text
  const saving = (1 - perBase / base) * 100
  return saving > 0.05 ? `${text} · hemat ${saving.toFixed(1)}%` : saving < -0.05 ? `${text} · lebih mahal dari eceran` : text
}

const unitError = (index, field) => errors.value[`units.${index}.${field}`]

async function save() {
  saving.value = true
  errors.value = {}
  const payload = {
    ...form.value,
    category_id: form.value.category_id || null,
    barcode: form.value.barcode || null,
    units: form.value.units
      .filter((unit) => unit.id || unit.sell_price > 0)
      .map((unit) => ({ ...unit, name: unit.conversion === 1 ? form.value.unit : unit.name, barcode: unit.conversion === 1 ? null : unit.barcode || null })),
  }
  if (payload.id) delete payload.initial_stock
  try {
    if (payload.id) {
      await http.put(`/products/${payload.id}`, payload)
    } else {
      await http.post('/products', payload)
    }
    toast.success('Produk disimpan.')
    form.value = null
    load(pagination.value?.current_page || 1)
  } catch (e) {
    errors.value = validationErrors(e)
    if (!Object.keys(errors.value).length) toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

async function remove(product) {
  if (!confirm(`Hapus produk ${product.name}?`)) return
  try {
    await http.delete(`/products/${product.id}`)
    toast.success('Produk dihapus.')
    load()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

const margin = (form) => {
  const price = baseUnit(form)?.sell_price || 0
  return price > 0 ? (((price - form.cost_price) / price) * 100).toFixed(1) : null
}

// ---- Import Excel ----
const importModal = ref(false)
const importFile = ref(null)
const importUpdate = ref(false)
const importInactive = ref(false)
const importing = ref(false)
const importResult = ref(null)

async function runImport() {
  if (!importFile.value) return
  importing.value = true
  importResult.value = null
  try {
    const body = new FormData()
    body.append('file', importFile.value)
    body.append('update', importUpdate.value ? 1 : 0)
    body.append('inactive', importInactive.value ? 1 : 0)
    const { data } = await http.post('/products/import', body, { timeout: 600000 })
    importResult.value = data.data
    load()
    loadCategories()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    importing.value = false
  }
}

// ---- Kategori ----
const categoryModal = ref(false)
const categoryName = ref('')
const editingCategory = ref(null)

async function saveCategory() {
  try {
    if (editingCategory.value) {
      await http.put(`/categories/${editingCategory.value.id}`, { name: editingCategory.value.name })
      editingCategory.value = null
    } else {
      await http.post('/categories', { name: categoryName.value })
      categoryName.value = ''
    }
    loadCategories()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function removeCategory(category) {
  if (!confirm(`Hapus kategori ${category.name}? Produk di dalamnya menjadi tanpa kategori.`)) return
  await http.delete(`/categories/${category.id}`).catch((e) => toast.error(errorMessage(e)))
  loadCategories()
}

onMounted(() => {
  load()
  loadCategories()
})
</script>

<template>
  <div class="stagger">
    <PageHeader title="Produk" subtitle="Master barang, harga, dan stok">
      <template v-if="canManage" #actions>
        <button class="btn-secondary" @click="(importModal = true), (importResult = null)"><AppIcon name="upload" :size="16" /> Import Excel</button>
        <button class="btn-secondary" @click="categoryModal = true"><AppIcon name="tag" :size="16" /> Kategori</button>
        <button class="btn-primary" @click="openForm()"><AppIcon name="plus" :size="16" /> Produk Baru</button>
      </template>
    </PageHeader>

    <div class="card mb-4 grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-6">
      <input v-model="filters.search" type="search" class="input sm:col-span-2" placeholder="Cari nama / SKU / scan barcode…" @keydown.enter="load()" @search="load()" />
      <select v-model="filters.active" class="input" @change="load()">
        <option value="1">Aktif</option>
        <option value="0">Nonaktif</option>
        <option value="">Semua status</option>
      </select>
      <select v-model="filters.sellable" class="input" @change="load()">
        <option value="">Semua produk</option>
        <option value="1">Sudah ada harga jual</option>
        <option value="0">Belum ada harga jual</option>
      </select>
      <select v-model="filters.category_id" class="input" @change="load()">
        <option value="">Semua kategori</option>
        <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
      </select>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="filters.low_stock" type="checkbox" :true-value="1" :false-value="0" class="h-4 w-4 rounded border-slate-300" @change="load()" />
        Hanya stok menipis
      </label>
    </div>

    <div class="card overflow-hidden">
      <div class="table-wrap">
        <table v-stack class="table">
          <thead>
            <tr>
              <th>Produk</th>
              <th>Kategori</th>
              <th v-if="canManage" class="num">Harga Beli (HPP)</th>
              <th class="num">Harga Jual / Satuan</th>
              <th class="num">Stok</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="product in products" :key="product.id" :class="{ 'opacity-60': !product.is_active }">
              <td>
                <p class="font-medium">{{ product.name }}</p>
                <p class="text-xs text-slate-400">
                  {{ product.sku }}<template v-if="product.barcode && product.barcode !== product.sku"> · {{ product.barcode }}</template>
                </p>
                <p v-if="product.consignor" class="mt-0.5 text-xs text-sky-700">Titipan: {{ product.consignor.name }}</p>
              </td>
              <td class="stack-hide">{{ product.category || '-' }}</td>
              <td v-if="canManage" class="num">{{ rupiah(product.cost_price, false) }}</td>
              <td class="num">
                <span v-if="!product.has_price" class="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset">Belum ada harga</span>
                <template v-else>
                  <p class="font-medium">{{ product.sell_price ? rupiah(product.sell_price, false) : '-' }}</p>
                  <p v-for="unit in product.units.filter((unit) => unit.conversion !== 1)" :key="unit.id" class="text-xs text-slate-500">
                    {{ unit.name }} ({{ unit.conversion }}): {{ rupiah(unit.sell_price, false) }}
                  </p>
                </template>
              </td>
              <td class="num">
                <span :class="!product.has_price ? 'text-slate-400' : product.stock <= 0 ? 'font-semibold text-red-600' : product.is_low_stock ? 'font-semibold text-amber-600' : ''">
                  {{ number(product.stock) }}
                </span>
                <span class="ml-1 text-slate-400">{{ product.unit }}</span>
              </td>
              <td class="stack-hide">
                <StatusBadge v-if="!product.is_active" status="nonaktif" />
                <StatusBadge v-else-if="!product.has_price" status="master" />
                <StatusBadge v-else-if="product.is_low_stock" status="menipis" />
                <StatusBadge v-else status="aktif" />
              </td>
              <td class="text-right">
                <div class="flex justify-end gap-1">
                  <RouterLink v-if="auth.can('stock.view')" :to="{ name: 'stock-card', params: { id: product.id } }" class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Kartu stok">
                    <AppIcon name="clipboard" :size="16" />
                  </RouterLink>
                  <template v-if="canManage">
                    <button class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Ubah" @click="openForm(product)"><AppIcon name="pencil" :size="16" /></button>
                    <button class="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Hapus" @click="remove(product)"><AppIcon name="trash" :size="16" /></button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState
        v-if="!loading && !products.length"
        icon="cube"
        :title="filters.active === '1' ? 'Tidak ada produk aktif' : filters.active === '0' ? 'Tidak ada produk nonaktif' : 'Belum ada produk'"
        :text="filters.active === '1' ? 'Produk nonaktif (mis. hasil import master) tidak ditampilkan. Aktifkan produk setelah harga jualnya diisi.' : ''"
      >
        <button v-if="filters.active !== ''" class="btn-secondary" @click="filters.active = ''; load()">Tampilkan semua status</button>
      </EmptyState>
      <PaginationBar :meta="pagination" @page="load" />
    </div>

    <!-- Form produk -->
    <AppModal v-if="form" :title="form.id ? 'Ubah Produk' : 'Produk Baru'" size="lg" @close="form = null">
      <form id="product-form" class="grid gap-4 sm:grid-cols-2" @submit.prevent="save">
        <div class="sm:col-span-2">
          <label class="label">Nama produk</label>
          <input v-model="form.name" class="input" :class="{ 'input-error': errors.name }" required />
          <p v-if="errors.name" class="error-text">{{ errors.name }}</p>
        </div>
        <div>
          <label class="label">Kode produk (SKU)</label>
          <input
            v-model="form.sku"
            class="input"
            :class="{ 'input-error': errors.sku }"
            :required="!!form.id"
            :placeholder="form.id ? '' : `Otomatis: ${nextSku || '…'}`"
          />
          <p v-if="!form.id && !errors.sku" class="mt-1 text-xs text-slate-500">Kosongkan agar dibuat otomatis & berurutan.</p>
          <p v-if="errors.sku" class="error-text">{{ errors.sku }}</p>
        </div>
        <div>
          <label class="label">Barcode (opsional)</label>
          <input v-model="form.barcode" class="input" :class="{ 'input-error': errors.barcode }" placeholder="Scan barcode di sini" />
          <p v-if="errors.barcode" class="error-text">{{ errors.barcode }}</p>
        </div>
        <div>
          <label class="label">Kategori</label>
          <select v-model="form.category_id" class="input">
            <option value="">Tanpa kategori</option>
            <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
          </select>
        </div>
        <div>
          <label class="label">Satuan dasar (satuan stok)</label>
          <input v-model="form.unit" class="input uppercase" list="unit-names" required @input="form.unit = form.unit.toUpperCase()" />
          <p class="mt-1 text-xs text-slate-500">Stok & HPP dihitung dalam satuan ini.</p>
        </div>
        <div>
          <label class="label">HPP per {{ form.unit || 'satuan' }}</label>
          <MoneyInput v-model="form.cost_price" :invalid="!!errors.cost_price" />
          <p class="mt-1 text-xs text-slate-500">Diperbarui otomatis (rata-rata) setiap ada pembelian.</p>
        </div>
        <datalist id="unit-names"><option v-for="unit in ['PCS', 'BKS', 'BTL', 'SCT', 'KOTAK', 'BOX', 'DUS', 'PAK', 'RENTENG', 'LUSIN', 'KRAT', 'KG', 'LTR', 'SAK']" :key="unit" :value="unit" /></datalist>

        <!-- Satuan & harga jual -->
        <div class="rounded-xl border border-slate-200 sm:col-span-2">
          <div class="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <div>
              <p class="text-sm font-semibold text-slate-800">Satuan & harga jual</p>
              <p class="text-xs text-slate-500">Harga tiap satuan bebas diatur, mis. 1 BOX isi 6 bisa lebih murah dari 6 × harga {{ form.unit || 'PCS' }}.</p>
            </div>
            <button type="button" class="btn-secondary btn-sm" @click="addUnit"><AppIcon name="plus" :size="14" /> Satuan</button>
          </div>
          <div class="divide-y divide-slate-100">
            <div v-for="(unit, index) in form.units" :key="index" class="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-[1fr_5rem_1.3fr_1.3fr_auto] sm:items-start">
              <div>
                <label class="text-xs text-slate-500">Satuan</label>
                <input v-if="unit.conversion === 1" :value="form.unit" class="input bg-slate-50" disabled />
                <input v-else v-model="unit.name" class="input uppercase" list="unit-names" placeholder="BOX" required @input="unit.name = unit.name.toUpperCase()" />
                <p v-if="unitError(form.units.indexOf(unit), 'name')" class="error-text">{{ unitError(form.units.indexOf(unit), 'name') }}</p>
              </div>
              <div>
                <label class="text-xs text-slate-500">Isi</label>
                <input v-model.number="unit.conversion" type="number" min="2" class="input" :disabled="unit.conversion === 1 && unit === baseUnit(form)" />
                <p v-if="unitError(form.units.indexOf(unit), 'conversion')" class="error-text">{{ unitError(form.units.indexOf(unit), 'conversion') }}</p>
              </div>
              <div>
                <label class="text-xs text-slate-500">Barcode satuan</label>
                <input v-if="unit === baseUnit(form)" :value="form.barcode || '(barcode produk)'" class="input bg-slate-50 text-slate-400" disabled />
                <input v-else v-model="unit.barcode" class="input" placeholder="Opsional (barcode dus)" />
                <p v-if="unitError(form.units.indexOf(unit), 'barcode')" class="error-text">{{ unitError(form.units.indexOf(unit), 'barcode') }}</p>
              </div>
              <div>
                <label class="text-xs text-slate-500">Harga jual</label>
                <MoneyInput v-model="unit.sell_price" />
                <p class="mt-1 text-xs text-slate-500">
                  <template v-if="unit === baseUnit(form)">
                    <span v-if="margin(form) !== null" :class="{ 'text-red-600': margin(form) < 0 }">Margin {{ margin(form) }}%</span>
                    <span v-else class="text-amber-600">Isi harga agar bisa dijual</span>
                  </template>
                  <template v-else>{{ unitInfo(form, unit) }}</template>
                </p>
              </div>
              <div class="flex items-end justify-end sm:pt-5">
                <button v-if="unit !== baseUnit(form)" type="button" class="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus satuan" @click="removeUnit(unit)">
                  <AppIcon name="trash" :size="16" />
                </button>
              </div>
            </div>
          </div>
          <p v-if="errors.units" class="error-text px-4 pb-3">{{ errors.units }}</p>
        </div>
        <div>
          <label class="label">Stok minimum (peringatan)</label>
          <input v-model.number="form.min_stock" type="number" min="0" class="input" />
        </div>
        <div v-if="!form.id">
          <label class="label">Stok awal</label>
          <input v-model.number="form.initial_stock" type="number" min="0" class="input" />
        </div>
        <div v-else>
          <label class="label">Stok saat ini</label>
          <p class="input bg-slate-50">{{ number(form.stock) }} {{ form.unit }}</p>
          <p class="mt-1 text-xs text-slate-500">Ubah stok lewat Pembelian atau Penyesuaian Stok.</p>
        </div>
        <label class="flex items-start gap-2 text-sm sm:col-span-2">
          <input v-model="form.is_active" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>
            Produk aktif (tampil di kasir & bon)
            <span class="block text-xs text-slate-500">Produk nonaktif tidak dijual langsung, tetapi tetap bisa menjadi bahan paket, dibeli, dititipkan, dan di-opname.</span>
          </span>
        </label>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="form = null">Batal</button>
        <button class="btn-primary" type="submit" form="product-form" :disabled="saving">{{ saving ? 'Menyimpan…' : 'Simpan' }}</button>
      </template>
    </AppModal>

    <!-- Import Excel -->
    <AppModal v-if="importModal" title="Import Produk dari Excel" @close="importModal = false">
      <div class="space-y-4 text-sm">
        <p class="text-slate-600">
          Format template <b>iPOS</b>: kolom <code>KODE ITEM</code>, <code>BARCODE</code>, <code>NAMA ITEM</code>, <code>JENIS</code>, <code>SATUAN</code>,
          <code>KONVERSI SATUAN DASAR</code>, <code>HARGA POKOK</code>, <code>HARGA JUAL</code>, <code>STOK</code>, <code>STOK MINIMUM</code>.
          Baris dengan kode item sama dan satuan berbeda menjadi satuan tambahan (multi satuan).
        </p>
        <input type="file" accept=".xlsx,.xls,.csv" class="input" @change="importFile = $event.target.files[0]" />
        <p class="-mt-2 text-xs text-slate-500">
          File besar (puluhan ribu barang) sebaiknya <b>CSV</b> agar hemat memori server. Ubah dari Excel dengan
          <code>php artisan products:to-csv file.xlsx</code> (barcode tetap utuh).
        </p>
        <label class="flex items-start gap-2">
          <input v-model="importUpdate" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>Perbarui produk yang kodenya sudah ada (nama, kategori, harga). Stok produk lama tidak diubah.</span>
        </label>
        <label class="flex items-start gap-2">
          <input v-model="importInactive" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>Jadikan produk baru <b>nonaktif</b> (tidak tampil di kasir sampai diaktifkan). Cocok untuk master awal.</span>
        </label>
        <p class="text-xs text-slate-500">File sangat besar (puluhan ribu baris) lebih cepat diimport lewat server: <code>php artisan products:import "file.xlsx"</code>.</p>
        <div v-if="importResult" class="rounded-lg bg-emerald-50 p-3 text-emerald-800">
          <p class="font-medium">Import selesai: {{ number(importResult.created) }} produk baru, {{ number(importResult.updated) }} diperbarui, {{ number(importResult.units) }} satuan & harga, {{ number(importResult.skipped) }} dilewati.</p>
          <ul v-if="importResult.errors.length" class="mt-2 max-h-32 list-disc overflow-y-auto pl-5 text-xs text-amber-800">
            <li v-for="(error, index) in importResult.errors.slice(0, 50)" :key="index">{{ error }}</li>
          </ul>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="importModal = false">Tutup</button>
        <button class="btn-primary" :disabled="!importFile || importing" @click="runImport">{{ importing ? 'Mengimport… (bisa beberapa menit)' : 'Import' }}</button>
      </template>
    </AppModal>

    <!-- Kategori -->
    <AppModal v-if="categoryModal" title="Kategori Produk" @close="categoryModal = false">
      <form class="mb-4 flex gap-2" @submit.prevent="saveCategory">
        <input v-model="categoryName" class="input" placeholder="Nama kategori baru" required />
        <button class="btn-primary" type="submit">Tambah</button>
      </form>
      <ul class="divide-y divide-slate-100">
        <li v-for="category in categories" :key="category.id" class="flex items-center justify-between gap-2 py-2 text-sm">
          <form v-if="editingCategory?.id === category.id" class="flex flex-1 gap-2" @submit.prevent="saveCategory">
            <input v-model="editingCategory.name" class="input" required />
            <button class="btn-primary btn-sm" type="submit">Simpan</button>
          </form>
          <template v-else>
            <span>{{ category.name }} <span class="text-slate-400">({{ category.products_count }})</span></span>
            <span class="flex gap-1">
              <button class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" @click="editingCategory = { ...category }"><AppIcon name="pencil" :size="16" /></button>
              <button class="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" @click="removeCategory(category)"><AppIcon name="trash" :size="16" /></button>
            </span>
          </template>
        </li>
      </ul>
    </AppModal>
  </div>
</template>
