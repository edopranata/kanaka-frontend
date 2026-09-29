<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import http, { errorMessage, validationErrors } from '../api/http'
import { useToastStore } from '../stores/toast'
import { number, rupiah, today } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import MoneyInput from '../components/MoneyInput.vue'
import PageHeader from '../components/PageHeader.vue'
import ProductSearch from '../components/ProductSearch.vue'

const router = useRouter()
const toast = useToastStore()

const suppliers = ref([])
const form = reactive({ supplier_id: '', date: today(), notes: '', items: [] })
const errors = ref({})
const saving = ref(false)

function addProduct(product) {
  if (product.consignor && form.supplier_id && product.consignor.id !== Number(form.supplier_id)) {
    toast.error(`${product.name} adalah titipan dari ${product.consignor.name}.`)
    return
  }
  if (!form.supplier_id && product.consignor) form.supplier_id = product.consignor.id
  const line = form.items.find((item) => item.product_id === product.id)
  if (line) {
    line.qty++
    return
  }
  form.items.push({
    product_id: product.id,
    name: product.name,
    sku: product.sku,
    unit: product.unit,
    stock: product.stock,
    consignor: product.consignor,
    qty: 1,
    cost: Math.round(product.cost_price || 0),
  })
}

const total = computed(() => form.items.reduce((sum, item) => sum + (Number(item.qty) || 0) * item.cost, 0))
const itemError = (index, field) => errors.value[`items.${index}.${field}`]

async function save() {
  saving.value = true
  errors.value = {}
  try {
    const { data } = await http.post('/consignments/receipts', {
      ...form,
      items: form.items.map(({ product_id, qty, cost }) => ({ product_id, qty, cost })),
    })
    toast.success(`Titipan ${data.data.number} dicatat. Stok bertambah.`)
    router.replace({ name: 'consignment-receipt', params: { id: data.data.id } })
  } catch (e) {
    errors.value = validationErrors(e)
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  const { data } = await http.get('/suppliers', { params: { per_page: 200 } })
  suppliers.value = data.data
})
</script>

<template>
  <div class="stagger">
    <PageHeader title="Titipan Masuk" subtitle="Barang yang dititipkan supplier. Belum menjadi hutang — dibayar saat penyelesaian sesuai yang terjual." :back="{ name: 'consignments', query: { tab: 'receipts' } }" />

    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <section class="card space-y-4 p-5">
        <div>
          <label class="label">Supplier (penitip)</label>
          <select v-model="form.supplier_id" class="input" :class="{ 'input-error': errors.supplier_id }">
            <option value="">— Pilih supplier —</option>
            <option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">{{ supplier.name }}</option>
          </select>
          <p v-if="errors.supplier_id" class="error-text">{{ errors.supplier_id }}</p>
        </div>
        <div>
          <label class="label">Tanggal</label>
          <input v-model="form.date" type="date" class="input" :max="today()" />
        </div>
        <div>
          <label class="label">Catatan</label>
          <textarea v-model="form.notes" rows="2" class="input" placeholder="Mis. titipan pagi" />
        </div>
        <p class="rounded-lg bg-sky-50 p-3 text-xs text-sky-800">
          Produk titipan tidak bisa dibeli lewat menu Pembelian dan hanya boleh dititipkan oleh satu supplier. Harga setor menjadi HPP produk.
        </p>
      </section>

      <section class="card">
        <div class="border-b border-slate-100 p-4">
          <ProductSearch include-inactive type="barang" show-price="cost" placeholder="Cari / scan barang titipan…" @select="addProduct" />
          <p v-if="errors.items" class="error-text">{{ errors.items }}</p>
        </div>
        <div class="table-wrap">
          <table v-stack class="table">
            <thead><tr><th>Barang</th><th class="num">Jumlah</th><th class="num">Harga Setor / Satuan</th><th class="num">Subtotal</th><th></th></tr></thead>
            <tbody>
              <tr v-for="(item, index) in form.items" :key="item.product_id" class="[&>td]:align-top">
                <td class="min-w-40 whitespace-normal">
                  <div class="flex min-h-10 flex-col justify-center">
                    <p class="font-medium">{{ item.name }}</p>
                    <p class="text-xs text-slate-500">{{ item.sku }} · <span class="whitespace-nowrap">stok {{ number(item.stock) }} {{ item.unit }}</span></p>
                    <p v-if="itemError(index, 'product_id')" class="error-text">{{ itemError(index, 'product_id') }}</p>
                  </div>
                </td>
                <td class="num"><input v-model.number="item.qty" type="number" min="1" class="input ml-auto h-10 w-24 py-0 text-right" /></td>
                <td class="num"><div class="ml-auto w-40 [&_input]:h-10 [&_input]:py-0"><MoneyInput v-model="item.cost" /></div></td>
                <td class="num font-medium"><div class="flex h-10 items-center justify-end">{{ rupiah((item.qty || 0) * item.cost, false) }}</div></td>
                <td>
                  <div class="flex h-10 items-center">
                    <button class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus" @click="form.items.splice(index, 1)"><AppIcon name="trash" :size="16" /></button>
                  </div>
                </td>
              </tr>
              <tr v-if="!form.items.length"><td colspan="5" class="py-10 text-center text-slate-500">Cari atau scan barang yang dititipkan.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
          <p class="text-sm text-slate-600">Nilai setor: <b class="text-lg text-slate-900 tabular-nums">{{ rupiah(total) }}</b></p>
          <div class="flex gap-2">
            <RouterLink :to="{ name: 'consignments' }" class="btn-secondary">Batal</RouterLink>
            <button class="btn-primary" :disabled="saving || !form.items.length || !form.supplier_id" @click="save">{{ saving ? 'Menyimpan…' : 'Simpan Titipan' }}</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
