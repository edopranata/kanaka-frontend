<script setup>
import { computed, onMounted, ref } from 'vue'
import http, { errorMessage, validationErrors } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { number, rupiah, tanggal } from '../utils/format'
import { promoAmount, promoLabel } from '../utils/discount'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import EmptyState from '../components/EmptyState.vue'
import MoneyInput from '../components/MoneyInput.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'
import ProductSearch from '../components/ProductSearch.vue'
import StatusBadge from '../components/StatusBadge.vue'

const meta = useMetaStore()
const toast = useToastStore()

const statuses = [
  { value: '', label: 'Semua' },
  { value: 'berjalan', label: 'Berjalan' },
  { value: 'terjadwal', label: 'Terjadwal' },
  { value: 'berakhir', label: 'Berakhir' },
  { value: 'nonaktif', label: 'Nonaktif' },
]

const discounts = ref([])
const pagination = ref(null)
const status = ref('')
const search = ref('')
const loading = ref(false)

async function load(page = 1) {
  loading.value = true
  try {
    const { data } = await http.get('/discounts', { params: { page, status: status.value || undefined, search: search.value || undefined } })
    discounts.value = data.data
    pagination.value = data.meta
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

function setStatus(value) {
  status.value = value
  load()
}

const period = (discount) => (discount.ends_on ? `${tanggal(discount.starts_on)} – ${tanggal(discount.ends_on)}` : `Mulai ${tanggal(discount.starts_on)}, tanpa batas`)

// ---- Form ----
const form = ref(null)
const errors = ref({})
const saving = ref(false)

function openForm(discount = null) {
  errors.value = {}
  form.value = discount
    ? {
        id: discount.id,
        name: discount.name,
        type: discount.type,
        value: Number(discount.value),
        starts_on: discount.starts_on,
        ends_on: discount.ends_on || '',
        min_qty: discount.min_qty,
        is_active: discount.is_active,
        notes: discount.notes || '',
        items: discount.items.map((item) => ({ ...item })),
      }
    : { id: null, name: '', type: 'persen', value: 10, starts_on: meta.business_date, ends_on: '', min_qty: 1, is_active: true, notes: '', items: [] }
}

function addProduct(product) {
  if (form.value.items.some((item) => item.product_id === product.id)) {
    toast.error(`${product.name} sudah ada di daftar produk promo.`)
    return
  }
  const units = (product.units || []).filter((unit) => unit.sell_price > 0)
  form.value.items.push({
    product_id: product.id,
    product_unit_id: null,
    name: product.name,
    sku: product.sku,
    units,
  })
}

/** Harga satuan yang ditampilkan di pratinjau: satuan yang dipilih, atau semua satuan jual produk. */
const previewUnits = (item) => (item.product_unit_id ? item.units.filter((unit) => unit.id === item.product_unit_id) : item.units)
const previewPrice = (price) => price - promoAmount({ type: form.value.type, value: Number(form.value.value) || 0, min_qty: 1 }, 1, price)
const itemError = (index) => errors.value[`items.${index}.product_id`] || errors.value[`items.${index}.product_unit_id`]

const valueLabel = computed(() => (form.value?.type === 'persen' ? 'Potongan (%)' : 'Potongan per satuan (Rp)'))

async function save() {
  saving.value = true
  errors.value = {}
  const payload = {
    ...form.value,
    ends_on: form.value.ends_on || null,
    items: form.value.items.map(({ product_id, product_unit_id }) => ({ product_id, product_unit_id })),
  }
  try {
    if (payload.id) {
      await http.put(`/discounts/${payload.id}`, payload)
    } else {
      await http.post('/discounts', payload)
    }
    toast.success('Promo disimpan.')
    form.value = null
    load(pagination.value?.current_page || 1)
  } catch (e) {
    errors.value = validationErrors(e)
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

async function toggle(discount) {
  try {
    await http.put(`/discounts/${discount.id}`, {
      ...discount,
      is_active: !discount.is_active,
      items: discount.items.map(({ product_id, product_unit_id }) => ({ product_id, product_unit_id })),
    })
    toast.success(discount.is_active ? 'Promo dinonaktifkan.' : 'Promo diaktifkan.')
    load(pagination.value?.current_page || 1)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function remove(discount) {
  if (!confirm(`Hapus promo ${discount.name}?`)) return
  try {
    await http.delete(`/discounts/${discount.id}`)
    toast.success('Promo dihapus.')
    load(pagination.value?.current_page || 1)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

onMounted(() => {
  load()
  meta.load()
})
</script>

<template>
  <div class="stagger">
    <PageHeader title="Diskon & Promo" subtitle="Potongan harga untuk produk tertentu dalam periode tertentu. Otomatis diterapkan di Kasir dan Penjualan Kredit.">
      <template #actions>
        <button class="btn-primary" @click="openForm()"><AppIcon name="plus" :size="16" /> Promo Baru</button>
      </template>
    </PageHeader>

    <div class="card mb-4 grid gap-3 p-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
      <div class="flex gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1">
        <button v-for="item in statuses" :key="item.value" class="tab" :class="{ 'tab-active': status === item.value }" @click="setStatus(item.value)">{{ item.label }}</button>
      </div>
      <input v-model="search" type="search" class="input" placeholder="Cari nama promo…" @keydown.enter="load()" @search="load()" />
    </div>

    <div class="card overflow-hidden">
      <div class="table-wrap">
        <table v-stack class="table">
          <thead>
            <tr><th>Promo</th><th>Potongan</th><th>Produk</th><th>Status</th><th class="num">Dipakai</th><th class="num">Total potongan</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="discount in discounts" :key="discount.id">
              <td>
                <p class="font-medium text-slate-900">{{ discount.name }}</p>
                <p class="text-xs text-slate-500">{{ period(discount) }}</p>
              </td>
              <td>
                <span class="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-600/20 ring-inset">
                  <AppIcon name="percent" :size="12" /> {{ promoLabel(discount) }}
                </span>
                <p v-if="discount.min_qty > 1" class="mt-0.5 text-xs text-slate-500">min. beli {{ discount.min_qty }}</p>
              </td>
              <td class="max-w-80">
                <p class="truncate text-sm">
                  <template v-for="(item, index) in discount.items.slice(0, 3)" :key="`${item.product_id}-${item.product_unit_id}`">
                    <template v-if="index">, </template>{{ item.name }}<span v-if="item.unit" class="text-slate-400"> ({{ item.unit }})</span>
                  </template>
                </p>
                <p v-if="discount.items.length > 3" class="text-xs text-slate-500">+{{ discount.items.length - 3 }} produk lain</p>
              </td>
              <td><StatusBadge :status="discount.status" /></td>
              <td class="num">{{ number(discount.usage?.sales || 0) }} trx</td>
              <td class="num font-medium">{{ rupiah(discount.usage?.discount || 0, false) }}</td>
              <td class="text-right whitespace-nowrap">
                <button class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" :title="discount.is_active ? 'Nonaktifkan' : 'Aktifkan'" @click="toggle(discount)">
                  <AppIcon :name="discount.is_active ? 'ban' : 'check'" :size="16" />
                </button>
                <button class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Ubah" @click="openForm(discount)"><AppIcon name="pencil" :size="16" /></button>
                <button v-if="!discount.usage?.sales" class="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Hapus" @click="remove(discount)"><AppIcon name="trash" :size="16" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-if="!loading && !discounts.length" icon="percent" title="Belum ada promo" text="Buat promo, mis. “Diskon Kopi 10%” untuk beberapa produk dengan periode tertentu.">
        <button class="btn-primary" @click="openForm()"><AppIcon name="plus" :size="16" /> Promo Baru</button>
      </EmptyState>
      <PaginationBar :meta="pagination" @page="load" />
    </div>

    <!-- Form promo -->
    <AppModal v-if="form" :title="form.id ? 'Ubah Promo' : 'Promo Baru'" size="xl" @close="form = null">
      <form id="discount-form" class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" @submit.prevent="save">
        <div class="space-y-3">
          <div>
            <label class="label">Nama promo</label>
            <input v-model="form.name" class="input" :class="{ 'input-error': errors.name }" placeholder="mis. Promo Akhir Bulan" required />
            <p v-if="errors.name" class="error-text">{{ errors.name }}</p>
          </div>
          <div>
            <label class="label">Jenis potongan</label>
            <div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              <button type="button" class="tab justify-center" :class="{ 'tab-active': form.type === 'persen' }" @click="form.type = 'persen'">Persen (%)</button>
              <button type="button" class="tab justify-center" :class="{ 'tab-active': form.type === 'nominal' }" @click="form.type = 'nominal'">Nominal (Rp)</button>
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="label">{{ valueLabel }}</label>
              <input v-if="form.type === 'persen'" v-model.number="form.value" type="number" min="0.01" max="100" step="0.01" class="input" :class="{ 'input-error': errors.value }" required />
              <MoneyInput v-else v-model="form.value" :invalid="!!errors.value" />
              <p v-if="errors.value" class="error-text">{{ errors.value }}</p>
            </div>
            <div>
              <label class="label">Minimal beli (qty)</label>
              <input v-model.number="form.min_qty" type="number" min="1" class="input" :class="{ 'input-error': errors.min_qty }" required />
              <p v-if="errors.min_qty" class="error-text">{{ errors.min_qty }}</p>
            </div>
            <div>
              <label class="label">Mulai</label>
              <input v-model="form.starts_on" type="date" class="input" :class="{ 'input-error': errors.starts_on }" required />
              <p v-if="errors.starts_on" class="error-text">{{ errors.starts_on }}</p>
            </div>
            <div>
              <label class="label">Berakhir <span class="font-normal text-slate-400">(kosong = tanpa batas)</span></label>
              <input v-model="form.ends_on" type="date" class="input" :class="{ 'input-error': errors.ends_on }" :min="form.starts_on" />
              <p v-if="errors.ends_on" class="error-text">{{ errors.ends_on }}</p>
            </div>
          </div>
          <div>
            <label class="label">Catatan</label>
            <textarea v-model="form.notes" rows="2" class="input" placeholder="Opsional"></textarea>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="form.is_active" type="checkbox" class="h-4 w-4 rounded border-slate-300" /> Aktif
          </label>
          <p class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            Promo berlaku otomatis di Kasir &amp; Penjualan Kredit selama periodenya. Bila satu produk masuk beberapa promo, dipakai potongan <b>terbesar</b> (tidak ditumpuk).
          </p>
        </div>

        <div class="flex min-w-0 flex-col rounded-xl border border-slate-200">
          <div class="border-b border-slate-100 px-4 py-3">
            <p class="text-sm font-semibold text-slate-800">Produk promo</p>
            <p class="mb-2 text-xs text-slate-500">Pilih satuan tertentu bila promo hanya untuk satuan itu (mis. hanya BOX).</p>
            <ProductSearch include-inactive placeholder="Cari / scan produk…" @select="addProduct" />
            <p v-if="errors.items" class="error-text">{{ errors.items }}</p>
          </div>
          <TransitionGroup tag="div" class="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto" enter-from-class="opacity-0 -translate-y-1" enter-active-class="transition duration-200" leave-to-class="opacity-0" leave-active-class="transition duration-150">
            <div v-for="(item, index) in form.items" :key="item.product_id" class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-center">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">{{ item.name }}</p>
                <p class="flex flex-wrap gap-x-3 text-xs text-slate-500">
                  <span v-for="unit in previewUnits(item)" :key="unit.id">
                    {{ unit.name }}: <span class="line-through">{{ number(unit.sell_price) }}</span> →
                    <b class="text-rose-700">{{ number(previewPrice(unit.sell_price)) }}</b>
                  </span>
                  <span v-if="!item.units.length">belum ada harga jual</span>
                </p>
                <p v-if="itemError(index)" class="error-text">{{ itemError(index) }}</p>
              </div>
              <select v-model="item.product_unit_id" class="input order-last col-span-2 h-10 py-0 sm:order-none sm:col-span-1">
                <option :value="null">Semua satuan</option>
                <option v-for="unit in item.units" :key="unit.id" :value="unit.id">Hanya {{ unit.name }}</option>
              </select>
              <button type="button" class="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus produk" @click="form.items.splice(index, 1)"><AppIcon name="trash" :size="16" /></button>
            </div>
          </TransitionGroup>
          <p v-if="!form.items.length" class="px-4 py-6 text-center text-sm text-slate-500">Belum ada produk.</p>
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="form = null">Batal</button>
        <button class="btn-primary" type="submit" form="discount-form" :disabled="saving || !form.items.length">{{ saving ? 'Menyimpan…' : 'Simpan Promo' }}</button>
      </template>
    </AppModal>
  </div>
</template>
