<script setup>
import { computed, ref } from 'vue'

const model = defineModel({ type: Number, default: 0 })
const props = defineProps({
  invalid: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '0' },
  /** Jumlah desimal yang boleh diisi (pemisah koma), mis. 2 untuk HPP per gram. Bawaan: rupiah utuh. */
  decimals: { type: Number, default: 0 },
})

const formatter = computed(() => new Intl.NumberFormat('id-ID', { maximumFractionDigits: props.decimals }))
// Saat mengetik desimal, teks disimpan apa adanya (mis. "142,") agar koma tidak hilang; dirapikan saat keluar isian.
const typing = ref(null)

function parse(text) {
  if (!props.decimals) return Number(String(text).replace(/\D/g, '')) || 0
  const [whole, fraction = ''] = String(text).replace(/\./g, '').split(',')
  const value = Number(`${whole.replace(/\D/g, '') || 0}.${fraction.replace(/\D/g, '').slice(0, props.decimals) || 0}`)
  return Number.isFinite(value) ? value : 0
}

const display = computed({
  get: () => typing.value ?? (model.value ? formatter.value.format(model.value) : ''),
  set: (text) => {
    if (props.decimals) typing.value = text
    model.value = parse(text)
  },
})
</script>

<template>
  <div class="relative">
    <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">Rp</span>
    <input
      v-model="display"
      type="text"
      :inputmode="decimals ? 'decimal' : 'numeric'"
      class="input pl-9 text-right tabular-nums"
      :class="{ 'input-error': invalid }"
      :disabled="disabled"
      :placeholder="placeholder"
      @blur="typing = null"
    />
  </div>
</template>
