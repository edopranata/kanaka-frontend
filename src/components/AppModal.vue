<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  size: { type: String, default: 'md' },
  /** Isi tidak di-scroll sebagai satu kesatuan; konten sendiri yang mengatur bagian mana yang bisa di-scroll. */
  fixedBody: { type: Boolean, default: false },
  /** Tampilkan tombol perbesar layar penuh; isi string untuk mengingat pilihan di perangkat ini (kunci localStorage). */
  maximizable: { type: [Boolean, String], default: false },
})
const emit = defineEmits(['close'])

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl', '2xl': 'sm:max-w-6xl' }

// Modal dirender lewat v-if di induk; animasi masuk saat mount, animasi keluar sebelum emit('close').
const open = ref(false)

const storageKey = typeof props.maximizable === 'string' ? `modal.maximized.${props.maximizable}` : null
const maximized = ref(false)
try {
  maximized.value = Boolean(storageKey) && localStorage.getItem(storageKey) === '1'
} catch {
  // Penyimpanan browser tidak tersedia; mulai dari ukuran normal.
}

function toggleMaximize() {
  maximized.value = !maximized.value
  try {
    if (storageKey) localStorage.setItem(storageKey, maximized.value ? '1' : '0')
  } catch {
    // Abaikan; pilihan hanya berlaku sampai dialog ditutup.
  }
}

function close() {
  open.value = false
}

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  open.value = true
  document.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px]" aria-hidden="true" />
    </Transition>
    <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" :class="{ 'pointer-events-none': !open, 'sm:p-4': !maximized }" @mousedown.self="close">
      <Transition name="modal" @after-leave="emit('close')">
        <div
          v-if="open"
          class="flex w-full flex-col bg-white shadow-2xl"
          :class="maximized ? 'h-dvh max-h-dvh' : ['max-h-[92vh] rounded-t-2xl sm:rounded-2xl', widths[props.size]]"
          role="dialog"
          aria-modal="true"
        >
          <header class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 class="text-base font-semibold text-slate-900">{{ title }}</h2>
            <div class="flex items-center gap-1">
              <button
                v-if="maximizable"
                type="button"
                class="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                :aria-label="maximized ? 'Kecilkan' : 'Perbesar'"
                :title="maximized ? 'Kecilkan' : 'Perbesar (layar penuh)'"
                @click="toggleMaximize"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path v-if="maximized" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                  <path v-else d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              </button>
              <button type="button" class="rounded p-1 text-slate-400 transition hover:rotate-90 hover:bg-slate-100 hover:text-slate-600" aria-label="Tutup" @click="close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </header>
          <div class="px-5 py-4" :class="fixedBody ? 'flex min-h-0 flex-1 flex-col overflow-y-auto' : 'overflow-y-auto'">
            <slot :close="close" />
          </div>
          <footer v-if="$slots.footer" class="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <slot name="footer" :close="close" />
          </footer>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
