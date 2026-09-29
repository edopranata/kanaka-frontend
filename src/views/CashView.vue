<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import http, { errorMessage, validationErrors } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { daysAgo, number, rupiah, tanggal, waktu } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import DateRange from '../components/DateRange.vue'
import EmptyState from '../components/EmptyState.vue'
import MoneyInput from '../components/MoneyInput.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'

const auth = useAuthStore()
const meta = useMetaStore()
const toast = useToastStore()
const manager = auth.can('cash.manage')

const kindLabels = { setor: 'Setor ke bank', serah_terima: 'Serah terima kas', tarik: 'Tarik tunai', pindah: 'Pindah rekening' }
const statusStyles = {
  menunggu: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  selesai: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ditolak: 'bg-red-50 text-red-700 ring-red-600/20',
  dibatalkan: 'bg-slate-100 text-slate-500 ring-slate-500/20',
}

// ---- Akun ----
const accounts = ref([])
const myDrawer = computed(() => accounts.value.find((account) => account.is_mine))
const drawers = computed(() => accounts.value.filter((account) => account.type === 'fisik'))
const banks = computed(() => accounts.value.filter((account) => account.type === 'bank'))
const shownDrawers = computed(() => (manager ? [...drawers.value].sort((a, b) => b.is_mine - a.is_mine) : drawers.value.filter((account) => account.is_mine)))
const totalDrawers = computed(() => drawers.value.reduce((sum, account) => sum + (account.balance || 0), 0))
const totalBanks = computed(() => banks.value.reduce((sum, account) => sum + (account.balance || 0), 0))
const available = (account) => (account?.balance || 0) - (account?.pending_out || 0)

async function loadAccounts() {
  const { data } = await http.get('/cash/accounts', { params: { all: manager ? 1 : undefined } })
  accounts.value = data.data
  if (!selectedId.value) selectedId.value = myDrawer.value?.id
}

// ---- Serah terima menunggu ----
const pending = ref([])
const incoming = computed(() => pending.value.filter((transfer) => transfer.can_accept))
const outgoing = computed(() => pending.value.filter((transfer) => !transfer.can_accept))

async function loadPending() {
  const { data } = await http.get('/cash/transfers', { params: { status: 'menunggu', per_page: 100 } })
  pending.value = data.data
}

// ---- Mutasi & riwayat ----
const tab = ref('mutations')
const selectedId = ref(null)
const selected = computed(() => accounts.value.find((account) => account.id === selectedId.value))
const range = reactive({ from: daysAgo(6), to: meta.business_date || daysAgo(0) })
const ledger = ref(null)
const loadingLedger = ref(false)

async function loadLedger() {
  if (!selectedId.value) return
  loadingLedger.value = true
  try {
    const { data } = await http.get(`/cash/accounts/${selectedId.value}/mutations`, { params: range })
    ledger.value = data
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loadingLedger.value = false
  }
}

function selectAccount(account) {
  if (account.balance === undefined) return
  selectedId.value = account.id
  tab.value = 'mutations'
  loadLedger()
}

