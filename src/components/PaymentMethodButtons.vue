<script setup>
import { computed } from 'vue'
import { useMetaStore } from '../stores/meta'

/**
 * Pilihan metode pembayaran berupa tombol (seperti di kasir), dipakai form pembayaran keluar/masuk.
 * exclude: metode yang disembunyikan, mis. ['va'].
 */
const props = defineProps({ exclude: { type: Array, default: () => [] } })
const model = defineModel({ type: String, default: 'tunai' })
const meta = useMetaStore()
const methods = computed(() => meta.payment_methods.filter((method) => !props.exclude.includes(method.value)))
</script>

<template>
  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup">
    <button
      v-for="method in methods"
      :key="method.value"
      type="button"
      role="radio"
      :aria-checked="model === method.value"
      class="rounded-lg border px-2 py-2.5 text-sm font-medium"
      :class="model === method.value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'"
      @click="model = method.value"
    >
      {{ method.label.replace('Kartu Debit/Kredit', 'Kartu Debit') }}
    </button>
  </div>
</template>
