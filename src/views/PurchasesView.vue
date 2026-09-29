<script setup>
import { onMounted, reactive, ref } from 'vue'
import http, { errorMessage } from '../api/http'
import { useToastStore } from '../stores/toast'
import { monthStart, rupiah, tanggal, today } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import DateRange from '../components/DateRange.vue'
import EmptyState from '../components/EmptyState.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'
import StatusBadge from '../components/StatusBadge.vue'

const toast = useToastStore()
const filters = reactive({ from: monthStart(), to: today(), search: '' })
const purchases = ref([])
const pagination = ref(null)
const loading = ref(false)

async function load(page = 1) {
  loading.value = true
  try {
    const { data } = await http.get('/purchases', { params: { ...filters, page } })
    purchases.value = data.data
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
    <PageHeader title="Pembelian" subtitle="Barang masuk dari supplier (menambah stok & memperbarui HPP)">
      <template #actions>
        <RouterLink :to="{ name: 'purchase-create' }" class="btn-primary"><AppIcon name="plus" :size="16" /> Pembelian Baru</RouterLink>
      </template>
    </PageHeader>

    <div class="card mb-4 space-y-3 p-4">
      <DateRange v-model:from="filters.from" v-model:to="filters.to" @change="load()" />
      <input v-model="filters.search" type="search" class="input" placeholder="Cari no. pembelian / no. faktur supplier…" @keydown.enter="load()" />
    </div>

    <div class="card overflow-hidden">
      <div class="table-wrap">
        <table v-stack class="table">
          <thead>
            <tr><th>No. Pembelian</th><th>Tanggal</th><th>Supplier</th><th>No. Faktur</th><th class="num">Item</th><th class="num">Total</th><th>Bayar</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr v-for="purchase in purchases" :key="purchase.id" class="cursor-pointer hover:bg-slate-50" @click="$router.push({ name: 'purchase', params: { id: purchase.id } })">
              <td class="font-medium text-brand-700">{{ purchase.number }}</td>
              <td>{{ tanggal(purchase.date) }}</td>
              <td>{{ purchase.supplier?.name || '-' }}</td>
              <td>{{ purchase.invoice_ref || '-' }}</td>
              <td class="num">{{ purchase.item_count }}</td>
              <td class="num font-medium">{{ rupiah(purchase.total) }}</td>
              <td>{{ purchase.payment_label || '-' }}</td>
              <td><StatusBadge :status="purchase.status" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-if="!loading && !purchases.length" icon="truck" title="Belum ada pembelian" />
      <PaginationBar :meta="pagination" @page="load" />
    </div>
  </div>
</template>
