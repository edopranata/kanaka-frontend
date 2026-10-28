<script setup>
import { computed, useAttrs } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * Isian angka dengan tombol − / + (tanpa panah kecil bawaan browser) dan satuan opsional, mis. "jam".
 * class/style untuk kotak luar; atribut lain (id, required, placeholder) diteruskan ke <input>.
 */
defineOptions({ inheritAttrs: false })
const props = defineProps({
  min: { type: [Number, String], default: null },
  max: { type: [Number, String], default: null },
  step: { type: [Number, String], default: 1 },
  suffix: { type: String, default: '' },
  invalid: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
const model = defineModel({ type: [Number, String, null], default: null })
const attrs = useAttrs()
const inputAttrs = computed(() => Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style')))

const bound = (value) => (value === null || value === '' ? null : Number(value))
const decimals = computed(() => (String(props.step).split('.')[1] || '').length)
const current = computed(() => (model.value === '' || model.value === null ? null : Number(model.value)))
const atMin = computed(() => bound(props.min) !== null && current.value !== null && current.value <= bound(props.min))
const atMax = computed(() => bound(props.max) !== null && current.value !== null && current.value >= bound(props.max))

function clamp(value) {
  let next = value
  if (bound(props.min) !== null) next = Math.max(bound(props.min), next)
  if (bound(props.max) !== null) next = Math.min(bound(props.max), next)
  return Number(next.toFixed(decimals.value))
}

function stepBy(direction) {
  const base = current.value ?? bound(props.min) ?? 0
  model.value = clamp(current.value === null ? base : base + direction * Number(props.step))
}

function onBlur() {
  if (current.value !== null && !Number.isNaN(current.value)) model.value = clamp(current.value)
}
</script>

<template>
  <div
    class="flex items-stretch overflow-hidden rounded-lg border bg-white shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:ring-2"
    :class="[
      invalid ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-100' : 'border-slate-300 focus-within:border-brand-500 focus-within:ring-brand-200',
      { 'bg-slate-100': disabled },
      attrs.class,
    ]"
    :style="attrs.style"
  >
    <button type="button" tabindex="-1" class="grid w-9 shrink-0 place-items-center text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200 disabled:pointer-events-none disabled:opacity-35" :disabled="disabled || atMin" aria-label="Kurangi" @click="stepBy(-1)">
      <AppIcon name="minus" :size="16" />
    </button>
    <input
      v-bind="inputAttrs"
      v-model.number="model"
      type="number"
      inputmode="decimal"
      :min="min ?? undefined"
      :max="max ?? undefined"
      :step="step"
      :disabled="disabled"
      class="w-full min-w-0 flex-1 border-x border-slate-200 bg-transparent px-2 py-2 text-center text-sm tabular-nums focus:outline-none disabled:cursor-not-allowed"
      @focus="$event.target.select()"
      @blur="onBlur"
    />
    <span v-if="suffix" class="grid shrink-0 place-items-center border-r border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-500">{{ suffix }}</span>
    <button type="button" tabindex="-1" class="grid w-9 shrink-0 place-items-center text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200 disabled:pointer-events-none disabled:opacity-35" :disabled="disabled || atMax" aria-label="Tambah" @click="stepBy(1)">
      <AppIcon name="plus" :size="16" />
    </button>
  </div>
</template>
