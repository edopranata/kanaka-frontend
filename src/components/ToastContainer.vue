<script setup>
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
</script>

<template>
  <div class="no-print pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
    <TransitionGroup
      enter-from-class="opacity-0 -translate-y-2"
      enter-active-class="transition duration-200"
      leave-to-class="opacity-0"
      leave-active-class="transition duration-150"
    >
      <div
        v-for="item in toast.items"
        :key="item.id"
        class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg"
        :class="item.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'"
        role="status"
      >
        <span class="flex-1">{{ item.message }}</span>
        <button class="opacity-80 hover:opacity-100" aria-label="Tutup" @click="toast.dismiss(item.id)">✕</button>
      </div>
    </TransitionGroup>
  </div>
</template>
