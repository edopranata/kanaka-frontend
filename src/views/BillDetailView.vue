<script setup>
import { nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http, { errorMessage, validationErrors } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { rupiah, tanggal } from '../utils/format'
import { downloadBillPdf } from '../utils/billPdf'
import { billBytes, columnsFor } from '../utils/escpos'
import { printWithBrowser, receiptPaper } from '../utils/print'
import { isDirect, printerConfig, sendBytes } from '../utils/printer'
import { periodLabel } from '../utils/invoice'
import AppIcon from '../components/AppIcon.vue'
import BankSelect from '../components/BankSelect.vue'
import BillDocument from '../components/BillDocument.vue'
import AppModal from '../components/AppModal.vue'
import MoneyInput from '../components/MoneyInput.vue'
import PageHeader from '../components/PageHeader.vue'
import ThermalPrint from '../components/ThermalPrint.vue'
import AppSelect from '../components/AppSelect.vue'
import { useAuthStore } from '../stores/auth'
import { confirmDialog } from '../stores/confirm'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const meta = useMetaStore()
const toast = useToastStore()

const bill = ref(null)
const payForm = ref(null)
const payErrors = ref({})
const paying = ref(false)
const print = () => window.print()
const pdfBusy = ref(false)

// Cetak thermal: header & catatan kaki seperti struk; printer langsung bila diatur, selain itu dialog cetak browser.
const thermal = ref(null)
const thermalBusy = ref(false)
async function printThermal() {
  thermalBusy.value = true
  const columns = columnsFor(receiptPaper())
  const bytes = billBytes(bill.value, { store: meta.store, template: meta.invoice, columns, feed: printerConfig.feed, cut: printerConfig.cut })
  try {
    if (isDirect()) {
      try {
        await sendBytes(bytes)
        toast.success('Nota tagihan dikirim ke printer.')
        return
      } catch (e) {
        toast.error(`${e.message || 'Gagal mencetak ke printer.'} Memakai dialog cetak browser.`)
      }
    }
    thermal.value = { bytes, columns }
    await nextTick()
    printWithBrowser()
  } finally {
    thermalBusy.value = false
  }
}

async function downloadPdf() {
  pdfBusy.value = true
  try {
    await downloadBillPdf(bill.value, { store: meta.store, template: meta.invoice })
  } catch (e) {
    toast.error(`PDF gagal dibuat: ${e?.message || e}`)
  } finally {
    pdfBusy.value = false
  }
}

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
  if (!(await confirmDialog({ title: 'Batalkan pembayaran', message: `Batalkan pembayaran ${rupiah(payment.amount)} tanggal ${tanggal(payment.date)}?`, confirmLabel: 'Batalkan pembayaran', cancelLabel: 'Kembali', tone: 'danger' }))) return
  try {
    const { data } = await http.delete(`/bills/${bill.value.id}/payments/${payment.id}`)
    bill.value = data.data
    toast.success('Pembayaran dibatalkan.')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function cancelBill() {
  if (!(await confirmDialog({ title: 'Batalkan tagihan', message: 'Batalkan tagihan ini? Bon di dalamnya kembali berstatus "belum ditagih".', confirmLabel: 'Batalkan tagihan', cancelLabel: 'Kembali', tone: 'danger' }))) return
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
        <button class="btn-secondary" :disabled="thermalBusy" @click="printThermal"><AppIcon name="receipt" :size="16" /> Cetak Thermal</button>
        <button class="btn-secondary" :disabled="pdfBusy" @click="downloadPdf"><AppIcon name="download" :size="16" /> {{ pdfBusy ? 'Membuat PDF…' : 'Unduh PDF' }}</button>
        <button v-if="bill.paid === 0 && auth.can('bills.delete')" class="btn-secondary text-red-600" @click="cancelBill"><AppIcon name="ban" :size="16" /> Batalkan</button>
        <button v-if="bill.remaining > 0 && auth.can('bills.pay')" class="btn-primary" @click="openPay"><AppIcon name="cash" :size="16" /> Catat Pembayaran</button>
      </template>
    </PageHeader>

    <template v-if="bill">
      <!-- Dokumen tagihan (juga untuk dicetak); template di Pengaturan → Toko & Struk → Nota tagihan -->
      <BillDocument :bill="bill" :store="meta.store" :template="meta.invoice" />

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
                  <button v-if="auth.can('bills.cancel_payment')" class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Batalkan pembayaran" @click="cancelPayment(payment)"><AppIcon name="trash" :size="16" /></button>
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
          <AppSelect v-model="payForm.payment_method" class="input" :options="meta.payment_methods" />
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
    <ThermalPrint v-if="thermal" :bytes="thermal.bytes" :columns="thermal.columns" />
  </div>
</template>
