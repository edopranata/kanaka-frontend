<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import http, { errorMessage } from '../api/http'
import { useToastStore } from '../stores/toast'
import { monthStart, rupiah, tanggal, tanggalAngka, today } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import DateRange from '../components/DateRange.vue'
import EmptyState from '../components/EmptyState.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const toast = useToastStore()
const route = useRoute()
// payment: '' semua | hutang (tempo belum lunas) | lewat (lewat jatuh tempo). Hutang tidak dibatasi rentang tanggal.
const filters = reactive({ from: monthStart(), to: today(), search: '', supplier: null, payment: ['hutang', 'lewat'].includes(route.query.payment) ? route.query.payment : '' })
const purchases = ref([])
const pagination = ref(null)
const loading = ref(false)
const payables = ref(null)
const canSeeAll = auth.can('purchases.view_all')
const statusStyle = { lunas: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', sebagian: 'bg-amber-50 text-amber-700 ring-amber-600/20', belum: 'bg-slate-100 text-slate-600 ring-slate-500/20' }
const tabs = [
  { key: '', label: 'Semua pembelian' },
  { key: 'hutang', label: 'Belum lunas' },
  { key: 'lewat', label: 'Lewat jatuh tempo' },
]

async function load(page = 1) {
  loading.value = true
  try {
    const params = filters.payment ? { payment: filters.payment, search: filters.search, supplier_id: filters.supplier?.id, page } : { from: filters.from, to: filters.to, search: filters.search, page }
    const { data } = await http.get('/purchases', { params })
    purchases.value = data.data
    pagination.value = data.meta
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

async function loadPayables() {
  if (!canSeeAll) return
  try {
    payables.value = (await http.get('/purchase-payables')).data
  } catch {
    // tidak kritis
  }
}

function setTab(key, supplier = null) {
  filters.payment = key
  filters.supplier = supplier
  load()
}

onMounted(() => {
  load()
  loadPayables()
})
</script>

<template>
  <div class="stagger">
    <PageHeader title="Pembelian" subtitle="Barang masuk dari supplier (menambah stok & memperbarui HPP), termasuk pembelian tempo">
      <template #actions>
        <RouterLink v-if="auth.can('purchases.create')" :to="{ name: 'purchase-create' }" class="btn-primary"><AppIcon name="plus" :size="16" /> Pembelian Baru</RouterLink>
      </template>
    </PageHeader>

    <!-- Hutang supplier (pembelian tempo) -->
    <section v-if="payables?.data.length" class="card mb-4 p-4">
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="font-semibold text-slate-900">Hutang supplier</h2>
        <p class="text-sm">
          Total <b class="tabular-nums">{{ rupiah(payables.total) }}</b>
          <span v-if="payables.overdue" class="ml-2 font-medium text-red-600">lewat jatuh tempo {{ rupiah(payables.overdue) }}</span>
        </p>
      </div>
      <div class="grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
        <button v-for="row in payables.data" :key="row.supplier?.id ?? 0" type="button" class="rounded-lg border p-3 text-left text-sm hover:bg-slate-50" :class="row.overdue ? 'border-red-200 bg-red-50/40' : 'border-slate-200'" @click="setTab('hutang', row.supplier)">
          <p class="font-medium text-slate-900">{{ row.supplier?.name || 'Tanpa supplier' }}</p>
          <p class="text-lg font-bold tabular-nums">{{ rupiah(row.outstanding) }}</p>
          <p class="text-xs" :class="row.overdue ? 'text-red-600' : 'text-slate-500'">
            {{ row.count }} pembelian · jatuh tempo terdekat {{ tanggalAngka(row.nearest_due) }}<template v-if="row.overdue"> · lewat {{ rupiah(row.overdue) }}</template>
          </p>
        </button>
      </div>
    </section>

    <div class="card mb-4 space-y-3 p-4">
      <div class="flex flex-wrap gap-1">
        <button v-for="tab in tabs" :key="tab.key" type="button" class="tab" :class="{ 'tab-active bg-brand-50': filters.payment === tab.key && !filters.supplier }" @click="setTab(tab.key)">{{ tab.label }}</button>
        <span v-if="filters.supplier" class="tab tab-active inline-flex items-center gap-1 bg-brand-50">
          Hutang {{ filters.supplier.name }}
          <button type="button" class="rounded p-0.5 hover:bg-white" title="Hapus filter supplier" @click="setTab('hutang')"><AppIcon name="x" :size="12" /></button>
        </span>
      </div>
      <DateRange v-if="!filters.payment" v-model:from="filters.from" v-model:to="filters.to" @change="load()" />
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
              <td>
                <template v-if="purchase.payment_term === 'tempo'">
                  <span class="rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset" :class="statusStyle[purchase.payment_status]">Tempo · {{ purchase.payment_status_label }}</span>
                  <p v-if="purchase.remaining && purchase.status === 'selesai'" class="mt-0.5 text-xs" :class="purchase.is_overdue ? 'font-medium text-red-600' : 'text-slate-500'">
                    sisa {{ rupiah(purchase.remaining) }} · {{ tanggalAngka(purchase.due_date) }}<template v-if="purchase.is_overdue"> (lewat)</template>
                  </p>
                </template>
                <template v-else>{{ purchase.payment_label || '-' }}</template>
              </td>
              <td><StatusBadge :status="purchase.status" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-if="!loading && !purchases.length" icon="truck" :title="filters.payment ? 'Tidak ada hutang pembelian' : 'Belum ada pembelian'" />
      <PaginationBar :meta="pagination" @page="load" />
    </div>
  </div>
</template>
