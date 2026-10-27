<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http, { errorMessage, validationErrors } from '../api/http'
import { useAuthStore } from '../stores/auth'
import AuthCard from '../components/AuthCard.vue'

/**
 * Wajib setelah masuk dengan kata sandi sementara (dari email): buat kata sandi sendiri sebelum memakai aplikasi.
 */
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const form = reactive({ current_password: '', password: '', password_confirmation: '' })
const errors = ref({})
const error = ref('')
const loading = ref(false)

const expires = computed(() => auth.user?.password_expires_at
  ? new Date(auth.user.password_expires_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
  : null)

async function submit() {
  loading.value = true
  errors.value = {}
  error.value = ''
  try {
    await http.put('/auth/password', form)
    auth.user = { ...auth.user, must_change_password: false, password_expires_at: null }
    router.replace(route.query.redirect || auth.homePath())
  } catch (e) {
    errors.value = validationErrors(e)
    if (!Object.keys(errors.value).length) error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function logout() {
  await auth.logout().catch(() => {})
  router.replace({ name: 'login' })
}
</script>

<template>
  <AuthCard title="Buat kata sandi baru" :subtitle="`Halo ${auth.user?.name || ''}, Anda masuk dengan kata sandi sementara. Buat kata sandi sendiri untuk melanjutkan.`">
    <form class="space-y-4" @submit.prevent="submit">
      <input type="text" :value="auth.user?.username" autocomplete="username" class="hidden" readonly />
      <div>
        <label class="label" for="current_password">Kata sandi sementara (dari email)</label>
        <input id="current_password" v-model="form.current_password" type="password" class="input" :class="{ 'input-error': errors.current_password }" autocomplete="current-password" required autofocus />
        <p v-if="errors.current_password" class="error-text">{{ errors.current_password }}</p>
        <p v-else-if="expires" class="mt-1 text-xs text-slate-500">Berlaku sampai {{ expires }}.</p>
      </div>
      <div>
        <label class="label" for="password">Kata sandi baru</label>
        <input id="password" v-model="form.password" type="password" class="input" :class="{ 'input-error': errors.password }" autocomplete="new-password" minlength="8" required />
        <p v-if="errors.password" class="error-text">{{ errors.password }}</p>
        <p v-else class="mt-1 text-xs text-slate-500">Minimal 8 karakter, berbeda dari kata sandi sementara.</p>
      </div>
      <div>
        <label class="label" for="password_confirmation">Ulangi kata sandi baru</label>
        <input id="password_confirmation" v-model="form.password_confirmation" type="password" class="input" autocomplete="new-password" required />
      </div>
      <Transition name="pop">
        <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
      </Transition>
      <button type="submit" class="btn-primary w-full" :disabled="loading">{{ loading ? 'Menyimpan…' : 'Simpan & lanjutkan' }}</button>
      <button type="button" class="block w-full text-center text-xs font-medium text-slate-500 hover:underline" @click="logout">Keluar</button>
    </form>
  </AuthCard>
</template>
