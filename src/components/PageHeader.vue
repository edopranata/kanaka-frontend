<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  back: { type: [String, Object], default: null },
})
</script>

<template>
  <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div class="flex min-w-0 items-start gap-3">
      <RouterLink v-if="back" :to="back" class="mt-0.5 rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-700" aria-label="Kembali">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
      </RouterLink>
      <div class="min-w-0">
        <h1 class="truncate text-xl font-semibold text-slate-900 sm:text-2xl">{{ title }}</h1>
        <p v-if="subtitle" class="mt-0.5 text-sm text-slate-500">{{ subtitle }}</p>
      </div>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
