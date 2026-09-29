<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import http, { errorMessage } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { number, rupiah, tanggal, waktu } from '../utils/format'
import { printReceipt } from '../utils/print'
import AppIcon from '../components/AppIcon.vue'
import ConfirmReason from '../components/ConfirmReason.vue'
import PageHeader from '../components/PageHeader.vue'
import ReceiptPrint from '../components/ReceiptPrint.vue'
import StatusBadge from '../components/StatusBadge.vue'

const route = useRoute()
const auth = useAuthStore()
const toast = useToastStore()

const sale = ref(null)
const voiding = ref(false)
const saving = ref(false)
const error = ref('')

async function load() {
  try {
    const { data } = await http.get(`/sales/${route.params.id}`)
    sale.value = data.data
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function voidSale(reason) {
  saving.value = true
  error.value = ''
  try {
    const { data } = await http.post(`/sales/${sale.value.id}/void`, { reason })
    sale.value = data.data
    voiding.value = false
    toast.success('Transaksi dibatalkan dan stok dikembalikan.')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="stagger">
    <PageHeader :title="sale?.number || 'Detail Penjualan'" :subtitle="sale ? waktu(sale.created_at) : ''" :back="sale?.payment_method === 'piutang' ? { name: 'credit-sales' } : { name: 'sales' }">
      <template v-if="sale" #actions>
        <button class="btn-secondary" @click="printReceipt"><AppIcon name="printer" :size="16" /> Cetak Struk</button>
        <button v-if="auth.can('sales.void') && sale.status === 'selesai' && !sale.bill" class="btn-danger" @click="voiding = true">
          <AppIcon name="ban" :size="16" /> Batalkan
        </button>
      </template>
    </PageHeader>

    <div v-if="sale" class="grid gap-5 lg:grid-cols-3">
      <section class="card overflow-hidden lg:col-span-2">
        <div class="table-wrap">
          <table v-stack class="table">
            <thead>
              <tr>
                <th>Produk</th>
                <th class="num">Qty</th>
                <th class="num">Harga</th>
                <th class="num">Diskon</th>
                <th class="num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in sale.items" :key="item.id">
                <td class="font-medium">
                  {{ item.product_name }}
                  <p v-if="item.variant" class="text-xs font-normal text-slate-500">{{ item.variant }}</p>
                </td>
                <td class="num">
                  {{ number(item.qty) }} {{ item.unit }}
                  <p v-if="item.conversion > 1" class="text-xs text-slate-500">isi {{ item.conversion }}</p>
                </td>
                <td class="num">{{ rupiah(item.price, false) }}</td>
                <td class="num">
                  {{ item.discount ? rupiah(item.discount, false) : '-' }}
                  <p v-if="item.promo" class="text-xs text-rose-700">{{ item.promo }}</p>
                </td>
                <td class="num font-medium">{{ rupiah(item.subtotal, false) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr><td colspan="4" class="text-right">Subtotal</td><td class="num">{{ rupiah(sale.subtotal, false) }}</td></tr>
              <tr v-if="sale.discount"><td colspan="4" class="text-right">Diskon</td><td class="num">-{{ rupiah(sale.discount, false) }}</td></tr>
              <tr v-if="sale.tax"><td colspan="4" class="text-right">Pajak</td><td class="num">{{ rupiah(sale.tax, false) }}</td></tr>
              <tr><td colspan="4" class="text-right">Total</td><td class="num text-base text-brand-700">{{ rupiah(sale.total) }}</td></tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section class="card space-y-3 p-5 text-sm">
        <div class="flex items-center justify-between"><span class="text-slate-500">Status</span><StatusBadge :status="sale.status" /></div>
        <div class="flex justify-between gap-3"><span class="text-slate-500">Tanggal usaha</span><span>{{ tanggal(sale.business_date) }}</span></div>
        <div class="flex justify-between gap-3"><span class="text-slate-500">Kasir</span><span>{{ sale.cashier }}</span></div>
        <div class="flex justify-between gap-3"><span class="text-slate-500">Pelanggan</span><span>{{ sale.customer?.name || 'Umum' }}</span></div>
        <hr class="border-slate-100" />
        <div class="flex justify-between gap-3"><span class="text-slate-500">Metode bayar</span><span>{{ sale.payment_label }}</span></div>
        <template v-if="sale.payment_method === 'piutang'">
          <div class="flex justify-between gap-3">
            <span class="text-slate-500">Tagihan</span>
            <RouterLink v-if="sale.bill && auth.can('receivables.manage')" :to="{ name: 'bill', params: { id: sale.bill.id } }" class="font-medium text-brand-700 hover:underline">{{ sale.bill.number }}</RouterLink>
            <span v-else-if="sale.bill">{{ sale.bill.number }}</span>
            <StatusBadge v-else status="belum_ditagih" />
          </div>
        </template>
        <template v-else>
          <div class="flex justify-between gap-3"><span class="text-slate-500">Dibayar</span><span class="tabular-nums">{{ rupiah(sale.paid) }}</span></div>
          <div class="flex justify-between gap-3"><span class="text-slate-500">Kembalian</span><span class="tabular-nums">{{ rupiah(sale.change) }}</span></div>
        </template>
        <div v-if="sale.payment_ref" class="flex justify-between gap-3"><span class="text-slate-500">Referensi</span><span>{{ sale.payment_ref }}</span></div>
        <div v-if="sale.cost_total !== undefined" class="flex justify-between gap-3">
          <span class="text-slate-500">HPP / Laba kotor</span>
          <span class="tabular-nums">{{ rupiah(sale.cost_total) }} / {{ rupiah(sale.subtotal - sale.discount - sale.cost_total) }}</span>
        </div>
        <p v-if="sale.notes" class="rounded-lg bg-slate-50 p-3 text-slate-600">{{ sale.notes }}</p>
        <div v-if="sale.status === 'batal'" class="rounded-lg bg-red-50 p-3 text-red-700">
          <p class="font-medium">Dibatalkan {{ waktu(sale.voided_at) }} oleh {{ sale.voided_by }}</p>
          <p>Alasan: {{ sale.void_reason }}</p>
        </div>
      </section>
    </div>

    <ReceiptPrint v-if="sale" :sale="sale" />
    <ConfirmReason
      v-if="voiding"
      title="Batalkan transaksi"
      :message="`Transaksi ${sale.number} akan dibatalkan dan stok barang dikembalikan. Transaksi pada tanggal yang sudah di-closing tidak dapat dibatalkan.`"
      :saving="saving"
      :error="error"
      @close="voiding = false"
      @confirm="voidSale"
    />
  </div>
</template>
