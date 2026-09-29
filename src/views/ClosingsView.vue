<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import http, { errorMessage, validationErrors } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { hariTanggal, number, rupiah, tanggal, waktu } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import EmptyState from '../components/EmptyState.vue'
import MoneyInput from '../components/MoneyInput.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'
import StatusBadge from '../components/StatusBadge.vue'

const auth = useAuthStore()
const meta = useMetaStore()
const toast = useToastStore()
const router = useRouter()

const status = ref(null)
const closings = ref([])
const pagination = ref(null)
const loading = ref(false)

async function loadStatus() {
  const { data } = await http.get('/closings/status')
  status.value = data
}

async function loadHistory(page = 1) {
  loading.value = true
  try {
    const { data } = await http.get('/closings', { params: { page } })
    closings.value = data.data
    pagination.value = data.meta
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

// ---- Closing manual: kas fisik dihitung per pengguna ----
const modal = ref(false)
const form = reactive({ notes: '' })
const actual = reactive({})
const errors = ref({})
const saving = ref(false)
const counterFor = ref(null)
const denominations = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100]
const pieces = reactive({})

const drawers = computed(() => status.value?.summary.cash_breakdown || [])
const banks = computed(() => status.value?.summary.bank_breakdown || [])
const rowActual = (row) => Number(actual[row.account_id]) || 0
const rowDifference = (row) => rowActual(row) - row.expected
const totalExpected = computed(() => drawers.value.reduce((sum, row) => sum + row.expected, 0))
const totalActual = computed(() => drawers.value.reduce((sum, row) => sum + rowActual(row), 0))
const difference = computed(() => totalActual.value - totalExpected.value)

/** Rincian mutasi hari ini untuk satu kas, mis. "Penjualan +150.000 · Setor bank −100.000". */
const movementLabels = { sales: 'Penjualan', receivables: 'Piutang', expenses: 'Pengeluaran', consignment: 'Titipan', purchases: 'Pembelian', transfer_in: 'Diterima', transfer_out: 'Diserahkan/setor', other: 'Lainnya' }
const movements = (row) => Object.entries(movementLabels).filter(([key]) => row[key]).map(([key, label]) => ({ label, value: row[key] }))

function openCounter(row) {
  counterFor.value = counterFor.value === row.account_id ? null : row.account_id
  if (!pieces[row.account_id]) pieces[row.account_id] = Object.fromEntries(denominations.map((value) => [value, 0]))
}
watch(pieces, () => {
  for (const [id, values] of Object.entries(pieces)) {
    if (Number(id) === counterFor.value) actual[id] = denominations.reduce((sum, value) => sum + value * (Number(values[value]) || 0), 0)
  }
}, { deep: true })

function openModal() {
  errors.value = {}
  form.notes = ''
  counterFor.value = null
  Object.keys(actual).forEach((key) => delete actual[key])
  Object.keys(pieces).forEach((key) => delete pieces[key])
  drawers.value.forEach((row) => (actual[row.account_id] = 0))
  modal.value = true
}

async function submit() {
  const message = difference.value === 0
    ? 'Semua kas sesuai. Lanjutkan closing?'
    : `Total selisih kas ${rupiah(difference.value)}. Selisih akan dibukukan ke kas masing-masing. Tetap lanjutkan?`
  if (!confirm(`${message}\n\nSaldo tiap kas menjadi saldo awal hari berikutnya. Setelah closing, transaksi tanggal ${tanggal(status.value.next_closing_date)} terkunci.`)) return

  saving.value = true
  errors.value = {}
  try {
    const { data } = await http.post('/closings', {
      date: status.value.next_closing_date,
      notes: form.notes,
      counts: drawers.value.map((row) => ({ account_id: row.account_id, actual: rowActual(row) })),
    })
    toast.success(`Closing ${tanggal(data.data.date)} berhasil.`)
    modal.value = false
    meta.load(true)
    router.push({ name: 'closing', params: { id: data.data.id } })
  } catch (e) {
    errors.value = validationErrors(e)
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadStatus().catch((e) => toast.error(errorMessage(e)))
  loadHistory()
})
</script>

<template>
  <div class="stagger">
    <PageHeader title="Closing Harian" subtitle="Tutup buku per hari: rekap penjualan, pembayaran, dan kas laci" />

    <div v-if="status" class="mb-5 grid gap-4 lg:grid-cols-3">
      <!-- Status closing berikutnya -->
      <section class="card p-5 lg:col-span-2">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs font-medium tracking-wide text-slate-500 uppercase">Belum di-closing</p>
            <h2 class="text-lg font-semibold text-slate-900">{{ hariTanggal(status.next_closing_date) }}</h2>
            <p v-if="status.pending_days > 0" class="mt-1 text-sm text-amber-700">
              <AppIcon name="alert" :size="14" class="inline" /> Tertunda {{ status.pending_days }} hari. Closing harus berurutan.
            </p>
          </div>
          <button v-if="auth.can('closings.create')" class="btn-primary" :disabled="!status.can_close" @click="openModal">
            <AppIcon name="lock" :size="16" /> Closing Manual
          </button>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-lg bg-slate-50 p-3">
            <p class="text-xs text-slate-500">Transaksi</p>
            <p class="text-lg font-semibold tabular-nums">{{ number(status.summary.transaction_count) }}</p>
            <p v-if="status.summary.void_count" class="text-xs text-red-600">{{ status.summary.void_count }} dibatalkan</p>
          </div>
          <div class="rounded-lg bg-slate-50 p-3">
            <p class="text-xs text-slate-500">Total penjualan</p>
            <p class="text-lg font-semibold tabular-nums">{{ rupiah(status.summary.net_sales) }}</p>
          </div>
          <div class="rounded-lg bg-slate-50 p-3">
            <p class="text-xs text-slate-500">Penjualan tunai</p>
            <p class="text-lg font-semibold tabular-nums">{{ rupiah(status.summary.cash_sales) }}</p>
          </div>
          <div class="rounded-lg bg-slate-50 p-3">
            <p class="text-xs text-slate-500">Pengeluaran</p>
            <p class="text-lg font-semibold tabular-nums">{{ rupiah(status.summary.expense_total) }}</p>
          </div>
        </div>
        <p v-if="status.pending_transfers?.count" class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AppIcon name="alert" :size="14" class="inline" /> {{ status.pending_transfers.count }} serah terima kas ({{ rupiah(status.pending_transfers.amount) }}) belum dikonfirmasi penerima.
          Uangnya masih tercatat di kas pengirim.
          <RouterLink :to="{ name: 'cash' }" class="font-medium underline">Lihat</RouterLink>
        </p>
        <div v-if="status.summary.payments.length" class="mt-3 flex flex-wrap gap-2 text-xs">
          <span v-for="payment in status.summary.payments" :key="payment.method" class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
            {{ payment.label }}: <b class="tabular-nums">{{ rupiah(payment.total) }}</b> ({{ payment.count }})
          </span>
        </div>
      </section>

      <!-- Info closing otomatis -->
      <section class="card p-5">
        <div class="flex items-center gap-2">
          <AppIcon name="clock" class="text-brand-600" />
          <h2 class="font-semibold">Closing otomatis</h2>
          <StatusBadge :status="status.auto_closing ? 'aktif' : 'nonaktif'" class="ml-auto" />
        </div>
        <p class="mt-2 text-sm text-slate-600">
          <template v-if="status.auto_closing">
            Setiap pukul <b>24:00 (00:00)</b> sistem otomatis meng-closing semua tanggal sebelumnya yang belum di-closing manual.
            Closing otomatis tidak menghitung kas fisik.
          </template>
          <template v-else>Closing otomatis dimatikan. Aktifkan di menu Pengaturan Toko.</template>
        </p>
        <p class="mt-3 text-sm text-slate-600">
          Setelah closing manual hari ini, transaksi berikutnya otomatis masuk ke tanggal usaha <b>besok</b>.
        </p>
        <p class="mt-3 text-sm text-slate-600">
          Kas fisik dihitung <b>per pengguna</b>. Saldo akhir tiap kas otomatis menjadi saldo awal besok.
          Total kas fisik saat ini: <b class="tabular-nums">{{ rupiah(status.summary.expected_cash) }}</b>.
        </p>
        <p class="mt-3 text-xs text-slate-500">Terakhir di-closing: {{ status.last_closed_date ? tanggal(status.last_closed_date) : 'belum pernah' }}</p>
      </section>
    </div>

    <!-- Riwayat -->
    <div class="card overflow-hidden">
      <header class="border-b border-slate-100 px-5 py-3 font-semibold">Riwayat closing</header>
      <div class="table-wrap">
        <table v-stack class="table">
          <thead>
            <tr>
              <th>Tanggal</th><th>Metode</th><th class="num">Transaksi</th><th class="num">Total Penjualan</th>
              <th class="num">Kas Seharusnya</th><th class="num">Kas Fisik</th><th class="num">Selisih</th><th class="num">Saldo Akhir</th><th>Ditutup</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="closing in closings" :key="closing.id" class="cursor-pointer hover:bg-slate-50" @click="router.push({ name: 'closing', params: { id: closing.id } })">
              <td class="font-medium text-brand-700">{{ tanggal(closing.date) }}</td>
              <td><StatusBadge :status="closing.method" /></td>
              <td class="num">{{ number(closing.transaction_count) }}</td>
              <td class="num font-medium">{{ rupiah(closing.net_sales, false) }}</td>
              <td class="num">{{ rupiah(closing.expected_cash, false) }}</td>
              <td class="num">{{ closing.actual_cash === null ? '-' : rupiah(closing.actual_cash, false) }}</td>
              <td class="num" :class="closing.cash_difference < 0 ? 'text-red-600' : closing.cash_difference > 0 ? 'text-emerald-600' : ''">
                {{ closing.cash_difference === null ? '-' : rupiah(closing.cash_difference, false) }}
              </td>
              <td class="num font-medium">
                {{ rupiah(closing.closing_balance, false) }}
                <p v-if="closing.cash_out" class="text-xs font-normal text-slate-500">setor bank {{ rupiah(closing.cash_out, false) }}</p>
              </td>
              <td class="text-slate-500">{{ closing.closed_by || 'Sistem' }} · {{ waktu(closing.closed_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-if="!loading && !closings.length" icon="lock" title="Belum ada closing" />
      <PaginationBar :meta="pagination" @page="loadHistory" />
    </div>

    <!-- Modal closing manual -->
    <AppModal v-if="modal" :title="`Closing ${tanggal(status.next_closing_date, 'long')}`" size="xl" @close="modal = false">
      <div class="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div class="min-w-0 space-y-3">
          <div>
            <p class="font-semibold text-slate-900">Hitung kas fisik per pengguna</p>
            <p class="text-xs text-slate-500">Isi uang yang benar-benar ada di tangan / laci masing-masing. Saldo awal = saldo akhir closing sebelumnya.</p>
          </div>
          <p v-if="errors.counts" class="error-text">{{ errors.counts }}</p>
          <div v-if="!drawers.length" class="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            Tidak ada kas fisik yang perlu dihitung hari ini.
          </div>
          <div v-for="row in drawers" :key="row.account_id" class="rounded-xl border border-slate-200 p-3">
            <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-start">
              <div class="min-w-0">
                <p class="font-medium text-slate-900">{{ row.name }}</p>
                <p class="text-xs text-slate-500">
                  Saldo awal <b class="tabular-nums">{{ rupiah(row.opening) }}</b> · seharusnya <b class="tabular-nums text-slate-800">{{ rupiah(row.expected) }}</b>
                </p>
                <p class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  <span v-for="item in movements(row)" :key="item.label">
                    {{ item.label }} <b class="tabular-nums" :class="item.value < 0 ? 'text-red-600' : 'text-emerald-700'">{{ item.value > 0 ? '+' : '' }}{{ number(item.value) }}</b>
                  </span>
                </p>
              </div>
              <div>
                <MoneyInput v-model="actual[row.account_id]" :disabled="counterFor === row.account_id" />
                <div class="mt-1 flex items-center justify-between gap-2 text-xs">
                  <button type="button" class="text-brand-700 hover:underline" @click="openCounter(row)">{{ counterFor === row.account_id ? 'Tutup pecahan' : 'Hitung pecahan' }}</button>
                  <span class="font-semibold tabular-nums" :class="rowDifference(row) === 0 ? 'text-emerald-700' : rowDifference(row) < 0 ? 'text-red-600' : 'text-amber-700'">
                    {{ rowDifference(row) === 0 ? 'Sesuai' : rupiah(rowDifference(row)) }}
                  </span>
                </div>
              </div>
            </div>
            <div v-if="counterFor === row.account_id" class="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-5">
              <label v-for="value in denominations" :key="value" class="text-xs text-slate-500">
                {{ number(value) }}
                <input v-model.number="pieces[row.account_id][value]" type="number" min="0" class="input mt-0.5 py-1.5" @focus="$event.target.select()" />
              </label>
            </div>
          </div>
          <div>
            <label class="label">Catatan</label>
            <textarea v-model="form.notes" rows="2" class="input" placeholder="Mis. penjelasan selisih kas" />
          </div>
        </div>

        <div class="h-fit space-y-2 rounded-xl bg-slate-50 p-4 text-sm lg:sticky lg:top-0">
          <p class="font-semibold text-slate-900">Rekap kas fisik</p>
          <div class="flex justify-between"><span class="text-slate-500">Saldo awal</span><span class="tabular-nums">{{ rupiah(status.summary.opening_cash) }}</span></div>
          <div class="flex justify-between font-semibold"><span>Seharusnya</span><span class="tabular-nums">{{ rupiah(totalExpected) }}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Hasil hitung</span><span class="tabular-nums">{{ rupiah(totalActual) }}</span></div>
          <div
            class="flex justify-between rounded-lg px-3 py-2 font-semibold"
            :class="difference === 0 ? 'bg-emerald-100 text-emerald-800' : difference < 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'"
          >
            <span>{{ difference === 0 ? 'Sesuai' : difference < 0 ? 'Kurang' : 'Lebih' }}</span>
            <span class="tabular-nums">{{ rupiah(difference) }}</span>
          </div>
          <div class="flex justify-between rounded-lg bg-brand-50 px-3 py-2 font-semibold text-brand-800">
            <span>Saldo awal besok</span><span class="tabular-nums">{{ rupiah(totalActual) }}</span>
          </div>

          <template v-if="banks.length">
            <p class="pt-3 font-semibold text-slate-900">Rekening bank (non tunai)</p>
            <div v-for="bank in banks" :key="bank.account_id" class="rounded-lg bg-white p-2.5">
              <p class="font-medium">{{ bank.name }}</p>
              <div class="mt-1 grid grid-cols-3 gap-1 text-xs">
                <span><span class="block text-slate-500">Awal</span><b class="tabular-nums">{{ number(bank.opening) }}</b></span>
                <span><span class="block text-slate-500">Mutasi</span><b class="tabular-nums" :class="bank.expected - bank.opening < 0 ? 'text-red-600' : 'text-emerald-700'">{{ number(bank.expected - bank.opening) }}</b></span>
                <span><span class="block text-slate-500">Akhir</span><b class="tabular-nums">{{ number(bank.expected) }}</b></span>
              </div>
            </div>
          </template>
          <p v-if="status.pending_transfers?.count" class="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            {{ status.pending_transfers.count }} serah terima belum dikonfirmasi; uangnya masih dihitung di kas pengirim.
          </p>
          <p class="pt-2 text-xs text-slate-500">
            {{ number(status.summary.transaction_count) }} transaksi · total {{ rupiah(status.summary.net_sales) }}.
            <template v-if="status.summary.credit_sales">Bon (piutang): {{ rupiah(status.summary.credit_sales) }}.</template>
          </p>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="modal = false">Batal</button>
        <button class="btn-primary" :disabled="saving" @click="submit"><AppIcon name="lock" :size="16" /> {{ saving ? 'Memproses…' : 'Closing Sekarang' }}</button>
      </template>
    </AppModal>
  </div>
</template>
