<script setup>
import { daysAgo, monthEnd, monthStart, today } from '../utils/format'

const from = defineModel('from', { type: String, required: true })
const to = defineModel('to', { type: String, required: true })
const emit = defineEmits(['change'])

const presets = [
  { label: 'Hari ini', range: () => [today(), today()] },
  { label: 'Kemarin', range: () => [daysAgo(1), daysAgo(1)] },
  { label: '7 hari', range: () => [daysAgo(6), today()] },
  { label: 'Bulan ini', range: () => [monthStart(), today()] },
  { label: 'Bulan lalu', range: () => [monthStart(-1), monthEnd(-1)] },
]

function apply(preset) {
  ;[from.value, to.value] = preset.range()
  emit('change')
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-2">
    <div>
      <label class="label text-xs">Dari</label>
      <input v-model="from" type="date" class="input" :max="to" @change="emit('change')" />
    </div>
    <div>
      <label class="label text-xs">Sampai</label>
      <input v-model="to" type="date" class="input" :min="from" @change="emit('change')" />
    </div>
    <div class="flex flex-wrap gap-1">
      <button v-for="preset in presets" :key="preset.label" type="button" class="btn-secondary btn-sm" @click="apply(preset)">
        {{ preset.label }}
      </button>
    </div>
  </div>
</template>
