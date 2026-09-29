<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import http, { errorMessage, validationErrors } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { number, rupiah } from '../utils/format'
import { printReceipt } from '../utils/print'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import CustomerPicker from '../components/CustomerPicker.vue'
import MoneyInput from '../components/MoneyInput.vue'
import PackageOptions from '../components/PackageOptions.vue'
import { lineKey, optionalComponents, packagePrice } from '../utils/cart'
import { bestPromo } from '../utils/discount'
import ReceiptPrint from '../components/ReceiptPrint.vue'

const CART_KEY = 'penjualan.cart'

const auth = useAuthStore()
const meta = useMetaStore()
const toast = useToastStore()

// ---- Katalog produk ----
const search = ref('')
const categoryId = ref('')
const categories = ref([])
const products = ref([])
const loadingProducts = ref(false)
const searchInput = ref(null)
let searchTimer = null

async function loadProducts() {
  loadingProducts.value = true
  try {
    const { data } = await http.get('/products', {
      params: { search: search.value || undefined, category_id: categoryId.value || undefined, active: 1, sellable: 1, per_page: 48 },
    })
    products.value = data.data
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loadingProducts.value = false
  }
}

function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadProducts, 250)
}

/**
 * Enter: kode persis (barcode/SKU) langsung masuk keranjang; jika hasil cari tinggal satu, tambahkan.
 */
async function onSearchEnter() {
  clearTimeout(searchTimer)
  const code = search.value.trim()
  if (!code) return
  try {
    const { data } = await http.get('/products/lookup', { params: { code } })
    search.value = ''
    addToCart(data.data, data.matched_unit_id)
    loadProducts()
  } catch {
    await loadProducts()
    if (products.value.length === 1) {
      addToCart(products.value[0])
      search.value = ''
      loadProducts()
    } else if (!products.value.length) {
      toast.error(`Produk "${code}" tidak ditemukan.`)
    }
  }
}

// ---- Keranjang ----
const cart = reactive({ items: [], customer: null, notes: '' })

// Promo aktif hari ini (diterapkan otomatis; dihitung ulang di server saat bayar).
const promos = ref([])
async function loadPromos() {
  const { data } = await http.get('/discounts/active')
  promos.value = data.data
}

function restoreCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY) || 'null')
    if (saved?.items) {
      const items = saved.items.filter((line) => line.unit_id).map((line) => ({ omit: [], options: [], ...line, key: line.key || lineKey(line.unit_id, line.omit || []) }))
      const { customer_id: _legacy, ...rest } = saved
      Object.assign(cart, rest, { items, customer: rest.customer || null })
    }
  } catch {
    localStorage.removeItem(CART_KEY)
  }
}
watch(cart, () => localStorage.setItem(CART_KEY, JSON.stringify(cart)), { deep: true })

/**
 * Tambah produk ke keranjang. unitId = satuan yang discan (mis. barcode dus); default satuan dasar.
 */
function addToCart(product, unitId = null, qty = 1) {
  const units = (product.units || []).filter((unit) => unit.sell_price > 0)
  const unit = units.find((item) => item.id === unitId) || units.find((item) => item.conversion === 1) || units[0]
  if (!unit) {
    toast.error(`${product.name} belum punya harga jual.${auth.can('products.manage') ? ' Atur harganya di menu Produk.' : ''}`)
    return
  }

  const key = lineKey(unit.id)
  let line = cart.items.find((item) => item.key === key)
  if (line) {
    line.qty += qty
  } else {
    line = {
      key,
      product_id: product.id,
      is_package: product.type === 'paket',
      available: product.available ?? null,
      options: optionalComponents(product).map(({ id, name, omit_price }) => ({ id, name, omit_price })),
      omit: [],
      base_price: unit.sell_price,
      unit_id: unit.id,
      name: product.name,
      sku: product.sku,
      base_unit: product.unit,
      unit: unit.name,
      conversion: unit.conversion,
      units: units.map(({ id, name, conversion, sell_price }) => ({ id, name, conversion, sell_price })),
      price: unit.sell_price,
      qty,
      showDiscount: false,
    }
    cart.items.unshift(line)
  }
  cart.items.filter((item) => item.product_id === product.id).forEach((item) => (item.stock = product.stock))
  warnStock(line)
}

