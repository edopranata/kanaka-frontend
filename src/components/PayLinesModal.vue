<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import http, { errorMessage, validationErrors } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { itemName, rupiah, tanggal } from '../utils/format'
import { columnsFor, paymentBytes } from '../utils/escpos'
import { printThermal, receiptPaper } from '../utils/print'
import { printerConfig } from '../utils/printer'
import AppIcon from './AppIcon.vue'
import AppModal from './AppModal.vue'
import MoneyInput from './MoneyInput.vue'
import BankSelect from './BankSelect.vue'

/**
 * Bayar piutang per baris bon: pilih baris (utuh) yang dibayar dari semua bon pelanggan yang belum lunas, atau hanya
 * baris satu tagihan (billId). Nilai baris = subtotal + bagian pajak bon (dihitung server).
 */
const props = defineProps({
  customer: { type: Object, required: true },
  billId: { type: Number, default: null },
})
const emit = defineEmits(['close', 'paid'])
const meta = useMetaStore()
const toast = useToastStore()

const loading = ref(true)
const sales = ref([])
const selected = ref([])
const form = reactive({ payment_method: 'tunai', cash_account_id: null, received: 0, notes: '' })
const errors = ref({})
const saving = ref(false)
const result = ref(null)

const lines = computed(() => sales.value.flatMap((sale) => sale.items))
const outstanding = computed(() => lines.value.reduce((sum, line) => sum + line.amount, 0))
const chosenTotal = computed(() => lines.value.filter((line) => selected.value.includes(line.id)).reduce((sum, line) => sum + line.amount, 0))
const allChosen = computed(() => lines.value.length > 0 && selected.value.length === lines.value.length)

// Tunai (seperti kasir): uang diterima, tombol cepat (uang pas & pembulatan ke atas), kembalian.
const isCash = computed(() => form.payment_method === 'tunai')
const change = computed(() => Math.max(0, form.received - chosenTotal.value))
const enoughCash = computed(() => !isCash.value || form.received >= chosenTotal.value)
const quickAmounts = computed(() => {
  const total = chosenTotal.value
  if (!total) return []
  const amounts = new Set([total])
  for (const unit of [5000, 10000, 20000, 50000, 100000]) amounts.add(Math.ceil(total / unit) * unit)
  return [...amounts].filter((amount) => amount >= total).sort((a, b) => a - b).slice(0, 5)
})

const saleState = (sale) => {
  const count = sale.items.filter((line) => selected.value.includes(line.id)).length
  return count === 0 ? 'none' : count === sale.items.length ? 'all' : 'some'
}
function toggleSale(sale) {
  const ids = sale.items.map((line) => line.id)
  selected.value = saleState(sale) === 'all' ? selected.value.filter((id) => !ids.includes(id)) : [...new Set([...selected.value, ...ids])]
}
const toggleAll = () => (selected.value = allChosen.value ? [] : lines.value.map((line) => line.id))

