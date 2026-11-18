<script setup>
import { onMounted, reactive, ref } from 'vue'
import http, { errorMessage } from '../api/http'
import { confirmDialog } from '../stores/confirm'
import { useToastStore } from '../stores/toast'
import { number, waktu } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import AppSelect from '../components/AppSelect.vue'
import EmptyState from '../components/EmptyState.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'

const toast = useToastStore()
const statusTabs = [
  { value: 'open', label: 'Belum ditangani' },
  { value: 'resolved', label: 'Selesai' },
  { value: 'all', label: 'Semua' },
]
const sourceOptions = [
  { value: 'server', label: 'Server' },
  { value: 'client', label: 'Browser / perangkat' },
]
const filters = reactive({ status: 'open', source: '' })
const logs = ref([])
const pagination = ref(null)
const open = ref(0)
const loading = ref(false)
const busy = ref(null)

async function load(page = 1) {
  loading.value = true
  try {
    const { data } = await http.get('/error-logs', { params: { ...filters, source: filters.source || undefined, page } })
    logs.value = data.data
    pagination.value = data.meta
    open.value = data.open
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

async function resolve(log) {
  busy.value = log.id
  try {
    const { data } = await http.post(`/error-logs/${log.id}/resolve`)
    Object.assign(log, data.data)
    open.value = Math.max(0, open.value - 1)
    if (filters.status === 'open') logs.value = logs.value.filter((item) => item.id !== log.id)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = null
  }
}

async function resolveAll() {
  if (!(await confirmDialog({ title: 'Tandai semua selesai', message: `Tandai ${number(open.value)} error yang belum ditangani sebagai selesai? Bila muncul lagi, error akan tercatat sebagai baris baru.`, confirmLabel: 'Tandai selesai', icon: 'check' }))) return
  try {
    const { data } = await http.post('/error-logs/resolve-all')
    toast.success(`${number(data.resolved)} error ditandai selesai.`)
    load()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

function setStatus(status) {
  filters.status = status
  load()
}

/** Browser & sistem operasi singkat dari user agent, mis. "Chrome · Android". */
function device(agent) {
  if (!agent) return ''
  const browser = /Edg\//.test(agent) ? 'Edge' : /OPR\//.test(agent) ? 'Opera' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : 'Browser'
  const os = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Windows/.test(agent) ? 'Windows' : /Mac OS X/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : ''
  return [browser, os].filter(Boolean).join(' · ')
}

onMounted(() => load())
</script>

<template>
  <div class="stagger">
    <PageHeader title="Log Error" subtitle="Error di server dan di perangkat pengguna (halaman macet, server tidak merespons, koneksi putus). Ringkasan dikirim lewat email setiap hari pukul 17.30.">
      <template #actions>
        <button class="btn-secondary" @click="load()"><AppIcon name="refresh" :size="16" /> Muat ulang</button>
        <button v-if="open" class="btn-primary" @click="resolveAll"><AppIcon name="check" :size="16" /> Tandai semua selesai</button>
      </template>
    </PageHeader>

    <div class="card mb-4 flex flex-wrap items-center gap-3 p-4">
      <div class="segmented">
        <button v-for="tab in statusTabs" :key="tab.value" type="button" class="tab" :class="{ 'tab-active': filters.status === tab.value }" @click="setStatus(tab.value)">
          {{ tab.label }}<span v-if="tab.value === 'open' && open" class="ml-1.5 rounded-full bg-red-600 px-1.5 text-xs text-white tabular-nums">{{ number(open) }}</span>
        </button>
      </div>
      <AppSelect v-model="filters.source" class="input w-full sm:w-56" :options="sourceOptions" empty="Semua sumber" @change="load()" />
    </div>

    <div class="space-y-3">
      <article v-for="log in logs" :key="log.id" class="card p-4" :class="{ 'opacity-70': log.resolved_at }">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5 text-xs">
              <span class="rounded-full px-2 py-0.5 font-medium ring-1 ring-inset" :class="log.source === 'server' ? 'bg-slate-100 text-slate-700 ring-slate-300' : 'bg-sky-50 text-sky-700 ring-sky-600/20'">
                {{ log.source === 'server' ? 'Server' : 'Browser' }}
              </span>
              <span class="font-medium text-slate-700">{{ log.kind_label }}</span>
              <span class="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700 tabular-nums" :title="`Terjadi ${log.count} kali`">{{ number(log.count) }}×</span>
            </div>
            <p class="mt-1.5 font-medium break-words text-slate-900">{{ log.message }}</p>
            <p class="mt-1 text-xs text-slate-500">
              Terakhir {{ waktu(log.last_seen_at) }}<template v-if="log.count > 1"> · pertama {{ waktu(log.first_seen_at) }}</template>
              <template v-if="log.user"> · {{ log.user }}</template>
              <template v-if="log.user_agent"> · {{ device(log.user_agent) }}</template>
            </p>
            <p v-if="log.url" class="mt-0.5 truncate text-xs text-slate-400" :title="log.url">{{ log.method ? `${log.method} ` : '' }}{{ log.url }}</p>
          </div>
          <div class="w-full sm:w-auto sm:shrink-0 sm:text-right">
            <button v-if="!log.resolved_at" class="btn-secondary btn-sm" :disabled="busy === log.id" @click="resolve(log)"><AppIcon name="check" :size="14" /> Tandai selesai</button>
            <p v-else class="text-xs text-emerald-700">Selesai {{ waktu(log.resolved_at) }}<template v-if="log.resolved_by"><br class="hidden sm:inline" /> oleh {{ log.resolved_by }}</template></p>
          </div>
        </div>
        <details v-if="log.location || log.trace" class="mt-2 text-xs">
          <summary class="cursor-pointer text-brand-700 select-none">Detail teknis</summary>
          <p v-if="log.location" class="mt-2 font-mono break-all text-slate-600">{{ log.location }}</p>
          <pre v-if="log.trace" class="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-slate-100">{{ log.trace }}</pre>
          <p v-if="log.user_agent" class="mt-2 break-all text-slate-400">{{ log.user_agent }}</p>
        </details>
      </article>
    </div>

    <div v-if="!loading && !logs.length" class="card">
      <EmptyState icon="check" :title="filters.status === 'open' ? 'Tidak ada error yang belum ditangani' : 'Belum ada error'" text="Error baru akan muncul di sini dan dikirim lewat email ringkasan harian." />
    </div>
    <PaginationBar :meta="pagination" class="mt-3" @page="load" />
  </div>
</template>
