<script setup>
import { onMounted, reactive, ref } from 'vue'
import http, { errorMessage } from '../api/http'
import { useToastStore } from '../stores/toast'
import { daysAgo, today, waktu } from '../utils/format'
import DateRange from '../components/DateRange.vue'
import EmptyState from '../components/EmptyState.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'

const toast = useToastStore()
const filters = reactive({ from: daysAgo(6), to: today(), search: '' })
const logs = ref([])
const pagination = ref(null)
const loading = ref(false)

async function load(page = 1) {
  loading.value = true
  try {
    const { data } = await http.get('/activity-logs', { params: { ...filters, page } })
    logs.value = data.data
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
    <PageHeader title="Log Aktivitas" subtitle="Jejak aksi penting: login, void, closing, penyesuaian stok, perubahan harga, dll." />
    <div class="card mb-4 space-y-3 p-4">
      <DateRange v-model:from="filters.from" v-model:to="filters.to" @change="load()" />
      <input v-model="filters.search" type="search" class="input" placeholder="Cari keterangan…" @keydown.enter="load()" />
    </div>
    <div class="card overflow-hidden">
      <div class="table-wrap">
        <table v-stack class="table">
          <thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Keterangan</th><th>IP</th></tr></thead>
          <tbody>
            <tr v-for="log in logs" :key="log.id">
              <td class="text-slate-500">{{ waktu(log.created_at) }}</td>
              <td class="font-medium">{{ log.user }}</td>
              <td><code class="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{{ log.action }}</code></td>
              <td class="whitespace-normal">{{ log.description }}</td>
              <td class="text-slate-400">{{ log.ip_address || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-if="!loading && !logs.length" icon="clipboard" title="Belum ada aktivitas" />
      <PaginationBar :meta="pagination" @page="load" />
    </div>
  </div>
</template>