async function load() {
  loading.value = true
  try {
    const { data } = await http.get(`/customers/${props.customer.id}/unpaid-lines`, { params: { bill_id: props.billId || undefined } })
    sales.value = data.data.sales
    selected.value = []
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

async function pay() {
  saving.value = true
  errors.value = {}
  try {
    const { data } = await http.post('/receivable-payments', { customer_id: props.customer.id, customer_bill_id: props.billId, sale_item_ids: selected.value, ...form, received: isCash.value ? form.received : null })
    result.value = { payment: data.data, outstanding: data.outstanding }
    emit('paid', result.value)
  } catch (e) {
    errors.value = validationErrors(e)
    if (!Object.keys(errors.value).length) toast.error(errorMessage(e))
    if (errors.value.sale_item_ids) load()
  } finally {
    saving.value = false
  }
}

function printProof() {
  const columns = columnsFor(receiptPaper())
  printThermal(paymentBytes(result.value.payment, { store: meta.store, columns, outstanding: result.value.outstanding, feed: printerConfig.feed, cut: printerConfig.cut }), columns, 'Bukti bayar dikirim ke printer.')
}

onMounted(load)
</script>

<template>
  <AppModal :title="billId ? 'Catat Pembayaran' : 'Bayar Sebagian'" size="lg" @close="emit('close')">
    <!-- Selesai: ringkasan & cetak bukti -->
    <div v-if="result" class="space-y-4 text-center">
      <span class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"><AppIcon name="check" :size="24" /></span>
      <div>
        <p class="font-semibold text-slate-900">Pembayaran {{ result.payment.number }} tercatat</p>
        <p class="text-sm text-slate-500">{{ result.payment.items.length }} baris · {{ result.payment.payment_label }}</p>
      </div>
      <p class="text-2xl font-bold text-brand-700 tabular-nums">{{ rupiah(result.payment.amount) }}</p>
      <div v-if="result.payment.received !== null" class="mx-auto flex max-w-xs justify-between rounded-lg bg-emerald-50 px-4 py-2.5 text-sm">
        <span class="text-emerald-800">Tunai {{ rupiah(result.payment.received) }}</span>
        <span class="font-semibold text-emerald-700">Kembalian {{ rupiah(result.payment.change) }}</span>
      </div>
      <p class="text-sm text-slate-600">Sisa piutang {{ customer.name }}: <b class="tabular-nums">{{ rupiah(result.outstanding) }}</b></p>
    </div>

    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-4 py-3">
        <div>
          <p class="text-sm font-semibold text-brand-900">{{ customer.name }}</p>
          <p class="text-xs text-brand-800">Pilih baris yang dibayar; satu baris dibayar utuh.</p>
        </div>
        <p class="text-right text-sm text-brand-800">{{ billId ? 'Sisa tagihan' : 'Sisa piutang' }}<br /><b class="text-lg tabular-nums">{{ rupiah(outstanding) }}</b></p>
      </div>

      <p v-if="loading" class="py-8 text-center text-sm text-slate-500">Memuat barang…</p>
      <p v-else-if="!lines.length" class="py-8 text-center text-sm text-slate-500">Tidak ada barang yang belum dibayar.</p>
      <template v-else>
        <label class="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" :checked="allChosen" :indeterminate="selected.length > 0 && !allChosen" @change="toggleAll" /> Pilih semua ({{ lines.length }} baris)
        </label>
        <div class="divide-y divide-slate-100 rounded-xl border border-slate-200">
          <div v-for="sale in sales" :key="sale.id" class="px-3 py-2.5">
            <label class="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" :checked="saleState(sale) === 'all'" :indeterminate="saleState(sale) === 'some'" @change="toggleSale(sale)" />
              {{ sale.number }} <span class="font-normal text-slate-500">({{ tanggal(sale.business_date) }})</span>
              <span v-if="sale.bill" class="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{{ sale.bill }}</span>
            </label>
            <label v-for="line in sale.items" :key="line.id" class="mt-1.5 flex items-start gap-2 rounded-lg py-1 pr-1 pl-6 text-sm hover:bg-slate-50" :class="{ 'bg-brand-50/60': selected.includes(line.id) }">
              <input v-model="selected" type="checkbox" :value="line.id" class="mt-0.5" />
              <span class="min-w-0 flex-1">{{ line.qty }} {{ line.unit }} {{ itemName(line) }}<span v-if="line.variant" class="text-slate-500"> ({{ line.variant }})</span></span>
              <span class="shrink-0 tabular-nums">{{ rupiah(line.amount) }}</span>
            </label>
          </div>
        </div>
        <p v-if="errors.sale_item_ids" class="error-text">{{ errors.sale_item_ids }}</p>

        <div>
          <label class="label">Metode pembayaran</label>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(7rem,1fr))]">
            <button
              v-for="method in meta.payment_methods.filter((item) => item.value !== 'va')"
              :key="method.value"
              type="button"
              class="rounded-lg border px-3 py-2.5 text-sm font-medium"
              :class="form.payment_method === method.value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:bg-slate-50'"
              @click="form.payment_method = method.value"
            >
              {{ method.label }}
            </button>
          </div>
          <p v-if="errors.payment_method" class="error-text">{{ errors.payment_method }}</p>
          <p v-else class="mt-1 text-xs text-slate-500">{{ isCash ? 'Tunai masuk ke kas fisik Anda.' : 'Non tunai masuk ke rekening bank.' }}</p>
        </div>
        <template v-if="isCash">
          <div>
            <label class="label">Uang diterima</label>
            <MoneyInput v-model="form.received" :invalid="!!errors.received || (form.received > 0 && !enoughCash)" />
            <p v-if="errors.received" class="error-text">{{ errors.received }}</p>
          </div>
          <div v-if="quickAmounts.length" class="flex flex-wrap gap-2">
            <button v-for="amount in quickAmounts" :key="amount" type="button" class="btn-secondary btn-sm" @click="form.received = amount">
              {{ amount === chosenTotal ? 'Uang pas' : rupiah(amount) }}
            </button>
          </div>
          <div class="flex items-baseline justify-between rounded-lg bg-slate-50 px-4 py-3">
            <span class="text-sm text-slate-600">Kembalian</span>
            <span class="text-2xl font-bold tabular-nums" :class="selected.length && enoughCash ? 'text-emerald-600' : 'text-slate-400'">{{ rupiah(change) }}</span>
          </div>
        </template>
        <BankSelect v-else v-model="form.cash_account_id" :method="form.payment_method" label="Ke rekening" />
        <div>
          <label class="label">Catatan</label>
          <input v-model="form.notes" class="input" maxlength="255" placeholder="Opsional" />
        </div>
      </template>
    </div>

    <template #footer="{ close }">
      <template v-if="result">
        <button class="btn-secondary" @click="printProof"><AppIcon name="printer" :size="16" /> Cetak bukti</button>
        <button class="btn-primary" @click="close">Selesai</button>
      </template>
      <template v-else>
        <p class="mr-auto self-center text-sm text-slate-600">Dipilih {{ selected.length }} baris · <b class="tabular-nums text-slate-900">{{ rupiah(chosenTotal) }}</b></p>
        <button class="btn-secondary" @click="close">Batal</button>
        <button class="btn-primary" :disabled="saving || !selected.length || !enoughCash" :title="enoughCash ? '' : 'Uang diterima kurang dari total yang dibayar'" @click="pay">
          <AppIcon name="check" :size="16" /> {{ saving ? 'Menyimpan…' : 'Bayar' }}
        </button>
      </template>
    </template>
  </AppModal>
</template>
