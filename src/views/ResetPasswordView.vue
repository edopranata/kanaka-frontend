<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http, { errorMessage, validationErrors } from '../api/http'
import { useAuthStore } from '../stores/auth'
import AuthCard from '../components/AuthCard.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const token = String(route.query.token || '')
const email = String(route.query.email || '')
const form = reactive({ password: '', password_confirmation: '' })
const errors = ref({})
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true
  errors.value = {}
  error.value = ''
  try {
    await http.post('/auth/reset-password', { token, email, ...form })
    // Semua perangkat dikeluarkan oleh server; hapus juga sesi di perangkat ini.
    if (auth.isAuthenticated) await auth.logout().catch(() => {})
    router.replace({ name: 'login', query: { reset: 1 } })
  } catch (e) {
    errors.value = validationErrors(e)
    error.value = errors.value.token || (Object.keys(errors.value).length ? '' : errorMessage(e))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthCard title="Atur ulang kata sandi" :subtitle="token && email ? `Akun dengan email ${email}` : ''">
    <div v-if="!token || !email" class="space-y-4">
      <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Tautan tidak lengkap. Buka tautan langsung dari email, atau minta tautan baru.</p>
      <RouterLink :to="{ name: 'forgot-password' }" class="btn-primary w-full">Minta tautan baru</RouterLink>
    </div>
    <form v-else class="space-y-4" @submit.prevent="submit">
      <input type="email" :value="email" autocomplete="username" class="hidden" readonly />
      <div>
        <label class="label" for="password">Kata sandi baru</label>
        <input id="password" v-model="form.password" type="password" class="input" :class="{ 'input-error': errors.password }" autocomplete="new-password" minlength="8" required autofocus />
        <p v-if="errors.password" class="error-text">{{ errors.password }}</p>
        <p v-else class="mt-1 text-xs text-slate-500">Minimal 8 karakter.</p>
      </div>
      <div>
        <label class="label" for="password_confirmation">Ulangi kata sandi baru</label>
        <input id="password_confirmation" v-model="form.password_confirmation" type="password" class="input" autocomplete="new-password" required />
      </div>
      <Transition name="pop">
        <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {{ error }}
          <RouterLink v-if="errors.token" :to="{ name: 'forgot-password' }" class="mt-1 block font-semibold underline">Kirim tautan baru →</RouterLink>
        </div>
      </Transition>
      <button type="submit" class="btn-primary w-full" :disabled="loading">{{ loading ? 'Menyimpan…' : 'Simpan kata sandi' }}</button>
    </form>
  </AuthCard>
</template>
