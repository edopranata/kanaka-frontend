<script setup>
import { onMounted } from 'vue'
import { appInfo, loadAppInfo } from '../utils/appInfo'

/**
 * Tampilan halaman tanpa menu (masuk, lupa / atur ulang / buat kata sandi): logo & nama aplikasi di atas kartu.
 */
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
})

onMounted(loadAppInfo)
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-4 py-10">
    <div class="w-full max-w-sm">
      <div class="mb-6 flex animate-fade-up flex-col items-center text-center text-white">
        <img src="/logo.svg" alt="" class="h-16 w-16 rounded-2xl shadow-lg" />
        <h1 class="mt-4 text-2xl font-semibold">{{ appInfo.app_name }}</h1>
        <p class="mt-1 text-sm text-brand-100">{{ appInfo.app_tagline }}</p>
        <p v-if="appInfo.store_name" class="mt-2 rounded-full bg-white/10 px-3 py-0.5 text-xs text-brand-50">{{ appInfo.store_name }}</p>
      </div>
      <div class="card animate-fade-up space-y-4 p-6 shadow-xl [animation-delay:120ms]">
        <div v-if="title">
          <h2 class="font-semibold text-slate-900">{{ title }}</h2>
          <p v-if="subtitle" class="mt-0.5 text-sm text-slate-500">{{ subtitle }}</p>
        </div>
        <slot />
      </div>
      <slot name="after" />
    </div>
  </div>
</template>
