<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http, { errorMessage } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { hariTanggal, number, rupiah, waktu } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const meta = useMetaStore()
const toast = useToastStore()

const closing = ref(null)
const products = ref([])
const expenses = ref([])
const print = () => window.print()

async function load() {
  try {
    const { data } = await http.get(`/closings/${route.params.id}`)
    closing.value = data.data
    products.value = data.products
    expenses.value = data.expenses
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function cancel() {
  if (!confirm('Batalkan closing ini? Transaksi pada tanggal tersebut akan terbuka kembali untuk dikoreksi.')) return
  try {
    await http.delete(`/closings/${closing.value.id}`)
    toast.success('Closing dibatalkan.')
    meta.load(true)
    router.replace({ name: 'closings' })
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

onMounted(load)
</script>

<template>
  <div class="stagger">
    <PageHeader :title="closing ? `Closing ${hariTanggal(closing.date)}` : 'Detail Closing'" :back="{ name: 'closings' }">
      <template v-if="closing" #actions>
        <button class="btn-secondary" @click="print"><AppIcon name="printer" :size="16" /> Cetak</button>
        <button v-if="auth.can('closings.cancel')" class="btn-danger no-print" @click="cancel"><AppIcon name="ban" :size="16" /> Batalkan Closing</button>
      </template>
    </PageHeader>

    <template v-if="closing">
      <div class="card mb-4 flex flex-wrap items-center gap-x-8 gap-y-2 p-4 text-sm">
        <span><span class="text-slate-500">Metode:</span> <StatusBadge :status="closing.method" /></span>
        <span><span class="text-slate-500">Ditutup oleh:</span> {{ closing.closed_by || 'Sistem (otomatis 00:00)' }}</span>
        <span><span class="text-slate-500">Waktu:</span> {{ waktu(closing.closed_at) }}</span>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <section class="card p-5 text-sm">
          <h2 class="mb-3 font-semibold">Penjualan</h2>
          <dl class="space-y-2">
            <div class="flex justify-between"><dt class="text-slate-500">Jumlah transaksi</dt><dd class="tabular-nums">{{ number(closing.transaction_count) }}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Transaksi dibatalkan</dt><dd class="tabular-nums">{{ number(closing.void_count) }}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Item terjual</dt><dd class="tabular-nums">{{ number(closing.item_count) }}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Penjualan kotor</dt><dd class="tabular-nums">{{ rupiah(closing.gross_sales) }}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Diskon</dt><dd class="tabular-nums">-{{ rupiah(closing.discount_total) }}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Pajak</dt><dd class="tabular-nums">{{ rupiah(closing.tax_total) }}</dd></div>
            <div class="flex justify-between border-t border-slate-100 pt-2 font-semibold"><dt>Total penjualan</dt><dd class="tabular-nums">{{ rupiah(closing.net_sales) }}</dd></div>
          </dl>
          <template v-if="closing.gross_profit !== undefined">
            <h2 class="mt-5 mb-3 font-semibold">Laba</h2>
            <dl class="space-y-2">
              <div class="flex justify-between"><dt class="text-slate-500">HPP</dt><dd class="tabular-nums">{{ rupiah(closing.cost_total) }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-500">Laba kotor</dt><dd class="tabular-nums">{{ rupiah(closing.gross_profit) }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-500">Pengeluaran</dt><dd class="tabular-nums">-{{ rupiah(closing.expense_total) }}</dd></div>
              <div class="flex justify-between border-t border-slate-100 pt-2 font-semibold"><dt>Laba bersih</dt><dd class="tabular-nums" :class="{ 'text-red-600': closing.net_profit < 0 }">{{ rupiah(closing.net_profit) }}</dd></div>
            </dl>
          </template>
        </section>

        <section class="card p-5 text-sm">
          <h2 class="mb-3 font-semibold">Metode pembayaran</h2>
          <dl class="space-y-2">
            <div v-for="payment in closing.payments" :key="payment.method" class="flex justify-between">
              <dt class="text-slate-500">{{ payment.label }} ({{ payment.count }})</dt><dd class="tabular-nums">{{ rupiah(payment.total) }}</dd>
            </div>
            <p v-if="!closing.payments.length" class="text-slate-500">Tidak ada transaksi.</p>
            <div v-if="closing.receivable_collected" class="flex justify-between border-t border-slate-100 pt-2"><dt class="text-slate-500">Penerimaan tagihan piutang</dt><dd class="tabular-nums">{{ rupiah(closing.receivable_collected) }}</dd></div>
          </dl>
          <template v-if="closing.cash_breakdown.length">
            <h2 class="mt-5 mb-3 font-semibold">Kas fisik per pengguna</h2>
            <div class="space-y-2">
              <div v-for="row in closing.cash_breakdown" :key="row.account_id" class="rounded-lg bg-slate-50 p-2.5">
                <p class="flex justify-between font-medium"><span>{{ row.name }}</span><span class="tabular-nums">{{ rupiah(row.actual ?? row.expected) }}</span></p>
                <p class="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                  <span>Awal {{ number(row.opening) }}</span>
                  <span>Seharusnya {{ number(row.expected) }}</span>
                  <span v-if="row.deposited">Setor bank {{ number(row.deposited) }}</span>
                  <span v-if="row.difference" class="font-semibold" :class="row.difference < 0 ? 'text-red-600' : 'text-amber-600'">Selisih {{ number(row.difference) }}</span>
                </p>
              </div>
            </div>
            <dl class="mt-3 space-y-2">
              <div class="flex justify-between"><dt class="text-slate-500">Saldo awal</dt><dd class="tabular-nums">{{ rupiah(closing.opening_cash) }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-500">Kas seharusnya</dt><dd class="tabular-nums">{{ rupiah(closing.expected_cash) }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-500">Kas fisik</dt><dd class="tabular-nums">{{ closing.actual_cash === null ? 'Tidak dihitung' : rupiah(closing.actual_cash) }}</dd></div>
              <div v-if="closing.cash_difference !== null" class="flex justify-between font-semibold" :class="closing.cash_difference < 0 ? 'text-red-600' : closing.cash_difference > 0 ? 'text-amber-600' : 'text-emerald-600'">
                <dt>Selisih</dt><dd class="tabular-nums">{{ rupiah(closing.cash_difference) }}</dd>
              </div>
              <div class="flex justify-between rounded-lg bg-brand-50 px-3 py-2 font-semibold text-brand-800">
                <dt>Saldo kas akhir</dt><dd class="tabular-nums">{{ rupiah(closing.closing_balance) }}</dd>
              </div>
            </dl>
          </template>
          <template v-else>
            <h2 class="mt-5 mb-3 font-semibold">Kas laci</h2>
            <dl class="space-y-2">
              <div class="flex justify-between"><dt class="text-slate-500">Saldo kas awal</dt><dd class="tabular-nums">{{ rupiah(closing.opening_cash) }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-500">+ Penjualan tunai</dt><dd class="tabular-nums">{{ rupiah(closing.cash_sales) }}</dd></div>
              <div v-if="closing.receivable_cash" class="flex justify-between"><dt class="text-slate-500">+ Pelunasan piutang tunai</dt><dd class="tabular-nums">{{ rupiah(closing.receivable_cash) }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-500">− Pengeluaran tunai</dt><dd class="tabular-nums">{{ rupiah(closing.cash_expenses) }}</dd></div>
              <div v-if="closing.consignment_cash" class="flex justify-between"><dt class="text-slate-500">− Bayar titipan tunai</dt><dd class="tabular-nums">{{ rupiah(closing.consignment_cash) }}</dd></div>
              <div class="flex justify-between border-t border-slate-100 pt-2 font-semibold"><dt>Kas seharusnya</dt><dd class="tabular-nums">{{ rupiah(closing.expected_cash) }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-500">Kas fisik</dt><dd class="tabular-nums">{{ closing.actual_cash === null ? 'Tidak dihitung' : rupiah(closing.actual_cash) }}</dd></div>
              <div v-if="closing.cash_difference !== null" class="flex justify-between font-semibold" :class="closing.cash_difference < 0 ? 'text-red-600' : closing.cash_difference > 0 ? 'text-amber-600' : 'text-emerald-600'">
                <dt>Selisih</dt><dd class="tabular-nums">{{ rupiah(closing.cash_difference) }}</dd>
              </div>
              <div class="flex justify-between"><dt class="text-slate-500">− Disetor / diambil</dt><dd class="tabular-nums">{{ rupiah(closing.cash_out) }}</dd></div>
              <div class="flex justify-between rounded-lg bg-brand-50 px-3 py-2 font-semibold text-brand-800">
                <dt>Saldo kas akhir</dt><dd class="tabular-nums">{{ rupiah(closing.closing_balance) }}</dd>
              </div>
            </dl>
          </template>
          <template v-if="closing.bank_breakdown.length">
            <h2 class="mt-5 mb-3 font-semibold">Rekening bank</h2>
            <dl class="space-y-2">
              <div v-for="bank in closing.bank_breakdown" :key="bank.account_id" class="flex justify-between gap-3">
                <dt class="text-slate-500">{{ bank.name }} <span class="text-xs">(awal {{ number(bank.opening) }})</span></dt><dd class="tabular-nums">{{ rupiah(bank.expected) }}</dd>
              </div>
            </dl>
          </template>
          <p v-if="closing.notes" class="mt-4 rounded-lg bg-slate-50 p-3 text-slate-600">{{ closing.notes }}</p>
        </section>

        <section class="card overflow-hidden text-sm">
          <h2 class="border-b border-slate-100 px-5 py-3 font-semibold">Pengeluaran</h2>
          <ul class="divide-y divide-slate-100">
            <li v-for="expense in expenses" :key="expense.id" class="flex justify-between gap-3 px-5 py-2.5">
              <span class="min-w-0"><span class="block truncate">{{ expense.description }}</span><span class="text-xs text-slate-500">{{ expense.category }} · {{ expense.payment_label }}</span></span>
              <span class="shrink-0 tabular-nums">{{ rupiah(expense.amount) }}</span>
            </li>
            <li v-if="!expenses.length" class="px-5 py-4 text-slate-500">Tidak ada pengeluaran.</li>
          </ul>
        </section>
      </div>

      <section class="card mt-4 overflow-hidden">
        <h2 class="border-b border-slate-100 px-5 py-3 font-semibold">Penjualan per produk</h2>
        <div class="table-wrap">
          <table v-stack class="table">
            <thead><tr><th>Produk</th><th class="num">Qty</th><th class="num">Total</th></tr></thead>
            <tbody>
              <tr v-for="product in products" :key="product.product_id">
                <td>{{ product.product_name }}</td>
                <td class="num">{{ number(product.qty) }} {{ product.unit }}</td>
                <td class="num">{{ rupiah(product.total, false) }}</td>
              </tr>
              <tr v-if="!products.length"><td colspan="3" class="py-6 text-center text-slate-500">Tidak ada penjualan.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
