<script setup>
import { onMounted, reactive, ref } from 'vue'
import http, { errorMessage } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { monthStart, tanggal, today } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import DateRange from '../components/DateRange.vue'
import EmptyState from '../components/EmptyState.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'
import StatusBadge from '../components/StatusBadge.vue'

const meta = useMetaStore()
const toast = useToastStore()
const filters = reactive({ from: monthStart(), to: today(), type: '' })
const adjustments = ref([])
const pagination = ref(null)
const loading = ref(false)

async function load(page = 1) {
  loading.value = true
  try {
    const { data } = await http.get('/stock-adjustments', { params: { ...filters, page } })
    adjustments.value = data.data
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
    <PageHeader title="Penyesuaian & Stok Opname" subtitle="Koreksi stok: barang masuk/keluar di luar pembelian & penjualan, serta hitung fisik">
      <template #actions>
        <RouterLink :to="{ name: 'adjustment-create', query: { type: 'opname' } }" class="btn-secondary"><AppIcon name="clipboard" :size="16" /> Stok Opname</RouterLink>
        <RouterLink :to="{ name: 'adjustment-create' }" class="btn-primary"><AppIcon name="plus" :size="16" /> Penyesuaian</RouterLink>
      </template>
    </PageHeader>

    <div class="card mb-4 space-y-3 p-4">
      <DateRange v-model:from="filters.from" v-model:to="filters.to" @change="load()" />
      <select v-model="filters.type" class="input sm:w-60" @change="load()">
        <option value="">Semua jenis</option>
        <option v-for="type in meta.adjustment_types" :key="type.value" :value="type.value">{{ type.label }}</option>
      </select>
    </div>

    <div class="card overflow-hidden">
      <div class="table-wrap">
        <table v-stack class="table">
          <thead><tr><th>No. Dokumen</th><th>Tanggal</th><th>Jenis</th><th>Alasan</th><th class="num">Item</th><th>Oleh</th></tr></thead>
          <tbody>
            <tr v-for="adjustment in adjustments" :key="adjustment.id" class="cursor-pointer hover:bg-slate-50" @click="$router.push({ name: 'adjustment', params: { id: adjustment.id } })">
              <td class="font-medium text-brand-700">{{ adjustment.number }}</td>
              <td>{{ tanggal(adjustment.date) }}</td>
              <td><StatusBadge :status="adjustment.type" /></td>
              <td>{{ adjustment.reason }}</td>
              <td class="num">{{ adjustment.item_count }}</td>
              <td>{{ adjustment.user }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-if="!loading && !adjustments.length" icon="archive" title="Belum ada penyesuaian stok" />
      <PaginationBar :meta="pagination" @page="load" />
    </div>
  </div>
</template>
