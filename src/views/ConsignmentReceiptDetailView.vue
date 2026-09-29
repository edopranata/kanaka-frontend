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
const receipt = ref(null)
const voiding = ref(false)
const saving = ref(false)
const error = ref('')
const print = () => window.print()
const untouched = () => receipt.value.items.every((item) => !item.qty_paid && !item.qty_returned)

async function load() {
  try {
    const { data } = await http.get(`/consignments/receipts/${route.params.id}`)
    receipt.value = data.data
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function voidReceipt(reason) {
  saving.value = true
  error.value = ''
  try {
    const { data } = await http.post(`/consignments/receipts/${receipt.value.id}/void`, { reason })
    receipt.value = data.data
    voiding.value = false
    toast.success('Titipan dibatalkan dan stok dikurangi.')
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
    <PageHeader :title="receipt?.number || 'Titipan Masuk'" :subtitle="receipt ? `${receipt.supplier.name} · ${tanggal(receipt.date, 'long')}` : ''" :back="{ name: 'consignments', query: { tab: 'receipts' } }">
      <template v-if="receipt" #actions>
        <button class="btn-secondary" @click="print"><AppIcon name="printer" :size="16" /> Cetak</button>
        <button v-if="receipt.status === 'selesai' && untouched()" class="btn-danger" @click="voiding = true"><AppIcon name="ban" :size="16" /> Batalkan</button>
      </template>
    </PageHeader>

    <template v-if="receipt">
      <div class="card mb-4 flex flex-wrap gap-x-8 gap-y-2 p-4 text-sm">
        <span><span class="text-slate-500">Status:</span> <StatusBadge :status="receipt.status" /></span>
        <span><span class="text-slate-500">Dicatat:</span> {{ receipt.user }} ({{ waktu(receipt.created_at) }})</span>
        <span v-if="receipt.notes" class="text-slate-600">{{ receipt.notes }}</span>
        <span v-if="receipt.status === 'batal'" class="text-red-600">Dibatalkan oleh {{ receipt.voided_by }}: {{ receipt.void_reason }}</span>
      </div>
      <div class="card overflow-hidden">
        <div class="table-wrap">
          <table v-stack class="table">
            <thead><tr><th>Barang</th><th class="num">Dititip</th><th class="num">Harga Setor</th><th class="num">Nilai</th><th class="num">Sudah Dibayar</th><th class="num">Diretur</th><th class="num">Masih Terbuka</th></tr></thead>
            <tbody>
              <tr v-for="item in receipt.items" :key="item.id">
                <td><p class="font-medium">{{ item.product_name }}</p><p class="text-xs text-slate-500">{{ item.sku }}</p></td>
                <td class="num">{{ number(item.qty) }} {{ item.unit }}</td>
                <td class="num">{{ rupiah(item.cost, false) }}</td>
                <td class="num">{{ rupiah(item.subtotal, false) }}</td>
                <td class="num">{{ number(item.qty_paid) }}</td>
                <td class="num">{{ number(item.qty_returned) }}</td>
                <td class="num font-semibold">{{ number(item.qty_open) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr><td colspan="3" class="text-right">Total nilai setor</td><td class="num">{{ rupiah(receipt.total) }}</td><td colspan="3"></td></tr>
            </tfoot>
          </table>
        </div>
      </div>
    </template>

    <ConfirmReason
      v-if="voiding"
      title="Batalkan titipan masuk"
      message="Stok barang akan dikurangi kembali. Hanya bisa dilakukan jika titipan belum pernah diselesaikan."
      :saving="saving"
      :error="error"
      @close="voiding = false"
      @confirm="voidReceipt"
    />
  </div>
</template>
