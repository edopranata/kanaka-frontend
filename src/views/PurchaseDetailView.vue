<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import http, { errorMessage, postTransaction, REPLAYED_MESSAGE, transactionKey, validationErrors } from '../api/http'
import { useToastStore } from '../stores/toast'
import { useMetaStore } from '../stores/meta'
import { confirmDialog } from '../stores/confirm'
import { number, rupiah, tanggal, tanggalAngka, waktu } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import BankSelect from '../components/BankSelect.vue'
import MoneyInput from '../components/MoneyInput.vue'
import ConfirmReason from '../components/ConfirmReason.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const toast = useToastStore()
const purchase = ref(null)
const voiding = ref(false)
const saving = ref(false)
const error = ref('')

const print = () => window.print()
const meta = useMetaStore()

// ---- Pembayaran hutang (pembelian tempo) ----
const tempo = computed(() => purchase.value?.payment_term === 'tempo')
const canPay = computed(() => auth.can('purchases.pay') && purchase.value?.status === 'selesai' && purchase.value?.remaining > 0)
const statusStyle = { lunas: 'bg-emerald-50 text-emerald-700', sebagian: 'bg-amber-50 text-amber-700', belum: 'bg-slate-100 text-slate-600' }
const payForm = ref(null)
const payErrors = ref({})
let payKey = null