const history = ref([])
const historyMeta = ref(null)
const historyStatus = ref('')
async function loadHistory(page = 1) {
  try {
    const { data } = await http.get('/cash/transfers', { params: { page, status: historyStatus.value || undefined } })
    history.value = data.data
    historyMeta.value = data.meta
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function refresh() {
  await Promise.all([loadAccounts(), loadPending()])
  loadLedger()
  if (tab.value === 'history') loadHistory(historyMeta.value?.current_page || 1)
  window.dispatchEvent(new Event('cash-pending-changed'))
}

// ---- Perpindahan kas ----
const transfer = ref(null)
const errors = ref({})
const saving = ref(false)
const modes = {
  setor: { title: 'Setor ke Bank', hint: 'Uang langsung tercatat masuk ke rekening.' },
  serah: { title: 'Serah Terima Kas', hint: 'Saldo baru pindah setelah penerima menekan “Terima”.' },
  tarik: { title: 'Tarik Tunai dari Rekening', hint: 'Uang dari rekening masuk ke kas fisik Anda.' },
}

function openTransfer(mode, account = null) {
  errors.value = {}
  const base = { mode, amount: 0, reference: '', notes: '' }
  if (mode === 'setor') transfer.value = { ...base, from_account_id: myDrawer.value?.id, to_account_id: banks.value.find((bank) => bank.is_active)?.id }
  if (mode === 'serah') transfer.value = { ...base, from_account_id: myDrawer.value?.id, to_account_id: null }
  if (mode === 'tarik') transfer.value = { ...base, from_account_id: account?.id || banks.value[0]?.id, to_account_id: myDrawer.value?.id }
}

const transferSource = computed(() => accounts.value.find((account) => account.id === transfer.value?.from_account_id))
const handoverTargets = computed(() => drawers.value.filter((account) => !account.is_mine && account.is_active))

async function submitTransfer() {
  saving.value = true
  errors.value = {}
  try {
    const { mode, ...payload } = transfer.value
    const { data } = await http.post('/cash/transfers', payload)
    toast.success(data.data.status === 'menunggu' ? `Menunggu konfirmasi ${data.data.to.name.replace(/^Kas /, '')}.` : `${kindLabels[data.data.kind]} ${rupiah(data.data.amount)} tercatat.`)
    transfer.value = null
    refresh()
  } catch (e) {
    errors.value = validationErrors(e)
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

async function act(item, action) {
  let body = {}
  if (action === 'reject') {
    const reason = prompt('Alasan menolak (opsional):', 'Uang belum diterima')
    if (reason === null) return
    body = { reason }
  } else if (action === 'accept' && !confirm(`Terima kas ${rupiah(item.amount)} dari ${item.from.name.replace(/^Kas /, '')}?\nPastikan uangnya sudah Anda pegang.`)) {
    return
  } else if (action === 'cancel' && !confirm(`Batalkan serah terima ${item.number}?`)) {
    return
  }
  try {
    await http.post(`/cash/transfers/${item.id}/${action}`, body)
    toast.success({ accept: 'Kas diterima.', reject: 'Serah terima ditolak.', cancel: 'Serah terima dibatalkan.' }[action])
    refresh()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

// ---- Penyesuaian saldo (pemilik/admin) ----
const adjust = ref(null)
function openAdjust(account) {
  errors.value = {}
  adjust.value = { account, direction: 1, amount: 0, reason: account.type === 'bank' && !account.balance ? 'Saldo awal rekening' : '' }
}
async function submitAdjust() {
  saving.value = true
  errors.value = {}
  try {
    await http.post(`/cash/accounts/${adjust.value.account.id}/adjust`, { amount: adjust.value.direction * (adjust.value.amount || 0), reason: adjust.value.reason })
    toast.success('Saldo disesuaikan.')
    adjust.value = null
    refresh()
  } catch (e) {
    errors.value = validationErrors(e)
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

// ---- Rekening bank (pemilik/admin) ----
const bankForm = ref(null)
function openBank(account = null) {
  errors.value = {}
  bankForm.value = account
    ? { id: account.id, name: account.name, bank_name: account.bank_name || '', account_number: account.account_number || '', account_holder: account.account_holder || '', is_active: account.is_active }
    : { id: null, name: '', bank_name: '', account_number: '', account_holder: '', is_active: true }
}
async function saveBank() {
  saving.value = true
  errors.value = {}
  try {
    const { id, ...payload } = bankForm.value
    if (id) await http.put(`/cash/accounts/${id}`, payload)
    else await http.post('/cash/accounts', payload)
    toast.success('Rekening disimpan.')
    bankForm.value = null
    refresh()
  } catch (e) {
    errors.value = validationErrors(e)
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

function switchTab(value) {
  tab.value = value
  if (value === 'history' && !historyMeta.value) loadHistory()
}

onMounted(async () => {
  try {
    await Promise.all([loadAccounts(), loadPending()])
    loadLedger()
  } catch (e) {
    toast.error(errorMessage(e))
  }
})
</script>

<template>
  <div class="stagger">
    <PageHeader title="Kas & Bank" :subtitle="manager ? 'Kas fisik tiap pengguna, rekening bank, dan perpindahan kas' : 'Kas fisik Anda dan serah terima kas'">
      <template #actions>
        <button class="btn-secondary" :disabled="!myDrawer" @click="openTransfer('serah')"><AppIcon name="handover" :size="16" /> Serah Terima</button>
        <button class="btn-primary" :disabled="!myDrawer || !banks.length" @click="openTransfer('setor')"><AppIcon name="bank" :size="16" /> Setor ke Bank</button>
      </template>
    </PageHeader>

    <!-- Menunggu konfirmasi saya -->
    <TransitionGroup tag="div" class="space-y-2" enter-from-class="opacity-0 -translate-y-1" enter-active-class="transition duration-300" leave-to-class="opacity-0" leave-active-class="transition duration-200">
      <div v-for="item in incoming" :key="item.id" class="card flex flex-wrap items-center gap-3 border-l-4 border-l-amber-500 p-4">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700"><AppIcon name="handover" /></span>
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-slate-900">{{ item.from.name.replace(/^Kas /, '') }} menyerahkan <span class="tabular-nums">{{ rupiah(item.amount) }}</span> kepada Anda</p>
          <p class="text-xs text-slate-500">{{ item.number }} · {{ waktu(item.created_at) }}<template v-if="item.notes"> · {{ item.notes }}</template></p>
        </div>
        <div class="flex gap-2">
          <button class="btn-secondary btn-sm" @click="act(item, 'reject')">Tolak</button>
          <button class="btn-primary btn-sm" @click="act(item, 'accept')"><AppIcon name="check" :size="14" /> Terima</button>
        </div>
      </div>
    </TransitionGroup>
    <div v-if="incoming.length" class="mb-4" />

    <!-- Ringkasan akun -->
    <div v-if="manager" class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
      <div class="card border-l-4 border-l-brand-600 p-4">
        <p class="text-xs font-medium tracking-wide text-slate-500 uppercase">Total kas fisik</p>
        <p class="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{{ rupiah(totalDrawers) }}</p>
        <p class="text-xs text-slate-500">{{ drawers.filter((account) => account.balance).length }} pemegang kas</p>
      </div>
      <div class="card border-l-4 border-l-sky-500 p-4">
        <p class="text-xs font-medium tracking-wide text-slate-500 uppercase">Total rekening bank</p>
        <p class="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{{ rupiah(totalBanks) }}</p>
        <p class="text-xs text-slate-500">{{ banks.length }} rekening</p>
      </div>
      <div class="card col-span-2 border-l-4 border-l-accent-500 p-4 lg:col-span-1">
        <p class="text-xs font-medium tracking-wide text-slate-500 uppercase">Total kas & bank</p>
        <p class="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{{ rupiah(totalDrawers + totalBanks) }}</p>
        <p class="text-xs text-slate-500">{{ pending.length ? `${pending.length} serah terima menunggu konfirmasi` : 'Tidak ada serah terima tertunda' }}</p>
      </div>
    </div>

    <section class="mb-4">
      <h2 class="mb-2 text-sm font-semibold text-slate-700">Kas fisik</h2>
      <div class="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
        <button
          v-for="account in shownDrawers"
          :key="account.id"
          type="button"
          class="card card-hover p-4 text-left transition"
          :class="[selectedId === account.id ? 'ring-2 ring-brand-500' : '', account.balance < 0 ? 'bg-red-50/40' : '']"
          @click="selectAccount(account)"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate font-medium text-slate-900">{{ account.name.replace(/^Kas /, '') }}</p>
              <p class="text-xs text-slate-500">{{ account.role || 'Kas fisik' }}<template v-if="account.is_mine"> · kas saya</template></p>
            </div>
            <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><AppIcon name="cash" :size="16" /></span>
          </div>
          <p class="mt-2 text-xl font-bold tabular-nums" :class="account.balance < 0 ? 'text-red-600' : 'text-slate-900'">{{ rupiah(account.balance) }}</p>
          <p v-if="account.pending_out" class="text-xs text-amber-700">{{ rupiah(account.pending_out) }} menunggu konfirmasi</p>
          <p v-if="!account.is_active" class="text-xs text-slate-400">Pengguna nonaktif</p>
        </button>
      </div>
    </section>

    <section v-if="manager" class="mb-5">
      <div class="mb-2 flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold text-slate-700">Rekening bank</h2>
        <button class="btn-secondary btn-sm" @click="openBank()"><AppIcon name="plus" :size="14" /> Rekening</button>
      </div>
      <div class="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
        <div
          v-for="account in banks"
          :key="account.id"
          class="card card-hover cursor-pointer p-4"
          :class="[selectedId === account.id ? 'ring-2 ring-brand-500' : '', !account.is_active ? 'opacity-60' : '']"
          @click="selectAccount(account)"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate font-medium text-slate-900">{{ account.name }}</p>
              <p class="truncate text-xs text-slate-500">
                {{ [account.bank_name, account.account_number, account.account_holder].filter(Boolean).join(' · ') || 'Rekening' }}<template v-if="!account.is_active"> · nonaktif</template>
              </p>
            </div>
            <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-700"><AppIcon name="bank" :size="16" /></span>
          </div>
          <p class="mt-2 text-xl font-bold tabular-nums" :class="account.balance < 0 ? 'text-red-600' : 'text-slate-900'">{{ rupiah(account.balance) }}</p>
          <div class="mt-2 flex flex-wrap gap-1" @click.stop>
            <button class="btn-secondary btn-sm" :disabled="!account.is_active" @click="openTransfer('tarik', account)">Tarik tunai</button>
            <button class="btn-secondary btn-sm" @click="openAdjust(account)">Sesuaikan</button>
            <button class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Ubah rekening" @click="openBank(account)"><AppIcon name="pencil" :size="14" /></button>
          </div>
        </div>
      </div>
    </section>

    <!-- Serah terima saya yang belum dikonfirmasi -->
    <div v-if="outgoing.length" class="card mb-4 divide-y divide-slate-100">
      <p class="px-4 py-2.5 text-sm font-semibold text-slate-700">Menunggu konfirmasi penerima</p>
      <div v-for="item in outgoing" :key="item.id" class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
        <div class="min-w-0 flex-1">
          <p><b class="tabular-nums">{{ rupiah(item.amount) }}</b> {{ item.from.name.replace(/^Kas /, '') }} → {{ item.to.name.replace(/^Kas /, '') }}</p>
          <p class="text-xs text-slate-500">{{ item.number }} · {{ waktu(item.created_at) }}</p>
        </div>
        <button v-if="item.can_cancel" class="btn-secondary btn-sm" @click="act(item, 'cancel')">Batalkan</button>
      </div>
    </div>

    <!-- Tab -->
    <div class="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1">
      <button class="tab" :class="{ 'tab-active': tab === 'mutations' }" @click="switchTab('mutations')">Mutasi {{ selected ? selected.name : '' }}</button>
      <button class="tab" :class="{ 'tab-active': tab === 'history' }" @click="switchTab('history')">Riwayat Perpindahan</button>
    </div>

    <Transition name="page" mode="out-in">
      <div v-if="tab === 'mutations'" key="mutations" class="card overflow-hidden">
        <div class="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-4">
          <DateRange v-model:from="range.from" v-model:to="range.to" @change="loadLedger" />
          <div v-if="manager && selected" class="flex gap-2">
            <button class="btn-secondary btn-sm" @click="openAdjust(selected)">Penyesuaian saldo</button>
          </div>
        </div>
        <div v-if="ledger" class="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 text-sm sm:grid-cols-4">
          <div><p class="text-xs text-slate-500">Saldo awal</p><p class="font-semibold tabular-nums">{{ rupiah(ledger.opening) }}</p></div>
          <div><p class="text-xs text-slate-500">Masuk</p><p class="font-semibold text-emerald-700 tabular-nums">{{ rupiah(ledger.total_in) }}</p></div>
          <div><p class="text-xs text-slate-500">Keluar</p><p class="font-semibold text-red-600 tabular-nums">{{ rupiah(ledger.total_out) }}</p></div>
          <div><p class="text-xs text-slate-500">Saldo akhir</p><p class="font-semibold tabular-nums">{{ rupiah(ledger.closing) }}</p></div>
        </div>
        <div class="table-wrap">
          <table v-stack class="table">
            <thead><tr><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th>Oleh</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Saldo</th></tr></thead>
            <tbody>
              <tr v-for="row in ledger?.data || []" :key="row.id">
                <td class="whitespace-nowrap">{{ tanggal(row.date) }}</td>
                <td>{{ row.type_label }}</td>
                <td class="max-w-80">
                  <RouterLink v-if="row.reference_type === 'sale'" :to="{ name: 'sale', params: { id: row.reference_id } }" class="font-medium text-brand-700 hover:underline">{{ row.reference_number }}</RouterLink>
                  <span v-else-if="row.reference_number" class="font-medium">{{ row.reference_number }}</span>
                  <span v-if="row.description" class="block truncate text-xs text-slate-500">{{ row.description }}</span>
                </td>
                <td class="text-slate-500">{{ row.user || '-' }}</td>
                <td class="num text-emerald-700">{{ row.amount > 0 ? number(row.amount) : '' }}</td>
                <td class="num text-red-600">{{ row.amount < 0 ? number(-row.amount) : '' }}</td>
                <td class="num font-medium">{{ number(row.balance) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <EmptyState v-if="!loadingLedger && ledger && !ledger.data.length" icon="cash" title="Tidak ada mutasi" text="Tidak ada uang masuk / keluar pada periode ini." />
      </div>

      <div v-else key="history" class="card overflow-hidden">
        <div class="border-b border-slate-100 p-4">
          <select v-model="historyStatus" class="input max-w-60" @change="loadHistory()">
            <option value="">Semua status</option>
            <option value="menunggu">Menunggu konfirmasi</option>
            <option value="selesai">Selesai</option>
            <option value="ditolak">Ditolak</option>
            <option value="dibatalkan">Dibatalkan</option>
          </select>
        </div>
        <div class="table-wrap">
          <table v-stack class="table">
            <thead><tr><th>No.</th><th>Jenis</th><th>Dari</th><th>Ke</th><th class="num">Jumlah</th><th>Status</th><th>Keterangan</th></tr></thead>
            <tbody>
              <tr v-for="item in history" :key="item.id">
                <td class="whitespace-nowrap"><span class="font-medium">{{ item.number }}</span><span class="block text-xs text-slate-500">{{ waktu(item.created_at) }}</span></td>
                <td>{{ kindLabels[item.kind] }}</td>
                <td>{{ item.from.name }}</td>
                <td>{{ item.to.name }}</td>
                <td class="num font-medium">{{ rupiah(item.amount, false) }}</td>
                <td>
                  <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset" :class="statusStyles[item.status]">{{ item.status_label }}</span>
                  <span v-if="item.confirmed_by && item.status !== 'dibatalkan'" class="block text-xs text-slate-500">{{ item.confirmed_by }} · {{ waktu(item.confirmed_at) }}</span>
                </td>
                <td class="max-w-64 text-xs text-slate-500">
                  <span v-if="item.reference" class="block">Bukti: {{ item.reference }}</span>
                  <span v-if="item.notes" class="block truncate">{{ item.notes }}</span>
                  <span v-if="item.reject_reason" class="block text-red-600">Ditolak: {{ item.reject_reason }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <EmptyState v-if="!history.length" icon="switch" title="Belum ada perpindahan kas" />
        <PaginationBar :meta="historyMeta" @page="loadHistory" />
      </div>
    </Transition>

    <!-- Modal perpindahan -->
    <AppModal v-if="transfer" :title="modes[transfer.mode].title" @close="transfer = null">
      <form id="transfer-form" class="space-y-3" @submit.prevent="submitTransfer">
        <p class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{{ modes[transfer.mode].hint }}</p>
        <div>
          <label class="label">Dari</label>
          <select v-if="transfer.mode === 'tarik'" v-model="transfer.from_account_id" class="input">
            <option v-for="bank in banks.filter((account) => account.is_active)" :key="bank.id" :value="bank.id">{{ bank.name }}</option>
          </select>
          <p v-else class="input flex items-center bg-slate-50">{{ transferSource?.name }}</p>
          <p class="mt-1 text-xs text-slate-500">
            Saldo tersedia <b class="tabular-nums">{{ rupiah(available(transferSource)) }}</b>
            <template v-if="transferSource?.pending_out"> ({{ rupiah(transferSource.pending_out) }} sedang menunggu konfirmasi)</template>
          </p>
          <p v-if="errors.from_account_id" class="error-text">{{ errors.from_account_id }}</p>
        </div>
        <div>
          <label class="label">Ke</label>
          <select v-if="transfer.mode === 'setor'" v-model="transfer.to_account_id" class="input" :class="{ 'input-error': errors.to_account_id }" required>
            <option v-for="bank in banks.filter((account) => account.is_active)" :key="bank.id" :value="bank.id">{{ bank.name }}</option>
          </select>
          <select v-else-if="transfer.mode === 'serah'" v-model="transfer.to_account_id" class="input" :class="{ 'input-error': errors.to_account_id }" required>
            <option :value="null" disabled>Pilih penerima…</option>
            <option v-for="account in handoverTargets" :key="account.id" :value="account.id">{{ account.name.replace(/^Kas /, '') }}{{ account.role ? ` — ${account.role}` : '' }}</option>
          </select>
          <p v-else class="input flex items-center bg-slate-50">{{ myDrawer?.name }}</p>
          <p v-if="errors.to_account_id" class="error-text">{{ errors.to_account_id }}</p>
        </div>
        <div>
          <label class="label">Jumlah</label>
          <MoneyInput v-model="transfer.amount" :invalid="!!errors.amount" />
          <p v-if="errors.amount" class="error-text">{{ errors.amount }}</p>
          <button v-if="available(transferSource) > 0" type="button" class="mt-1 text-xs text-brand-700 hover:underline" @click="transfer.amount = available(transferSource)">Semua ({{ rupiah(available(transferSource)) }})</button>
        </div>
        <div v-if="transfer.mode !== 'serah'">
          <label class="label">No. bukti / referensi <span class="font-normal text-slate-400">(opsional)</span></label>
          <input v-model="transfer.reference" class="input" placeholder="mis. no. slip setoran" />
        </div>
        <div>
          <label class="label">Catatan <span class="font-normal text-slate-400">(opsional)</span></label>
          <input v-model="transfer.notes" class="input" />
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="transfer = null">Batal</button>
        <button class="btn-primary" type="submit" form="transfer-form" :disabled="saving || !transfer.amount">{{ saving ? 'Menyimpan…' : transfer.mode === 'serah' ? 'Kirim ke Penerima' : 'Simpan' }}</button>
      </template>
    </AppModal>

    <!-- Modal penyesuaian -->
    <AppModal v-if="adjust" :title="`Penyesuaian ${adjust.account.name}`" @close="adjust = null">
      <form id="adjust-form" class="space-y-3" @submit.prevent="submitAdjust">
        <p class="text-sm text-slate-600">Saldo saat ini <b class="tabular-nums">{{ rupiah(adjust.account.balance) }}</b>. Gunakan untuk saldo awal rekening atau koreksi.</p>
        <div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button type="button" class="tab justify-center" :class="{ 'tab-active': adjust.direction === 1 }" @click="adjust.direction = 1">Tambah</button>
          <button type="button" class="tab justify-center" :class="{ 'tab-active': adjust.direction === -1 }" @click="adjust.direction = -1">Kurangi</button>
        </div>
        <div>
          <label class="label">Jumlah</label>
          <MoneyInput v-model="adjust.amount" :invalid="!!errors.amount" />
          <p v-if="errors.amount" class="error-text">{{ errors.amount }}</p>
          <p class="mt-1 text-xs text-slate-500">Saldo menjadi <b class="tabular-nums">{{ rupiah(adjust.account.balance + adjust.direction * (adjust.amount || 0)) }}</b></p>
        </div>
        <div>
          <label class="label">Alasan</label>
          <input v-model="adjust.reason" class="input" :class="{ 'input-error': errors.reason }" required />
          <p v-if="errors.reason" class="error-text">{{ errors.reason }}</p>
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="adjust = null">Batal</button>
        <button class="btn-primary" type="submit" form="adjust-form" :disabled="saving || !adjust.amount">Simpan</button>
      </template>
    </AppModal>

    <!-- Modal rekening -->
    <AppModal v-if="bankForm" :title="bankForm.id ? 'Ubah Rekening' : 'Rekening Baru'" @close="bankForm = null">
      <form id="bank-form" class="space-y-3" @submit.prevent="saveBank">
        <div>
          <label class="label">Nama rekening</label>
          <input v-model="bankForm.name" class="input" :class="{ 'input-error': errors.name }" placeholder="mis. BCA Toko / QRIS" required />
          <p v-if="errors.name" class="error-text">{{ errors.name }}</p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="label">Bank</label><input v-model="bankForm.bank_name" class="input" placeholder="mis. BCA" /></div>
          <div><label class="label">No. rekening</label><input v-model="bankForm.account_number" class="input" /></div>
        </div>
        <div><label class="label">Atas nama</label><input v-model="bankForm.account_holder" class="input" /></div>
        <label class="flex items-center gap-2 text-sm"><input v-model="bankForm.is_active" type="checkbox" class="h-4 w-4 rounded border-slate-300" /> Aktif</label>
        <p class="text-xs text-slate-500">Rekening tujuan tiap metode non tunai (Transfer, QRIS, Kartu) diatur di Pengaturan Aplikasi.</p>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="bankForm = null">Batal</button>
        <button class="btn-primary" type="submit" form="bank-form" :disabled="saving">Simpan</button>
      </template>
    </AppModal>
  </div>
</template>
