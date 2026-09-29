<script setup>
import { computed, onMounted, ref } from 'vue'
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
import ProductSearch from '../components/ProductSearch.vue'
import StatusBadge from '../components/StatusBadge.vue'

const auth = useAuthStore()
const toast = useToastStore()
const meta = useMetaStore()
const canManage = auth.can('products.manage')

const packages = ref([])
const categories = ref([])
const search = ref('')
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const { data } = await http.get('/packages', { params: { search: search.value || undefined } })
    packages.value = data.data
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

const materialPrice = (item) => item.sell_price || item.cost_price || 0

/**
 * Nilai bahan (harga jual eceran), HPP bahan, jasa, dan laba untuk satu paket/form.
 */
function calc(pkg) {
  const components = pkg.components || []
  // Bahan tanpa harga jual (mis. hanya dipakai di paket) dinilai dengan HPP-nya.
  const materialValue = components.reduce((sum, item) => sum + item.qty * materialPrice(item), 0)
  const cost = components.reduce((sum, item) => sum + item.qty * (item.cost_price || 0), 0)
  const price = pkg.sell_price || 0
  return {
    materialValue,
    cost,
    service: price - materialValue,
    profit: price - cost,
    margin: price > 0 ? ((price - cost) / price) * 100 : 0,
  }
}

// ---- Form ----
const form = ref(null)
const errors = ref({})
const saving = ref(false)

const nextSku = ref('')

function openForm(pkg = null) {
  errors.value = {}
  form.value = pkg
    ? {
        id: pkg.id,
        name: pkg.name,
        sku: pkg.sku,
        category_id: pkg.category_id || '',
        unit: pkg.unit,
        sell_price: pkg.sell_price || 0,
        is_active: pkg.is_active,
        components: pkg.components.map((item) => ({ ...item })),
      }
    : { id: null, name: '', sku: '', category_id: '', unit: meta.defaults.package_unit, sell_price: 0, is_active: true, components: [] }
  if (!pkg) {
    nextSku.value = ''
    http.get('/products/next-sku', { params: { type: 'paket' } }).then(({ data }) => (nextSku.value = data.sku)).catch(() => {})
  }
}

function addComponent(product) {
  if (form.value.components.some((item) => item.component_id === product.id)) {
    toast.error(`${product.name} sudah ada di daftar bahan.`)
    return
  }
  form.value.components.push({
    component_id: product.id,
    name: product.name,
    unit: product.unit,
    stock: product.stock,
    is_active: product.is_active,
    sell_price: product.sell_price || 0,
    cost_price: product.cost_price || 0,
    qty: 1,
    // Bahan pertama otomatis jadi bahan utama.
    is_optional: form.value.components.length > 0,
    omit_price: form.value.components.length > 0 ? product.sell_price || 0 : 0,
  })
}

const formCalc = computed(() => (form.value ? calc(form.value) : null))
const optionalTotal = computed(() => form.value?.components.filter((item) => item.is_optional).reduce((sum, item) => sum + (item.omit_price || 0), 0) || 0)
const componentError = (index, field) => errors.value[`components.${index}.${field}`]

