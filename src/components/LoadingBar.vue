<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { useLoadingStore } from '../stores/loading'

/**
 * Loading bar tipis di atas layar, maju perlahan selama ada request lalu selesai dengan mulus.
 */
const loading = useLoadingStore()
const progress = ref(0)
const visible = ref(false)
let showTimer = null
let tick = null
let hideTimer = null

watch(() => loading.active, (active) => {
  clearTimeout(hideTimer)
  if (active) {
    // Request cepat (< 150 ms) tidak perlu menampilkan bar.
    showTimer = setTimeout(() => {
      visible.value = true
      progress.value = 8
      clearInterval(tick)
      tick = setInterval(() => {
        progress.value += (90 - progress.value) * 0.08
      }, 120)
    }, 150)
  } else {
    clearTimeout(showTimer)
    clearInterval(tick)
    if (!visible.value) return
    progress.value = 100
    hideTimer = setTimeout(() => {
      visible.value = false
      progress.value = 0
    }, 350)
  }
})

onBeforeUnmount(() => {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  clearInterval(tick)
})
</script>

<template>
  <Transition name="fade">
    <div v-if="visible" class="no-print pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5">
      <div class="h-full bg-accent-500 shadow-[0_0_8px_var(--color-accent-500)] transition-[width] duration-300 ease-out" :style="{ width: `${progress}%` }" />
    </div>
  </Transition>
</template>
