<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import http, { errorMessage, validationErrors } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { number, rupiah, tanggal, today } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import BankSelect from '../components/BankSelect.vue'
import MoneyInput from '../components/MoneyInput.vue'
import PageHeader from '../components/PageHeader.vue'
import ProductSearch from '../components/ProductSearch.vue'

const router = useRouter()
const toast = useToastStore()

const suppliers = ref([])
const meta = useMetaStore()
const form = reactive({ date: today(), supplier_id: '', invoice_ref: '', discount: 0, notes: '', payment_method: 'tunai', cash_account_id: null, items: [] })
const drawer = ref(null)
const errors = ref({})
const saving = ref(false)

function addProduct(product) {
  const line = form.items.find((item) => item.product_id === product.id)
  if (line) {
    line.qty++
    return
  }
  const baseCost = Math.round(product.cost_price || 0)
  form.items.push({
    product_id: product.id,
    name: product.name,
    sku: product.sku,
    base_unit: product.unit,
    base_cost: baseCost,
    stock: product.stock,
    // Satuan beli: satuan dasar + satuan jual lain (mis. DUS isi 24).
    units: [{ id: null, name: product.unit, conversion: 1 }, ...(product.units || []).filter((unit) => unit.conversion > 1)],
    unit_id: null,
    conversion: 1,
    qty: 1,
    cost: baseCost,
  })
}

function changeUnit(item, value) {
  const unit = item.units.find((unit) => String(unit.id) === String(value)) || item.units[0]
  item.unit_id = unit.id
  item.conversion = unit.conversion
  item.cost = item.base_cost * unit.conversion
}

const subtotal = computed(() => form.items.reduce((sum, item) => sum + (Number(item.qty) || 0) * item.cost, 0))
const total = computed(() => Math.max(0, subtotal.value - (form.discount || 0)))

// ---- Konfirmasi sebelum simpan ----
const confirming = ref(false)
const lineCount = (item) => (Number(item.qty) || 0) * item.conversion
const zeroCost = computed(() => form.items.filter((item) => !item.cost))
const badQty = computed(() => form.items.filter((item) => !(Number(item.qty) > 0)))
const supplierName = computed(() => suppliers.value.find((supplier) => supplier.id === form.supplier_id)?.name)
const drawerShort = computed(() => (form.payment_method === 'tunai' && drawer.value ? Math.max(0, total.value - (drawer.value.balance - (drawer.value.pending_out || 0))) : 0))

/** Perkiraan HPP per satuan dasar setelah pembelian (rata-rata bergerak, diskon faktur dibagi proporsional). */
function newCost(item) {
  const ratio = subtotal.value > 0 ? total.value / subtotal.value : 1
  const incoming = lineCount(item)
  const unitCost = (item.cost / item.conversion) * ratio
  const stock = Math.max(0, item.stock || 0)
  return stock + incoming > 0 ? Math.round((stock * item.base_cost + incoming * unitCost) / (stock + incoming)) : item.base_cost
}

function save() {
  if (!form.items.length) {
    toast.error('Tambahkan minimal satu barang.')
    return
  }
  confirming.value = true
}

/** Tutup dialog dan arahkan ke isian harga beli yang masih 0. */
function fixCost() {
  confirming.value = false
  const index = form.items.findIndex((item) => !item.cost)
  nextTick(() => document.querySelector(`[data-cost-row="${index}"] input`)?.focus())
}

async function submit() {
  saving.value = true
  errors.value = {}
  try {
    const { data } = await http.post('/purchases', {
      ...form,
      supplier_id: form.supplier_id || null,
      cash_account_id: form.payment_method === 'tunai' ? null : form.cash_account_id,
      items: form.items.map(({ product_id, unit_id, qty, cost }) => ({ product_id, product_unit_id: unit_id, qty, cost })),
    })
    confirming.value = false
    toast.success(`Pembelian ${data.data.number} disimpan. Stok bertambah.`)
    router.replace({ name: 'purchase', params: { id: data.data.id } })
  } catch (e) {
    confirming.value = false
    errors.value = validationErrors(e)
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  http.get('/cash/accounts').then(({ data }) => (drawer.value = data.data.find((account) => account.is_mine))).catch(() => {})
  const { data } = await http.get('/suppliers', { params: { per_page: 200 } })
  suppliers.value = data.data
})
</script>