async function save() {
  saving.value = true
  errors.value = {}
  const payload = {
    ...form.value,
    category_id: form.value.category_id || null,
    components: form.value.components.map(({ component_id, qty, is_optional, omit_price }) => ({ component_id, qty, is_optional, omit_price: is_optional ? omit_price : 0 })),
  }
  try {
    if (payload.id) {
      await http.put(`/packages/${payload.id}`, payload)
    } else {
      await http.post('/packages', payload)
    }
    toast.success('Paket disimpan.')
    form.value = null
    load()
  } catch (e) {
    errors.value = validationErrors(e)
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

async function remove(pkg) {
  if (!confirm(`Hapus paket ${pkg.name}?`)) return
  try {
    await http.delete(`/products/${pkg.id}`)
    toast.success('Paket dihapus.')
    load()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

onMounted(() => {
  load()
  http.get('/categories').then(({ data }) => (categories.value = data.data)).catch(() => {})
})
</script>

<template>
  <div class="stagger">
    <PageHeader title="Paket / Menu Olahan" subtitle="Produk racikan dari beberapa bahan, mis. Indomie + Telur dimasak. Stok diambil dari bahan-bahannya.">
      <template v-if="canManage" #actions>
        <button class="btn-primary" @click="openForm()"><AppIcon name="plus" :size="16" /> Paket Baru</button>
      </template>
    </PageHeader>

    <div class="card mb-4 p-4">
      <input v-model="search" type="search" class="input" placeholder="Cari nama / kode paket…" @keydown.enter="load" @search="load" />
    </div>

    <div v-if="packages.length" class="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]">
      <article v-for="pkg in packages" :key="pkg.id" class="card card-hover flex flex-col p-5" :class="{ 'opacity-60': !pkg.is_active }">
        <header class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-base font-semibold text-slate-900">{{ pkg.name }}</p>
            <p class="text-xs text-slate-500">{{ pkg.sku }}<template v-if="pkg.category"> · {{ pkg.category }}</template></p>
          </div>
          <div class="text-right">
            <p class="text-lg font-bold text-brand-700 tabular-nums">{{ rupiah(pkg.sell_price) }}</p>
            <p class="text-xs text-slate-500">per {{ pkg.unit }}</p>
          </div>
        </header>

        <ul class="mt-4 space-y-1.5 text-sm">
          <li v-for="item in pkg.components" :key="item.id" class="flex items-center justify-between gap-2">
            <span class="min-w-0 truncate">
              {{ item.qty }} {{ item.unit }} {{ item.name }}
              <span v-if="item.is_active === false" class="text-xs text-slate-400">(nonaktif)</span>
            </span>
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset"
              :class="item.is_optional ? 'bg-sky-50 text-sky-700 ring-sky-600/20' : 'bg-brand-50 text-brand-700 ring-brand-600/20'"
            >
              {{ item.is_optional ? `Opsional −${number(item.omit_price)}` : 'Bahan utama' }}
            </span>
          </li>
        </ul>

        <dl class="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
          <div><dt class="text-slate-500">Nilai bahan</dt><dd class="font-semibold tabular-nums">{{ rupiah(calc(pkg).materialValue) }}</dd></div>
          <div><dt class="text-slate-500">Jasa / olahan</dt><dd class="font-semibold tabular-nums">{{ rupiah(calc(pkg).service) }}</dd></div>
          <template v-if="canManage">
            <div><dt class="text-slate-500">HPP bahan</dt><dd class="font-semibold tabular-nums">{{ rupiah(calc(pkg).cost) }}</dd></div>
            <div><dt class="text-slate-500">Laba kotor</dt><dd class="font-semibold text-emerald-700 tabular-nums">{{ rupiah(calc(pkg).profit) }} ({{ calc(pkg).margin.toFixed(0) }}%)</dd></div>
          </template>
        </dl>

        <footer class="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span class="text-sm" :class="pkg.available > 0 ? 'text-slate-600' : 'font-medium text-red-600'">
            Tersedia <b class="tabular-nums">{{ number(pkg.available ?? 0) }}</b> {{ pkg.unit }}
          </span>
          <span class="flex items-center gap-1">
            <StatusBadge v-if="!pkg.is_active" status="nonaktif" />
            <template v-if="canManage">
              <button class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Ubah" @click="openForm(pkg)"><AppIcon name="pencil" :size="16" /></button>
              <button class="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Hapus" @click="remove(pkg)"><AppIcon name="trash" :size="16" /></button>
            </template>
          </span>
        </footer>
      </article>
    </div>
    <div v-else-if="!loading" class="card">
      <EmptyState icon="fire" title="Belum ada paket" text="Buat paket seperti “Indomie Telur”: pilih Indomie sebagai bahan utama dan Telur sebagai bahan opsional." >
        <button v-if="canManage" class="btn-primary" @click="openForm()"><AppIcon name="plus" :size="16" /> Paket Baru</button>
      </EmptyState>
    </div>

    <!-- Form paket -->
    <AppModal v-if="form" :title="form.id ? 'Ubah Paket' : 'Paket Baru'" size="xl" @close="form = null">
      <form id="package-form" class="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" @submit.prevent="save">
        <div class="space-y-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="label">Nama paket</label>
              <input v-model="form.name" class="input" :class="{ 'input-error': errors.name }" placeholder="mis. Indomie Telur" required />
              <p v-if="errors.name" class="error-text">{{ errors.name }}</p>
            </div>
            <div>
              <label class="label">Kode</label>
              <input v-model="form.sku" class="input" :class="{ 'input-error': errors.sku }" :required="!!form.id" :placeholder="form.id ? '' : `Otomatis: ${nextSku || '…'}`" />
              <p v-if="errors.sku" class="error-text">{{ errors.sku }}</p>
            </div>
            <div>
              <label class="label">Kategori</label>
              <select v-model="form.category_id" class="input">
                <option value="">Tanpa kategori</option>
                <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Satuan jual</label>
              <input v-model="form.unit" class="input uppercase" list="package-units" required @input="form.unit = form.unit.toUpperCase()" />
              <datalist id="package-units"><option v-for="unit in ['PORSI', 'GELAS', 'PIRING', 'MANGKOK', 'BUNGKUS', 'PAKET']" :key="unit" :value="unit" /></datalist>
            </div>
            <div>
              <label class="label">Harga jual per {{ form.unit || 'porsi' }}</label>
              <MoneyInput v-model="form.sell_price" :invalid="!!errors.sell_price" />
              <p v-if="errors.sell_price" class="error-text">{{ errors.sell_price }}</p>
            </div>
          </div>

          <div class="rounded-xl border border-slate-200">
            <div class="border-b border-slate-100 px-4 py-3">
              <p class="text-sm font-semibold text-slate-800">Bahan</p>
              <p class="mb-2 text-xs text-slate-500">
                <b>Bahan utama</b> wajib ada &amp; menentukan jumlah porsi yang tersedia. <b>Opsional</b> boleh dihilangkan pemesan dengan potongan harga.
              </p>
              <ProductSearch include-inactive type="barang" placeholder="Cari / scan bahan (mis. Indomie, Telur)…" @select="addComponent" />
              <p v-if="errors.components" class="error-text">{{ errors.components }}</p>
            </div>
            <TransitionGroup tag="div" class="divide-y divide-slate-100" enter-from-class="opacity-0 -translate-y-1" enter-active-class="transition duration-200" leave-to-class="opacity-0" leave-active-class="transition duration-150">
              <div v-for="(item, index) in form.components" :key="item.component_id" class="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_4.5rem_9rem_8.5rem_auto] sm:items-start">
                <div class="col-span-2 sm:col-span-1">
                  <p class="text-sm font-medium">
                    {{ item.name }}
                    <span v-if="item.is_active === false" class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-slate-500 uppercase" title="Tidak tampil di kasir, tetap dipakai sebagai bahan">Nonaktif</span>
                  </p>
                  <p class="text-xs text-slate-500">stok {{ number(item.stock) }} {{ item.unit }} · {{ item.sell_price ? rupiah(item.sell_price) : 'belum ada harga' }}</p>
                  <p v-if="componentError(index, 'component_id')" class="error-text">{{ componentError(index, 'component_id') }}</p>
                </div>
                <div>
                  <label class="text-xs text-slate-500">Jumlah</label>
                  <input v-model.number="item.qty" type="number" min="1" class="input h-10 py-0" />
                </div>
                <div>
                  <label class="text-xs text-slate-500">Jenis</label>
                  <div class="grid h-10 grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                    <button type="button" class="tab justify-center px-1 text-xs" :class="{ 'tab-active': !item.is_optional }" @click="item.is_optional = false">Utama</button>
                    <button type="button" class="tab justify-center px-1 text-xs" :class="{ 'tab-active': item.is_optional }" @click="item.is_optional = true">Opsional</button>
                  </div>
                </div>
                <div>
                  <template v-if="item.is_optional">
                    <label class="text-xs whitespace-nowrap text-slate-500">Potongan jika tanpa</label>
                    <div class="[&_input]:h-10 [&_input]:py-0"><MoneyInput v-model="item.omit_price" /></div>
                  </template>
                </div>
                <div class="flex items-end justify-end sm:pt-5">
                  <button type="button" class="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus bahan" @click="form.components.splice(index, 1)"><AppIcon name="trash" :size="16" /></button>
                </div>
              </div>
            </TransitionGroup>
            <p v-if="!form.components.length" class="px-4 py-6 text-center text-sm text-slate-500">Belum ada bahan.</p>
          </div>

          <label class="flex items-center gap-2 text-sm">
            <input v-model="form.is_active" type="checkbox" class="h-4 w-4 rounded border-slate-300" /> Aktif (tampil di kasir)
          </label>
        </div>

        <!-- Rincian harga -->
        <aside class="h-fit space-y-2 rounded-xl bg-slate-50 p-4 text-sm lg:sticky lg:top-0">
          <p class="font-semibold text-slate-900">Rincian harga per {{ form.unit || 'porsi' }}</p>
          <div v-for="item in form.components" :key="item.component_id" class="flex justify-between gap-2 text-slate-600">
            <span class="truncate">{{ item.qty }} × {{ item.name }}<template v-if="!item.sell_price && item.cost_price"> (HPP)</template></span>
            <span class="tabular-nums">{{ rupiah(item.qty * materialPrice(item)) }}</span>
          </div>
          <div class="flex justify-between border-t border-slate-200 pt-2"><span class="text-slate-500">Nilai bahan</span><span class="tabular-nums">{{ rupiah(formCalc.materialValue) }}</span></div>
          <div class="flex justify-between font-semibold" :class="formCalc.service < 0 ? 'text-red-600' : 'text-brand-700'">
            <span>Jasa / olahan</span><span class="tabular-nums">{{ rupiah(formCalc.service) }}</span>
          </div>
          <div class="flex justify-between border-t border-slate-200 pt-2 text-base font-bold"><span>Harga jual</span><span class="tabular-nums">{{ rupiah(form.sell_price) }}</span></div>
          <template v-if="canManage">
            <div class="flex justify-between pt-2"><span class="text-slate-500">HPP bahan</span><span class="tabular-nums">{{ rupiah(formCalc.cost) }}</span></div>
            <div class="flex justify-between text-emerald-700"><span>Laba kotor</span><span class="tabular-nums">{{ rupiah(formCalc.profit) }} ({{ formCalc.margin.toFixed(1) }}%)</span></div>
          </template>
          <p v-if="optionalTotal" class="rounded-lg bg-sky-50 p-2 text-xs text-sky-800">
            Tanpa semua bahan opsional: <b class="tabular-nums">{{ rupiah(form.sell_price - optionalTotal) }}</b>
          </p>
        </aside>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="form = null">Batal</button>
        <button class="btn-primary" type="submit" form="package-form" :disabled="saving || !form.components.length">{{ saving ? 'Menyimpan…' : 'Simpan Paket' }}</button>
      </template>
    </AppModal>
  </div>
</template>
