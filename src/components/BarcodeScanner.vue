<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { cameraError, feedback, getDetector } from '../utils/barcode'
import AppIcon from './AppIcon.vue'

/**
 * Pemindai barcode layar penuh memakai kamera (belakang, bila ada).
 *
 * - resolve(code): fungsi async opsional → { ok, text } untuk ditampilkan (mis. nama produk / "tidak ditemukan").
 * - continuous: tetap terbuka untuk scan berikutnya (kasir / pembelian). Barcode yang sama baru dihitung lagi
 *   setelah sempat hilang dari kamera ±1,5 detik (barang yang dipegang diam tidak ditambah berulang).
 */
const props = defineProps({
  title: { type: String, default: 'Scan barcode' },
  continuous: { type: Boolean, default: false },
  resolve: { type: Function, default: null },
})
const emit = defineEmits(['detected', 'close'])

const video = ref(null)
const status = ref('starting') // starting | scanning | error
const error = ref('')
const history = ref([])
const torch = ref(false)
const torchAvailable = ref(false)
const cameras = ref([])
const cameraIndex = ref(-1)
const busy = ref(false)

let stream = null
let frame = null
let lastCode = ''
let lastSeenAt = 0
let stopped = false

async function start(deviceId = null) {
  stopStream()
  status.value = 'starting'
  error.value = ''
  let stage = 'camera'
  try {
    const detectorPromise = getDetector()
    detectorPromise.catch(() => {})
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    })
    if (stopped) return stopStream()
    video.value.srcObject = stream
    await video.value.play()

    const track = stream.getVideoTracks()[0]
    torchAvailable.value = !!track.getCapabilities?.().torch
    torch.value = false
    if (!cameras.value.length) {
      cameras.value = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput')
      cameraIndex.value = cameras.value.findIndex((device) => device.deviceId === track.getSettings().deviceId)
    }

    stage = 'detector'
    const detector = await detectorPromise
    status.value = 'scanning'
    loop(detector)
  } catch (e) {
    status.value = 'error'
    error.value = stage === 'detector' ? 'Pembaca barcode gagal dimuat. Periksa koneksi lalu coba lagi.' : cameraError(e)
  }
}

let lastScan = 0
function loop(detector) {
  frame = requestAnimationFrame(async (now) => {
    if (stopped || status.value !== 'scanning') return
    // ± 7x per detik sudah cukup dan hemat baterai.
    if (!busy.value && now - lastScan > 140 && video.value?.readyState >= 2) {
      lastScan = now
      try {
        const [barcode] = await detector.detect(video.value)
        if (barcode?.rawValue) await handle(barcode.rawValue.trim())
      } catch {
        // frame berikutnya
      }
    }
    loop(detector)
  })
}

async function handle(code) {
  const now = Date.now()
  const repeated = code === lastCode && now - lastSeenAt < 1500
  lastSeenAt = now
  if (!code || repeated) return
  lastCode = code

  if (!props.resolve) {
    feedback(true)
    emit('detected', code)
    if (!props.continuous) close()
    return
  }

  busy.value = true
  try {
    const result = (await props.resolve(code)) || { ok: true, text: code }
    feedback(result.ok)
    history.value.unshift({ id: now, code, ...result })
    history.value = history.value.slice(0, 5)
    if (result.ok && !props.continuous) close()
  } finally {
    busy.value = false
  }
}

async function toggleTorch() {
  const track = stream?.getVideoTracks()[0]
  if (!track) return
  try {
    await track.applyConstraints({ advanced: [{ torch: !torch.value }] })
    torch.value = !torch.value
  } catch {
    torchAvailable.value = false
  }
}

function switchCamera() {
  if (cameras.value.length < 2) return
  cameraIndex.value = (cameraIndex.value + 1) % cameras.value.length
  start(cameras.value[cameraIndex.value].deviceId)
}

function stopStream() {
  cancelAnimationFrame(frame)
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
}

function close() {
  stopped = true
  stopStream()
  emit('close')
}

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  start()
})
onBeforeUnmount(() => {
  stopped = true
  document.removeEventListener('keydown', onKeydown)
  stopStream()
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-modal="true">
      <header class="flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div class="min-w-0">
          <p class="truncate font-semibold">{{ title }}</p>
          <p class="text-xs text-white/60">{{ continuous ? 'Scan beberapa barang berturut-turut' : 'Arahkan kamera ke barcode' }}</p>
        </div>
        <button class="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Tutup" @click="close">
          <AppIcon name="x" :size="22" />
        </button>
      </header>

      <div class="relative min-h-0 flex-1 overflow-hidden">
        <video ref="video" class="h-full w-full object-cover" playsinline muted autoplay />

        <!-- Bingkai bidik -->
        <div v-if="status === 'scanning'" class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div class="relative aspect-[1.6] w-[78%] max-w-md rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
            <span class="absolute -top-0.5 -left-0.5 h-7 w-7 rounded-tl-2xl border-t-4 border-l-4 border-emerald-400" />
            <span class="absolute -top-0.5 -right-0.5 h-7 w-7 rounded-tr-2xl border-t-4 border-r-4 border-emerald-400" />
            <span class="absolute -bottom-0.5 -left-0.5 h-7 w-7 rounded-bl-2xl border-b-4 border-l-4 border-emerald-400" />
            <span class="absolute -right-0.5 -bottom-0.5 h-7 w-7 rounded-br-2xl border-r-4 border-b-4 border-emerald-400" />
            <span class="scan-line absolute inset-x-4 h-0.5 rounded-full bg-emerald-400/90 shadow-[0_0_12px_2px_rgba(52,211,153,0.7)]" />
          </div>
        </div>

        <div v-if="status === 'starting'" class="absolute inset-0 flex items-center justify-center text-sm text-white/70">Membuka kamera…</div>
        <div v-if="status === 'error'" class="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <AppIcon name="camera" :size="40" class="text-white/50" />
          <p class="text-sm">{{ error }}</p>
          <button class="rounded-lg bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25" @click="start()">Coba lagi</button>
        </div>
      </div>

      <footer class="space-y-3 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <TransitionGroup v-if="history.length" tag="ul" class="space-y-1.5" enter-from-class="opacity-0 -translate-y-1" enter-active-class="transition duration-200">
          <li v-for="item in history" :key="item.id" class="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm">
            <AppIcon :name="item.ok ? 'check' : 'alert'" :size="16" :class="item.ok ? 'text-emerald-400' : 'text-amber-400'" />
            <span class="min-w-0 flex-1 truncate">{{ item.text }}</span>
            <span class="shrink-0 font-mono text-xs text-white/50">{{ item.code }}</span>
          </li>
        </TransitionGroup>
        <div class="flex items-center justify-center gap-3">
          <button v-if="torchAvailable" class="rounded-full p-3" :class="torch ? 'bg-amber-400 text-black' : 'bg-white/10 hover:bg-white/20'" aria-label="Senter" @click="toggleTorch">
            <AppIcon name="bolt" :size="22" />
          </button>
          <button v-if="cameras.length > 1" class="rounded-full bg-white/10 p-3 hover:bg-white/20" aria-label="Ganti kamera" @click="switchCamera">
            <AppIcon name="refresh" :size="22" />
          </button>
          <button v-if="continuous" class="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-600" @click="close">Selesai</button>
        </div>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.scan-line {
  animation: scan 2s ease-in-out infinite;
}
@keyframes scan {
  0%,
  100% {
    top: 12%;
  }
  50% {
    top: 86%;
  }
}
</style>
