<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http, { errorMessage, validationErrors } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { number, rupiah, tanggal } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import BankSelect from '../components/BankSelect.vue'
import AppModal from '../components/AppModal.vue'
import MoneyInput from '../components/MoneyInput.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'

const route = useRoute()
const router = useRouter()
const meta = useMetaStore()
const toast = useToastStore()

const settlement = ref(null)
const payForm = ref(null)
const payErrors = ref({})
const paying = ref(false)
const print = () => window.print()

async function load() {
  try {
    const { data } = await http.get(`/consignments/settlements/${route.params.id}`)
    settlement.value = data.data
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

function openPay() {
  payErrors.value = {}
  payForm.value = reactive({ amount: settlement.value.remaining, payment_method: 'tunai', cash_account_id: null, notes: '' })
}

async function pay() {
  paying.value = true
  payErrors.value = {}
  try {
    const { data } = await http.post(`/consignments/settlements/${settlement.value.id}/payments`, payForm.value)
    settlement.value = data.data
    payForm.value = null
    toast.success(settlement.value.status === 'lunas' ? 'Hutang titipan lunas.' : 'Pembayaran dicatat.')
  } catch (e) {
    payErrors.value = validationErrors(e)
    if (!Object.keys(payErrors.value).length) toast.error(errorMessage(e))
  } finally {
    paying.value = false
  }
}

async function cancelPayment(payment) {
  if (!confirm(`Batalkan pembayaran ${rupiah(payment.amount)}?`)) return
  try {
    const { data } = await http.delete(`/consignments/settlements/${settlement.value.id}/payments/${payment.id}`)
    settlement.value = data.data
    toast.success('Pembayaran dibatalkan.')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function cancelSettlement() {
  if (!confirm('Batalkan penyelesaian ini? Stok dan titipan terbuka dikembalikan seperti sebelum penyelesaian.')) return
  try {
    await http.delete(`/consignments/settlements/${settlement.value.id}`)
    toast.success('Penyelesaian dibatalkan.')
    router.replace({ name: 'consignments', query: { tab: 'settlements' } })
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

onMounted(load)
</script>

<template>
  <div class="stagger">
    <PageHeader :title="settlement?.number || 'Penyelesaian Titipan'" :subtitle="settlement ? `${settlement.supplier.name} · ${tanggal(settlement.date, 'long')}` : ''" :back="{ name: 'consignments', query: { tab: 'settlements' } }" class="no-print">
      <template v-if="settlement" #actions>
        <button class="btn-secondary" @click="print"><AppIcon name="printer" :size="16" /> Cetak</button>
        <button v-if="settlement.paid === 0" class="btn-secondary text-red-600" @click="cancelSettlement"><AppIcon name="ban" :size="16" /> Batalkan</button>
        <button v-if="settlement.remaining > 0" class="btn-primary" @click="openPay"><AppIcon name="cash" :size="16" /> Bayar</button>
      </template>
    </PageHeader>

    <template v-if="settlement">
      <section class="card p-5 print:border-0 print:p-0 print:shadow-none">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p class="text-lg font-bold text-slate-900">{{ meta.store.name }}</p>
            <p class="text-sm text-slate-500">Penyelesaian barang titipan</p>
          </div>
          <div class="text-right">
            <p class="font-medium">{{ settlement.number }}</p>
            <p class="text-sm text-slate-500">{{ settlement.supplier.name }} · {{ tanggal(settlement.date) }}</p>
            <StatusBadge :status="settlement.status" class="mt-1" />
          </div>
        </div>
        <div class="table-wrap -mx-5 sm:mx-0">
          <table v-stack class="table">
            <thead><tr><th>Barang</th><th class="num">Titipan</th><th class="num">Sisa Fisik</th><th class="num">Diretur</th><th class="num">Terbawa</th><th class="num">Dibayar</th><th class="num">Nilai</th></tr></thead>
            <tbody>
              <tr v-for="line in settlement.lines" :key="line.id">
                <td><p class="font-medium">{{ line.product_name }}</p><p class="text-xs text-slate-500">{{ line.sku }}</p></td>
                <td class="num">{{ number(line.open_qty) }}</td>
                <td class="num">
                  {{ number(line.remaining) }}
                  <p v-if="line.remaining !== line.stock_system" class="text-xs" :class="line.remaining < line.stock_system ? 'text-red-600' : 'text-amber-600'">sistem {{ number(line.stock_system) }}</p>
                </td>
                <td class="num">{{ number(line.returned) }}</td>
                <td class="num">{{ number(line.carried) }}</td>
                <td class="num font-semibold">{{ number(line.sold) }} {{ line.unit }}</td>
                <td class="num font-semibold">{{ rupiah(line.amount, false) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr><td colspan="6" class="text-right">Total dibayar ke supplier</td><td class="num">{{ rupiah(settlement.total) }}</td></tr>
              <tr><td colspan="6" class="text-right">Sudah dibayar</td><td class="num">{{ rupiah(settlement.paid) }}</td></tr>
              <tr><td colspan="6" class="text-right">Sisa hutang</td><td class="num text-base text-brand-700">{{ rupiah(settlement.remaining) }}</td></tr>
            </tfoot>
          </table>
        </div>
        <p v-if="settlement.notes" class="mt-3 text-sm text-slate-600">{{ settlement.notes }}</p>
      </section>

      <section class="card mt-4 overflow-hidden">
        <h2 class="border-b border-slate-100 px-5 py-3 font-semibold">Pembayaran ke supplier</h2>
        <div class="table-wrap">
          <table v-stack class="table">
            <thead><tr><th>Tanggal</th><th>Metode</th><th>Catatan</th><th>Dicatat</th><th class="num">Jumlah</th><th class="no-print"></th></tr></thead>
            <tbody>
              <tr v-for="payment in settlement.payments" :key="payment.id">
                <td>{{ tanggal(payment.date) }}</td>
                <td>{{ payment.payment_label }}</td>
                <td class="whitespace-normal text-slate-500">{{ payment.notes || '' }}</td>
                <td>{{ payment.user }}</td>
                <td class="num font-medium">{{ rupiah(payment.amount, false) }}</td>
                <td class="no-print text-right">
                  <button class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Batalkan pembayaran" @click="cancelPayment(payment)"><AppIcon name="trash" :size="16" /></button>
                </td>
              </tr>
              <tr v-if="!settlement.payments.length"><td colspan="6" class="py-6 text-center text-slate-500">Belum dibayar.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <AppModal v-if="payForm" title="Bayar ke Supplier" size="sm" @close="payForm = null">
      <form id="consignment-pay-form" class="space-y-4" @submit.prevent="pay">
        <div class="rounded-xl bg-brand-50 p-4 text-center">
          <p class="text-sm text-brand-800">Sisa hutang</p>
          <p class="text-2xl font-bold text-brand-800 tabular-nums">{{ rupiah(settlement.remaining) }}</p>
        </div>
        <div>
          <label class="label">Jumlah dibayar</label>
          <MoneyInput v-model="payForm.amount" :invalid="!!payErrors.amount" />
          <p v-if="payErrors.amount" class="error-text">{{ payErrors.amount }}</p>
        </div>
        <div>
          <label class="label">Metode</label>
          <select v-model="payForm.payment_method" class="input">
            <option v-for="method in meta.payment_methods" :key="method.value" :value="method.value">{{ method.label }}</option>
          </select>
          <p class="mt-1 text-xs text-slate-500">{{ payForm.payment_method === 'tunai' ? 'Tunai diambil dari kas fisik Anda.' : 'Non tunai diambil dari rekening bank.' }}</p>
        </div>
        <BankSelect v-model="payForm.cash_account_id" :method="payForm.payment_method" label="Dari rekening" />
        <div>
          <label class="label">Catatan</label>
          <input v-model="payForm.notes" class="input" placeholder="Opsional" />
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="payForm = null">Batal</button>
        <button class="btn-primary" type="submit" form="consignment-pay-form" :disabled="paying || !payForm.amount">{{ paying ? 'Menyimpan…' : 'Simpan Pembayaran' }}</button>
      </template>
    </AppModal>
  </div>
</template>
