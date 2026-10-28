<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  /** Objek pengguna ({ name, avatar_url }). */
  user: { type: Object, default: null },
  size: { type: Number, default: 36 },
  /** 'light' untuk latar terang (halaman), 'dark' untuk latar gelap (sidebar). */
  tone: { type: String, default: 'light' },
})

const initials = computed(() =>
  (props.user?.name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase(),
)

// Foto gagal dimuat (mis. file dihapus) → kembali ke inisial.
const failed = ref(false)
watch(() => props.user?.avatar_url, () => (failed.value = false))
const photo = computed(() => (!failed.value && props.user?.avatar_url) || null)
</script>

<template>
  <span
    class="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold select-none"
    :class="tone === 'dark' ? 'bg-white/15 text-white ring-2 ring-white/15' : 'bg-brand-100 text-brand-800 ring-2 ring-white'"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.max(10, Math.round(size * 0.36))}px` }"
  >
    <img v-if="photo" :src="photo" alt="" class="h-full w-full object-cover" loading="lazy" @error="failed = true" />
    <template v-else>{{ initials }}</template>
  </span>
</template>