function openPay() {
  payErrors.value = {}
  payForm.value = { amount: purchase.value.remaining, payment_method: 'transfer', cash_account_id: null, notes: '' }
}
async function submitPay() {
  saving.value = true
  payErrors.value = {}
  const body = { ...payForm.value, cash_account_id: payForm.value.payment_method === 'tunai' ? null : payForm.value.cash_account_id }
  payKey = transactionKey(payKey, { purchase: purchase.value.id, paid: purchase.value.paid, amount: body.amount, method: body.payment_method })
  try {
    const { data, replayed } = await postTransaction(`/purchases/${purchase.value.id}/payments`, body, payKey.key)
    purchase.value = data.data
    payForm.value = null
    payKey = null
    toast.success(replayed ? REPLAYED_MESSAGE : data.data.remaining ? `Pembayaran dicatat. Sisa hutang ${rupiah(data.data.remaining)}.` : 'Pembayaran dicatat. Pembelian lunas.')
  } catch (e) {
    payErrors.value = validationErrors(e)
    if (!Object.keys(payErrors.value).length) toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}
async function cancelPayment(payment) {
  if (!(await confirmDialog({ title: 'Batalkan pembayaran', message: `Batalkan pembayaran ${rupiah(payment.amount)} tanggal ${tanggalAngka(payment.date)}? Uang dikembalikan ke ${payment.cash_account || 'kas pembayar'}.`, confirmLabel: 'Batalkan pembayaran', tone: 'danger' }))) return
  try {
    const { data } = await http.delete(`/purchases/${purchase.value.id}/payments/${payment.id}`)
    purchase.value = data.data
    toast.success('Pembayaran dibatalkan.')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function load() {
  try {
    const { data } = await http.get(`/purchases/${route.params.id}`)
    purchase.value = data.data
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function voidPurchase(reason) {
  saving.value = true
  error.value = ''
  try {
    const { data } = await http.post(`/purchases/${purchase.value.id}/void`, { reason })
    purchase.value = data.data
    voiding.value = false
    toast.success('Pembelian dibatalkan dan stok dikurangi.')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="stagger">
    <PageHeader :title="purchase?.number || 'Detail Pembelian'" :subtitle="purchase ? tanggal(purchase.date, 'long') : ''" :back="{ name: 'purchases' }">
      <template v-if="purchase" #actions>
        <button class="btn-secondary" @click="print"><AppIcon name="printer" :size="16" /> Cetak</button>
        <button v-if="canPay" class="btn-primary" @click="openPay"><AppIcon name="cash" :size="16" /> Bayar Hutang</button>
        <button v-if="purchase.status === 'selesai' && auth.can('purchases.void')" class="btn-danger" @click="voiding = true"><AppIcon name="ban" :size="16" /> Batalkan</button>
      </template>
    </PageHeader>

    <div v-if="purchase" class="grid gap-5 lg:grid-cols-3">
      <section class="card overflow-hidden lg:col-span-2">
        <div class="table-wrap">
          <table v-stack class="table">
            <thead><tr><th>SKU</th><th>Produk</th><th class="num">Qty</th><th class="num">Harga Beli</th><th class="num">Subtotal</th></tr></thead>
            <tbody>
              <tr v-for="item in purchase.items" :key="item.id">
                <td class="text-slate-500">{{ item.sku }}</td>
                <td class="font-medium">{{ item.product_name }}</td>
                <td class="num">
                  {{ number(item.qty) }} {{ item.unit }}
                  <p v-if="item.conversion > 1" class="text-xs text-slate-500">= {{ number(item.base_qty) }}</p>
                </td>
                <td class="num">{{ rupiah(item.cost, false) }}</td>
                <td class="num">{{ rupiah(item.subtotal, false) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr><td colspan="4" class="text-right">Subtotal</td><td class="num">{{ rupiah(purchase.subtotal, false) }}</td></tr>
              <tr v-if="purchase.discount"><td colspan="4" class="text-right">Diskon</td><td class="num">-{{ rupiah(purchase.discount, false) }}</td></tr>
              <tr><td colspan="4" class="text-right">Total</td><td class="num text-brand-700">{{ rupiah(purchase.total) }}</td></tr>
            </tfoot>
          </table>
        </div>
      </section>
      <section class="card space-y-3 p-5 text-sm">
        <div class="flex items-center justify-between"><span class="text-slate-500">Status</span><StatusBadge :status="purchase.status" /></div>
        <div class="flex justify-between gap-3"><span class="text-slate-500">Supplier</span><span>{{ purchase.supplier?.name || '-' }}</span></div>
        <div class="flex justify-between gap-3"><span class="text-slate-500">No. faktur</span><span>{{ purchase.invoice_ref || '-' }}</span></div>
        <div v-if="!tempo" class="flex justify-between gap-3">
          <span class="text-slate-500">Pembayaran</span>
          <span class="text-right">{{ purchase.payment_label || '-' }}<span v-if="purchase.cash_account" class="block text-xs text-slate-500">dari {{ purchase.cash_account }}</span></span>
        </div>
        <div class="flex justify-between gap-3"><span class="text-slate-500">Dicatat oleh</span><span>{{ purchase.user }}</span></div>
        <div class="flex justify-between gap-3"><span class="text-slate-500">Waktu input</span><span>{{ waktu(purchase.created_at) }}</span></div>
        <p v-if="purchase.notes" class="rounded-lg bg-slate-50 p-3 text-slate-600">{{ purchase.notes }}</p>
        <div v-if="tempo" class="space-y-2 rounded-xl border border-slate-200 p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold text-slate-800">Pembayaran tempo</span>
            <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="statusStyle[purchase.payment_status]">{{ purchase.payment_status_label }}</span>
          </div>
          <div class="flex justify-between gap-3" :class="purchase.is_overdue ? 'font-medium text-red-600' : ''">
            <span :class="purchase.is_overdue ? '' : 'text-slate-500'">Jatuh tempo</span><span>{{ tanggalAngka(purchase.due_date) }}<template v-if="purchase.is_overdue"> (lewat)</template></span>
          </div>
          <div class="flex justify-between gap-3"><span class="text-slate-500">Sudah dibayar</span><span class="tabular-nums">{{ rupiah(purchase.paid) }}</span></div>
          <div class="flex justify-between gap-3 font-semibold"><span>Sisa hutang</span><span class="tabular-nums" :class="purchase.remaining ? 'text-amber-700' : 'text-emerald-700'">{{ rupiah(purchase.remaining) }}</span></div>
          <ul v-if="purchase.payments?.length" class="divide-y divide-slate-100 border-t border-slate-100 pt-1">
            <li v-for="payment in purchase.payments" :key="payment.id" class="flex items-start justify-between gap-2 py-1.5 text-xs">
              <div class="min-w-0">
                <p class="font-medium text-slate-700">{{ tanggalAngka(payment.date) }} · {{ payment.payment_label }}</p>
                <p class="text-slate-500">{{ payment.cash_account || '-' }} · {{ payment.user }}<template v-if="payment.notes"> · {{ payment.notes }}</template></p>
              </div>
              <span class="flex shrink-0 items-center gap-1">
                <span class="tabular-nums">{{ rupiah(payment.amount) }}</span>
                <button v-if="auth.can('purchases.pay')" type="button" class="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Batalkan pembayaran" @click="cancelPayment(payment)"><AppIcon name="x" :size="12" /></button>
              </span>
            </li>
          </ul>
        </div>
        <div v-if="purchase.status === 'batal'" class="rounded-lg bg-red-50 p-3 text-red-700">
          <p class="font-medium">Dibatalkan {{ waktu(purchase.voided_at) }} oleh {{ purchase.voided_by }}</p>
          <p>Alasan: {{ purchase.void_reason }}</p>
        </div>
      </section>
    </div>

    <AppModal v-if="payForm" title="Bayar Hutang Pembelian" @close="payForm = null">
      <form id="pay-form" class="space-y-4" @submit.prevent="submitPay">
        <div class="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm">
          <div>
            <p class="font-semibold text-amber-900">{{ purchase.supplier?.name || 'Supplier' }} · {{ purchase.number }}</p>
            <p class="text-xs text-amber-800">Jatuh tempo {{ tanggalAngka(purchase.due_date) }}<template v-if="purchase.is_overdue"> (lewat)</template></p>
          </div>
          <p class="text-right text-amber-900">Sisa hutang<br /><b class="text-lg tabular-nums">{{ rupiah(purchase.remaining) }}</b></p>
        </div>
        <div>
          <label class="label">Jumlah dibayar</label>
          <MoneyInput v-model="payForm.amount" :invalid="!!payErrors.amount" />
          <div class="mt-1.5 flex gap-2"><button type="button" class="btn-secondary btn-sm" @click="payForm.amount = purchase.remaining">Lunasi {{ rupiah(purchase.remaining) }}</button></div>
          <p v-if="payErrors.amount" class="error-text">{{ payErrors.amount }}</p>
        </div>
        <div>
          <label class="label">Metode pembayaran</label>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              v-for="method in meta.payment_methods"
              :key="method.value"
              type="button"
              class="rounded-lg border px-2 py-2.5 text-sm font-medium"
              :class="payForm.payment_method === method.value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:bg-slate-50'"
              @click="payForm.payment_method = method.value"
            >
              {{ method.label.replace('Kartu Debit/Kredit', 'Kartu Debit') }}
            </button>
          </div>
          <p v-if="payErrors.payment_method" class="error-text">{{ payErrors.payment_method }}</p>
          <p v-else class="mt-1 text-xs text-slate-500">{{ payForm.payment_method === 'tunai' ? 'Diambil dari kas fisik (laci) Anda.' : 'Mengurangi saldo rekening bank.' }}</p>
        </div>
        <BankSelect v-model="payForm.cash_account_id" :method="payForm.payment_method" label="Dari rekening" />
        <div>
          <label class="label">Catatan</label>
          <input v-model="payForm.notes" class="input" maxlength="255" placeholder="Opsional, mis. no. bukti transfer" />
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="payForm = null">Batal</button>
        <button class="btn-primary" type="submit" form="pay-form" :disabled="saving || !payForm.amount"><AppIcon name="check" :size="16" /> {{ saving ? 'Menyimpan…' : `Bayar ${rupiah(payForm.amount || 0)}` }}</button>
      </template>
    </AppModal>

    <ConfirmReason
      v-if="voiding"
      title="Batalkan pembelian"
      :message="tempo && purchase.payments?.length ? 'Pembelian tempo ini sudah ada pembayarannya — batalkan pembayarannya terlebih dahulu.' : 'Stok barang akan dikurangi kembali sesuai jumlah pembelian. Tidak dapat dibatalkan bila stok sudah terjual.'"
      :saving="saving"
      :error="error"
      @close="voiding = false"
      @confirm="voidPurchase"
    />
  </div>
</template>
