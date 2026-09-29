<script setup>
import { computed } from 'vue'

const model = defineModel({ type: Number, default: 0 })
defineProps({
  invalid: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '0' },
})

const display = computed({
  get: () => (model.value ? new Intl.NumberFormat('id-ID').format(model.value) : ''),
  set: (text) => {
    model.value = Number(String(text).replace(/\D/g, '')) || 0
  },
})
</script>

<template>
  <div class="relative">
    <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">Rp</span>
    <input
      v-model="display"
      type="text"
      inputmode="numeric"
      class="input pl-9 text-right tabular-nums"
      :class="{ 'input-error': invalid }"
      :disabled="disabled"
      :placeholder="placeholder"
    />
  </div>
</template>
