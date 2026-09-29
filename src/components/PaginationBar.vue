<script setup>
defineProps({
  meta: { type: Object, default: null },
})
const emit = defineEmits(['page'])
</script>

<template>
  <div v-if="meta && meta.last_page > 1" class="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
    <span>{{ meta.from }}–{{ meta.to }} dari {{ meta.total }}</span>
    <div class="flex gap-2">
      <button class="btn-secondary btn-sm" :disabled="meta.current_page <= 1" @click="emit('page', meta.current_page - 1)">Sebelumnya</button>
      <button class="btn-secondary btn-sm" :disabled="meta.current_page >= meta.last_page" @click="emit('page', meta.current_page + 1)">Berikutnya</button>
    </div>
  </div>
</template>
