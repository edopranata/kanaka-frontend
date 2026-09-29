<script setup>
import AppIcon from './AppIcon.vue'

defineProps({
  icon: { type: String, default: 'archive' },
  title: { type: String, default: 'Belum ada data' },
  text: { type: String, default: '' },
})
</script>

<template>
  <div class="flex animate-fade-up flex-col items-center justify-center px-4 py-12 text-center">
    <div class="rounded-full bg-slate-100 p-3 text-slate-400">
      <AppIcon :name="icon" :size="28" />
    </div>
    <p class="mt-3 font-medium text-slate-700">{{ title }}</p>
    <p v-if="text" class="mt-1 max-w-sm text-sm text-slate-500">{{ text }}</p>
    <div v-if="$slots.default" class="mt-4"><slot /></div>
  </div>
</template>
