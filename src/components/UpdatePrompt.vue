<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import AppIcon from './AppIcon.vue'

/**
 * Pemberitahuan versi aplikasi baru (service worker baru menunggu). Tidak memuat ulang otomatis agar
 * transaksi yang sedang diisi (mis. di kasir) tidak hilang; pengguna memilih kapan memuat ulang.
 */
const CHECK_EVERY = 30 * 60 * 1000
const SNOOZE = 30 * 60 * 1000

let registration = null
let lastCheck = 0
function checkForUpdate() {
  if (!registration || registration.installing || !navigator.onLine || Date.now() - lastCheck < 60 * 1000) return
  lastCheck = Date.now()
  registration.update().catch(() => {})
}
const onVisible = () => document.visibilityState === 'visible' && checkForUpdate()
const timer = setInterval(checkForUpdate, CHECK_EVERY)

const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(_url, value) {
    registration = value ?? null
    document.addEventListener('visibilitychange', onVisible)
  },
})

const snoozedUntil = ref(0)
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 60 * 1000)
const visible = computed(() => needRefresh.value && now.value >= snoozedUntil.value)
const updating = ref(false)

function later() {
  snoozedUntil.value = Date.now() + SNOOZE
  now.value = Date.now()
}

async function reload() {
  updating.value = true
  // Muat ulang setelah versi baru aktif; cadangan bila peristiwa "controlling" tidak datang.
  setTimeout(() => window.location.reload(), 4000)
  await updateServiceWorker(true).catch(() => window.location.reload())
}

onBeforeUnmount(() => {
  clearInterval(timer)
  clearInterval(clock)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <Transition name="pop">
    <div v-if="visible" class="no-print fixed inset-x-3 bottom-3 z-[60] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96" role="alert">
      <div class="flex items-start gap-3 rounded-xl bg-white p-4 shadow-2xl ring-1 ring-slate-900/10">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
          <AppIcon name="refresh" :size="20" :class="{ 'animate-spin': updating }" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-slate-900">Versi baru tersedia</p>
          <p class="mt-0.5 text-sm text-slate-500">Muat ulang untuk memakai versi terbaru. Simpan dulu transaksi yang sedang diisi.</p>
          <div class="mt-3 flex gap-2">
            <button type="button" class="btn-primary btn-sm" :disabled="updating" @click="reload">{{ updating ? 'Memuat ulang…' : 'Muat ulang' }}</button>
            <button type="button" class="btn-ghost btn-sm" :disabled="updating" @click="later">Nanti</button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
