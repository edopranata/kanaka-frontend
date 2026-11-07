<script setup>
import { computed } from 'vue'
import { number, rupiah, tanggal } from '../utils/format'
import { invoiceHeader, periodLabel, textLines } from '../utils/invoice'
import StatusBadge from './StatusBadge.vue'

/**
 * Dokumen nota tagihan (A4): tampil di detail tagihan, dicetak, dan menjadi pratinjau di Pengaturan → Toko & Struk.
 * template = meta.invoice (judul, header kustom, catatan kaki, tanda tangan); header kosong = identitas toko.
 */
const props = defineProps({
  bill: { type: Object, required: true },
  store: { type: Object, required: true },
  template: { type: Object, default: () => ({}) },
  /** Pratinjau: tanpa tautan & tetap berbentuk tabel di layar kecil. */
  preview: { type: Boolean, default: false },
})

const name = computed(() => invoiceHeader(props.store, props.template).name)
const header = computed(() => invoiceHeader(props.store, props.template).lines)
const footer = computed(() => textLines(props.template.footer))
</script>

<template>
  <section :class="preview ? 'bg-white p-8' : 'card p-5 sm:p-8 print:border-0 print:p-0 print:shadow-none'">
    <div class="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-3">
      <div class="min-w-0">
        <p class="text-base leading-tight font-bold text-slate-900">{{ name }}</p>
        <p v-for="(line, index) in header" :key="index" class="text-xs leading-tight text-slate-500">{{ line }}</p>
      </div>
      <div class="text-right">
        <p class="text-xl leading-tight font-bold tracking-wide text-brand-700">{{ template.title || 'TAGIHAN' }}</p>
        <p class="text-sm leading-tight font-medium">{{ bill.number }}</p>
        <StatusBadge :status="bill.is_overdue ? 'jatuh_tempo' : bill.status" class="mt-0.5" />
      </div>
    </div>

    <div class="grid gap-4 border-b border-slate-200 py-3 text-xs sm:grid-cols-2" :class="{ 'grid-cols-2': preview }">
      <div class="leading-snug">
        <p class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Kepada</p>
        <p class="mt-0.5 font-semibold text-slate-900">{{ bill.customer.name }}</p>
        <p v-if="bill.customer.address" class="text-slate-600">{{ bill.customer.address }}</p>
        <p v-if="bill.customer.phone" class="text-slate-600">{{ bill.customer.phone }}</p>
      </div>
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 leading-snug sm:justify-self-end" :class="{ 'justify-self-end': preview }">
        <dt class="text-slate-500">Periode</dt><dd class="text-right font-medium">{{ periodLabel(bill.period) }}</dd>
        <dt class="text-slate-500">Tanggal tagihan</dt><dd class="text-right">{{ tanggal(bill.issue_date, 'long') }}</dd>
        <dt class="text-slate-500">Jatuh tempo</dt><dd class="text-right font-medium" :class="{ 'text-red-600': bill.is_overdue }">{{ tanggal(bill.due_date, 'long') }}</dd>
      </dl>
    </div>

    <div class="table-wrap" :class="{ '-mx-5 sm:mx-0': !preview }">
      <!-- Huruf & sel tabel lebih kecil dan rapat dari tabel aplikasi biasa (dokumen cetak). -->
      <table v-stack="!preview" class="table text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1">
        <thead>
          <tr><th>Tanggal</th><th>No. Bon</th><th>Barang</th><th class="num">Jumlah</th></tr>
        </thead>
        <tbody>
          <tr v-for="sale in bill.sales" :key="sale.id">
            <td>{{ tanggal(sale.business_date) }}</td>
            <td>
              <span v-if="preview">{{ sale.number }}</span>
              <RouterLink v-else :to="{ name: 'sale', params: { id: sale.id } }" class="text-brand-700 hover:underline print:text-slate-800">{{ sale.number }}</RouterLink>
            </td>
            <td class="whitespace-normal">
              <span v-for="(item, index) in sale.items" :key="item.id">{{ item.product_name }}{{ item.variant ? ` ${item.variant}` : '' }} ({{ number(item.qty) }} {{ item.unit }}){{ index < sale.items.length - 1 ? ', ' : '' }}</span>
            </td>
            <td class="num">{{ rupiah(sale.total, false) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr><td colspan="3" class="text-right">Total tagihan</td><td class="num">{{ rupiah(bill.total) }}</td></tr>
          <tr><td colspan="3" class="text-right">Sudah dibayar</td><td class="num">{{ rupiah(bill.paid) }}</td></tr>
          <tr><td colspan="3" class="text-right">Sisa tagihan</td><td class="num text-sm text-brand-700">{{ rupiah(bill.remaining) }}</td></tr>
        </tfoot>
      </table>
    </div>

    <div v-if="footer.length || template.signer" class="mt-4 flex flex-wrap items-start justify-between gap-6 text-xs leading-snug text-slate-600" :class="{ 'flex-nowrap': preview }">
      <div v-if="footer.length" class="min-w-0 flex-1">
        <p v-for="(line, index) in footer" :key="index" class="whitespace-pre-wrap">{{ line }}</p>
      </div>
      <div v-if="template.signer" class="ml-auto w-48 shrink-0 text-center">
        <p>Hormat kami,</p>
        <p class="mt-12 border-t border-slate-400 pt-1 font-semibold text-slate-900">{{ template.signer }}</p>
        <p v-if="template.signer_title" class="text-slate-500">{{ template.signer_title }}</p>
      </div>
    </div>
  </section>
</template>
