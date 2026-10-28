<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

// Pemotong foto profil: geser untuk mengatur posisi, perbesar dengan slider. Hasil: persegi OUTPUT px (WebP/JPEG).
const props = defineProps({
  file: { type: File, required: true },
})
defineExpose({ crop })

const VIEW = 240
const OUTPUT = 320

const source = URL.createObjectURL(props.file)
const image = ref(null)
const zoom = ref(1)
const offset = ref({ x: 0, y: 0 })
const error = ref('')

const baseScale = computed(() => (image.value ? VIEW / Math.min(image.value.naturalWidth, image.value.naturalHeight) : 1))
const scale = computed(() => baseScale.value * zoom.value)
const size = computed(() => (image.value ? { w: image.value.naturalWidth * scale.value, h: image.value.naturalHeight * scale.value } : { w: 0, h: 0 }))

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
function place(x, y) {
  offset.value = { x: clamp(x, VIEW - size.value.w, 0), y: clamp(y, VIEW - size.value.h, 0) }
}

function onLoad(event) {
  image.value = event.target
  place((VIEW - size.value.w) / 2, (VIEW - size.value.h) / 2)
}
function onError() {
  error.value = 'File ini bukan gambar yang bisa dibaca. Pilih foto JPG, PNG, atau WebP.'
}

// Perbesar dari titik tengah bingkai.
watch(zoom, (next, previous) => {
  if (!image.value) return
  const [from, to] = [baseScale.value * previous, baseScale.value * next]
  const center = { x: (VIEW / 2 - offset.value.x) / from, y: (VIEW / 2 - offset.value.y) / from }
  place(VIEW / 2 - center.x * to, VIEW / 2 - center.y * to)
})

let drag = null
function startDrag(event) {
  drag = { x: event.clientX, y: event.clientY, start: { ...offset.value } }
  event.currentTarget.setPointerCapture(event.pointerId)
}
function moveDrag(event) {
  if (drag) place(drag.start.x + event.clientX - drag.x, drag.start.y + event.clientY - drag.y)
}
const endDrag = () => (drag = null)

function onWheel(event) {
  zoom.value = clamp(zoom.value - event.deltaY * 0.002, 1, 3)
}

/** @returns {Promise<Blob>} */
function crop() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = OUTPUT
  const ratio = OUTPUT / VIEW
  const context = canvas.getContext('2d')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, OUTPUT, OUTPUT)
  context.drawImage(image.value, offset.value.x * ratio, offset.value.y * ratio, size.value.w * ratio, size.value.h * ratio)
  // Browser tanpa encoder WebP otomatis menghasilkan PNG; JPEG sebagai cadangan terakhir.
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal memproses foto.'))), 'image/webp', 0.88),
  )
}

onBeforeUnmount(() => URL.revokeObjectURL(source))
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <template v-else>
      <div
        class="relative cursor-grab touch-none overflow-hidden rounded-2xl bg-slate-100 select-none active:cursor-grabbing"
        :style="{ width: `${VIEW}px`, height: `${VIEW}px` }"
        @pointerdown="startDrag"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @wheel.prevent="onWheel"
      >
        <img
          :src="source"
          alt=""
          draggable="false"
          class="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
          :style="{ width: `${size.w}px`, height: `${size.h}px`, transform: `translate(${offset.x}px, ${offset.y}px)` }"
          @load="onLoad"
          @error="onError"
        />
        <!-- Bingkai lingkaran: area di luar lingkaran digelapkan -->
        <div class="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(15,23,42,0.45)] ring-2 ring-white/80" />
      </div>
      <label class="flex w-full max-w-60 items-center gap-3 text-xs text-slate-500">
        <span>Perkecil</span>
        <input v-model.number="zoom" type="range" min="1" max="3" step="0.01" class="flex-1 accent-brand-600" aria-label="Perbesar foto" />
        <span>Perbesar</span>
      </label>
      <p class="text-center text-xs text-slate-500">Geser foto untuk mengatur posisi wajah di dalam lingkaran.</p>
    </template>
  </div>
</template>
