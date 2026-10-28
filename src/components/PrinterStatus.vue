<script setup>
import { onMounted } from 'vue'
import { checkPrinter, isDirect, printerConfig, printerNotice, printerState } from '../utils/printer'
import AppIcon from './AppIcon.vue'

/**
 * Status printer struk di halaman transaksi: pemberitahuan bila printer belum diatur / tidak terhubung,
 * atau baris kecil "Printer siap" bila sudah tersambung. Printer dicek saat halaman dibuka.
 */
const styles = {
  info: 'bg-sky-50 text-sky-800',
  warn: 'bg-amber-50 text-amber-800',
  error: 'bg-red-50 text-red-800',
}

onMounted(() => {
  if (isDirect() && printerState.status !== 'ready') checkPrinter()
})
</script>

<template>
  <div v-if="printerNotice" class="flex items-start gap-2 px-3 py-2 text-xs" :class="styles[printerNotice.level]" role="status">
    <AppIcon :name="printerNotice.key === 'checking' ? 'refresh' : printerNotice.level === 'info' ? 'printer' : 'alert'" :size="16" class="mt-px shrink-0" :class="{ 'animate-spin': printerNotice.key === 'checking' }" />
    <div class="min-w-0 flex-1">
      <p class="font-semibold">{{ printerNotice.title }}</p>
      <p class="opacity-90">{{ printerNotice.detail }}</p>
      <div v-if="printerNotice.key !== 'checking'" class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-semibold">
        <button v-if="printerNotice.key === 'offline'" type="button" class="underline-offset-2 hover:underline" @click="checkPrinter">Cek lagi</button>
        <RouterLink :to="{ name: 'printer' }" class="underline-offset-2 hover:underline">Atur printer</RouterLink>
        <button v-if="printerNotice.key === 'browser'" type="button" class="underline-offset-2 opacity-75 hover:underline" @click="printerConfig.hideBrowserNotice = true">Sembunyikan</button>
      </div>
    </div>
  </div>
  <div v-else-if="isDirect()" class="flex items-center gap-2 px-3 py-1.5 text-xs text-emerald-700">
    <span class="h-2 w-2 rounded-full bg-emerald-500" />
    <span class="min-w-0 flex-1 truncate">Printer siap · {{ printerState.name }}<template v-if="printerConfig.deviceName.trim()"> · {{ printerConfig.deviceName.trim() }}</template></span>
    <button type="button" class="font-semibold text-slate-500 hover:text-slate-700" title="Cek koneksi printer" @click="checkPrinter"><AppIcon name="refresh" :size="13" /></button>
  </div>
</template>
