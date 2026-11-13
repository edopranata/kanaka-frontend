<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import http, { errorMessage, postTransaction, REPLAYED_MESSAGE, transactionKey, validationErrors } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { rupiah, tanggalAngka } from '../utils/format'
import { columnsFor, consignmentPaymentBytes } from '../utils/escpos'
import { printThermal, receiptPaper } from '../utils/print'
import { printerConfig } from '../utils/printer'
import AppIcon from './AppIcon.vue'
import AppModal from './AppModal.vue'
import BankSelect from './BankSelect.vue'

/**
 * Bayar penitip sekaligus: centang beberapa penyelesaian titipan (mis. 3 hari) lalu bayar sekali; setiap penyelesaian
 * yang dipilih dilunasi. Bukti bayar thermal berisi rincian per hari.
 */
const props = defineProps({ supplier: { type: Object, required: true } })
const emit = defineEmits(['close', 'paid'])
const meta = useMetaStore()
const toast = useToastStore()

const loading = ref(true)
const rows = ref([])
const selected = ref([])
const form = reactive({ payment_method: 'tunai', cash_account_id: null, notes: '' })
const errors = ref({})
const saving = ref(false)
const result = ref(null)
let payKey = null

const chosenTotal = computed(() => rows.value.filter((row) => selected.value.includes(row.id)).reduce((sum, row) => sum + row.remaining, 0))
const allChosen = computed(() => rows.value.length > 0 && selected.value.length === rows.value.length)
const toggleAll = () => (selected.value = allChosen.value ? [] : rows.value.map((row) => row.id))

async function load() {
  loading.value = true
  try {
    const { data } = await http.get(`/consignments/suppliers/${props.supplier.id}/unpaid`)
    rows.value = data.data
    selected.value = data.data.map((row) => row.id)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

async function pay() {
  saving.value = true
  errors.value = {}
  const ids = [...selected.value].sort((a, b) => a - b)
  payKey = transactionKey(payKey, { supplier: props.supplier.id, ids, method: form.payment_method })
  try {
    const body = { settlement_ids: ids, ...form, cash_account_id: form.payment_method === 'tunai' ? null : form.cash_account_id }
    const { data, replayed } = await postTransaction(`/consignments/suppliers/${props.supplier.id}/payments`, body, payKey.key)
    if (replayed) toast.show(REPLAYED_MESSAGE, 'success', 6000)
    result.value = { payment: data.data, outstanding: data.outstanding }
    emit('paid', result.value)
  } catch (e) {
    errors.value = validationErrors(e)
    if (!Object.keys(errors.value).length) toast.error(errorMessage(e))
    if (errors.value.settlement_ids) load()
  } finally {
    saving.value = false
  }
}

function printProof() {
  const columns = columnsFor(receiptPaper())
  printThermal(consignmentPaymentBytes(result.value.payment, { store: meta.store, columns, outstanding: result.value.outstanding, feed: printerConfig.feed, cut: printerConfig.cut }), columns, 'Bukti bayar dikirim ke printer.')
}

onMounted(load)
</script>

<template>
  <AppModal title="Bayar Titipan" size="lg" @close="emit('close')">
    <div v-if="result" class="space-y-4 text-center">
      <span class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"><AppIcon name="check" :size="24" /></span>
      <div>
        <p class="font-semibold text-slate-900">Pembayaran ke {{ supplier.name }} tercatat</p>
        <p class="text-sm text-slate-500">{{ result.payment.lines.length }} penyelesaian · {{ result.payment.payment_label }}</p>
      </div>
      <p class="text-2xl font-bold text-brand-700 tabular-nums">{{ rupiah(result.payment.total) }}</p>
      <p class="text-sm text-slate-600">Sisa hutang ke {{ supplier.name }}: <b class="tabular-nums">{{ rupiah(result.outstanding) }}</b></p>
    </div>

    <div v-else class="space-y-4">
      <p v-if="loading" class="py-8 text-center text-sm text-slate-500">Memuat penyelesaian…</p>
      <p v-else-if="!rows.length" class="py-8 text-center text-sm text-slate-500">Tidak ada hutang titipan ke {{ supplier.name }}.</p>
      <template v-else>
        <label class="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" :checked="allChosen" :indeterminate="selected.length > 0 && !allChosen" @change="toggleAll" /> Pilih semua ({{ rows.length }} penyelesaian)
        </label>
        <div class="divide-y divide-slate-100 rounded-xl border border-slate-200">
          <label v-for="row in rows" :key="row.id" class="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-50" :class="{ 'bg-brand-50/60': selected.includes(row.id) }">
            <input v-model="selected" type="checkbox" :value="row.id" />
            <span class="min-w-0 flex-1">
              <span class="font-medium text-slate-800">{{ tanggalAngka(row.date) }}</span>
              <span class="text-slate-500"> · {{ row.number }} · terjual {{ row.sold }}</span>
              <span v-if="row.paid" class="block text-xs text-amber-700">sudah dibayar {{ rupiah(row.paid) }} dari {{ rupiah(row.total) }}</span>
            </span>
            <span class="shrink-0 font-semibold tabular-nums">{{ rupiah(row.remaining) }}</span>
          </label>
        </div>
        <p v-if="errors.settlement_ids" class="error-text">{{ errors.settlement_ids }}</p>

        <div>
          <label class="label">Metode pembayaran</label>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(7rem,1fr))]">
            <button
              v-for="method in meta.payment_methods"
              :key="method.value"
              type="button"
              class="rounded-lg border px-3 py-2.5 text-sm font-medium"
              :class="form.payment_method === method.value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:bg-slate-50'"
              @click="form.payment_method = method.value"
            >
              {{ method.label.replace('Kartu Debit/Kredit', 'Kartu Debit') }}
            </button>
          </div>
          <p v-if="errors.payment_method" class="error-text">{{ errors.payment_method }}</p>
          <p v-else class="mt-1 text-xs text-slate-500">{{ form.payment_method === 'tunai' ? 'Diambil dari kas fisik (laci) Anda.' : 'Mengurangi saldo rekening bank.' }}</p>
        </div>
        <BankSelect v-model="form.cash_account_id" :method="form.payment_method" label="Dari rekening" />
        <div>
          <label class="label">Catatan</label>
          <input v-model="form.notes" class="input" maxlength="200" placeholder="Opsional, mis. no. bukti transfer" />
        </div>
      </template>
    </div>

    <template #footer="{ close }">
      <template v-if="result">
        <button class="btn-secondary" @click="printProof"><AppIcon name="printer" :size="16" /> Cetak bukti</button>
        <button class="btn-primary" @click="close">Selesai</button>
      </template>
      <template v-else>
        <p class="mr-auto self-center text-sm text-slate-600">Dipilih {{ selected.length }} · <b class="tabular-nums text-slate-900">{{ rupiah(chosenTotal) }}</b></p>
        <button class="btn-secondary" @click="close">Batal</button>
        <button class="btn-primary" :disabled="saving || !selected.length" @click="pay"><AppIcon name="check" :size="16" /> {{ saving ? 'Menyimpan…' : `Bayar ${rupiah(chosenTotal)}` }}</button>
      </template>
    </template>
  </AppModal>
</template>
