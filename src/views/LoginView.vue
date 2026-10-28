<script setup>
import { nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { errorMessage } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { appInfo, loadAppInfo } from '../utils/appInfo'
import { renderGoogleButton } from '../utils/google'
import AuthCard from '../components/AuthCard.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const form = reactive({ username: '', password: '' })
const loading = ref(false)
const error = ref('')
// Setelah atur ulang kata sandi lewat email.
const notice = ref(route.query.reset ? 'Kata sandi berhasil diatur ulang. Silakan masuk dengan kata sandi baru.' : '')

// Langkah ke-2: verifikasi 2 langkah (kode authenticator atau kode pemulihan).
const step = ref('login')
const twoFactor = reactive({ code: '', recovery_code: '', recovery: false })
const codeInput = ref(null)

const googleButton = ref(null)
const googleError = ref('')

function finish() {
  if (auth.mustChangePassword) {
    router.replace({ name: 'change-password', query: route.query.redirect ? { redirect: route.query.redirect } : {} })
    return
  }
  router.replace(route.query.redirect || auth.homePath())
}

async function run(action) {
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await action()
    if (result === 'two_factor') {
      step.value = 'two_factor'
      Object.assign(twoFactor, { code: '', recovery_code: '', recovery: false })
      await nextTick()
      codeInput.value?.focus()
    } else {
      finish()
    }
  } catch (e) {
    error.value = errorMessage(e)
    // Sesi verifikasi berakhir → kembali ke langkah awal.
    if (step.value === 'two_factor' && /berakhir/.test(error.value)) step.value = 'login'
  } finally {
    loading.value = false
  }
}

const submit = () => run(() => auth.login(form.username, form.password))
const submitCode = () => run(() => auth.verifyTwoFactor(twoFactor.recovery ? { recovery_code: twoFactor.recovery_code } : { code: twoFactor.code }))

function backToLogin() {
  step.value = 'login'
  auth.challenge = null
  error.value = ''
}

async function showGoogle() {
  if (!appInfo.value.google_client_id || !googleButton.value) return
  try {
    await renderGoogleButton(googleButton.value, appInfo.value.google_client_id, (credential) => run(() => auth.loginWithGoogle(credential)))
  } catch (e) {
    googleError.value = e.message
  }
}

onMounted(async () => {
  await loadAppInfo()
  document.title = `Masuk · ${appInfo.value.app_name}`
  showGoogle()
})
// Tombol Google dirender ulang saat kembali dari langkah verifikasi.
watch(step, async (value) => value === 'login' && (await nextTick(), showGoogle()))
</script>

<template>
  <AuthCard>
    <form v-if="step === 'login'" class="space-y-4" @submit.prevent="submit">
      <Transition name="pop">
        <p v-if="notice" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ notice }}</p>
      </Transition>
      <div>
        <label class="label" for="username">Nama pengguna</label>
        <input id="username" v-model.trim="form.username" class="input" autocomplete="username" autocapitalize="off" required autofocus />
      </div>
      <div>
        <div class="flex items-baseline justify-between gap-2">
          <label class="label" for="password">Kata sandi</label>
          <RouterLink :to="{ name: 'forgot-password', query: form.username ? { login: form.username } : {} }" class="text-xs font-medium text-brand-700 hover:underline">Lupa kata sandi?</RouterLink>
        </div>
        <input id="password" v-model="form.password" type="password" class="input" autocomplete="current-password" required />
      </div>
      <Transition name="pop">
        <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
      </Transition>
      <button type="submit" class="btn-primary w-full" :disabled="loading">{{ loading ? 'Memproses…' : 'Masuk' }}</button>

      <template v-if="appInfo.google_client_id">
        <div class="flex items-center gap-3 text-xs text-slate-400"><span class="h-px flex-1 bg-slate-200" />atau<span class="h-px flex-1 bg-slate-200" /></div>
        <div ref="googleButton" class="flex min-h-10 justify-center" />
        <p v-if="googleError" class="text-center text-xs text-red-600">{{ googleError }}</p>
        <p v-else class="text-center text-xs text-slate-500">Akun Google harus ditautkan dulu di menu Profil Saya.</p>
      </template>
    </form>

    <form v-else class="space-y-4" @submit.prevent="submitCode">
      <div>
        <h2 class="font-semibold text-slate-900">Verifikasi 2 langkah</h2>
        <p class="mt-0.5 text-sm text-slate-500">
          {{ twoFactor.recovery ? 'Masukkan salah satu kode pemulihan yang Anda simpan saat mengaktifkan verifikasi 2 langkah.' : 'Masukkan 6 digit kode dari aplikasi authenticator di HP Anda.' }}
        </p>
      </div>
      <div v-if="!twoFactor.recovery">
        <label class="label" for="code">Kode verifikasi</label>
        <input id="code" ref="codeInput" v-model.trim="twoFactor.code" class="input text-center text-lg tracking-[0.4em] tabular-nums" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9 ]{6,7}" placeholder="000000" required />
      </div>
      <div v-else>
        <label class="label" for="recovery">Kode pemulihan</label>
        <input id="recovery" v-model.trim="twoFactor.recovery_code" class="input font-mono" autocomplete="off" autocapitalize="off" placeholder="xxxxx-xxxxx" required />
      </div>
      <Transition name="pop">
        <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
      </Transition>
      <button type="submit" class="btn-primary w-full" :disabled="loading">{{ loading ? 'Memeriksa…' : 'Verifikasi' }}</button>
      <div class="flex justify-between gap-2 text-xs font-medium">
        <button type="button" class="text-slate-500 hover:underline" @click="backToLogin">← Kembali</button>
        <button type="button" class="text-brand-700 hover:underline" @click="(twoFactor.recovery = !twoFactor.recovery), (error = '')">
          {{ twoFactor.recovery ? 'Pakai kode authenticator' : 'Pakai kode pemulihan' }}
        </button>
      </div>
    </form>
  </AuthCard>
</template>
