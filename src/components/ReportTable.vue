<script setup>
import { number, percent, rupiah, tanggal } from '../utils/format'
import EmptyState from './EmptyState.vue'

/**
 * Tabel generik untuk hasil ReportService (columns/rows/totals).
 */
defineProps({
  report: { type: Object, required: true },
})

function format(value, type) {
  if (value === null || value === undefined) return '-'
  switch (type) {
    case 'money':
      return rupiah(value, false)
    case 'number':
      return number(value)
    case 'percent':
      return percent(value)
    case 'date':
      return tanggal(value)
    default:
      return value
  }
}

const isNumeric = (type) => ['money', 'number', 'percent'].includes(type)
const rowClass = (row) => ({
  'font-semibold bg-slate-50': row.style === 'subtotal',
  'font-bold bg-brand-50 text-brand-800': row.style === 'total',
})
</script>

<template>
  <div class="table-wrap">
    <table v-stack class="table">
      <thead>
        <tr>
          <th v-for="column in report.columns" :key="column.key" :class="{ num: isNumeric(column.type) }">{{ column.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in report.rows" :key="index" :class="rowClass(row)">
          <td
            v-for="column in report.columns"
            :key="column.key"
            :class="[{ num: isNumeric(column.type), 'text-red-600': isNumeric(column.type) && row[column.key] < 0 }, row.style === 'indent' && column.key === 'label' ? 'pl-8' : '']"
          >
            {{ format(row[column.key], column.type) }}
          </td>
        </tr>
      </tbody>
      <tfoot v-if="report.totals && report.rows.length">
        <tr>
          <td v-for="(column, index) in report.columns" :key="column.key" :class="{ num: isNumeric(column.type) }">
            <template v-if="index === 0">TOTAL</template>
            <template v-else-if="column.key in report.totals">{{ format(report.totals[column.key], column.type) }}</template>
          </td>
        </tr>
      </tfoot>
    </table>
    <EmptyState v-if="!report.rows.length" icon="chart" title="Tidak ada data" text="Tidak ada transaksi pada periode ini." />
  </div>
</template>
