<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppModal from './AppModal.vue'
import AppIcon from './AppIcon.vue'

defineOptions({ inheritAttrs: false })

const deferredPrompt = ref(null)
const showHelp = ref(false)
const isStandalone = ref(false)

const ua = navigator.userAgent
const isIos = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isSafariMac = /macintosh/i.test(ua) && /safari/i.test(ua) && !/chrome|chromium|edg/i.test(ua)

const canShow = computed(() => !isStandalone.value && (deferredPrompt.value || isIos || isSafariMac))

function onBeforeInstall(event) {
  event.preventDefault()
  deferredPrompt.value = event
}
function onInstalled() {
  deferredPrompt.value = null
  isStandalone.value = true
}

async function install() {
  if (deferredPrompt.value) {
    deferredPrompt.value.prompt()
    await deferredPrompt.value.userChoice
    deferredPrompt.value = null
  } else {
    showHelp.value = true
  }
}

onMounted(() => {
  isStandalone.value = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('appinstalled', onInstalled)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  window.removeEventListener('appinstalled', onInstalled)
})
</script>

<template>
  <button v-if="canShow" type="button" v-bind="$attrs" @click="install">
    <AppIcon name="install" :size="18" />
    <span>Install Aplikasi</span>
  </button>

  <AppModal v-if="showHelp" title="Install Aplikasi" size="sm" @close="showHelp = false">
    <div v-if="isIos" class="space-y-2 text-sm text-slate-700">
      <p>Di iPhone / iPad (Safari):</p>
      <ol class="list-decimal space-y-1 pl-5">
        <li>Ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas).</li>
        <li>Pilih <b>Tambah ke Layar Utama</b> (Add to Home Screen).</li>
        <li>Ketuk <b>Tambah</b>.</li>
      </ol>
    </div>
    <div v-else class="space-y-2 text-sm text-slate-700">
      <p>Di Mac (Safari 17+):</p>
      <ol class="list-decimal space-y-1 pl-5">
        <li>Buka menu <b>File</b>.</li>
        <li>Pilih <b>Add to Dock…</b></li>
        <li>Klik <b>Add</b>. Aplikasi akan muncul di Dock dan Launchpad.</li>
      </ol>
      <p class="text-slate-500">Di Chrome / Edge: klik ikon install di address bar.</p>
    </div>
  </AppModal>
</template>
