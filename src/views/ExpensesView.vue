<script setup>
import { onMounted, reactive, ref } from 'vue'
import http, { errorMessage, validationErrors } from '../api/http'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { monthStart, rupiah, tanggal, today } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import BankSelect from '../components/BankSelect.vue'
import AppModal from '../components/AppModal.vue'
import DateRange from '../components/DateRange.vue'
import EmptyState from '../components/EmptyState.vue'
import MoneyInput from '../components/MoneyInput.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'

const meta = useMetaStore()
const toast = useToastStore()

const filters = reactive({ from: monthStart(), to: today(), category: '' })
const expenses = ref([])
const pagination = ref(null)
const totalAmount = ref(0)
const loading = ref(false)

async function load(page = 1) {
  loading.value = true
  try {
    const { data } = await http.get('/expenses', { params: { ...filters, page } })
    expenses.value = data.data
    pagination.value = data.meta
    totalAmount.value = data.total_amount
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

const form = ref(null)
const errors = ref({})
const saving = ref(false)

function openForm(expense = null) {
  errors.value = {}
  form.value = expense
    ? { ...expense, cash_account_id: expense.payment_method === 'tunai' ? null : expense.cash_account_id }
    : { id: null, date: meta.business_date || today(), category: meta.expense_categories[0] || '', description: '', amount: 0, payment_method: 'tunai', cash_account_id: null }
}

async function save() {
  saving.value = true
  errors.value = {}
  try {
    if (form.value.id) {
      await http.put(`/expenses/${form.value.id}`, form.value)
    } else {
      await http.post('/expenses', form.value)
    }
    toast.success('Pengeluaran disimpan.')
    form.value = null
    load()
  } catch (e) {
    errors.value = validationErrors(e)
    if (!Object.keys(errors.value).length) toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

async function remove(expense) {
  if (!confirm(`Hapus pengeluaran "${expense.description}"?`)) return
  try {
    await http.delete(`/expenses/${expense.id}`)
    toast.success('Pengeluaran dihapus.')
    load()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

onMounted(() => load())
</script>

<template>
  <div class="stagger">
    <PageHeader title="Pengeluaran" subtitle="Biaya operasional toko (mengurangi laba & kas laci bila tunai)">
      <template #actions>
        <button class="btn-primary" @click="openForm()"><AppIcon name="plus" :size="16" /> Catat Pengeluaran</button>
      </template>
    </PageHeader>

    <div class="card mb-4 space-y-3 p-4">
      <DateRange v-model:from="filters.from" v-model:to="filters.to" @change="load()" />
      <select v-model="filters.category" class="input sm:w-64" @change="load()">
        <option value="">Semua kategori</option>
        <option v-for="category in meta.expense_categories" :key="category" :value="category">{{ category }}</option>
      </select>
    </div>

    <div class="card overflow-hidden">
      <div class="table-wrap">
        <table v-stack class="table">
          <thead><tr><th>Tanggal</th><th>Kategori</th><th>Keterangan</th><th>Pembayaran</th><th class="num">Jumlah</th><th>Oleh</th><th></th></tr></thead>
          <tbody>
            <tr v-for="expense in expenses" :key="expense.id">
              <td>{{ tanggal(expense.date) }}</td>
              <td>{{ expense.category }}</td>
              <td class="max-w-72 truncate">{{ expense.description }}</td>
              <td>{{ expense.payment_label }}</td>
              <td class="num font-medium">{{ rupiah(expense.amount, false) }}</td>
              <td>{{ expense.user }}</td>
              <td class="text-right">
                <button class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Ubah" @click="openForm(expense)"><AppIcon name="pencil" :size="16" /></button>
                <button class="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Hapus" @click="remove(expense)"><AppIcon name="trash" :size="16" /></button>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="expenses.length">
            <tr><td colspan="4">Total periode ini</td><td class="num">{{ rupiah(totalAmount, false) }}</td><td colspan="2"></td></tr>
          </tfoot>
        </table>
      </div>
      <EmptyState v-if="!loading && !expenses.length" icon="wallet" title="Belum ada pengeluaran" />
      <PaginationBar :meta="pagination" @page="load" />
    </div>

    <AppModal v-if="form" :title="form.id ? 'Ubah Pengeluaran' : 'Catat Pengeluaran'" @close="form = null">
      <form id="expense-form" class="grid gap-3 sm:grid-cols-2" @submit.prevent="save">
        <div>
          <label class="label">Tanggal</label>
          <input v-model="form.date" type="date" class="input" :max="today()" :class="{ 'input-error': errors.date }" />
          <p v-if="errors.date" class="error-text">{{ errors.date }}</p>
        </div>
        <div>
          <label class="label">Kategori</label>
          <input v-model="form.category" class="input" list="expense-categories" required />
          <datalist id="expense-categories"><option v-for="category in meta.expense_categories" :key="category" :value="category" /></datalist>
        </div>
        <div class="sm:col-span-2">
          <label class="label">Keterangan</label>
          <input v-model="form.description" class="input" :class="{ 'input-error': errors.description }" required />
        </div>
        <div>
          <label class="label">Jumlah</label>
          <MoneyInput v-model="form.amount" :invalid="!!errors.amount" />
          <p v-if="errors.amount" class="error-text">{{ errors.amount }}</p>
        </div>
        <div>
          <label class="label">Dibayar dengan</label>
          <select v-model="form.payment_method" class="input">
            <option v-for="method in meta.payment_methods" :key="method.value" :value="method.value">{{ method.label }}</option>
          </select>
          <p class="mt-1 text-xs text-slate-500">{{ form.payment_method === 'tunai' ? `Tunai = diambil dari kas fisik ${form.id ? 'pencatat' : 'Anda'}.` : 'Non tunai = diambil dari rekening bank.' }}</p>
        </div>
        <BankSelect v-model="form.cash_account_id" :method="form.payment_method" label="Dari rekening" />
      </form>
      <template #footer>
        <button class="btn-secondary" @click="form = null">Batal</button>
        <button class="btn-primary" type="submit" form="expense-form" :disabled="saving">Simpan</button>
      </template>
    </AppModal>
  </div>
</template>