/**
 * Jumlah (satuan dasar) produk ini di seluruh keranjang.
 */
const baseQtyInCart = (productId) => cart.items
  .filter((item) => item.product_id === productId)
  .reduce((sum, item) => sum + (Number(item.qty) || 0) * item.conversion, 0)

const overStock = (line) => (line.is_package ? baseQtyInCart(line.product_id) > (line.available ?? Infinity) : baseQtyInCart(line.product_id) > line.stock)

function warnStock(line) {
  if (overStock(line)) {
    toast.error(line.is_package
      ? `${line.name} hanya tersedia ${number(line.available)} ${line.unit} (stok bahan utama).`
      : `Stok ${line.name} tersisa ${number(line.stock)} ${line.base_unit}.`)
  }
}

/**
 * Pesan tanpa / dengan bahan opsional. Varian yang sama digabung dalam satu baris.
 */
function toggleOption(line, optionId) {
  const omit = line.omit.includes(optionId) ? line.omit.filter((id) => id !== optionId) : [...line.omit, optionId]
  const key = lineKey(line.unit_id, omit)
  const existing = cart.items.find((item) => item !== line && item.key === key)
  if (existing) {
    existing.qty += line.qty
    cart.items.splice(cart.items.indexOf(line), 1)
    return
  }
  Object.assign(line, { omit, key, price: packagePrice(line.base_price, line.options, omit) })
}

function changeUnit(line, unitId) {
  const unit = line.units.find((item) => item.id === Number(unitId))
  const existing = cart.items.find((item) => item !== line && item.key === lineKey(unit.id))
  if (existing) {
    existing.qty += line.qty
    cart.items.splice(cart.items.indexOf(line), 1)
    warnStock(existing)
    return
  }
  Object.assign(line, { key: lineKey(unit.id), unit_id: unit.id, unit: unit.name, conversion: unit.conversion, price: unit.sell_price, base_price: unit.sell_price })
  warnStock(line)
}

function changeQty(line, delta) {
  line.qty = Math.max(1, (Number(line.qty) || 0) + delta)
}

function removeLine(index) {
  cart.items.splice(index, 1)
}

function clearCart(ask = true) {
  if (ask && cart.items.length && !confirm('Kosongkan keranjang?')) return
  Object.assign(cart, { items: [], customer: null, notes: '' })
  searchInput.value?.focus()
}

const linePromo = (line) => bestPromo(promos.value, line.product_id, line.unit_id, Number(line.qty) || 0, line.price)
const lineGross = (line) => (Number(line.qty) || 0) * line.price
const lineTotal = (line) => Math.max(0, lineGross(line) - linePromo(line).amount)
const grossTotal = computed(() => cart.items.reduce((sum, line) => sum + lineGross(line), 0))
const subtotal = computed(() => cart.items.reduce((sum, line) => sum + lineTotal(line), 0))
const savings = computed(() => grossTotal.value - subtotal.value)
const tax = computed(() => Math.round((subtotal.value * (meta.tax_percent || 0)) / 100))
const total = computed(() => Math.max(0, subtotal.value + tax.value))
const itemCount = computed(() => cart.items.reduce((sum, line) => sum + (Number(line.qty) || 0), 0))

// ---- Pelanggan (bisa dicari; kosong = pelanggan umum) ----
const canPickCustomer = auth.can('customers.manage', 'credit.sell', 'receivables.manage')

// ---- Kategori: beberapa terpopuler tampil sebagai tombol, sisanya lewat dialog ----
const TOP_CATEGORIES = 5
const categoryModal = ref(false)
const categorySearch = ref('')

const topCategories = computed(() => [...categories.value].sort((a, b) => b.products_count - a.products_count).slice(0, TOP_CATEGORIES))
const visibleCategories = computed(() => {
  const selected = categories.value.find((category) => category.id === categoryId.value)
  // Kategori pilihan dari dialog tampil paling depan (selalu terlihat) dan jumlah tombol tetap.
  return selected && !topCategories.value.includes(selected) ? [selected, ...topCategories.value.slice(0, TOP_CATEGORIES - 1)] : topCategories.value
})
const hiddenCategoryCount = computed(() => categories.value.length - visibleCategories.value.length)
const filteredCategories = computed(() => {
  const term = categorySearch.value.trim().toLowerCase()
  return categories.value.filter((category) => !term || category.name.toLowerCase().includes(term))
})

