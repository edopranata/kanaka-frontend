<script setup>
/**
 * Pilihan bahan opsional pada baris paket di keranjang (mis. "Telur" bisa dihilangkan).
 */
defineProps({
  options: { type: Array, required: true },
  omit: { type: Array, required: true },
})
const emit = defineEmits(['toggle'])
</script>

<template>
  <div class="mt-1.5 flex flex-wrap gap-1">
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 transition duration-200 ring-inset"
      :class="omit.includes(option.id) ? 'bg-slate-100 text-slate-400 line-through ring-slate-300' : 'bg-brand-50 text-brand-700 ring-brand-600/20'"
      :title="omit.includes(option.id) ? 'Klik untuk menambahkan kembali' : `Klik untuk pesan tanpa ${option.name}`"
      @click="emit('toggle', option.id)"
    >
      <span>{{ omit.includes(option.id) ? '＋' : '✓' }}</span> {{ option.name }}
    </button>
  </div>
</template>
