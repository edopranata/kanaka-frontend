<script setup>
import { onBeforeUnmount, ref } from 'vue'
import http from '../api/http'
import { number, rupiah } from '../utils/format'
import ScanButton from './ScanButton.vue'

/**
 * Kotak pencarian produk (nama/SKU/barcode). Enter pada kode persis langsung memilih produk.
 */
const props = defineProps({
  placeholder: { type: String, default: 'Cari nama / SKU / scan barcode…' },
  showPrice: { type: String, default: 'sell' },
  type: { type: String, default: '' },
  /** Sertakan produk nonaktif (tidak tampil di kasir) — untuk bahan paket, pembelian, dan stok. */
  includeInactive: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])

const term = ref('')
const results = ref([])
const open = ref(false)
const highlighted = ref(0)
const input = ref(null)
let timer = null

async function search() {
  const { data } = await http.get('/products', {
    params: { search: term.value, active: props.includeInactive ? undefined : 1, per_page: 10, type: props.type || undefined },
  })
  results.value = data.data
  highlighted.value = 0
  open.value = true
}

function onInput() {
  clearTimeout(timer)
  if (!term.value.trim()) {
    results.value = []
    open.value = false
    return
  }
  timer = setTimeout(search, 250)
}

async function onEnter() {
  clearTimeout(timer)
  const code = term.value.trim()
  if (!code) return
  if (open.value && results.value[highlighted.value]) {
    return choose(results.value[highlighted.value])
  }
  try {
    const { data } = await http.get('/products/lookup', { params: { code, include_inactive: props.includeInactive ? 1 : undefined } })
    if (props.type && data.data.type !== props.type) throw new Error('type')
    choose({ ...data.data, matched_unit_id: data.matched_unit_id })
  } catch {
    await search()
  }
}

/** Hasil scan kamera: kode persis langsung dipilih; ditampilkan di pemindai (nama produk / tidak ditemukan). */
async function scan(code) {
  try {
    const { data } = await http.get('/products/lookup', { params: { code, include_inactive: props.includeInactive ? 1 : undefined } })
    if (props.type && data.data.type !== props.type) return { ok: false, text: `${data.data.name} bukan ${props.type === 'paket' ? 'paket' : 'barang'}` }
    choose({ ...data.data, matched_unit_id: data.matched_unit_id })
    return { ok: true, text: data.data.name }
  } catch {
    return { ok: false, text: 'Produk tidak ditemukan' }
  }
}

function choose(product) {
  emit('select', product)
  term.value = ''
  results.value = []
  open.value = false
  input.value?.focus()
}

function move(step) {
  if (!results.value.length) return
  highlighted.value = (highlighted.value + step + results.value.length) % results.value.length
}

function close() {
  setTimeout(() => (open.value = false), 150)
}

onBeforeUnmount(() => clearTimeout(timer))
defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="relative">
    <ScanButton class="absolute top-1/2 right-1.5 z-10 h-8 w-8 -translate-y-1/2" title="Scan produk" continuous :resolve="scan" />
    <input
      ref="input"
      v-model="term"
      type="search"
      class="input pr-11"
      :placeholder="placeholder"
      autocomplete="off"
      @input="onInput"
      @keydown.enter.prevent="onEnter"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.esc="open = false"
      @blur="close"
    />
    <Transition name="pop">
    <div v-if="open" class="absolute inset-x-0 top-full z-30 mt-1 max-h-80 origin-top overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
      <p v-if="!results.length" class="px-3 py-3 text-sm text-slate-500">Produk tidak ditemukan.</p>
      <button
        v-for="(product, index) in results"
        :key="product.id"
        type="button"
        class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors"
        :class="index === highlighted ? 'bg-brand-50' : 'hover:bg-slate-50'"
        @mousedown.prevent="choose(product)"
      >
        <span class="min-w-0">
          <span class="block truncate font-medium text-slate-800">
            {{ product.name }}
            <span v-if="!product.is_active" class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-slate-500 uppercase">Nonaktif</span>
          </span>
          <span class="text-xs text-slate-500">
            {{ product.sku }} ·
            <template v-if="product.type === 'paket'">paket, tersedia {{ number(product.available ?? 0) }} {{ product.unit }}</template>
            <template v-else>stok {{ number(product.stock) }} {{ product.unit }}</template>
          </span>
        </span>
        <span class="shrink-0 tabular-nums text-slate-600">
          <template v-if="props.showPrice === 'cost'">{{ rupiah(product.cost_price) }}</template>
          <template v-else-if="product.sell_price">{{ rupiah(product.sell_price) }}</template>
          <span v-else class="text-xs text-amber-600">Belum ada harga</span>
        </span>
      </button>
    </div>
    </Transition>
  </div>
</template>
