<script setup>
import { ref } from 'vue'
import { cameraSupported } from '../utils/barcode'
import AppIcon from './AppIcon.vue'
import BarcodeScanner from './BarcodeScanner.vue'

/**
 * Tombol kamera untuk scan barcode. Tidak tampil bila perangkat/browser tidak mendukung kamera (atau bukan HTTPS).
 * Lihat BarcodeScanner untuk arti props.
 */
defineOptions({ inheritAttrs: false })

defineProps({
  title: { type: String, default: 'Scan barcode' },
  continuous: { type: Boolean, default: false },
  resolve: { type: Function, default: null },
})
const emit = defineEmits(['detected'])

const supported = cameraSupported()
const open = ref(false)
</script>

<template>
  <button
    v-if="supported"
    v-bind="$attrs"
    type="button"
    class="inline-flex items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-brand-700"
    title="Scan barcode dengan kamera"
    aria-label="Scan barcode dengan kamera"
    @click="open = true"
  >
    <AppIcon name="camera" :size="20" />
  </button>
  <BarcodeScanner v-if="open" :title="title" :continuous="continuous" :resolve="resolve" @detected="emit('detected', $event)" @close="open = false" />
</template>
