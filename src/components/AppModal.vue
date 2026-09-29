<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  size: { type: String, default: 'md' },
  /** Isi tidak di-scroll sebagai satu kesatuan; konten sendiri yang mengatur bagian mana yang bisa di-scroll. */
  fixedBody: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }

// Modal dirender lewat v-if di induk; animasi masuk saat mount, animasi keluar sebelum emit('close').
const open = ref(false)

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
    <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" :class="{ 'pointer-events-none': !open }" @mousedown.self="close">
      <Transition name="modal" @after-leave="emit('close')">
        <div
          v-if="open"
          class="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          :class="widths[props.size]"
          role="dialog"
          aria-modal="true"
        >
          <header class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 class="text-base font-semibold text-slate-900">{{ title }}</h2>
            <button class="rounded p-1 text-slate-400 transition hover:rotate-90 hover:bg-slate-100 hover:text-slate-600" aria-label="Tutup" @click="close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
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
