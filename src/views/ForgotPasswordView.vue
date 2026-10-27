<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import http, { errorMessage } from '../api/http'
import AuthCard from '../components/AuthCard.vue'

const route = useRoute()
const login = ref(String(route.query.login || ''))
const loading = ref(false)
const error = ref('')
const sent = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await http.post('/auth/forgot-password', { login: login.value })
    sent.value = data.message
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthCard title="Lupa kata sandi" :subtitle="sent ? '' : 'Tautan untuk membuat kata sandi baru dikirim ke email akun Anda.'">
    <div v-if="sent" class="space-y-4">
      <p class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ sent }}</p>
      <p class="text-xs text-slate-500">Tautan berlaku 60 menit. Belum menerima email? Tunggu sebentar lalu kirim ulang, atau hubungi pemilik toko bila akun Anda belum memiliki email.</p>
      <div class="flex gap-2">
        <button type="button" class="btn-secondary flex-1" @click="sent = ''">Kirim ulang</button>
        <RouterLink :to="{ name: 'login' }" class="btn-primary flex-1">Ke halaman masuk</RouterLink>
      </div>
    </div>
    <form v-else class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="label" for="login">Nama pengguna atau email</label>
        <input id="login" v-model.trim="login" class="input" autocomplete="username" autocapitalize="off" required autofocus />
      </div>
      <Transition name="pop">
        <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
      </Transition>
      <button type="submit" class="btn-primary w-full" :disabled="loading">{{ loading ? 'Mengirim…' : 'Kirim tautan' }}</button>
      <RouterLink :to="{ name: 'login' }" class="block text-center text-xs font-medium text-slate-500 hover:underline">← Kembali ke halaman masuk</RouterLink>
    </form>
  </AuthCard>
</template>
