<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http, { errorMessage } from '../api/http'
import { useToastStore } from '../stores/toast'
import { number, rupiah, tanggal } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import EmptyState from '../components/EmptyState.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'
import StatCard from '../components/StatCard.vue'
import StatusBadge from '../components/StatusBadge.vue'

const route = useRoute()
const router = useRouter()
const toast = useToastStore()
const tab = ref(['summary', 'receipts', 'settlements'].includes(route.query.tab) ? route.query.tab : 'summary')

const summary = ref([])
const receipts = ref([])
const receiptMeta = ref(null)
const settlements = ref([])
const settlementMeta = ref(null)
const outstanding = ref(0)
const filters = reactive({ status: 'terbuka' })
const loading = ref(false)

async function loadSummary() {
  const { data } = await http.get('/consignments/summary')
  summary.value = data.data
}
async function loadReceipts(page = 1) {
  const { data } = await http.get('/consignments/receipts', { params: { page } })
  receipts.value = data.data
  receiptMeta.value = data.meta
}
async function loadSettlements(page = 1) {
  const { data } = await http.get('/consignments/settlements', { params: { ...filters, page } })
  settlements.value = data.data
  settlementMeta.value = data.meta
  outstanding.value = data.outstanding
}

async function switchTab(value) {
  tab.value = value
  router.replace({ query: { tab: value } })
  loading.value = true
  try {
    await { summary: loadSummary, receipts: loadReceipts, settlements: loadSettlements }[value]()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

const totalOpenValue = () => summary.value.reduce((sum, row) => sum + row.open_value, 0)
const totalOutstanding = () => summary.value.reduce((sum, row) => sum + row.outstanding, 0)

onMounted(() => switchTab(tab.value))
</script>

<template>
  <div class="stagger">
    <PageHeader title="Barang Titipan" subtitle="Konsinyasi: bayar supplier hanya untuk barang yang terjual, sisa diretur atau terbawa ke periode berikutnya">
      <template #actions>
        <RouterLink :to="{ name: 'consignment-settle' }" class="btn-secondary"><AppIcon name="calculator" :size="16" /> Selesaikan Titipan</RouterLink>
        <RouterLink :to="{ name: 'consignment-receive' }" class="btn-primary"><AppIcon name="plus" :size="16" /> Titipan Masuk</RouterLink>
      </template>
    </PageHeader>

    <div class="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1">
      <button class="tab" :class="{ 'tab-active': tab === 'summary' }" @click="switchTab('summary')">Per Supplier</button>
      <button class="tab" :class="{ 'tab-active': tab === 'receipts' }" @click="switchTab('receipts')">Titipan Masuk</button>
      <button class="tab" :class="{ 'tab-active': tab === 'settlements' }" @click="switchTab('settlements')">Penyelesaian & Hutang</button>
    </div>

    <Transition name="page" mode="out-in">
      <!-- Ringkasan per supplier -->
      <div v-if="tab === 'summary'" key="summary" class="space-y-4">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
          <StatCard label="Supplier aktif" :value="number(summary.length)" tone="slate" />
          <StatCard label="Nilai titipan belum diselesaikan" :value="rupiah(totalOpenValue())" hint="Harga setor × barang yang belum dihitung" />
          <StatCard label="Hutang titipan belum dibayar" :value="rupiah(totalOutstanding())" tone="red" />
        </div>
        <div class="card overflow-hidden">
          <div class="table-wrap">
            <table v-stack class="table">
              <thead>
                <tr><th>Supplier</th><th class="num">Produk</th><th class="num">Titipan Terbuka</th><th class="num">Nilai (Harga Setor)</th><th>Terakhir Diselesaikan</th><th class="num">Hutang</th><th></th></tr>
              </thead>
              <tbody>
                <tr v-for="row in summary" :key="row.supplier.id">
                  <td>
                    <p class="font-medium">{{ row.supplier.name }}</p>
                    <p class="text-xs text-slate-500">{{ row.supplier.phone || '-' }}</p>
                  </td>
                  <td class="num">{{ number(row.open_products) }}</td>
                  <td class="num">
                    {{ number(row.open_qty) }}
                    <p v-if="row.oldest_open" class="text-xs text-slate-500">sejak {{ tanggal(row.oldest_open) }}</p>
                  </td>
                  <td class="num">{{ rupiah(row.open_value, false) }}</td>
                  <td>{{ row.last_settled ? tanggal(row.last_settled) : 'Belum pernah' }}</td>
                  <td class="num font-semibold" :class="{ 'text-red-600': row.outstanding }">{{ rupiah(row.outstanding, false) }}</td>
                  <td class="text-right">
                    <RouterLink v-if="row.open_qty" :to="{ name: 'consignment-settle', query: { supplier_id: row.supplier.id } }" class="btn-secondary btn-sm">Selesaikan</RouterLink>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <EmptyState v-if="!loading && !summary.length" icon="inbox" title="Belum ada barang titipan" text="Catat barang yang dititipkan supplier lewat tombol Titipan Masuk." />
        </div>
      </div>

      <!-- Titipan masuk -->
      <div v-else-if="tab === 'receipts'" key="receipts" class="card overflow-hidden">
        <div class="table-wrap">
          <table v-stack class="table">
            <thead><tr><th>No. Titipan</th><th>Tanggal</th><th>Supplier</th><th class="num">Barang</th><th class="num">Nilai Setor</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="receipt in receipts" :key="receipt.id" class="cursor-pointer hover:bg-slate-50" @click="router.push({ name: 'consignment-receipt', params: { id: receipt.id } })">
                <td class="font-medium text-brand-700">{{ receipt.number }}</td>
                <td>{{ tanggal(receipt.date) }}</td>
                <td>{{ receipt.supplier.name }}</td>
                <td class="num">{{ receipt.item_count }}</td>
                <td class="num">{{ rupiah(receipt.total, false) }}</td>
                <td><StatusBadge :status="receipt.status" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <EmptyState v-if="!loading && !receipts.length" icon="inbox" title="Belum ada titipan masuk" />
        <PaginationBar :meta="receiptMeta" @page="loadReceipts" />
      </div>

      <!-- Penyelesaian & hutang -->
      <div v-else key="settlements" class="space-y-4">
        <div class="card flex flex-wrap items-center justify-between gap-3 p-4">
          <select v-model="filters.status" class="input sm:w-60" @change="loadSettlements()">
            <option value="terbuka">Belum lunas</option>
            <option value="belum">Belum dibayar</option>
            <option value="sebagian">Dibayar sebagian</option>
            <option value="lunas">Lunas</option>
            <option value="">Semua</option>
          </select>
          <p class="text-sm text-slate-600">Total hutang titipan: <b class="text-red-600 tabular-nums">{{ rupiah(outstanding) }}</b></p>
        </div>
        <div class="card overflow-hidden">
          <div class="table-wrap">
            <table v-stack class="table">
              <thead><tr><th>No. Penyelesaian</th><th>Tanggal</th><th>Supplier</th><th class="num">Total Terjual</th><th class="num">Sisa Hutang</th><th>Status</th></tr></thead>
              <tbody>
                <tr v-for="settlement in settlements" :key="settlement.id" class="cursor-pointer hover:bg-slate-50" @click="router.push({ name: 'consignment-settlement', params: { id: settlement.id } })">
                  <td class="font-medium text-brand-700">{{ settlement.number }}</td>
                  <td>{{ tanggal(settlement.date) }}</td>
                  <td>{{ settlement.supplier.name }}</td>
                  <td class="num">{{ rupiah(settlement.total, false) }}</td>
                  <td class="num font-semibold">{{ rupiah(settlement.remaining, false) }}</td>
                  <td><StatusBadge :status="settlement.status" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <EmptyState v-if="!loading && !settlements.length" icon="calculator" title="Tidak ada penyelesaian" />
          <PaginationBar :meta="settlementMeta" @page="loadSettlements" />
        </div>
      </div>
    </Transition>
  </div>
</template>
