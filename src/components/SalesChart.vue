<script setup>
import { computed, ref } from 'vue'
import { number, rupiah, tanggal } from '../utils/format'

/**
 * Grafik kolom penjualan harian (satu seri). Hover/tap kolom untuk detail.
 */
const props = defineProps({
  data: { type: Array, required: true }, // [{ date, total, count }]
})

const hovered = ref(null)

function niceMax(value) {
  if (value <= 0) return 1000
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= value / 4) * magnitude
  return Math.ceil(value / step) * step
}

const max = computed(() => niceMax(Math.max(...props.data.map((day) => day.total), 0)))
const ticks = computed(() => [1, 0.75, 0.5, 0.25, 0].map((ratio) => max.value * ratio))

const decimal = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

function shortNumber(value) {
  if (value >= 1_000_000) return `${decimal.format(value / 1_000_000)} jt`
  if (value >= 1_000) return `${decimal.format(value / 1_000)} rb`
  return number(value)
}

const dayLabel = (date) => new Date(`${date}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
</script>

<template>
  <div class="relative">
    <div class="flex h-48 gap-2">
      <!-- Sumbu Y -->
      <div class="flex w-12 shrink-0 flex-col justify-between text-right text-[11px] text-slate-400 tabular-nums">
        <span v-for="tick in ticks" :key="tick" class="-translate-y-1.5 leading-none">{{ shortNumber(tick) }}</span>
      </div>
      <div class="relative flex-1">
        <div class="pointer-events-none absolute inset-0 flex flex-col justify-between">
          <div v-for="tick in ticks" :key="tick" class="border-t border-slate-100" />
        </div>
        <div class="absolute inset-0 flex items-end">
          <button
            v-for="(day, index) in data"
            :key="day.date"
            type="button"
            class="group relative flex h-full flex-1 items-end justify-center focus:outline-none"
            :aria-label="`${tanggal(day.date)}: ${rupiah(day.total)}, ${day.count} transaksi`"
            @mouseenter="hovered = index"
            @mouseleave="hovered = null"
            @focus="hovered = index"
            @blur="hovered = null"
          >
            <span
              class="block w-full max-w-6 origin-bottom animate-bar-grow rounded-t transition-[opacity,height] duration-500"
              :class="hovered !== null && hovered !== index ? 'opacity-50' : ''"
              :style="{ height: `${(day.total / max) * 100}%`, minHeight: day.total ? '2px' : '0', backgroundColor: '#14a38f', marginInline: '1px', animationDelay: `${index * 35}ms` }"
            />
          </button>
        </div>
        <!-- Tooltip -->
        <Transition name="fade">
        <div
          v-if="hovered !== null"
          class="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-3 py-2 text-xs whitespace-nowrap text-white shadow-lg transition-[left] duration-200 ease-out"
          :style="{ left: `${((hovered + 0.5) / data.length) * 100}%` }"
        >
          <p class="font-medium">{{ tanggal(data[hovered].date, 'long') }}</p>
          <p class="tabular-nums">{{ rupiah(data[hovered].total) }}</p>
          <p class="text-slate-300">{{ data[hovered].count }} transaksi</p>
        </div>
        </Transition>
      </div>
    </div>
    <div class="mt-1 flex gap-2 pl-14 text-[11px] text-slate-400">
      <span v-for="(day, index) in data" :key="day.date" class="min-w-0 flex-1 text-center whitespace-nowrap">
        <template v-if="index % 2 === data.length % 2">
          <span class="sm:hidden">{{ Number(day.date.slice(8)) }}</span>
          <span class="hidden sm:inline">{{ dayLabel(day.date) }}</span>
        </template>
      </span>
    </div>
  </div>
</template>
