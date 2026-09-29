<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  hint: { type: String, default: '' },
  tone: { type: String, default: 'brand' },
})

const tones = {
  brand: 'border-l-brand-600',
  accent: 'border-l-accent-500',
  green: 'border-l-emerald-500',
  red: 'border-l-red-500',
  slate: 'border-l-slate-400',
}
</script>

<template>
  <div class="card card-hover border-l-4 p-4" :class="tones[tone]">
    <p class="text-xs font-medium tracking-wide text-slate-500 uppercase">{{ label }}</p>
    <p class="mt-1 text-lg font-semibold break-words text-slate-900 tabular-nums sm:text-2xl">{{ value }}</p>
    <p v-if="hint" class="mt-1 text-xs text-slate-500">{{ hint }}</p>
  </div>
</template>