function selectCategory(id) {
  categoryId.value = id
  categoryModal.value = false
  categorySearch.value = ''
  loadProducts()
}

// ---- Pembayaran ----
const payModal = ref(false)
const payment = reactive({ method: 'tunai', paid: 0, ref: '' })
const paying = ref(false)
const errors = ref({})
const paidInput = ref(null)

const change = computed(() => Math.max(0, payment.paid - total.value))
const quickAmounts = computed(() => {
  const amounts = new Set([total.value])
  for (const unit of [5000, 10000, 20000, 50000, 100000]) {
    amounts.add(Math.ceil(total.value / unit) * unit)
  }
  return [...amounts].filter((amount) => amount >= total.value).sort((a, b) => a - b).slice(0, 5)
})

function openPayment() {
  if (!cart.items.length) {
    toast.error('Keranjang masih kosong.')
    return
  }
  errors.value = {}
  Object.assign(payment, { method: 'tunai', paid: 0, ref: '' })
  payModal.value = true
}

async function pay() {
  if (payment.method === 'tunai' && payment.paid < total.value) {
    errors.value = { paid: 'Jumlah bayar kurang dari total belanja.' }
    return
  }
  paying.value = true
  errors.value = {}
  try {
    const { data } = await http.post('/sales', {
      customer_id: cart.customer?.id || null,
      items: cart.items.map((line) => ({ product_unit_id: line.unit_id, qty: Number(line.qty), omit: line.omit?.length ? line.omit : undefined })),
      payment_method: payment.method,
      paid: payment.method === 'tunai' ? payment.paid : null,
      payment_ref: payment.ref || null,
      notes: cart.notes || null,
    })
    lastSale.value = data.data
    payModal.value = false
    clearCart(false)
    search.value = ''
    loadProducts()
    if (data.data.business_date !== meta.business_date) {
      meta.load(true)
      loadPromos().catch(() => {})
    }
  } catch (e) {
    errors.value = validationErrors(e)
    toast.error(errorMessage(e))
  } finally {
    paying.value = false
  }
}

// ---- Sukses ----
const lastSale = ref(null)

function newTransaction() {
  lastSale.value = null
  nextTick(() => searchInput.value?.focus())
}

// ---- Shortcut keyboard ----
function onKeydown(event) {
  if (event.key === 'F2') {
    event.preventDefault()
    searchInput.value?.focus()
  } else if (event.key === 'F8') {
    event.preventDefault()
    if (!payModal.value && !lastSale.value) openPayment()
  } else if (event.key === 'Enter' && lastSale.value && !event.target.closest?.('input,textarea')) {
    event.preventDefault()
    newTransaction()
  }
}

watch(payModal, (open) => open && nextTick(() => paidInput.value?.querySelector('input')?.focus()))

onMounted(async () => {
  restoreCart()
  window.addEventListener('keydown', onKeydown)
  searchInput.value?.focus()
  loadProducts()
  loadPromos().catch(() => {})
  http.get('/categories', { params: { sellable: 1 } }).then(({ data }) => (categories.value = data.data)).catch(() => {})
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(searchTimer)
})
</script>

