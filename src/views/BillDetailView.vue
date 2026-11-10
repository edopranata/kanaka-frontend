<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http, { errorMessage } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { rupiah, tanggal } from '../utils/format'
import { downloadBillPdf } from '../utils/billPdf'
import { billBytes, columnsFor, paymentBytes } from '../utils/escpos'
import { printThermal, receiptPaper } from '../utils/print'
import { printerConfig } from '../utils/printer'
import { periodLabel } from '../utils/invoice'
import AppIcon from '../components/AppIcon.vue'
import BillDocument from '../components/BillDocument.vue'
import PageHeader from '../components/PageHeader.vue'
import PayLinesModal from '../components/PayLinesModal.vue'
import { useAuthStore } from '../stores/auth'
import { confirmDialog } from '../stores/confirm'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const meta = useMetaStore()
const toast = useToastStore()

const bill = ref(null)
const print = () => window.print()
const pdfBusy = ref(false)

// Cetak thermal: header & catatan kaki seperti struk; printer langsung bila diatur, selain itu dialog cetak browser.
const thermalBusy = ref(false)
async function printThermalBill() {
  thermalBusy.value = true
  try {
    const columns = columnsFor(receiptPaper())
    await printThermal(billBytes(bill.value, { store: meta.store, template: meta.invoice, columns, feed: printerConfig.feed, cut: printerConfig.cut }), columns, 'Nota tagihan dikirim ke printer.')
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

// Catat pembayaran: pilih baris bon tagihan ini (utuh), lihat PayLinesModal.
const paying = ref(false)

async function printPayment(payment) {
  try {
    const { data } = await http.get(`/receivable-payments/${payment.id}`)
    const columns = columnsFor(receiptPaper())
    await printThermal(paymentBytes(data.data, { store: meta.store, columns, outstanding: data.outstanding, feed: printerConfig.feed, cut: printerConfig.cut }), columns, 'Bukti bayar dikirim ke printer.')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function cancelPayment(payment) {
  const others = payment.total > payment.amount ? ` Pembayaran ini juga mencakup bon lain (total ${rupiah(payment.total)}); semuanya ikut dibatalkan.` : ''
  if (!(await confirmDialog({ title: 'Batalkan pembayaran', message: `Batalkan pembayaran ${payment.number || ''} tanggal ${tanggal(payment.date)}? Baris bonnya kembali menjadi belum dibayar.${others}`, confirmLabel: 'Batalkan pembayaran', cancelLabel: 'Kembali', tone: 'danger' }))) return
  try {
    await http.delete(`/receivable-payments/${payment.id}`)
    await load()
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
        <button class="btn-secondary" :disabled="thermalBusy" @click="printThermalBill"><AppIcon name="receipt" :size="16" /> Cetak Thermal</button>
        <button class="btn-secondary" :disabled="pdfBusy" @click="downloadPdf"><AppIcon name="download" :size="16" /> {{ pdfBusy ? 'Membuat PDF…' : 'Unduh PDF' }}</button>
        <button v-if="bill.paid === 0 && auth.can('bills.delete')" class="btn-secondary text-red-600" @click="cancelBill"><AppIcon name="ban" :size="16" /> Batalkan</button>
        <button v-if="bill.remaining > 0 && auth.can('bills.pay')" class="btn-primary" @click="paying = true"><AppIcon name="cash" :size="16" /> Catat Pembayaran</button>
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
            <thead><tr><th>No. Pembayaran</th><th>Tanggal</th><th>Metode</th><th>Catatan</th><th>Dicatat</th><th class="num">Jumlah</th><th class="no-print"></th></tr></thead>
            <tbody>
              <tr v-for="payment in bill.payments" :key="payment.id">
                <td class="font-medium">{{ payment.number || '—' }}</td>
                <td>{{ tanggal(payment.date) }}</td>
                <td>{{ payment.payment_label }}</td>
                <td class="whitespace-normal text-slate-500">{{ payment.notes || '' }}</td>
                <td>{{ payment.user }}</td>
                <td class="num font-medium">
                  {{ rupiah(payment.amount, false) }}
                  <p v-if="payment.total > payment.amount" class="text-xs font-normal text-slate-500">dari {{ rupiah(payment.total, false) }} (termasuk bon lain)</p>
                </td>
                <td class="no-print text-right">
                  <button v-if="payment.number" class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Cetak bukti" @click="printPayment(payment)"><AppIcon name="printer" :size="16" /></button>
                  <button v-if="auth.can('bills.cancel_payment')" class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Batalkan pembayaran" @click="cancelPayment(payment)"><AppIcon name="trash" :size="16" /></button>
                </td>
              </tr>
              <tr v-if="!bill.payments.length"><td colspan="7" class="py-6 text-center text-slate-500">Belum ada pembayaran.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <PayLinesModal v-if="paying" :customer="bill.customer" :bill-id="bill.id" @paid="load" @close="paying = false" />
  </div>
</template>
