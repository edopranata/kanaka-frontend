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

const bill = ref(null)
const payForm = ref(null)
const payErrors = ref({})
const paying = ref(false)
const print = () => window.print()
const periodLabel = (period) => new Date(`${period}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

async function load() {
  try {
    const { data } = await http.get(`/bills/${route.params.id}`)
    bill.value = data.data
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

function openPay() {
  payErrors.value = {}
  payForm.value = reactive({ amount: bill.value.remaining, payment_method: 'tunai', cash_account_id: null, notes: '' })
}

async function pay() {
  paying.value = true
  payErrors.value = {}
  try {
    const { data } = await http.post(`/bills/${bill.value.id}/payments`, payForm.value)
    bill.value = data.data
    payForm.value = null
    toast.success(bill.value.status === 'lunas' ? 'Tagihan lunas.' : 'Pembayaran dicatat.')
  } catch (e) {
    payErrors.value = validationErrors(e)
    if (!Object.keys(payErrors.value).length) toast.error(errorMessage(e))
  } finally {
    paying.value = false
  }
}

async function cancelPayment(payment) {
  if (!confirm(`Batalkan pembayaran ${rupiah(payment.amount)} tanggal ${tanggal(payment.date)}?`)) return
  try {
    const { data } = await http.delete(`/bills/${bill.value.id}/payments/${payment.id}`)
    bill.value = data.data
    toast.success('Pembayaran dibatalkan.')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function cancelBill() {
  if (!confirm('Batalkan tagihan ini? Bon di dalamnya kembali berstatus "belum ditagih".')) return
  try {
    await http.delete(`/bills/${bill.value.id}`)
    toast.success('Tagihan dibatalkan.')
    router.replace({ name: 'bills' })
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

onMounted(load)
</script>

<template>
  <div class="stagger">
    <PageHeader :title="bill?.number || 'Detail Tagihan'" :subtitle="bill ? `${bill.customer.name} · ${periodLabel(bill.period)}` : ''" :back="{ name: 'bills' }" class="no-print">
      <template v-if="bill" #actions>
        <button class="btn-secondary" @click="print"><AppIcon name="printer" :size="16" /> Cetak Tagihan</button>
        <button v-if="bill.paid === 0" class="btn-secondary text-red-600" @click="cancelBill"><AppIcon name="ban" :size="16" /> Batalkan</button>
        <button v-if="bill.remaining > 0" class="btn-primary" @click="openPay"><AppIcon name="cash" :size="16" /> Catat Pembayaran</button>
      </template>
    </PageHeader>

    <template v-if="bill">
      <!-- Dokumen tagihan (juga untuk dicetak) -->
      <section class="card p-5 sm:p-8 print:border-0 print:p-0 print:shadow-none">
        <div class="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p class="text-lg font-bold text-slate-900">{{ meta.store.name }}</p>
            <p v-if="meta.store.address" class="text-sm text-slate-500">{{ meta.store.address }}</p>
            <p v-if="meta.store.phone" class="text-sm text-slate-500">Telp. {{ meta.store.phone }}</p>
          </div>
          <div class="text-right">
            <p class="text-2xl font-bold tracking-wide text-brand-700">TAGIHAN</p>
            <p class="font-medium">{{ bill.number }}</p>
            <StatusBadge :status="bill.is_overdue ? 'jatuh_tempo' : bill.status" class="mt-1" />
          </div>
        </div>

        <div class="grid gap-4 border-b border-slate-200 py-5 text-sm sm:grid-cols-2">
          <div>
            <p class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Kepada</p>
            <p class="mt-1 font-semibold text-slate-900">{{ bill.customer.name }}</p>
            <p v-if="bill.customer.address" class="text-slate-600">{{ bill.customer.address }}</p>
            <p v-if="bill.customer.phone" class="text-slate-600">{{ bill.customer.phone }}</p>
          </div>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 sm:justify-self-end">
            <dt class="text-slate-500">Periode</dt><dd class="text-right font-medium">{{ periodLabel(bill.period) }}</dd>
            <dt class="text-slate-500">Tanggal tagihan</dt><dd class="text-right">{{ tanggal(bill.issue_date, 'long') }}</dd>
            <dt class="text-slate-500">Jatuh tempo</dt><dd class="text-right font-medium" :class="{ 'text-red-600': bill.is_overdue }">{{ tanggal(bill.due_date, 'long') }}</dd>
          </dl>
        </div>

        <div class="table-wrap -mx-5 sm:mx-0">
          <table v-stack class="table">
            <thead>
              <tr><th>Tanggal</th><th>No. Bon</th><th>Barang</th><th class="num">Jumlah</th></tr>
            </thead>
            <tbody>
              <tr v-for="sale in bill.sales" :key="sale.id">
                <td>{{ tanggal(sale.business_date) }}</td>
                <td>
                  <RouterLink :to="{ name: 'sale', params: { id: sale.id } }" class="text-brand-700 hover:underline print:text-slate-800">{{ sale.number }}</RouterLink>
                </td>
                <td class="whitespace-normal">
                  <span v-for="(item, index) in sale.items" :key="item.id">{{ item.product_name }}{{ item.variant ? ` ${item.variant}` : '' }} ({{ number(item.qty) }} {{ item.unit }}){{ index < sale.items.length - 1 ? ', ' : '' }}</span>
                </td>
                <td class="num">{{ rupiah(sale.total, false) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr><td colspan="3" class="text-right">Total tagihan</td><td class="num">{{ rupiah(bill.total) }}</td></tr>
              <tr><td colspan="3" class="text-right">Sudah dibayar</td><td class="num">{{ rupiah(bill.paid) }}</td></tr>
              <tr><td colspan="3" class="text-right">Sisa tagihan</td><td class="num text-base text-brand-700">{{ rupiah(bill.remaining) }}</td></tr>
            </tfoot>
          </table>
        </div>
        <p class="mt-6 hidden text-sm text-slate-600 print:block">Mohon melakukan pembayaran sebelum tanggal jatuh tempo. Terima kasih.</p>
      </section>

      <!-- Riwayat pembayaran -->
      <section class="card mt-4 overflow-hidden print:mt-6 print:border-0 print:shadow-none">
        <h2 class="border-b border-slate-100 px-5 py-3 font-semibold">Riwayat pembayaran</h2>
        <div class="table-wrap">
          <table v-stack class="table">
            <thead><tr><th>Tanggal</th><th>Metode</th><th>Catatan</th><th>Dicatat</th><th class="num">Jumlah</th><th class="no-print"></th></tr></thead>
            <tbody>
              <tr v-for="payment in bill.payments" :key="payment.id">
                <td>{{ tanggal(payment.date) }}</td>
                <td>{{ payment.payment_label }}</td>
                <td class="whitespace-normal text-slate-500">{{ payment.notes || '' }}</td>
                <td>{{ payment.user }}</td>
                <td class="num font-medium">{{ rupiah(payment.amount, false) }}</td>
                <td class="no-print text-right">
                  <button class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Batalkan pembayaran" @click="cancelPayment(payment)"><AppIcon name="trash" :size="16" /></button>
                </td>
              </tr>
              <tr v-if="!bill.payments.length"><td colspan="6" class="py-6 text-center text-slate-500">Belum ada pembayaran.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <AppModal v-if="payForm" title="Catat Pembayaran" size="sm" @close="payForm = null">
      <form id="pay-form" class="space-y-4" @submit.prevent="pay">
        <div class="rounded-xl bg-brand-50 p-4 text-center">
          <p class="text-sm text-brand-800">Sisa tagihan</p>
          <p class="text-2xl font-bold text-brand-800 tabular-nums">{{ rupiah(bill.remaining) }}</p>
        </div>
        <div>
          <label class="label">Jumlah dibayar</label>
          <MoneyInput v-model="payForm.amount" :invalid="!!payErrors.amount" />
          <p v-if="payErrors.amount" class="error-text">{{ payErrors.amount }}</p>
          <div class="mt-2 flex gap-2">
            <button type="button" class="btn-secondary btn-sm" @click="payForm.amount = bill.remaining">Lunas</button>
            <button type="button" class="btn-secondary btn-sm" @click="payForm.amount = Math.round(bill.remaining / 2)">Setengah</button>
          </div>
        </div>
        <div>
          <label class="label">Metode</label>
          <select v-model="payForm.payment_method" class="input">
            <option v-for="method in meta.payment_methods" :key="method.value" :value="method.value">{{ method.label }}</option>
          </select>
          <p class="mt-1 text-xs text-slate-500">{{ payForm.payment_method === 'tunai' ? 'Tunai masuk ke kas fisik Anda.' : 'Non tunai masuk ke rekening bank.' }}</p>
        </div>
        <BankSelect v-model="payForm.cash_account_id" :method="payForm.payment_method" label="Ke rekening" />
        <div>
          <label class="label">Catatan</label>
          <input v-model="payForm.notes" class="input" placeholder="Opsional" />
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="payForm = null">Batal</button>
        <button class="btn-primary" type="submit" form="pay-form" :disabled="paying || !payForm.amount">{{ paying ? 'Menyimpan…' : 'Simpan Pembayaran' }}</button>
      </template>
    </AppModal>
  </div>
</template>
