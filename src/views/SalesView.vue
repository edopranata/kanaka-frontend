<script setup>
import { onMounted, reactive, ref } from 'vue'
import http, { errorMessage } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { jam, rupiah, tanggal, today } from '../utils/format'
import DateRange from '../components/DateRange.vue'
import EmptyState from '../components/EmptyState.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'
import StatusBadge from '../components/StatusBadge.vue'

const auth = useAuthStore()
const meta = useMetaStore()
const toast = useToastStore()

const filters = reactive({ from: today(), to: today(), search: '', status: '', payment_method: '', page: 1 })
const sales = ref([])
const pagination = ref(null)
const loading = ref(false)

async function load(page = 1) {
  filters.page = page
  loading.value = true
  try {
    const { data } = await http.get('/sales', { params: { ...filters } })
    sales.value = data.data
    pagination.value = data.meta
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

onMounted(() => load())
</script>

<template>
  <div class="stagger">
    <PageHeader title="Riwayat Penjualan" :subtitle="auth.can('sales.view_all') ? 'Semua transaksi kasir' : 'Transaksi yang Anda input'" />

    <div class="card mb-4 space-y-3 p-4">
      <DateRange v-model:from="filters.from" v-model:to="filters.to" @change="load()" />
      <div class="grid gap-2 sm:grid-cols-3">
        <input v-model="filters.search" type="search" class="input" placeholder="Cari no. invoice…" @keydown.enter="load()" />
        <select v-model="filters.status" class="input" @change="load()">
          <option value="">Semua status</option>
          <option value="selesai">Selesai</option>
          <option value="batal">Dibatalkan</option>
        </select>
        <select v-model="filters.payment_method" class="input" @change="load()">
          <option value="">Semua metode bayar</option>
          <option v-for="method in meta.payment_methods" :key="method.value" :value="method.value">{{ method.label }}</option>
          <option value="piutang">Piutang (Bon)</option>
        </select>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="table-wrap">
        <table v-stack class="table">
          <thead>
            <tr>
              <th>No. Invoice</th>
              <th>Tanggal</th>
              <th>Kasir</th>
              <th>Pelanggan</th>
              <th>Pembayaran</th>
              <th class="num">Item</th>
              <th class="num">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sale in sales" :key="sale.id" class="cursor-pointer hover:bg-slate-50" @click="$router.push({ name: 'sale', params: { id: sale.id } })">
              <td class="font-medium text-brand-700">{{ sale.number }}</td>
              <td>{{ tanggal(sale.business_date) }} <span class="text-slate-400">{{ jam(sale.created_at) }}</span></td>
              <td>{{ sale.cashier }}</td>
              <td>{{ sale.customer?.name || '-' }}</td>
              <td>{{ sale.payment_label }}</td>
              <td class="num">{{ sale.item_count }}</td>
              <td class="num font-medium" :class="{ 'text-slate-400 line-through': sale.status === 'batal' }">{{ rupiah(sale.total) }}</td>
              <td><StatusBadge :status="sale.status" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-if="!loading && !sales.length" icon="receipt" title="Belum ada transaksi" text="Tidak ada penjualan pada filter ini." />
      <PaginationBar :meta="pagination" @page="load" />
    </div>
  </div>
</template>
