<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import http, { errorMessage, validationErrors } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { number, rupiah } from '../utils/format'
import { printReceipt } from '../utils/print'
import { bestPromo } from '../utils/discount'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import CustomerPicker from '../components/CustomerPicker.vue'
import PackageOptions from '../components/PackageOptions.vue'
import { lineKey, optionalComponents, packagePrice } from '../utils/cart'
import PageHeader from '../components/PageHeader.vue'
import ProductSearch from '../components/ProductSearch.vue'
import ReceiptPrint from '../components/ReceiptPrint.vue'

const meta = useMetaStore()
const toast = useToastStore()

const customer = ref(null)
const receivable = ref(null)
const form = reactive({ items: [], notes: '' })
const promos = ref([])
const errors = ref({})
const saving = ref(false)
const lastSale = ref(null)
const search = ref(null)

watch(customer, async (value) => {
  receivable.value = null
  if (!value) return
  const { data } = await http.get(`/customers/${value.id}/receivable`)
  receivable.value = data.data
  nextTick(() => search.value?.focus())
})

function addProduct(product) {
  const units = (product.units || []).filter((unit) => unit.sell_price > 0)
  if (!units.length) {
    toast.error(`${product.name} belum punya harga jual.`)
    return
  }
  const unit = units.find((item) => item.id === product.matched_unit_id) || units.find((item) => item.conversion === 1) || units[0]
  const key = lineKey(unit.id)
  const line = form.items.find((item) => item.key === key)
  if (line) {
    line.qty++
    return
  }
  form.items.push({
    key,
    product_id: product.id,
    is_package: product.type === 'paket',
    available: product.available ?? null,
    options: optionalComponents(product).map(({ id, name, omit_price }) => ({ id, name, omit_price })),
    omit: [],
    base_price: unit.sell_price,
    name: product.name,
    sku: product.sku,
    base_unit: product.unit,
    stock: product.stock,
    units,
    unit_id: unit.id,
    conversion: unit.conversion,
    price: unit.sell_price,
    qty: 1,
  })
}

function changeUnit(line, value) {
  const unit = line.units.find((item) => item.id === Number(value))
  const existing = form.items.find((item) => item !== line && item.key === lineKey(unit.id))
  if (existing) {
    existing.qty += line.qty
    form.items.splice(form.items.indexOf(line), 1)
    return
  }
  Object.assign(line, { key: lineKey(unit.id), unit_id: unit.id, conversion: unit.conversion, price: unit.sell_price, base_price: unit.sell_price })
}

function toggleOption(line, optionId) {
  const omit = line.omit.includes(optionId) ? line.omit.filter((id) => id !== optionId) : [...line.omit, optionId]
  const key = lineKey(line.unit_id, omit)
  const existing = form.items.find((item) => item !== line && item.key === key)
  if (existing) {
    existing.qty += line.qty
    form.items.splice(form.items.indexOf(line), 1)
    return
  }
  Object.assign(line, { omit, key, price: packagePrice(line.base_price, line.options, omit) })
}

const linePromo = (line) => bestPromo(promos.value, line.product_id, line.unit_id, Number(line.qty) || 0, line.price)
const lineGross = (line) => (Number(line.qty) || 0) * line.price
const lineTotal = (line) => lineGross(line) - linePromo(line).amount
const grossTotal = computed(() => form.items.reduce((sum, line) => sum + lineGross(line), 0))
const subtotal = computed(() => form.items.reduce((sum, line) => sum + lineTotal(line), 0))
const tax = computed(() => Math.round((subtotal.value * (meta.tax_percent || 0)) / 100))
const total = computed(() => Math.max(0, subtotal.value + tax.value))
const overLimit = computed(() => receivable.value?.available !== null && receivable.value?.available !== undefined && total.value > receivable.value.available)
const baseQty = (productId) => form.items.filter((line) => line.product_id === productId).reduce((sum, line) => sum + (Number(line.qty) || 0) * line.conversion, 0)

