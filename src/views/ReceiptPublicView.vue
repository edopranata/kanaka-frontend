<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import http from '../api/http'
import { footerLines, headerLines, promoLabel } from '../utils/escpos'
import { number, rupiah, taxLabel, waktu } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'

/**
 * Struk digital untuk pembeli (dibuka dari QR di struk). Tanpa login & tanpa menu aplikasi.
 */
const route = useRoute()
const sale = ref(null)
const store = ref(null)
const state = ref('loading') // loading | ready | notfound | error
const print = () => window.print()

onMounted(async () => {
  try {
    const { data } = await http.get(`/receipts/${route.params.token}`)
    sale.value = data.data
    store.value = data.store
    state.value = 'ready'
    document.title = `Struk ${data.data.number} · ${data.store.name}`
  } catch (e) {
    state.value = e.response?.status === 404 ? 'notfound' : 'error'
    document.title = 'Struk digital'
  }
})
</script>

<template>
  <div class="min-h-dvh bg-slate-100 px-4 py-8 print:bg-white print:p-0">
    <div v-if="state === 'loading'" class="mx-auto max-w-sm animate-pulse rounded-2xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm">Memuat struk…</div>

    <div v-else-if="state !== 'ready'" class="mx-auto max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
      <AppIcon name="receipt" :size="36" class="mx-auto text-slate-300" />
      <p class="mt-3 font-semibold text-slate-800">{{ state === 'notfound' ? 'Struk tidak ditemukan' : 'Struk belum dapat dimuat' }}</p>
      <p class="mt-1 text-sm text-slate-500">
        {{ state === 'notfound' ? 'Pastikan QR yang di-scan berasal dari struk yang benar.' : 'Periksa koneksi internet lalu muat ulang halaman.' }}
      </p>
    </div>

    <article v-else class="mx-auto max-w-sm animate-fade-up rounded-2xl bg-white p-6 font-mono text-[13px] leading-relaxed text-slate-800 shadow-sm print:max-w-none print:rounded-none print:shadow-none">
      <header class="text-center">
        <p class="font-sans text-lg font-bold text-slate-900">{{ store.name }}</p>
        <p v-for="(line, index) in headerLines(store)" :key="index" class="text-xs text-slate-500">{{ line }}</p>
        <p class="mt-2 inline-block rounded-full bg-brand-50 px-3 py-0.5 font-sans text-xs font-semibold text-brand-700">Struk digital</p>
      </header>

      <div class="my-3 border-t border-dashed border-slate-300" />
      <dl class="space-y-0.5">
        <div class="flex justify-between gap-3"><dt class="text-slate-500">No</dt><dd class="text-right">{{ sale.number }}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-slate-500">Tanggal</dt><dd class="text-right">{{ waktu(sale.created_at) }}</dd></div>
        <div v-if="sale.cashier" class="flex justify-between gap-3"><dt class="text-slate-500">Kasir</dt><dd class="text-right">{{ sale.cashier }}</dd></div>
        <div v-if="sale.customer" class="flex justify-between gap-3"><dt class="text-slate-500">Pelanggan</dt><dd class="text-right">{{ sale.customer.name }}</dd></div>
      </dl>

      <div class="my-3 border-t border-dashed border-slate-300" />
      <ul class="space-y-2">
        <li v-for="item in sale.items" :key="item.id">
          <p class="font-medium">{{ item.product_name }}</p>
          <p v-if="item.variant" class="pl-3 text-xs text-slate-500">({{ item.variant }})</p>
          <p class="flex justify-between gap-3 pl-3">
            <span>{{ item.qty }} {{ item.unit }} × {{ number(item.price) }}</span>
            <span>{{ number(item.qty * item.price) }}</span>
          </p>
          <p v-if="item.discount" class="flex justify-between gap-3 pl-3 text-rose-700">
            <span>{{ promoLabel(item) }}</span>
            <span>-{{ number(item.discount) }}</span>
          </p>
        </li>
      </ul>

      <div class="my-3 border-t border-dashed border-slate-300" />
      <dl class="space-y-0.5">
        <div class="flex justify-between"><dt>Subtotal</dt><dd>{{ number(sale.subtotal) }}</dd></div>
        <div v-if="sale.discount" class="flex justify-between"><dt>Diskon</dt><dd>-{{ number(sale.discount) }}</dd></div>
        <div v-if="sale.tax" class="flex justify-between"><dt>{{ taxLabel(sale) }}</dt><dd>{{ number(sale.tax) }}</dd></div>
        <div class="flex justify-between pt-1 font-sans text-base font-bold text-slate-900"><dt>TOTAL</dt><dd>{{ rupiah(sale.total) }}</dd></div>
        <template v-if="sale.payment_method === 'piutang'">
          <p class="pt-2 text-center font-bold">BON — BAYAR NANTI</p>
          <p class="text-center text-xs text-slate-500">Ditagih pada tagihan bulanan</p>
        </template>
        <template v-else>
          <div class="flex justify-between"><dt>{{ sale.payment_label }}</dt><dd>{{ number(sale.paid) }}</dd></div>
          <div v-if="sale.change" class="flex justify-between"><dt>Kembali</dt><dd>{{ number(sale.change) }}</dd></div>
        </template>
      </dl>
      <p v-if="sale.status === 'batal'" class="mt-3 rounded-lg bg-red-50 py-1.5 text-center font-sans text-sm font-bold text-red-700">TRANSAKSI DIBATALKAN</p>

      <template v-if="footerLines(store.receipt_footer).length">
        <div class="my-3 border-t border-dashed border-slate-300" />
        <p v-for="(line, index) in footerLines(store.receipt_footer)" :key="index" class="text-center text-xs text-slate-600">{{ line }}</p>
      </template>

      <div class="no-print mt-5 flex justify-center">
        <button class="btn-secondary btn-sm font-sans" @click="print"><AppIcon name="printer" :size="14" /> Cetak / Simpan PDF</button>
      </div>
    </article>
  </div>
</template>
