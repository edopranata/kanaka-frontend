<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http, { errorMessage, validationErrors } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { number, rupiah, tanggal } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import BankSelect from '../components/BankSelect.vue'
import EmptyState from '../components/EmptyState.vue'
import PageHeader from '../components/PageHeader.vue'

const route = useRoute()
const router = useRouter()
const meta = useMetaStore()
const toast = useToastStore()

const suppliers = ref([])
const supplierId = ref(route.query.supplier_id ? Number(route.query.supplier_id) : '')
const lines = ref([])
const loading = ref(false)
const form = reactive({ notes: '', pay_now: false, payment_method: 'tunai', cash_account_id: null })
const errors = ref({})
const saving = ref(false)

async function loadPending() {
  lines.value = []
  if (!supplierId.value) return
  loading.value = true
  try {
    const { data } = await http.get('/consignments/pending', { params: { supplier_id: supplierId.value } })
    lines.value = data.data.map((row) => ({ ...row, include: true, remaining: Math.max(row.stock, 0), returned: 0 }))
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

watch(supplierId, (value) => {
  router.replace({ query: value ? { supplier_id: value } : {} })
  loadPending()
})

/**
 * Nilai yang dibayar dengan FIFO: terjual diambil dari kiriman terlama.
 */
function lineCalc(line) {
  const remaining = Math.min(Math.max(Number(line.remaining) || 0, 0), line.open_qty)
  const returned = Math.min(Math.max(Number(line.returned) || 0, 0), remaining)
  let sold = line.open_qty - remaining
  const paidQty = sold
  let amount = 0
  for (const batch of line.batches) {
    const take = Math.min(batch.qty, sold)
    amount += take * batch.cost
    sold -= take
    if (!sold) break
  }
  return { sold: paidQty, returned, carried: remaining - returned, amount, shrink: remaining - line.stock }
}

const included = computed(() => lines.value.filter((line) => line.include))
const total = computed(() => included.value.reduce((sum, line) => sum + lineCalc(line).amount, 0))
const lineError = (index, field) => errors.value[`lines.${index}.${field}`]

function returnAll() {
  lines.value.forEach((line) => (line.returned = line.remaining))
}
function keepAll() {
  lines.value.forEach((line) => (line.returned = 0))
}

async function save() {
  const message = total.value
    ? `Total yang harus dibayar ke supplier ${rupiah(total.value)}${form.pay_now ? ` dibayar sekarang (${meta.paymentLabel(form.payment_method)})` : ' dicatat sebagai hutang'}. Lanjutkan?`
    : 'Tidak ada barang terjual. Simpan penyelesaian (retur / penyesuaian stok)?'
  if (!confirm(message)) return

  saving.value = true
  errors.value = {}
  try {
    const { data } = await http.post('/consignments/settlements', {
      supplier_id: supplierId.value,
      notes: form.notes || null,
      pay_now: form.pay_now && total.value > 0,
      payment_method: form.pay_now ? form.payment_method : null,
      cash_account_id: form.pay_now ? form.cash_account_id : null,
      lines: included.value.map((line) => ({ product_id: line.product_id, remaining: Number(line.remaining) || 0, returned: Number(line.returned) || 0 })),
    })
    toast.success(`Penyelesaian ${data.data.number} disimpan.`)
    router.replace({ name: 'consignment-settlement', params: { id: data.data.id } })
  } catch (e) {
    const all = validationErrors(e)
    // Petakan index baris yang dikirim ke index di tabel.
    errors.value = Object.fromEntries(Object.entries(all).map(([key, value]) => {
      const match = key.match(/^lines\.(\d+)\.(.+)$/)
      return match ? [`lines.${lines.value.indexOf(included.value[match[1]])}.${match[2]}`, value] : [key, value]
    }))
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  const { data } = await http.get('/suppliers', { params: { per_page: 200 } })
  suppliers.value = data.data
  loadPending()
})
</script>

<template>
  <div class="stagger">
    <PageHeader title="Penyelesaian Titipan" subtitle="Hitung sisa fisik: yang tidak ada lagi dibayar ke supplier, sisa boleh diretur atau terbawa ke penyelesaian berikutnya" :back="{ name: 'consignments' }" />

    <div class="card mb-4 flex flex-wrap items-end gap-3 p-4">
      <div class="min-w-64 flex-1">
        <label class="label">Supplier</label>
        <select v-model="supplierId" class="input">
          <option value="">— Pilih supplier —</option>
          <option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">{{ supplier.name }}</option>
        </select>
      </div>
      <div v-if="lines.length" class="flex flex-wrap gap-2">
        <button type="button" class="btn-secondary" @click="returnAll"><AppIcon name="back" :size="16" /> Retur semua sisa</button>
        <button type="button" class="btn-secondary" @click="keepAll">Sisa dibiarkan (terbawa)</button>
      </div>
    </div>

    <div v-if="supplierId" class="card overflow-hidden">
      <div class="table-wrap">
        <table v-stack class="table">
          <thead>
            <tr>
              <th></th><th>Barang</th><th class="num">Titipan Terbuka</th><th class="num">Stok Sistem</th>
              <th class="num">Sisa Fisik</th><th class="num">Diretur</th><th class="num">Terbawa</th><th class="num">Dibayar</th><th class="num">Nilai</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(line, index) in lines" :key="line.product_id" class="[&>td]:align-top" :class="{ 'opacity-50': !line.include }">
              <td><div class="flex h-10 items-center"><input v-model="line.include" type="checkbox" class="h-4 w-4 rounded border-slate-300" :title="line.include ? 'Ikut diselesaikan' : 'Lewati'" /></div></td>
              <td class="min-w-44 whitespace-normal">
                <div class="flex min-h-10 flex-col justify-center">
                  <p class="font-medium">{{ line.name }}</p>
                  <p class="text-xs text-slate-500">
                    {{ line.sku }} · kiriman sejak {{ tanggal(line.batches[0].date) }}
                    <template v-if="line.batches.length > 1"> ({{ line.batches.length }} harga setor)</template>
                  </p>
                  <p v-if="lineError(index, 'remaining') || lineError(index, 'returned') || lineError(index, 'product_id')" class="error-text">
                    {{ lineError(index, 'remaining') || lineError(index, 'returned') || lineError(index, 'product_id') }}
                  </p>
                </div>
              </td>
              <td class="num"><div class="flex h-10 items-center justify-end">{{ number(line.open_qty) }}</div></td>
              <td class="num"><div class="flex h-10 items-center justify-end">{{ number(line.stock) }}</div></td>
              <td class="num">
                <input v-model.number="line.remaining" type="number" min="0" :max="line.open_qty" class="input ml-auto h-10 w-20 py-0 text-right" :disabled="!line.include" @focus="$event.target.select()" />
                <p v-if="line.include && lineCalc(line).shrink" class="mt-1 text-xs" :class="lineCalc(line).shrink < 0 ? 'text-red-600' : 'text-amber-600'">
                  selisih {{ lineCalc(line).shrink > 0 ? '+' : '' }}{{ lineCalc(line).shrink }}
                </p>
              </td>
              <td class="num"><input v-model.number="line.returned" type="number" min="0" :max="line.remaining" class="input ml-auto h-10 w-20 py-0 text-right" :disabled="!line.include" @focus="$event.target.select()" /></td>
              <td class="num"><div class="flex h-10 items-center justify-end text-slate-600">{{ number(lineCalc(line).carried) }}</div></td>
              <td class="num"><div class="flex h-10 items-center justify-end font-semibold">{{ number(lineCalc(line).sold) }} {{ line.unit }}</div></td>
              <td class="num"><div class="flex h-10 items-center justify-end font-semibold">{{ rupiah(lineCalc(line).amount, false) }}</div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-if="!loading && !lines.length" icon="inbox" title="Tidak ada titipan terbuka" text="Semua titipan supplier ini sudah diselesaikan." />

      <div v-if="lines.length" class="grid gap-4 border-t border-slate-200 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div class="space-y-3 text-sm">
          <div>
            <label class="label">Catatan</label>
            <input v-model="form.notes" class="input" placeholder="Opsional" />
          </div>
          <p class="text-xs text-slate-500">
            <b>Dibayar</b> = titipan terbuka − sisa fisik (terjual atau hilang). <b>Terbawa</b> = sisa yang tidak diretur, tetap sebagai titipan untuk penyelesaian berikutnya.
            Nilai dihitung dengan harga setor kiriman terlama lebih dulu (FIFO).
          </p>
        </div>
        <div class="space-y-3 rounded-xl bg-slate-50 p-4">
          <div class="flex items-baseline justify-between">
            <span class="font-semibold">Total dibayar ke supplier</span>
            <span class="text-2xl font-bold text-brand-700 tabular-nums">{{ rupiah(total) }}</span>
          </div>
          <div class="grid grid-cols-2 gap-1 rounded-lg bg-white p-1">
            <button type="button" class="tab justify-center" :class="{ 'tab-active bg-brand-50': !form.pay_now }" @click="form.pay_now = false">Bayar nanti (hutang)</button>
            <button type="button" class="tab justify-center" :class="{ 'tab-active bg-brand-50': form.pay_now }" @click="form.pay_now = true">Bayar sekarang</button>
          </div>
          <select v-if="form.pay_now" v-model="form.payment_method" class="input">
            <option v-for="method in meta.payment_methods" :key="method.value" :value="method.value">{{ method.label }}</option>
          </select>
          <p v-if="form.pay_now && form.payment_method === 'tunai'" class="text-xs text-slate-500">Diambil dari kas fisik Anda — otomatis tercatat di Kas &amp; Bank.</p>
          <BankSelect v-if="form.pay_now" v-model="form.cash_account_id" :method="form.payment_method" label="Dari rekening" />
          <button class="btn-primary w-full" :disabled="saving || !included.length" @click="save">
            <AppIcon name="check" :size="16" /> {{ saving ? 'Menyimpan…' : 'Simpan Penyelesaian' }}
          </button>
        </div>
      </div>
    </div>
    <div v-else class="card">
      <EmptyState icon="inbox" title="Pilih supplier" text="Pilih supplier untuk melihat barang titipannya yang belum diselesaikan." />
    </div>
  </div>
</template>