async function save() {
  if (!customer.value) {
    errors.value = { customer_id: 'Pilih pelanggan terlebih dahulu.' }
    return
  }
  saving.value = true
  errors.value = {}
  try {
    const { data } = await http.post('/credit-sales', {
      customer_id: customer.value.id,
      items: form.items.map((line) => ({ product_unit_id: line.unit_id, qty: Number(line.qty), omit: line.omit.length ? line.omit : undefined })),
      notes: form.notes || null,
    })
    lastSale.value = data.data
    Object.assign(form, { items: [], notes: '' })
    const { data: summary } = await http.get(`/customers/${customer.value.id}/receivable`)
    receivable.value = summary.data
  } catch (e) {
    errors.value = validationErrors(e)
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

function newBon(sameCustomer) {
  lastSale.value = null
  if (!sameCustomer) customer.value = null
  nextTick(() => search.value?.focus())
}

onMounted(() => {
  http.get('/discounts/active').then(({ data }) => (promos.value = data.data)).catch(() => {})
})
</script>

<template>
  <div class="stagger">
    <PageHeader title="Bon Baru" subtitle="Penjualan kredit: barang diambil sekarang, dibayar lewat tagihan bulanan" :back="{ name: 'credit-sales' }" />

    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <section class="card space-y-4 p-5">
        <div>
          <label class="label">Pelanggan</label>
          <CustomerPicker v-model="customer" :invalid="!!errors.customer_id" />
          <p v-if="errors.customer_id" class="error-text">{{ errors.customer_id }}</p>
        </div>

        <Transition name="pop">
          <div v-if="receivable" class="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
            <p class="font-semibold text-slate-900">Piutang pelanggan</p>
            <div class="flex justify-between"><span class="text-slate-500">Bon belum ditagih ({{ receivable.unbilled_count }})</span><span class="tabular-nums">{{ rupiah(receivable.unbilled) }}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Tagihan belum lunas</span><span class="tabular-nums">{{ rupiah(receivable.billed_outstanding) }}</span></div>
            <div v-if="receivable.overdue" class="flex justify-between text-red-600"><span>Lewat jatuh tempo</span><span class="tabular-nums">{{ rupiah(receivable.overdue) }}</span></div>
            <div class="flex justify-between border-t border-slate-200 pt-2 font-semibold"><span>Total piutang</span><span class="tabular-nums">{{ rupiah(receivable.outstanding) }}</span></div>
            <div v-if="receivable.available !== null" class="flex justify-between" :class="overLimit ? 'font-semibold text-red-600' : 'text-emerald-700'">
              <span>Sisa limit</span><span class="tabular-nums">{{ rupiah(receivable.available) }}</span>
            </div>
          </div>
        </Transition>

        <div>
          <label class="label">Catatan</label>
          <textarea v-model="form.notes" rows="2" class="input" placeholder="Mis. diambil oleh anaknya" />
        </div>
      </section>

      <section class="card">
        <div class="border-b border-slate-100 p-4">
          <ProductSearch ref="search" @select="addProduct" />
          <p v-if="errors.items" class="error-text">{{ errors.items }}</p>
        </div>
        <div class="table-wrap">
          <table v-stack class="table">
            <thead>
              <tr><th>Produk</th><th>Satuan</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Subtotal</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="(line, index) in form.items" :key="line.key" class="[&>td]:align-top">
                <td class="min-w-40 whitespace-normal">
                  <div class="flex min-h-10 flex-col justify-center">
                    <p class="font-medium">{{ line.name }}</p>
                    <p v-if="line.is_package" class="text-xs" :class="baseQty(line.product_id) > (line.available ?? 0) ? 'font-medium text-red-600' : 'text-slate-500'">
                      Paket · <span class="whitespace-nowrap">tersedia {{ number(line.available ?? 0) }} {{ line.base_unit }}</span>
                    </p>
                    <p v-else class="text-xs" :class="baseQty(line.product_id) > line.stock ? 'font-medium text-red-600' : 'text-slate-500'">
                      {{ line.sku }} · <span class="whitespace-nowrap">stok {{ number(line.stock) }} {{ line.base_unit }}</span>
                    </p>
                    <PackageOptions v-if="line.options.length" :options="line.options" :omit="line.omit" @toggle="toggleOption(line, $event)" />
                  </div>
                </td>
                <td>
                  <select v-if="line.units.length > 1" :value="line.unit_id" class="input h-10 w-32 py-0" @change="changeUnit(line, $event.target.value)">
                    <option v-for="unit in line.units" :key="unit.id" :value="unit.id">{{ unit.name }}{{ unit.conversion > 1 ? ` (isi ${unit.conversion})` : '' }}</option>
                  </select>
                  <div v-else class="flex h-10 items-center">{{ line.units[0].name }}</div>
                </td>
                <td class="num"><input v-model.number="line.qty" type="number" min="1" class="input ml-auto h-10 w-20 py-0 text-right" @focus="$event.target.select()" /></td>
                <td class="num"><div class="flex h-10 items-center justify-end">{{ rupiah(line.price, false) }}</div></td>
                <td class="num font-medium">
                  <div class="flex min-h-10 flex-col items-end justify-center">
                    <span v-if="linePromo(line).amount" class="text-xs font-normal text-slate-400 line-through">{{ rupiah(lineGross(line), false) }}</span>
                    <span>{{ rupiah(lineTotal(line), false) }}</span>
                    <span v-if="linePromo(line).amount" class="text-xs font-normal text-rose-700">{{ linePromo(line).promo.name }}</span>
                  </div>
                </td>
                <td>
                  <div class="flex h-10 items-center">
                    <button class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus" @click="form.items.splice(index, 1)"><AppIcon name="trash" :size="16" /></button>
                  </div>
                </td>
              </tr>
              <tr v-if="!form.items.length">
                <td colspan="6" class="py-10 text-center text-slate-500">{{ customer ? 'Cari atau scan produk yang diambil pelanggan.' : 'Pilih pelanggan lalu tambahkan barang.' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="space-y-2 border-t border-slate-200 p-4 text-sm">
          <div class="flex justify-between"><span class="text-slate-500">Subtotal</span><span class="tabular-nums">{{ rupiah(grossTotal) }}</span></div>
          <div v-if="grossTotal !== subtotal" class="flex justify-between text-rose-700"><span>Hemat promo</span><span class="tabular-nums">−{{ rupiah(grossTotal - subtotal) }}</span></div>
          <div v-if="meta.tax_percent" class="flex justify-between"><span class="text-slate-500">Pajak ({{ meta.tax_percent }}%)</span><span class="tabular-nums">{{ rupiah(tax) }}</span></div>
          <div class="flex items-baseline justify-between"><span class="font-semibold">Total bon</span><span class="text-xl font-bold text-brand-700 tabular-nums">{{ rupiah(total) }}</span></div>
          <p v-if="overLimit" class="rounded-lg bg-red-50 px-3 py-2 text-red-700">Total bon melebihi sisa limit kredit pelanggan.</p>
          <div class="flex justify-end gap-2 pt-2">
            <RouterLink :to="{ name: 'credit-sales' }" class="btn-secondary">Batal</RouterLink>
            <button class="btn-primary" :disabled="saving || !form.items.length || !customer" @click="save">
              <AppIcon name="book" :size="16" /> {{ saving ? 'Menyimpan…' : 'Simpan Bon' }}
            </button>
          </div>
        </div>
      </section>
    </div>

    <AppModal v-if="lastSale" title="Bon tersimpan" size="sm" @close="newBon(true)">
      <div class="space-y-3 text-center">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><AppIcon name="check" :size="30" /></div>
        <p class="text-sm text-slate-500">{{ lastSale.number }} · {{ lastSale.customer?.name }}</p>
        <p class="text-2xl font-bold tabular-nums">{{ rupiah(lastSale.total) }}</p>
        <p class="text-sm text-slate-500">Dicatat sebagai piutang dan akan masuk tagihan bulan ini.</p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="printReceipt"><AppIcon name="printer" :size="16" /> Cetak Nota</button>
        <button class="btn-secondary" @click="newBon(false)">Pelanggan Lain</button>
        <button class="btn-primary" @click="newBon(true)">Bon Baru</button>
      </template>
    </AppModal>
    <ReceiptPrint v-if="lastSale" :sale="lastSale" />
  </div>
</template>
