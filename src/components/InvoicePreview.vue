<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BillDocument from './BillDocument.vue'

/**
 * Pratinjau nota tagihan A4 dengan tagihan contoh, diperkecil mengikuti lebar kolom (dokumen asli 794 px = A4 96 dpi).
 */
const props = defineProps({
  store: { type: Object, required: true },
  template: { type: Object, required: true },
  dueDays: { type: Number, default: 10 },
})

const PAGE_WIDTH = 794
const frame = ref(null)
const page = ref(null)
const scale = ref(0.5)
const height = ref(0)
let observer

function measure() {
  if (!frame.value || !page.value) return
  scale.value = Math.min(1, frame.value.clientWidth / PAGE_WIDTH)
  height.value = page.value.offsetHeight * scale.value
}
onMounted(() => {
  observer = new ResizeObserver(measure)
  observer.observe(frame.value)
  observer.observe(page.value)
})
onBeforeUnmount(() => observer?.disconnect())

const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const bill = computed(() => {
  const today = new Date()
  const due = new Date(today)
  due.setDate(due.getDate() + props.dueDays)
  const month = iso(today).slice(0, 7)
  const sales = [
    { id: 1, number: `BON-${month.replace('-', '')}-0001`, business_date: `${month}-03`, total: 351000, items: [{ id: 1, product_name: 'Kopi Kapal Api Sachet', qty: 3, unit: 'RENTENG' }, { id: 2, product_name: 'Indomie Kaldu Ayam', qty: 2, unit: 'DUS' }] },
    { id: 2, number: `BON-${month.replace('-', '')}-0002`, business_date: `${month}-17`, total: 138000, items: [{ id: 3, product_name: 'Indomie Goreng', qty: 1, unit: 'DUS' }] },
  ]
  return {
    number: `TG-${month.replace('-', '')}-0001`,
    status: 'belum',
    is_overdue: false,
    period: month,
    issue_date: iso(today),
    due_date: iso(due),
    customer: { name: 'Budi Santoso', address: 'Jl. Melati No. 5', phone: '0812-3456-7890' },
    sales,
    total: 489000,
    paid: 0,
    remaining: 489000,
  }
})
</script>

<template>
  <div ref="frame" class="overflow-hidden" :style="{ height: `${height}px` }">
    <div ref="page" class="origin-top-left" :style="{ width: `${PAGE_WIDTH}px`, transform: `scale(${scale})` }">
      <BillDocument :bill="bill" :store="store" :template="template" preview />
    </div>
  </div>
</template>
