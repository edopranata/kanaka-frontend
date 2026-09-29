<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http, { errorMessage } from '../api/http'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const form = reactive({ username: '', password: '' })
const info = ref({ app_name: 'Aplikasi Penjualan', app_tagline: 'Kasir · Inventory · Closing · Laporan', store_name: '' })

onMounted(async () => {
  try {
    const { data } = await http.get('/app-info')
    info.value = data
    document.title = `Masuk · ${data.app_name}`
  } catch {
    // Tetap tampilkan nama bawaan bila server belum bisa dihubungi.
  }
})
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await auth.login(form.username, form.password)
    const fallback = auth.can('dashboard') ? '/' : '/akun'
    router.replace(route.query.redirect || (auth.user.role === 'kasir' ? '/kasir' : fallback))
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-4 py-10">
    <div class="w-full max-w-sm">
      <div class="mb-6 flex animate-fade-up flex-col items-center text-center text-white">
        <img src="/logo.svg" alt="" class="h-16 w-16 rounded-2xl shadow-lg" />
        <h1 class="mt-4 text-2xl font-semibold">{{ info.app_name }}</h1>
        <p class="mt-1 text-sm text-brand-100">{{ info.app_tagline }}</p>
        <p v-if="info.store_name" class="mt-2 rounded-full bg-white/10 px-3 py-0.5 text-xs text-brand-50">{{ info.store_name }}</p>
      </div>
      <form class="card animate-fade-up space-y-4 p-6 shadow-xl [animation-delay:120ms]" @submit.prevent="submit">
        <div>
          <label class="label" for="username">Nama pengguna</label>
          <input id="username" v-model.trim="form.username" class="input" autocomplete="username" autocapitalize="off" required autofocus />
        </div>
        <div>
          <label class="label" for="password">Kata sandi</label>
          <input id="password" v-model="form.password" type="password" class="input" autocomplete="current-password" required />
        </div>
        <Transition name="pop">
          <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
        </Transition>
        <button type="submit" class="btn-primary w-full" :disabled="loading">{{ loading ? 'Memproses…' : 'Masuk' }}</button>
      </form>
    </div>
  </div>
</template>
