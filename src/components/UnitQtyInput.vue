<script setup>
import { computed, ref, watch } from 'vue'
import { number } from '../utils/format'
import AppSelect from './AppSelect.vue'
import NumberInput from './NumberInput.vue'

/**
 * Isian jumlah stok dengan pilihan satuan, mis. 33 BKS = 11.550 GRM. Nilai v-model selalu dalam satuan dasar
 * (stok disimpan dalam satuan dasar).
 * - mixed: satu isian per satuan untuk hitung fisik campuran (mis. 32 BKS + 120 GRM).
 * - compact: isian tanpa tombol − / + untuk di dalam tabel.
 * - Peringatan bila jumlah dalam satuan dasar kurang dari satu satuan besar yang isinya ≥ 50 (mis. 33 GRM untuk kopi
 *   350 GRM per BKS), dengan tombol untuk memakai satuan besar itu.
 */
const props = defineProps({
  /** Satuan produk: [{ name, conversion }]; satuan dasar boleh tidak ikut. */
  units: { type: Array, default: () => [] },
  baseUnit: { type: String, required: true },
  mixed: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})
const model = defineModel({ type: [Number, null], default: null })

/** Satuan dasar + satuan besar (isi unik), urut dari yang terkecil. */
const options = computed(() => {
  const larger = new Map()
  for (const unit of props.units) {
    const conversion = Number(unit.conversion)
    if (conversion > 1 && unit.name && !larger.has(conversion)) larger.set(conversion, String(unit.name).toUpperCase())
  }
  return [{ name: props.baseUnit, conversion: 1 }, ...[...larger].sort((a, b) => a[0] - b[0]).map(([conversion, name]) => ({ name, conversion }))]
})
const total = (qty, conversion) => (qty === null || qty === '' || Number.isNaN(Number(qty)) ? null : Math.round(Number(qty) * conversion))

// ---- Satu satuan ----
const conversion = ref(1)
const qty = ref(null)
const emitted = ref(null)

function emit(value) {
  emitted.value = value
  model.value = value
}

/** Tampilkan nilai dari luar: pakai satuan yang sedang dipilih bila habis dibagi, selain itu satuan dasar. */
function fromModel(value) {
  if (value === null || value === '') {
    qty.value = null
  } else if (Number(value) % conversion.value === 0) {
    qty.value = Number(value) / conversion.value
  } else {
    conversion.value = 1
    qty.value = Number(value)
  }
}

watch(qty, (value) => emit(total(value, conversion.value)))
watch(conversion, (value) => emit(total(qty.value, value)))

const fmt = (value) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value)
const selected = computed(() => options.value.find((option) => option.conversion === conversion.value) || options.value[0])
const suggestion = computed(() => {
  if (conversion.value !== 1 || !(Number(qty.value) > 0)) return null
  const next = options.value.find((option) => option.conversion >= 50)
  return next && Number(qty.value) < next.conversion ? next : null
})

// ---- Campuran (opname) ----
const mixedActive = computed(() => props.mixed && options.value.length > 1)
const parts = ref([])
const descending = computed(() => [...options.value].reverse())

/** Pecah nilai satuan dasar ke satuan terbesar lebih dulu, mis. 11.270 GRM → 32 BKS + 70 GRM. */
function splitModel(value) {
  let rest = Number(value) || 0
  parts.value = descending.value.map((option) => {
    const count = Math.floor(rest / option.conversion)
    rest -= count * option.conversion
    return count
  })
}

watch(parts, (values) => emit(values.reduce((sum, value, index) => sum + (total(value, descending.value[index].conversion) || 0), 0)), { deep: true })

// Nilai dari luar (mis. form dibuka / direset) dan satuan produk yang berubah di form.
watch(
  [model, () => options.value.map((option) => option.conversion).join(',')],
  ([value], [, previousUnits]) => {
    const unitsChanged = previousUnits !== undefined && previousUnits !== options.value.map((option) => option.conversion).join(',')
    if (!options.value.some((option) => option.conversion === conversion.value)) conversion.value = 1
    if (value === emitted.value && !unitsChanged) return
    emitted.value = value
    if (mixedActive.value) splitModel(value)
    else fromModel(value)
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <div v-if="mixedActive" class="flex flex-wrap gap-2">
      <template v-for="(option, index) in descending" :key="option.conversion">
        <label v-if="compact" class="flex min-w-0 flex-1 basis-24 items-center gap-1.5">
          <input v-model.number="parts[index]" type="number" min="0" class="input min-w-0 text-right tabular-nums" :class="{ 'input-error': invalid }" @focus="$event.target.select()" />
          <span class="text-xs text-slate-500">{{ option.name }}</span>
        </label>
        <NumberInput v-else v-model="parts[index]" :min="0" :suffix="option.name" :invalid="invalid" class="min-w-0 flex-1 basis-32" />
      </template>
    </div>
    <div v-else class="flex items-center gap-2">
      <template v-if="compact">
        <input v-model.number="qty" type="number" min="0" class="input min-w-0 flex-1 text-right tabular-nums" :class="{ 'input-error': invalid }" @focus="$event.target.select()" />
        <span v-if="options.length === 1" class="text-xs text-slate-500">{{ baseUnit }}</span>
      </template>
      <NumberInput v-else v-model="qty" :min="0" :suffix="options.length > 1 ? '' : baseUnit" :invalid="invalid" class="min-w-0 flex-1" />
      <AppSelect v-if="options.length > 1" v-model="conversion" class="input w-24 shrink-0" :options="options" value-key="conversion" label-key="name" :searchable="false" aria-label="Satuan" />
    </div>
    <p v-if="mixedActive" class="mt-1 text-xs text-slate-500">Total {{ number(model || 0) }} {{ baseUnit }}</p>
    <p v-else-if="selected.conversion > 1 && qty !== null" class="mt-1 text-xs text-slate-500">= {{ number(model || 0) }} {{ baseUnit }} ({{ selected.name }} isi {{ number(selected.conversion) }})</p>
    <p v-if="suggestion" class="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
      {{ number(qty) }} {{ baseUnit }} hanya {{ fmt(qty / suggestion.conversion) }} {{ suggestion.name }}.
      <button type="button" class="font-semibold underline" @click="conversion = suggestion.conversion">Maksud Anda {{ number(qty) }} {{ suggestion.name }}?</button>
    </p>
  </div>
</template>
