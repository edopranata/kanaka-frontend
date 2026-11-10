<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import http, { errorMessage, validationErrors } from '../api/http'
import { useToastStore } from '../stores/toast'
import { itemName, monthStart, rupiah, tanggal, today } from '../utils/format'
import { columnsFor, paymentBytes } from '../utils/escpos'
import { printThermal, receiptPaper } from '../utils/print'
import { printerConfig } from '../utils/printer'
import { confirmDialog } from '../stores/confirm'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import CustomerPicker from '../components/CustomerPicker.vue'
import EmptyState from '../components/EmptyState.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'
import StatCard from '../components/StatCard.vue'
import StatusBadge from '../components/StatusBadge.vue'
import AppSelect from '../components/AppSelect.vue'
import DateInput from '../components/DateInput.vue'
import DateRange from '../components/DateRange.vue'
import PayLinesModal from '../components/PayLinesModal.vue'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'

const auth = useAuthStore()
const meta = useMetaStore()
const router = useRouter()
const toast = useToastStore()

const tab = ref('bills')
const periodLabel = (period) => new Date(`${period}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

// ---- Daftar tagihan ----
const filters = reactive({ status: 'terbuka', period: '', search: '' })
const bills = ref([])
const summary = ref(null)
const pagination = ref(null)
const loading = ref(false)

async function loadBills(page = 1) {
  loading.value = true
  try {
    const { data } = await http.get('/bills', { params: { ...filters, page } })
    bills.value = data.data
    summary.value = data.summary
    pagination.value = data.meta
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

// ---- Saldo per pelanggan ----
const receivables = ref([])
const receivableTotals = ref(null)
const receivableSearch = ref('')

async function loadReceivables() {
  const { data } = await http.get('/receivables', { params: { search: receivableSearch.value || undefined } })
  receivables.value = data.data
  receivableTotals.value = data.totals
}

function switchTab(value) {
  tab.value = value
  const loaders = { bills: loadBills, customers: loadReceivables, payments: loadPayments }
  loaders[value]()
}

// ---- Bayar sebagian (per baris bon) ----
const payCustomer = ref(null)
function afterPaid() {
  loadReceivables()
  loadBills(pagination.value?.current_page || 1)
}

// ---- Riwayat pembayaran (baris yang sudah dibayar) ----
const paymentFilters = reactive({ search: '', from: monthStart(), to: today() })
const payments = ref([])
const paymentPagination = ref(null)
const openPayment = ref(null)

async function loadPayments(page = 1) {
  try {
    const { data } = await http.get('/receivable-payments', { params: { ...paymentFilters, search: paymentFilters.search || undefined, page } })
    payments.value = data.data
    paymentPagination.value = data.meta
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function printPayment(payment) {
  try {
    const { data } = await http.get(`/receivable-payments/${payment.id}`)
    const columns = columnsFor(receiptPaper())
    await printThermal(paymentBytes(data.data, { store: meta.store, columns, outstanding: data.outstanding, feed: printerConfig.feed, cut: printerConfig.cut }), columns, 'Bukti bayar dikirim ke printer.')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function cancelPayment(payment) {
  if (!(await confirmDialog({ title: 'Batalkan pembayaran', message: `Batalkan pembayaran ${payment.number || ''} ${rupiah(payment.amount)} dari ${payment.customer?.name}? ${payment.items.length} baris bon kembali menjadi belum dibayar.`, confirmLabel: 'Batalkan pembayaran', cancelLabel: 'Kembali', tone: 'danger' }))) return
  try {
    await http.delete(`/receivable-payments/${payment.id}`)
    toast.success('Pembayaran dibatalkan.')
    loadPayments(paymentPagination.value?.current_page || 1)
    loadBills(pagination.value?.current_page || 1)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

// ---- Buat tagihan ----
const generateForm = ref(null)
const generating = ref(false)
const generateErrors = ref({})

function openGenerate(customer = null) {
  generateErrors.value = {}
  generateForm.value = { period: customer ? monthStart().slice(0, 7) : monthStart(-1).slice(0, 7), customer }
}

async function generate() {
  generating.value = true
  generateErrors.value = {}
  try {
    const { data } = await http.post('/bills/generate', {
      period: generateForm.value.period,
      customer_id: generateForm.value.customer?.id || null,
    })
    generateForm.value = null
    if (!data.count) {
      toast.show('Tidak ada bon yang perlu ditagih untuk periode tersebut.', 'success')
      return
    }
    toast.success(`${data.count} tagihan dibuat.`)
    if (data.count === 1) {
      router.push({ name: 'bill', params: { id: data.data[0].id } })
    } else {
      switchTab('bills')
    }
  } catch (e) {
    generateErrors.value = validationErrors(e)
    toast.error(errorMessage(e))
  } finally {
    generating.value = false
  }
}

onMounted(() => loadBills())
</script>

<template>
  <div class="stagger">
    <PageHeader title="Tagihan & Piutang" subtitle="Tagihan bulanan penjualan kredit dan pembayarannya">
      <template #actions>
        <RouterLink :to="{ name: 'credit-sales' }" class="btn-secondary"><AppIcon name="book" :size="16" /> Daftar Bon</RouterLink>
        <button v-if="auth.can('bills.generate')" class="btn-primary" @click="openGenerate()"><AppIcon name="document" :size="16" /> Buat Tagihan</button>
      </template>
    </PageHeader>

    <div v-if="summary" class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
      <StatCard label="Tagihan belum lunas" :value="rupiah(summary.outstanding)" />
      <StatCard label="Lewat jatuh tempo" :value="rupiah(summary.overdue)" tone="red" />
      <StatCard label="Bon belum ditagih" :value="rupiah(summary.unbilled)" tone="accent" hint="Otomatis ditagih tiap tgl 1" />
      <StatCard label="Total piutang" :value="rupiah(summary.outstanding + summary.unbilled)" tone="slate" />
    </div>

    <div class="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1">
      <button class="tab" :class="{ 'tab-active': tab === 'bills' }" @click="switchTab('bills')">Daftar Tagihan</button>
      <button class="tab" :class="{ 'tab-active': tab === 'customers' }" @click="switchTab('customers')">Saldo per Pelanggan</button>
      <button class="tab" :class="{ 'tab-active': tab === 'payments' }" @click="switchTab('payments')">Riwayat Pembayaran</button>
    </div>

    <Transition name="page" mode="out-in">
      <div v-if="tab === 'bills'" key="bills">
        <div class="card mb-4 grid gap-2 p-4 sm:grid-cols-3">
          <input v-model="filters.search" type="search" class="input" placeholder="Cari no. tagihan / pelanggan…" @keydown.enter="loadBills()" @search="loadBills()" />
          <AppSelect
            v-model="filters.status"
            class="input"
            :options="[
              { value: 'terbuka', label: 'Belum lunas' },
              { value: 'jatuh_tempo', label: 'Lewat jatuh tempo' },
              { value: 'belum', label: 'Belum dibayar' },
              { value: 'sebagian', label: 'Dibayar sebagian' },
              { value: 'lunas', label: 'Lunas' },
              { value: '', label: 'Semua' },
            ]"
            @change="loadBills()"
          />
          <DateInput v-model="filters.period" type="month" class="input" placeholder="Semua periode" clearable @change="loadBills()" />
        </div>

        <div class="card overflow-hidden">
          <div class="table-wrap">
            <table v-stack class="table">
              <thead>
                <tr><th>No. Tagihan</th><th>Pelanggan</th><th>Periode</th><th>Jatuh Tempo</th><th class="num">Bon</th><th class="num">Total</th><th class="num">Sisa</th><th>Status</th></tr>
              </thead>
              <tbody>
                <tr v-for="bill in bills" :key="bill.id" class="cursor-pointer hover:bg-slate-50" @click="router.push({ name: 'bill', params: { id: bill.id } })">
                  <td class="font-medium text-brand-700">{{ bill.number }}</td>
                  <td class="font-medium">{{ bill.customer.name }}</td>
                  <td>{{ periodLabel(bill.period) }}</td>
                  <td :class="{ 'font-medium text-red-600': bill.is_overdue }">{{ tanggal(bill.due_date) }}</td>
                  <td class="num">{{ bill.sale_count }}</td>
                  <td class="num">{{ rupiah(bill.total, false) }}</td>
                  <td class="num font-semibold">{{ rupiah(bill.remaining, false) }}</td>
                  <td><StatusBadge :status="bill.is_overdue ? 'jatuh_tempo' : bill.status" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <EmptyState v-if="!loading && !bills.length" icon="document" title="Tidak ada tagihan" text="Tagihan dibuat otomatis setiap tanggal 1, atau klik Buat Tagihan." />
          <PaginationBar :meta="pagination" @page="loadBills" />
        </div>
      </div>

      <div v-else-if="tab === 'payments'" key="payments">
        <div class="card mb-4 flex flex-wrap items-end gap-3 p-4">
          <input v-model="paymentFilters.search" type="search" class="input min-w-56 flex-1" placeholder="Cari no. pembayaran / pelanggan…" @keydown.enter="loadPayments()" @search="loadPayments()" />
          <DateRange v-model:from="paymentFilters.from" v-model:to="paymentFilters.to" @change="loadPayments()" />
        </div>
        <div class="card overflow-hidden">
          <div class="table-wrap">
            <table v-stack class="table">
              <thead>
                <tr><th>No. Pembayaran</th><th>Tanggal</th><th>Pelanggan</th><th>Metode</th><th class="num">Baris</th><th class="num">Jumlah</th><th>Dicatat</th><th></th></tr>
              </thead>
              <tbody>
                <template v-for="payment in payments" :key="payment.id">
                  <tr class="cursor-pointer hover:bg-slate-50" @click="openPayment = openPayment === payment.id ? null : payment.id">
                    <td class="font-medium text-brand-700">{{ payment.number || '—' }}</td>
                    <td>{{ tanggal(payment.date) }}</td>
                    <td class="font-medium">{{ payment.customer?.name }}</td>
                    <td>{{ payment.payment_label }}</td>
                    <td class="num">{{ payment.items.length }}</td>
                    <td class="num font-semibold">{{ rupiah(payment.amount, false) }}</td>
                    <td>{{ payment.user }}</td>
                    <td class="text-right" @click.stop>
                      <button class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Cetak bukti" @click="printPayment(payment)"><AppIcon name="printer" :size="16" /></button>
                      <button v-if="auth.can('bills.cancel_payment')" class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Batalkan pembayaran" @click="cancelPayment(payment)"><AppIcon name="trash" :size="16" /></button>
                    </td>
                  </tr>
                  <tr v-if="openPayment === payment.id" class="bg-slate-50/70">
                    <td colspan="8" class="!whitespace-normal">
                      <div class="space-y-1 py-1 text-sm">
                        <div v-for="line in payment.items" :key="line.id" class="flex justify-between gap-3">
                          <span class="min-w-0"><span class="text-slate-500">{{ line.sale_number }} ({{ tanggal(line.business_date) }})</span> · {{ line.qty }} {{ line.unit }} {{ itemName(line) }}</span>
                          <span class="shrink-0 tabular-nums">{{ rupiah(line.amount, false) }}</span>
                        </div>
                        <p v-if="payment.notes" class="text-xs text-slate-500">Catatan: {{ payment.notes }}</p>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <EmptyState v-if="!payments.length" icon="cash" title="Belum ada pembayaran" text="Pembayaran piutang pada periode ini tampil di sini, lengkap dengan baris bon yang dibayar." />
          <PaginationBar :meta="paymentPagination" @page="loadPayments" />
        </div>
      </div>

      <div v-else key="customers">
        <div class="card mb-4 p-4">
          <input v-model="receivableSearch" type="search" class="input" placeholder="Cari pelanggan…" @keydown.enter="loadReceivables" @search="loadReceivables" />
        </div>
        <div class="card overflow-hidden">
          <div class="table-wrap">
            <table v-stack class="table">
              <thead>
                <tr><th>Pelanggan</th><th class="num">Batas Kredit</th><th class="num">Belum Ditagih</th><th class="num">Tagihan Belum Lunas</th><th class="num">Lewat Tempo</th><th class="num">Total Piutang</th><th></th></tr>
              </thead>
              <tbody>
                <tr v-for="row in receivables" :key="row.customer.id">
                  <td>
                    <p class="font-medium">{{ row.customer.name }}</p>
                    <p class="text-xs text-slate-500">{{ row.customer.phone || '-' }}</p>
                  </td>
                  <td class="num">{{ row.credit_limit ? rupiah(row.credit_limit, false) : 'Tanpa batas' }}</td>
                  <td class="num">
                    {{ rupiah(row.unbilled, false) }}
                    <p v-if="row.unbilled_count" class="text-xs text-slate-500">{{ row.unbilled_count }} bon sejak {{ tanggal(row.oldest_unbilled) }}</p>
                  </td>
                  <td class="num">{{ rupiah(row.billed_outstanding, false) }}</td>
                  <td class="num" :class="{ 'font-medium text-red-600': row.overdue }">{{ rupiah(row.overdue, false) }}</td>
                  <td class="num font-semibold">{{ rupiah(row.outstanding, false) }}</td>
                  <td class="text-right">
                    <div class="flex flex-wrap justify-end gap-2">
                      <button v-if="auth.can('bills.pay')" class="btn-primary btn-sm" @click="payCustomer = row.customer"><AppIcon name="cash" :size="14" /> Bayar sebagian</button>
                      <button v-if="row.unbilled && auth.can('bills.generate')" class="btn-secondary btn-sm" @click="openGenerate(row.customer)">Tagih sekarang</button>
                    </div>
                  </td>
                </tr>
              </tbody>
              <tfoot v-if="receivables.length && receivableTotals">
                <tr>
                  <td>Total</td><td></td>
                  <td class="num">{{ rupiah(receivableTotals.unbilled, false) }}</td>
                  <td class="num">{{ rupiah(receivableTotals.billed_outstanding, false) }}</td>
                  <td class="num">{{ rupiah(receivableTotals.overdue, false) }}</td>
                  <td class="num">{{ rupiah(receivableTotals.outstanding, false) }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <EmptyState v-if="!receivables.length" icon="users" title="Tidak ada piutang" text="Semua pelanggan sudah lunas." />
        </div>
      </div>
    </Transition>

    <PayLinesModal v-if="payCustomer" :customer="payCustomer" @paid="afterPaid" @close="payCustomer = null" />

    <AppModal v-if="generateForm" title="Buat Tagihan" @close="generateForm = null">
      <div class="space-y-4 text-sm">
        <div>
          <label class="label">Periode</label>
          <DateInput v-model="generateForm.period" type="month" class="input" :class="{ 'input-error': generateErrors.period }" />
          <p v-if="generateErrors.period" class="error-text">{{ generateErrors.period }}</p>
          <p class="mt-1 text-xs text-slate-500">Semua bon yang belum ditagih sampai akhir periode ini (atau sampai hari ini untuk bulan berjalan) akan dimasukkan.</p>
        </div>
        <div>
          <label class="label">Pelanggan</label>
          <CustomerPicker v-model="generateForm.customer" />
          <p class="mt-1 text-xs text-slate-500">Kosongkan untuk membuat tagihan semua pelanggan sekaligus.</p>
        </div>
        <p class="rounded-lg bg-slate-50 p-3 text-slate-600">
          Tagihan juga dibuat <b>otomatis setiap tanggal 1 pukul 01:00</b> untuk bon bulan sebelumnya (bisa diatur di Pengaturan Toko).
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="generateForm = null">Batal</button>
        <button class="btn-primary" :disabled="generating || !generateForm.period" @click="generate">{{ generating ? 'Memproses…' : 'Buat Tagihan' }}</button>
      </template>
    </AppModal>
  </div>
</template>
