<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http, { errorMessage, validationErrors } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { number, today } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import PageHeader from '../components/PageHeader.vue'
import ProductSearch from '../components/ProductSearch.vue'

const route = useRoute()
const router = useRouter()
const meta = useMetaStore()
const toast = useToastStore()

const reasons = {
  masuk: ['Bonus supplier', 'Retur pelanggan', 'Koreksi input', 'Lainnya'],
  keluar: ['Barang rusak', 'Kedaluwarsa', 'Hilang', 'Dipakai sendiri', 'Retur ke supplier', 'Lainnya'],
  opname: ['Stok opname rutin', 'Stok opname tahunan', 'Pemeriksaan mendadak'],
}

const form = reactive({
  type: ['masuk', 'keluar', 'opname'].includes(route.query.type) ? route.query.type : 'keluar',
  date: today(),
  reason: '',
  notes: '',
  items: [],
})
const errors = ref({})
const saving = ref(false)
const loadingAll = ref(false)
const isOpname = computed(() => form.type === 'opname')

watch(() => form.type, () => {
  form.reason = reasons[form.type][0]
  form.items = []
}, { immediate: true })

function addProduct(product) {
  if (form.items.some((item) => item.product_id === product.id)) return
  form.items.push({
    product_id: product.id,
    name: product.name,
    sku: product.sku,
    unit: product.unit,
    stock: product.stock,
    qty: 1,
    actual_qty: product.stock,
  })
}

/**
 * Opname: muat semua produk aktif sekaligus (per kategori opsional).
 */
async function loadAllProducts() {
  loadingAll.value = true
  try {
    let page = 1
    let lastPage = 1
    do {
      const { data } = await http.get('/products', { params: { in_use: 1, type: 'barang', per_page: 200, page } })
      data.data.forEach(addProduct)
      lastPage = data.meta.last_page
      page++
    } while (page <= lastPage)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loadingAll.value = false
  }
}

const difference = (item) => (Number(item.actual_qty) || 0) - item.stock

async function save() {
  if (!form.items.length) {
    toast.error('Tambahkan minimal satu barang.')
    return
  }
  if (isOpname.value && !confirm('Stok sistem akan disamakan dengan hasil hitung fisik. Lanjutkan?')) return
  saving.value = true
  errors.value = {}
  try {
    const { data } = await http.post('/stock-adjustments', {
      ...form,
      items: form.items.map((item) => (isOpname.value
        ? { product_id: item.product_id, actual_qty: item.actual_qty }
        : { product_id: item.product_id, qty: item.qty })),
    })
    toast.success(`${data.data.type_label} ${data.data.number} disimpan.`)
    router.replace({ name: 'adjustment', params: { id: data.data.id } })
  } catch (e) {
    errors.value = validationErrors(e)
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="stagger">
    <PageHeader :title="isOpname ? 'Stok Opname' : 'Penyesuaian Stok'" :subtitle="isOpname ? 'Masukkan hasil hitung fisik; selisih otomatis dicatat' : 'Catat barang masuk/keluar di luar pembelian & penjualan'" :back="{ name: 'adjustments' }" />

    <div class="grid gap-5 lg:grid-cols-3">
      <section class="card space-y-4 p-5">
        <div>
          <label class="label">Jenis</label>
          <div class="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
            <button v-for="type in meta.adjustment_types" :key="type.value" type="button" class="tab justify-center" :class="{ 'tab-active': form.type === type.value }" @click="form.type = type.value">
              {{ type.label.replace('Stok ', '') }}
            </button>
          </div>
        </div>
        <div>
          <label class="label">Tanggal</label>
          <input v-model="form.date" type="date" class="input" :max="today()" />
        </div>
        <div>
          <label class="label">Alasan</label>
          <input v-model="form.reason" class="input" list="reasons" :class="{ 'input-error': errors.reason }" required />
          <datalist id="reasons"><option v-for="reason in reasons[form.type]" :key="reason" :value="reason" /></datalist>
          <p v-if="errors.reason" class="error-text">{{ errors.reason }}</p>
        </div>
        <div>
          <label class="label">Catatan</label>
          <textarea v-model="form.notes" rows="2" class="input" />
        </div>
      </section>

      <section class="card lg:col-span-2">
        <div class="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          <div class="min-w-60 flex-1"><ProductSearch include-inactive type="barang" @select="addProduct" /></div>
          <button v-if="isOpname" class="btn-secondary" :disabled="loadingAll" @click="loadAllProducts">
            <AppIcon name="download" :size="16" /> {{ loadingAll ? 'Memuat…' : 'Muat semua produk berstok' }}
          </button>
        </div>
        <div class="table-wrap max-h-[60vh] overflow-y-auto">
          <table v-stack class="table">
            <thead>
              <tr v-if="isOpname"><th>Produk</th><th class="num">Stok Sistem</th><th class="num">Stok Fisik</th><th class="num">Selisih</th><th></th></tr>
              <tr v-else><th>Produk</th><th class="num">Stok Saat Ini</th><th class="num">Jumlah {{ form.type === 'masuk' ? 'Masuk' : 'Keluar' }}</th><th class="num">Stok Akhir</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in form.items" :key="item.product_id">
                <td>
                  <p class="font-medium">{{ item.name }}</p>
                  <p class="text-xs text-slate-500">{{ item.sku }}</p>
                  <p v-if="errors[`items.${index}.qty`]" class="error-text">{{ errors[`items.${index}.qty`] }}</p>
                </td>
                <td class="num">{{ number(item.stock) }} {{ item.unit }}</td>
                <template v-if="isOpname">
                  <td class="num"><input v-model.number="item.actual_qty" type="number" min="0" class="input ml-auto w-24 text-right" @focus="$event.target.select()" /></td>
                  <td class="num font-semibold" :class="difference(item) < 0 ? 'text-red-600' : difference(item) > 0 ? 'text-emerald-600' : 'text-slate-400'">
                    {{ difference(item) > 0 ? '+' : '' }}{{ number(difference(item)) }}
                  </td>
                </template>
                <template v-else>
                  <td class="num"><input v-model.number="item.qty" type="number" min="1" class="input ml-auto w-24 text-right" /></td>
                  <td class="num">{{ number(item.stock + (form.type === 'masuk' ? 1 : -1) * (item.qty || 0)) }}</td>
                </template>
                <td><button class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" @click="form.items.splice(index, 1)"><AppIcon name="trash" :size="16" /></button></td>
              </tr>
              <tr v-if="!form.items.length">
                <td colspan="5" class="py-10 text-center text-slate-500">Cari atau scan produk di atas untuk menambahkan.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex justify-end gap-2 border-t border-slate-200 p-4">
          <RouterLink :to="{ name: 'adjustments' }" class="btn-secondary">Batal</RouterLink>
          <button class="btn-primary" :disabled="saving || !form.items.length" @click="save">{{ saving ? 'Menyimpan…' : 'Simpan' }}</button>
        </div>
      </section>
    </div>
  </div>
</template>
