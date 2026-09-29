<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import http, { errorMessage } from '../api/http'
import { useToastStore } from '../stores/toast'
import { number, rupiah, tanggal, waktu } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'

const route = useRoute()
const toast = useToastStore()
const adjustment = ref(null)

const totalValue = computed(() => adjustment.value?.items.reduce((sum, item) => sum + item.value, 0) || 0)
const print = () => window.print()

onMounted(async () => {
  try {
    const { data } = await http.get(`/stock-adjustments/${route.params.id}`)
    adjustment.value = data.data
  } catch (e) {
    toast.error(errorMessage(e))
  }
})
</script>

<template>
  <div class="stagger">
    <PageHeader :title="adjustment?.number || 'Detail Penyesuaian'" :subtitle="adjustment ? `${adjustment.type_label} · ${tanggal(adjustment.date, 'long')}` : ''" :back="{ name: 'adjustments' }">
      <template #actions>
        <button class="btn-secondary" @click="print"><AppIcon name="printer" :size="16" /> Cetak</button>
      </template>
    </PageHeader>

    <div v-if="adjustment" class="space-y-4">
      <div class="card flex flex-wrap gap-x-8 gap-y-2 p-5 text-sm">
        <div><span class="text-slate-500">Jenis:</span> <StatusBadge :status="adjustment.type" /></div>
        <div><span class="text-slate-500">Alasan:</span> {{ adjustment.reason }}</div>
        <div><span class="text-slate-500">Oleh:</span> {{ adjustment.user }} ({{ waktu(adjustment.created_at) }})</div>
        <div v-if="adjustment.notes" class="w-full text-slate-600">{{ adjustment.notes }}</div>
      </div>
      <div class="card overflow-hidden">
        <div class="table-wrap">
          <table v-stack class="table">
            <thead><tr><th>SKU</th><th>Produk</th><th class="num">Stok Sebelum</th><th class="num">Stok Sesudah</th><th class="num">Perubahan</th><th class="num">Nilai (HPP)</th></tr></thead>
            <tbody>
              <tr v-for="item in adjustment.items" :key="item.id">
                <td class="text-slate-500">{{ item.sku }}</td>
                <td class="font-medium">{{ item.product_name }}</td>
                <td class="num">{{ number(item.system_qty) }}</td>
                <td class="num">{{ number(item.actual_qty) }}</td>
                <td class="num font-semibold" :class="item.qty_change < 0 ? 'text-red-600' : item.qty_change > 0 ? 'text-emerald-600' : 'text-slate-400'">
                  {{ item.qty_change > 0 ? '+' : '' }}{{ number(item.qty_change) }} {{ item.unit }}
                </td>
                <td class="num">{{ rupiah(item.value, false) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr><td colspan="5" class="text-right">Total nilai selisih</td><td class="num" :class="{ 'text-red-600': totalValue < 0 }">{{ rupiah(totalValue) }}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