<template>
  <div class="grid grid-cols-1 gap-3 pb-24 lg:h-[calc(100dvh-4.5rem)] lg:grid-cols-[minmax(0,1fr)_400px] lg:pb-0">
    <!-- Katalog -->
    <section class="card flex min-h-0 min-w-0 flex-col">
      <div class="space-y-2 border-b border-slate-100 p-3">
        <div class="relative">
          <AppIcon name="search" :size="18" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input
            ref="searchInput"
            v-model="search"
            type="search"
            class="input py-2.5 pl-10 text-base"
            placeholder="Scan barcode / cari produk (F2)"
            autocomplete="off"
            @input="onSearchInput"
            @keydown.enter.prevent="onSearchEnter"
          />
        </div>
        <div class="flex items-start gap-2">
          <div class="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1">
            <button class="tab shrink-0" :class="{ 'tab-active bg-brand-50': categoryId === '' }" @click="selectCategory('')">Semua</button>
            <button
              v-for="category in visibleCategories"
              :key="category.id"
              class="tab shrink-0"
              :class="{ 'tab-active bg-brand-50': categoryId === category.id }"
              @click="selectCategory(category.id)"
            >
              {{ category.name }}
            </button>
          </div>
          <button
            v-if="categories.length"
            class="tab inline-flex shrink-0 items-center gap-1 border border-dashed border-slate-300"
            title="Semua kategori"
            @click="categoryModal = true"
          >
            <AppIcon name="tag" :size="14" />
            <span class="hidden sm:inline">Kategori lainnya</span><span class="sm:hidden">Lainnya</span>
            <span v-if="hiddenCategoryCount" class="rounded-full bg-slate-200 px-1.5 text-[11px] tabular-nums">{{ hiddenCategoryCount }}</span>
          </button>
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <div v-if="!products.length && !loadingProducts" class="py-10 text-center text-sm text-slate-500">Produk tidak ditemukan.</div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          <button
            v-for="product in products"
            :key="product.id"
            type="button"
            class="flex flex-col rounded-lg border border-slate-200 p-3 text-left transition hover:border-brand-500 hover:bg-brand-50 active:scale-[0.98]"
            @click="addToCart(product)"
          >
            <span class="line-clamp-2 min-h-10 text-sm font-medium text-slate-800">
              <span v-if="product.type === 'paket'" class="mr-1 inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-violet-700 uppercase">Paket</span>{{ product.name }}
            </span>
            <span class="mt-1 text-xs text-slate-400">{{ product.sku }}</span>
            <span v-if="product.units.length > 1" class="mt-1 flex flex-wrap gap-1">
              <span v-for="unit in product.units.filter((unit) => unit.conversion !== 1 && unit.sell_price > 0)" :key="unit.id" class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                {{ unit.name }} {{ rupiah(unit.sell_price, false) }}
              </span>
            </span>
            <span class="mt-auto flex flex-wrap items-end justify-between gap-x-2 pt-2">
              <span class="font-semibold whitespace-nowrap text-brand-700 tabular-nums">{{ product.sell_price ? rupiah(product.sell_price) : product.units[0] ? `${rupiah(product.units[0].sell_price)}/${product.units[0].name}` : '' }}</span>
              <span v-if="product.type === 'paket'" class="text-xs whitespace-nowrap tabular-nums" :class="(product.available ?? 0) <= 0 ? 'font-semibold text-red-600' : 'text-slate-500'">
                sisa {{ number(product.available ?? 0) }} {{ product.unit }}
              </span>
              <span v-else class="text-xs whitespace-nowrap tabular-nums" :class="product.stock <= 0 ? 'font-semibold text-red-600' : product.is_low_stock ? 'text-amber-600' : 'text-slate-500'">
                {{ number(product.stock) }} {{ product.unit }}
              </span>
            </span>
          </button>
        </div>
      </div>
    </section>

    <!-- Keranjang -->
    <section id="cart" class="card flex min-h-0 min-w-0 flex-col">
      <div class="flex items-center gap-2 border-b border-slate-100 p-3">
        <CustomerPicker
          v-if="canPickCustomer"
          v-model="cart.customer"
          class="min-w-0 flex-1"
          :show-credit="false"
          clear-label="Umum"
          placeholder="Pelanggan umum — cari nama / telepon…"
        />
        <p v-else class="input bg-slate-50 text-slate-500">Pelanggan umum</p>
      </div>

      <div class="min-h-40 flex-1 overflow-y-auto">
        <div v-if="!cart.items.length" class="flex h-full flex-col items-center justify-center p-8 text-center text-sm text-slate-400">
          <AppIcon name="cart" :size="36" />
          <p class="mt-2">Keranjang kosong. Scan barcode atau pilih produk.</p>
        </div>
        <ul class="divide-y divide-slate-100">
          <li v-for="(line, index) in cart.items" :key="line.key" class="px-3 py-2.5">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">{{ line.name }}</p>
                <p class="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                  {{ rupiah(line.price) }} /
                  <select v-if="line.units.length > 1" :value="line.unit_id" class="rounded border border-slate-300 bg-white py-0 pr-6 pl-1 text-xs" @change="changeUnit(line, $event.target.value)">
                    <option v-for="unit in line.units" :key="unit.id" :value="unit.id">{{ unit.name }}{{ unit.conversion > 1 ? ` (${unit.conversion})` : '' }}</option>
                  </select>
                  <span v-else>{{ line.unit }}</span>
                  <span v-if="line.conversion > 1">= {{ number(line.qty * line.conversion) }} {{ line.base_unit }}</span>
                  <span v-if="overStock(line)" class="font-medium text-red-600">· {{ line.is_package ? `tersedia ${number(line.available)}` : `stok ${number(line.stock)} ${line.base_unit}` }}</span>
                </p>
                <PackageOptions v-if="line.options?.length" :options="line.options" :omit="line.omit" @toggle="toggleOption(line, $event)" />
                <Transition name="pop">
                  <p v-if="linePromo(line).amount" class="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-600/20 ring-inset">
                    <AppIcon name="percent" :size="12" /> {{ linePromo(line).promo.name }} · −{{ rupiah(linePromo(line).amount) }}
                  </p>
                </Transition>
              </div>
              <div class="shrink-0 text-right">
                <p v-if="linePromo(line).amount" class="text-xs text-slate-400 line-through tabular-nums">{{ rupiah(lineGross(line)) }}</p>
                <p class="text-sm font-semibold tabular-nums">{{ rupiah(lineTotal(line)) }}</p>
              </div>
            </div>
            <div class="mt-1.5 flex items-center justify-between gap-2">
              <div class="flex items-center">
                <button class="rounded-l-lg border border-slate-300 px-2 py-1 hover:bg-slate-50" @click="changeQty(line, -1)"><AppIcon name="minus" :size="14" /></button>
                <input v-model.number="line.qty" type="number" min="1" class="w-14 border-y border-slate-300 py-1 text-center text-sm tabular-nums focus:outline-none" @focus="$event.target.select()" />
                <button class="rounded-r-lg border border-slate-300 px-2 py-1 hover:bg-slate-50" @click="changeQty(line, 1)"><AppIcon name="plus" :size="14" /></button>
              </div>
              <div class="flex items-center gap-1">
                <button class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus" @click="removeLine(index)">
                  <AppIcon name="trash" :size="16" />
                </button>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <div class="space-y-1.5 border-t border-slate-200 p-3 text-sm">
        <div class="flex justify-between"><span class="text-slate-500">Subtotal ({{ number(itemCount) }} item)</span><span class="tabular-nums">{{ rupiah(grossTotal) }}</span></div>
        <div v-if="savings" class="flex justify-between text-rose-700"><span>Hemat promo</span><span class="tabular-nums">−{{ rupiah(savings) }}</span></div>
        <div v-if="meta.tax_percent" class="flex justify-between"><span class="text-slate-500">Pajak ({{ meta.tax_percent }}%)</span><span class="tabular-nums">{{ rupiah(tax) }}</span></div>
        <div class="flex items-baseline justify-between pt-1">
          <span class="font-semibold">Total</span>
          <span class="text-2xl font-bold text-brand-700 tabular-nums">{{ rupiah(total) }}</span>
        </div>
        <input v-model="cart.notes" class="input" placeholder="Catatan (opsional)" />
        <div class="grid grid-cols-[auto_1fr] gap-2 pt-1">
          <button class="btn-secondary" :disabled="!cart.items.length" @click="clearCart()">Batal</button>
          <button class="btn-primary btn-lg" :disabled="!cart.items.length" @click="openPayment">
            <AppIcon name="cash" /> Bayar (F8)
          </button>
        </div>
      </div>
    </section>

    <!-- Bar ringkasan (mobile) -->
    <div class="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg lg:hidden">
      <a href="#cart" class="min-w-0">
        <p class="text-xs text-slate-500">{{ number(itemCount) }} item · lihat keranjang</p>
        <p class="text-lg font-bold text-brand-700 tabular-nums">{{ rupiah(total) }}</p>
      </a>
      <button class="btn-primary btn-lg" :disabled="!cart.items.length" @click="openPayment">Bayar</button>
    </div>

    <!-- Modal pembayaran -->
    <AppModal v-if="payModal" title="Pembayaran" @close="payModal = false">
      <div class="space-y-4">
        <div class="rounded-xl bg-brand-50 p-4 text-center">
          <p class="text-sm text-brand-800">Total belanja</p>
          <p class="text-3xl font-bold text-brand-800 tabular-nums">{{ rupiah(total) }}</p>
        </div>
        <div>
          <label class="label">Metode pembayaran</label>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              v-for="method in meta.payment_methods.filter((item) => item.value !== 'va')"
              :key="method.value"
              type="button"
              class="rounded-lg border px-3 py-2.5 text-sm font-medium"
              :class="payment.method === method.value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:bg-slate-50'"
              @click="payment.method = method.value"
            >
              {{ method.label }}
            </button>
          </div>
        </div>
        <template v-if="payment.method === 'tunai'">
          <div ref="paidInput">
            <label class="label">Uang diterima</label>
            <MoneyInput v-model="payment.paid" :invalid="!!errors.paid" @keydown.enter.prevent="pay" />
            <p v-if="errors.paid" class="error-text">{{ errors.paid }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button v-for="amount in quickAmounts" :key="amount" type="button" class="btn-secondary btn-sm" @click="payment.paid = amount">
              {{ amount === total ? 'Uang pas' : rupiah(amount) }}
            </button>
          </div>
          <div class="flex items-baseline justify-between rounded-lg bg-slate-50 px-4 py-3">
            <span class="text-sm text-slate-600">Kembalian</span>
            <span class="text-2xl font-bold tabular-nums" :class="payment.paid >= total ? 'text-emerald-600' : 'text-slate-400'">{{ rupiah(change) }}</span>
          </div>
        </template>
        <div v-else>
          <label class="label">No. referensi / approval (opsional)</label>
          <input v-model="payment.ref" class="input" placeholder="Mis. 4 digit terakhir kartu / ID transaksi" />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="payModal = false">Kembali</button>
        <button class="btn-primary" :disabled="paying" @click="pay">
          <AppIcon name="check" :size="18" /> {{ paying ? 'Menyimpan…' : 'Selesaikan Transaksi' }}
        </button>
      </template>
    </AppModal>

    <!-- Modal sukses -->
    <AppModal v-if="lastSale" title="Transaksi berhasil" size="sm" @close="newTransaction">
      <div class="space-y-3 text-center">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <AppIcon name="check" :size="30" />
        </div>
        <p class="text-sm text-slate-500">{{ lastSale.number }}</p>
        <div class="grid grid-cols-2 gap-3 text-left">
          <div class="rounded-lg bg-slate-50 p-3">
            <p class="text-xs text-slate-500">Total</p>
            <p class="text-lg font-semibold tabular-nums">{{ rupiah(lastSale.total) }}</p>
          </div>
          <div class="rounded-lg bg-emerald-50 p-3">
            <p class="text-xs text-emerald-700">Kembalian</p>
            <p class="text-lg font-semibold text-emerald-700 tabular-nums">{{ rupiah(lastSale.change) }}</p>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="printReceipt"><AppIcon name="printer" :size="18" /> Cetak Struk</button>
        <button class="btn-primary" @click="newTransaction">Transaksi Baru (Enter)</button>
      </template>
    </AppModal>
    <ReceiptPrint v-if="lastSale" :sale="lastSale" />

    <!-- Dialog semua kategori -->
    <AppModal v-if="categoryModal" title="Pilih Kategori" size="lg" @close="categoryModal = false">
      <input v-model="categorySearch" type="search" class="input mb-4" placeholder="Cari kategori…" autofocus />
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          type="button"
          class="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition duration-200"
          :class="categoryId === '' ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 hover:border-brand-500 hover:bg-brand-50'"
          @click="selectCategory('')"
        >
          Semua kategori
        </button>
        <button
          v-for="category in filteredCategories"
          :key="category.id"
          type="button"
          class="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition duration-200"
          :class="categoryId === category.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 hover:border-brand-500 hover:bg-brand-50'"
          @click="selectCategory(category.id)"
        >
          <span class="min-w-0 truncate">{{ category.name }}</span>
          <span class="shrink-0 rounded-full px-1.5 text-[11px] tabular-nums" :class="categoryId === category.id ? 'bg-white/20' : 'bg-slate-100 text-slate-500'">{{ category.products_count }}</span>
        </button>
      </div>
      <p v-if="!filteredCategories.length" class="py-6 text-center text-sm text-slate-500">Kategori tidak ditemukan.</p>
    </AppModal>
  </div>
</template>
