<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import http, { download, errorMessage } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { monthStart, today } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import DateRange from '../components/DateRange.vue'
import PageHeader from '../components/PageHeader.vue'
import ReportTable from '../components/ReportTable.vue'

const meta = useMetaStore()
const toast = useToastStore()

const types = ref([])
const active = ref(null)
const categories = ref([])
const filters = reactive({ from: monthStart(), to: today(), category_id: '', low_stock: false })
const report = ref(null)
const loading = ref(false)
const exporting = ref(false)

const current = computed(() => types.value.find((type) => type.key === active.value))
const params = computed(() => ({
  from: current.value?.dated ? filters.from : undefined,
  to: current.value?.dated ? filters.to : undefined,
  category_id: ['products', 'stock'].includes(active.value) && filters.category_id ? filters.category_id : undefined,
  low_stock: active.value === 'stock' && filters.low_stock ? 1 : undefined,
}))

async function load() {
  if (!active.value) return
  loading.value = true
  try {
    const { data } = await http.get(`/reports/${active.value}`, { params: params.value })
    report.value = data
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

function select(key) {
  active.value = key
  report.value = null
  load()
}

async function exportExcel() {
  exporting.value = true
  try {
    await download(`/reports/${active.value}`, { ...params.value, export: 1 }, `laporan-${active.value}.xlsx`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    exporting.value = false
  }
}

const print = () => window.print()

onMounted(async () => {
  const [{ data }, categoryResponse] = await Promise.all([http.get('/reports'), http.get('/categories').catch(() => ({ data: { data: [] } }))])
  types.value = data.data
  categories.value = categoryResponse.data.data
  if (types.value.length) select(types.value[0].key)
})
</script>

<template>
  <div class="stagger">
    <PageHeader title="Laporan" subtitle="Pilih jenis laporan, atur periode, lalu cetak atau export ke Excel" class="no-print">
      <template #actions>
        <button class="btn-secondary" :disabled="!report" @click="print"><AppIcon name="printer" :size="16" /> Cetak</button>
        <button class="btn-primary" :disabled="!report || exporting" @click="exportExcel"><AppIcon name="download" :size="16" /> {{ exporting ? 'Mengunduh…' : 'Export Excel' }}</button>
      </template>
    </PageHeader>

    <div class="no-print mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1">
      <button v-for="type in types" :key="type.key" class="tab" :class="{ 'tab-active': active === type.key }" @click="select(type.key)">{{ type.label }}</button>
    </div>

    <div v-if="current" class="no-print card mb-4 flex flex-wrap items-end gap-3 p-4">
      <DateRange v-if="current.dated" v-model:from="filters.from" v-model:to="filters.to" @change="load" />
      <div v-if="['products', 'stock'].includes(active)">
        <label class="label text-xs">Kategori</label>
        <select v-model="filters.category_id" class="input" @change="load">
          <option value="">Semua kategori</option>
          <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
        </select>
      </div>
      <label v-if="active === 'stock'" class="flex items-center gap-2 pb-2 text-sm">
        <input v-model="filters.low_stock" type="checkbox" class="h-4 w-4 rounded border-slate-300" @change="load" /> Hanya stok menipis
      </label>
    </div>

    <section v-if="report" class="card overflow-hidden" :class="{ 'opacity-60': loading }">
      <header class="border-b border-slate-100 px-5 py-4">
        <p class="hidden text-sm font-semibold print:block">{{ meta.store.name }}</p>
        <h2 class="text-lg font-semibold text-slate-900">{{ report.title }}</h2>
        <p class="text-sm text-slate-500">{{ report.subtitle }}</p>
      </header>
      <ReportTable :report="report" />
    </section>
    <p v-else-if="loading" class="py-10 text-center text-slate-500">Memuat laporan…</p>
    <p v-else-if="!types.length" class="py-10 text-center text-slate-500">Anda tidak memiliki akses ke laporan.</p>
  </div>
</template>
