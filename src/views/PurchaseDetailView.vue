<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import http, { errorMessage } from '../api/http'
import { useToastStore } from '../stores/toast'
import { number, rupiah, tanggal, waktu } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import ConfirmReason from '../components/ConfirmReason.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'

const route = useRoute()
const toast = useToastStore()
const purchase = ref(null)
const voiding = ref(false)
const saving = ref(false)
const error = ref('')

const print = () => window.print()

async function load() {
  try {
    const { data } = await http.get(`/purchases/${route.params.id}`)
    purchase.value = data.data
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function voidPurchase(reason) {
  saving.value = true
  error.value = ''
  try {
    const { data } = await http.post(`/purchases/${purchase.value.id}/void`, { reason })
    purchase.value = data.data
    voiding.value = false
    toast.success('Pembelian dibatalkan dan stok dikurangi.')
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
    <PageHeader :title="purchase?.number || 'Detail Pembelian'" :subtitle="purchase ? tanggal(purchase.date, 'long') : ''" :back="{ name: 'purchases' }">
      <template v-if="purchase" #actions>
        <button class="btn-secondary" @click="print"><AppIcon name="printer" :size="16" /> Cetak</button>
        <button v-if="purchase.status === 'selesai'" class="btn-danger" @click="voiding = true"><AppIcon name="ban" :size="16" /> Batalkan</button>
      </template>
    </PageHeader>

    <div v-if="purchase" class="grid gap-5 lg:grid-cols-3">
      <section class="card overflow-hidden lg:col-span-2">
        <div class="table-wrap">
          <table v-stack class="table">
            <thead><tr><th>SKU</th><th>Produk</th><th class="num">Qty</th><th class="num">Harga Beli</th><th class="num">Subtotal</th></tr></thead>
            <tbody>
              <tr v-for="item in purchase.items" :key="item.id">
                <td class="text-slate-500">{{ item.sku }}</td>
                <td class="font-medium">{{ item.product_name }}</td>
                <td class="num">
                  {{ number(item.qty) }} {{ item.unit }}
                  <p v-if="item.conversion > 1" class="text-xs text-slate-500">= {{ number(item.base_qty) }}</p>
                </td>
                <td class="num">{{ rupiah(item.cost, false) }}</td>
                <td class="num">{{ rupiah(item.subtotal, false) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr><td colspan="4" class="text-right">Subtotal</td><td class="num">{{ rupiah(purchase.subtotal, false) }}</td></tr>
              <tr v-if="purchase.discount"><td colspan="4" class="text-right">Diskon</td><td class="num">-{{ rupiah(purchase.discount, false) }}</td></tr>
              <tr><td colspan="4" class="text-right">Total</td><td class="num text-brand-700">{{ rupiah(purchase.total) }}</td></tr>
            </tfoot>
          </table>
        </div>
      </section>
      <section class="card space-y-3 p-5 text-sm">
        <div class="flex items-center justify-between"><span class="text-slate-500">Status</span><StatusBadge :status="purchase.status" /></div>
        <div class="flex justify-between gap-3"><span class="text-slate-500">Supplier</span><span>{{ purchase.supplier?.name || '-' }}</span></div>
        <div class="flex justify-between gap-3"><span class="text-slate-500">No. faktur</span><span>{{ purchase.invoice_ref || '-' }}</span></div>
        <div class="flex justify-between gap-3">
          <span class="text-slate-500">Pembayaran</span>
          <span class="text-right">{{ purchase.payment_label || '-' }}<span v-if="purchase.cash_account" class="block text-xs text-slate-500">dari {{ purchase.cash_account }}</span></span>
        </div>
        <div class="flex justify-between gap-3"><span class="text-slate-500">Dicatat oleh</span><span>{{ purchase.user }}</span></div>
        <div class="flex justify-between gap-3"><span class="text-slate-500">Waktu input</span><span>{{ waktu(purchase.created_at) }}</span></div>
        <p v-if="purchase.notes" class="rounded-lg bg-slate-50 p-3 text-slate-600">{{ purchase.notes }}</p>
        <div v-if="purchase.status === 'batal'" class="rounded-lg bg-red-50 p-3 text-red-700">
          <p class="font-medium">Dibatalkan {{ waktu(purchase.voided_at) }} oleh {{ purchase.voided_by }}</p>
          <p>Alasan: {{ purchase.void_reason }}</p>
        </div>
      </section>
    </div>

    <ConfirmReason
      v-if="voiding"
      title="Batalkan pembelian"
      message="Stok barang akan dikurangi kembali sesuai jumlah pembelian. Tidak dapat dibatalkan bila stok sudah terjual."
      :saving="saving"
      :error="error"
      @close="voiding = false"
      @confirm="voidPurchase"
    />
  </div>
</template>
