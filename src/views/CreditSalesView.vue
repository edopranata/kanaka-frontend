<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import http, { errorMessage } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { jam, monthStart, rupiah, tanggal, today } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import CustomerPicker from '../components/CustomerPicker.vue'
import DateRange from '../components/DateRange.vue'
import EmptyState from '../components/EmptyState.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'
import StatusBadge from '../components/StatusBadge.vue'

const auth = useAuthStore()
const toast = useToastStore()

const customer = ref(null)
const filters = reactive({ from: monthStart(), to: today(), billed: '', status: 'selesai' })
const sales = ref([])
const pagination = ref(null)
const loading = ref(false)

async function load(page = 1) {
  loading.value = true
  try {
    const { data } = await http.get('/sales', {
      params: { ...filters, payment_method: 'piutang', customer_id: customer.value?.id, page },
    })
    sales.value = data.data
    pagination.value = data.meta
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

watch(customer, () => load())
onMounted(() => load())
</script>

<template>
  <div class="stagger">
    <PageHeader title="Penjualan Kredit (Bon)" subtitle="Ambil dulu, bayar nanti — ditagih bulanan per pelanggan">
      <template #actions>
        <RouterLink v-if="auth.can('receivables.manage')" :to="{ name: 'bills' }" class="btn-secondary"><AppIcon name="document" :size="16" /> Tagihan & Piutang</RouterLink>
        <RouterLink :to="{ name: 'credit-sale-create' }" class="btn-primary"><AppIcon name="plus" :size="16" /> Bon Baru</RouterLink>
      </template>
    </PageHeader>

    <div class="card mb-4 space-y-3 p-4">
      <DateRange v-model:from="filters.from" v-model:to="filters.to" @change="load()" />
      <div class="grid gap-2 sm:grid-cols-3">
        <CustomerPicker v-model="customer" />
        <select v-model="filters.billed" class="input" @change="load()">
          <option value="">Semua bon</option>
          <option value="0">Belum ditagih</option>
          <option value="1">Sudah masuk tagihan</option>
        </select>
        <select v-model="filters.status" class="input" @change="load()">
          <option value="selesai">Aktif</option>
          <option value="batal">Dibatalkan</option>
          <option value="">Semua status</option>
        </select>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="table-wrap">
        <table v-stack class="table">
          <thead>
            <tr><th>No. Bon</th><th>Tanggal</th><th>Pelanggan</th><th class="num">Item</th><th class="num">Total</th><th>Tagihan</th><th>Dicatat</th></tr>
          </thead>
          <tbody>
            <tr v-for="sale in sales" :key="sale.id" class="cursor-pointer hover:bg-slate-50" @click="$router.push({ name: 'sale', params: { id: sale.id } })">
              <td class="font-medium text-brand-700">{{ sale.number }}</td>
              <td>{{ tanggal(sale.business_date) }} <span class="text-slate-400">{{ jam(sale.created_at) }}</span></td>
              <td class="font-medium">{{ sale.customer?.name }}</td>
              <td class="num">{{ sale.item_count }}</td>
              <td class="num font-medium" :class="{ 'text-slate-400 line-through': sale.status === 'batal' }">{{ rupiah(sale.total) }}</td>
              <td>
                <StatusBadge v-if="sale.status === 'batal'" status="batal" />
                <RouterLink v-else-if="sale.bill && auth.can('receivables.manage')" :to="{ name: 'bill', params: { id: sale.bill.id } }" class="text-brand-700 hover:underline" @click.stop>
                  {{ sale.bill.number }}
                </RouterLink>
                <span v-else-if="sale.bill">{{ sale.bill.number }}</span>
                <StatusBadge v-else status="belum_ditagih" />
              </td>
              <td class="text-slate-500">{{ sale.cashier }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-if="!loading && !sales.length" icon="book" title="Belum ada bon" text="Bon penjualan kredit pada filter ini akan tampil di sini." />
      <PaginationBar :meta="pagination" @page="load" />
    </div>
  </div>
</template>