<template>
  <div class="stagger">
    <PageHeader title="Pembelian Baru" subtitle="Stok bertambah dan HPP rata-rata dihitung ulang saat disimpan" :back="{ name: 'purchases' }" />

    <div class="grid gap-5 lg:grid-cols-3">
      <section class="card space-y-4 p-5">
        <div>
          <label class="label">Tanggal</label>
          <input v-model="form.date" type="date" class="input" :max="today()" :class="{ 'input-error': errors.date }" />
          <p v-if="errors.date" class="error-text">{{ errors.date }}</p>
        </div>
        <div>
          <label class="label">Supplier</label>
          <select v-model="form.supplier_id" class="input">
            <option value="">— Tanpa supplier —</option>
            <option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">{{ supplier.name }}</option>
          </select>
        </div>
        <div>
          <label class="label">No. faktur supplier</label>
          <input v-model="form.invoice_ref" class="input" />
        </div>
        <div>
          <label class="label">Pembayaran</label>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            <button
              v-for="method in meta.payment_methods"
              :key="method.value"
              type="button"
              class="rounded-lg border px-2 py-2 text-sm font-medium transition"
              :class="form.payment_method === method.value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:bg-slate-50'"
              @click="form.payment_method = method.value"
            >
              {{ method.label.replace('Kartu Debit/Kredit', 'Kartu Debit') }}
            </button>
          </div>
          <p v-if="errors.payment_method" class="error-text">{{ errors.payment_method }}</p>
          <template v-if="form.payment_method === 'tunai'">
            <p class="mt-2 text-xs text-slate-500">
              Diambil dari kas fisik Anda<template v-if="drawer"> — saldo <b class="tabular-nums">{{ rupiah(drawer.balance) }}</b></template>.
            </p>
            <p v-if="drawer && total > drawer.balance - (drawer.pending_out || 0)" class="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              <AppIcon name="alert" :size="12" class="inline" /> Kas Anda kurang {{ rupiah(total - drawer.balance + (drawer.pending_out || 0)) }}.
              Minta serah terima kas dari pemilik/admin, atau pilih pembayaran non tunai.
            </p>
          </template>
          <p v-else class="mt-2 text-xs text-slate-500">Mengurangi saldo rekening bank.</p>
        </div>
        <BankSelect v-model="form.cash_account_id" :method="form.payment_method" label="Dari rekening" />
        <div>
          <label class="label">Catatan</label>
          <textarea v-model="form.notes" rows="2" class="input" />
        </div>
      </section>

      <section class="card lg:col-span-2">
        <div class="border-b border-slate-100 p-4">
          <ProductSearch include-inactive show-price="cost" type="barang" @select="addProduct" />
          <p v-if="errors.items" class="error-text">{{ errors.items }}</p>
        </div>
        <div class="table-wrap">
          <table v-stack class="table">
            <thead>
              <tr><th>Produk</th><th>Satuan</th><th class="num">Qty</th><th class="num">Harga Beli / Satuan</th><th class="num">Subtotal</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in form.items" :key="item.product_id" class="[&>td]:align-top">
                <td class="min-w-40 whitespace-normal">
                  <div class="flex min-h-10 flex-col justify-center">
                    <p class="font-medium">{{ item.name }}</p>
                    <p class="text-xs text-slate-500">{{ item.sku }} · <span class="whitespace-nowrap">stok {{ number(item.stock) }} {{ item.base_unit }}</span></p>
                  </div>
                </td>
                <td>
                  <select v-if="item.units.length > 1" :value="item.unit_id ?? ''" class="input h-10 w-32 py-0" @change="changeUnit(item, $event.target.value)">
                    <option v-for="unit in item.units" :key="unit.id ?? 'base'" :value="unit.id ?? ''">{{ unit.name }}{{ unit.conversion > 1 ? ` (isi ${unit.conversion})` : '' }}</option>
                  </select>
                  <div v-else class="flex h-10 items-center">{{ item.base_unit }}</div>
                  <p v-if="item.conversion > 1" class="mt-1 text-xs text-slate-500">= {{ number((item.qty || 0) * item.conversion) }} {{ item.base_unit }}</p>
                </td>
                <td class="num"><input v-model.number="item.qty" type="number" min="1" class="input ml-auto h-10 w-20 py-0 text-right" /></td>
                <td class="num">
                  <div class="ml-auto w-36 [&_input]:h-10 [&_input]:py-0" :data-cost-row="index"><MoneyInput v-model="item.cost" :invalid="!item.cost" /></div>
                  <p v-if="!item.cost" class="mt-1 text-xs text-red-600">Harga beli masih 0</p>
                </td>
                <td class="num font-medium"><div class="flex h-10 items-center justify-end">{{ rupiah((item.qty || 0) * item.cost, false) }}</div></td>
                <td>
                  <div class="flex h-10 items-center">
                    <button class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus" @click="form.items.splice(index, 1)"><AppIcon name="trash" :size="16" /></button>
                  </div>
                </td>
              </tr>
              <tr v-if="!form.items.length">
                <td colspan="6" class="py-10 text-center text-slate-500">Cari atau scan produk di atas untuk menambahkan.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="space-y-2 border-t border-slate-200 p-4 text-sm">
          <div class="flex justify-between"><span class="text-slate-500">Subtotal</span><span class="tabular-nums">{{ rupiah(subtotal) }}</span></div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-slate-500">Diskon faktur</span>
            <div class="w-44"><MoneyInput v-model="form.discount" :invalid="!!errors.discount" /></div>
          </div>
          <div class="flex items-baseline justify-between"><span class="font-semibold">Total</span><span class="text-xl font-bold text-brand-700 tabular-nums">{{ rupiah(total) }}</span></div>
          <div class="flex justify-between text-xs text-slate-500"><span>Dibayar dengan</span><span>{{ meta.paymentLabel(form.payment_method) }}</span></div>
          <div class="flex justify-end gap-2 pt-2">
            <RouterLink :to="{ name: 'purchases' }" class="btn-secondary">Batal</RouterLink>
            <button class="btn-primary" :disabled="saving || !form.items.length" @click="save">{{ saving ? 'Menyimpan…' : 'Simpan Pembelian' }}</button>
          </div>
        </div>
      </section>
    </div>

    <!-- Konfirmasi pembelian -->
    <AppModal v-if="confirming" title="Konfirmasi Pembelian" size="lg" fixed-body @close="confirming = false">
      <!-- Ringkasan atas & bawah tetap terlihat; hanya daftar barang yang di-scroll. -->
      <div class="flex min-h-0 flex-1 flex-col gap-4 text-sm [&>*:not(.scroll-area)]:shrink-0">
        <div v-if="zeroCost.length" class="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          <p class="font-semibold"><AppIcon name="alert" :size="16" class="inline" /> {{ zeroCost.length }} barang harga belinya masih Rp 0</p>
          <p class="mt-1 text-xs">
            {{ zeroCost.slice(0, 3).map((item) => item.name).join(', ') }}<template v-if="zeroCost.length > 3"> dan {{ zeroCost.length - 3 }} lainnya (baris merah)</template>.
            <span class="hidden sm:inline">Stok akan bertambah tanpa biaya sehingga <b>HPP rata-rata turun</b> dan laba terlihat lebih besar.</span>
            Lanjutkan hanya bila barang ini memang gratis / bonus dari supplier.
          </p>
        </div>
        <div v-if="badQty.length" class="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          <AppIcon name="alert" :size="16" class="inline" /> Qty belum diisi untuk: {{ badQty.map((item) => item.name).join(', ') }}.
        </div>

        <dl class="grid grid-cols-3 gap-x-4 gap-y-1 sm:grid-cols-4">
          <div><dt class="text-xs text-slate-500">Tanggal</dt><dd class="font-medium">{{ tanggal(form.date) }}</dd></div>
          <div><dt class="text-xs text-slate-500">Supplier</dt><dd class="font-medium">{{ supplierName || 'Tanpa supplier' }}</dd></div>
          <div class="hidden sm:block"><dt class="text-xs text-slate-500">No. faktur</dt><dd class="font-medium">{{ form.invoice_ref || '-' }}</dd></div>
          <div><dt class="text-xs text-slate-500">Jumlah barang</dt><dd class="font-medium">{{ form.items.length }} jenis</dd></div>
        </dl>

        <div class="scroll-area min-h-32 flex-1 overflow-auto overscroll-contain rounded-xl border border-slate-200">
          <table class="table">
            <thead class="sticky top-0 z-10 shadow-[0_1px_0_0_var(--color-slate-200)]"><tr><th>Barang</th><th class="num">Qty</th><th class="num">Harga beli</th><th class="num">Subtotal</th><th class="num">HPP baru (perkiraan)</th></tr></thead>
            <tbody>
              <tr v-for="item in form.items" :key="item.product_id" :class="{ 'bg-red-50/60': !item.cost }">
                <td class="whitespace-normal">
                  <p class="font-medium">{{ item.name }}</p>
                  <p v-if="item.conversion > 1" class="text-xs text-slate-500">= {{ number(lineCount(item)) }} {{ item.base_unit }}</p>
                </td>
                <td class="num whitespace-nowrap">{{ number(item.qty || 0) }} {{ item.units.find((unit) => unit.id === item.unit_id)?.name || item.base_unit }}</td>
                <td class="num" :class="{ 'font-semibold text-red-600': !item.cost }">{{ rupiah(item.cost, false) }}</td>
                <td class="num">{{ rupiah((item.qty || 0) * item.cost, false) }}</td>
                <td class="num whitespace-nowrap text-xs">
                  <span class="text-slate-400">{{ number(item.base_cost) }} → </span>
                  <b :class="newCost(item) < item.base_cost ? 'text-amber-700' : 'text-slate-800'">{{ number(newCost(item)) }}</b>
                  <span class="block text-slate-400">per {{ item.base_unit }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="grid gap-2 sm:grid-cols-2 sm:gap-3">
          <div class="space-y-1 rounded-xl bg-slate-50 p-3">
            <div class="flex justify-between"><span class="text-slate-500">Subtotal</span><span class="tabular-nums">{{ rupiah(subtotal) }}</span></div>
            <div v-if="form.discount" class="flex justify-between"><span class="text-slate-500">Diskon faktur</span><span class="tabular-nums">−{{ rupiah(form.discount) }}</span></div>
            <div class="flex justify-between border-t border-slate-200 pt-1 text-base font-bold"><span>Total</span><span class="text-brand-700 tabular-nums">{{ rupiah(total) }}</span></div>
          </div>
          <div class="space-y-1 rounded-xl bg-slate-50 p-3">
            <div class="flex justify-between"><span class="text-slate-500">Dibayar dengan</span><span class="font-medium">{{ meta.paymentLabel(form.payment_method) }}</span></div>
            <p v-if="form.payment_method === 'tunai'" class="text-xs text-slate-500">
              Mengurangi kas fisik Anda<template v-if="drawer">: {{ rupiah(drawer.balance) }} → <b :class="drawer.balance - total < 0 ? 'text-red-600' : ''">{{ rupiah(drawer.balance - total) }}</b></template>
            </p>
            <p v-else class="text-xs text-slate-500">Mengurangi saldo rekening bank.</p>
            <p v-if="drawerShort" class="rounded-lg bg-amber-100 px-2 py-1 text-xs text-amber-800">Kas Anda kurang {{ rupiah(drawerShort) }} — saldo kas akan minus.</p>
          </div>
        </div>
        <p class="hidden text-xs text-slate-500 sm:block">Setelah disimpan, stok bertambah dan HPP rata-rata dihitung ulang. Pembelian yang salah bisa dibatalkan dari halaman detail.</p>
      </div>
      <template #footer>
        <button v-if="zeroCost.length" class="btn-secondary" @click="fixCost">Perbaiki harga beli</button>
        <button v-else class="btn-secondary" @click="confirming = false">Kembali</button>
        <button class="btn-primary" :class="{ 'bg-amber-600 hover:bg-amber-700': zeroCost.length }" :disabled="saving || badQty.length" @click="submit">
          <AppIcon name="check" :size="16" /> {{ saving ? 'Menyimpan…' : zeroCost.length ? 'Tetap Simpan (harga 0)' : 'Ya, Simpan Pembelian' }}
        </button>
      </template>
    </AppModal>
  </div>
</template>
