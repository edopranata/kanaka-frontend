<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { renderSVG } from 'uqr'
import http, { errorMessage, validationErrors } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { appInfo, loadAppInfo } from '../utils/appInfo'
import { renderGoogleButton } from '../utils/google'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import PageHeader from '../components/PageHeader.vue'

const auth = useAuthStore()
const toast = useToastStore()
const form = reactive({ current_password: '', password: '', password_confirmation: '' })
const errors = ref({})
const saving = ref(false)

async function save() {
  saving.value = true
  errors.value = {}
  try {
    await http.put('/auth/password', form)
    Object.assign(form, { current_password: '', password: '', password_confirmation: '' })
    toast.success('Kata sandi diperbarui. Perangkat lain telah dikeluarkan.')
  } catch (e) {
    errors.value = validationErrors(e)
    if (!Object.keys(errors.value).length) toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

// ---- Login dengan Google -------------------------------------------------------------------
const googleButton = ref(null)
const googleError = ref('')
const googleBusy = ref(false)

async function showGoogleButton() {
  await nextTick()
  if (!appInfo.value.google_client_id || auth.user?.google_linked || !googleButton.value) return
  try {
    await renderGoogleButton(googleButton.value, appInfo.value.google_client_id, linkGoogle, { text: 'continue_with' })
  } catch (e) {
    googleError.value = e.message
  }
}

async function linkGoogle(credential) {
  googleBusy.value = true
  googleError.value = ''
  try {
    const { data } = await http.post('/auth/google/link', { credential })
    auth.user = { ...auth.user, ...data.data }
    toast.success(`Akun Google ${data.data.google_email} ditautkan.`)
  } catch (e) {
    googleError.value = errorMessage(e)
  } finally {
    googleBusy.value = false
  }
}

async function unlinkGoogle() {
  if (!confirm(`Lepas tautan akun Google ${auth.user.google_email}? Anda tidak bisa lagi masuk dengan Google sampai ditautkan ulang.`)) return
  try {
    const { data } = await http.delete('/auth/google/link')
    auth.user = { ...auth.user, ...data.data }
    toast.success('Tautan akun Google dilepas.')
    showGoogleButton()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

// ---- Verifikasi 2 langkah (MFA) ------------------------------------------------------------
// setup: { secret, uri, code } saat aktivasi; recoveryCodes: tampil sekali setelah aktif / dibuat ulang.
const setup = ref(null)
const recoveryCodes = ref(null)
const twoFactorError = ref('')
const twoFactorBusy = ref(false)
const qrSvg = computed(() => (setup.value ? renderSVG(setup.value.uri, { border: 1, ecc: 'M' }) : ''))
const groupedSecret = computed(() => setup.value?.secret.match(/.{1,4}/g).join(' ') || '')

// Konfirmasi kata sandi sebelum mengubah pengaturan keamanan.
const prompt = ref(null)
const promptPassword = ref('')
const promptError = ref('')
const promptBusy = ref(false)
const actions = {
  enable: { title: 'Aktifkan verifikasi 2 langkah', button: 'Lanjutkan', run: startTwoFactor },
  codes: { title: 'Buat ulang kode pemulihan', button: 'Buat ulang', run: regenerateCodes, note: 'Kode pemulihan lama tidak berlaku lagi.' },
  disable: { title: 'Nonaktifkan verifikasi 2 langkah', button: 'Nonaktifkan', run: disableTwoFactor, danger: true, note: 'Akun hanya dilindungi kata sandi.' },
}

function askPassword(action) {
  prompt.value = actions[action]
  promptPassword.value = ''
  promptError.value = ''
}

async function confirmPrompt() {
  promptBusy.value = true
  promptError.value = ''
  try {
    await prompt.value.run(promptPassword.value)
    prompt.value = null
  } catch (e) {
    promptError.value = validationErrors(e).password || errorMessage(e)
  } finally {
    promptBusy.value = false
  }
}

async function startTwoFactor(password) {
  const { data } = await http.post('/auth/two-factor', { password })
  setup.value = { ...data, code: '' }
  recoveryCodes.value = null
  twoFactorError.value = ''
}

async function confirmTwoFactor() {
  twoFactorBusy.value = true
  twoFactorError.value = ''
  try {
    const { data } = await http.post('/auth/two-factor/confirm', { code: setup.value.code })
    recoveryCodes.value = data.recovery_codes
    setup.value = null
    auth.user = { ...auth.user, two_factor_enabled: true }
    toast.success('Verifikasi 2 langkah aktif.')
  } catch (e) {
    twoFactorError.value = validationErrors(e).code || errorMessage(e)
  } finally {
    twoFactorBusy.value = false
  }
}

async function regenerateCodes(password) {
  const { data } = await http.post('/auth/two-factor/recovery-codes', { password })
  recoveryCodes.value = data.recovery_codes
  toast.success('Kode pemulihan baru dibuat.')
}

async function disableTwoFactor(password) {
  await http.delete('/auth/two-factor', { data: { password } })
  auth.user = { ...auth.user, two_factor_enabled: false }
  recoveryCodes.value = null
  toast.success('Verifikasi 2 langkah dinonaktifkan.')
}

async function copyCodes() {
  try {
    await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
    toast.success('Kode pemulihan disalin.')
  } catch {
    toast.error('Tidak dapat menyalin. Catat kode secara manual.')
  }
}

function downloadCodes() {
  const text = `Kode pemulihan ${appInfo.value.app_name} — ${auth.user.username}\nSetiap kode hanya bisa dipakai sekali.\n\n${recoveryCodes.value.join('\n')}\n`
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  link.download = `kode-pemulihan-${auth.user.username}.txt`
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

onMounted(async () => {
  await loadAppInfo()
  showGoogleButton()
})
</script>

<template>
  <div class="stagger">
    <PageHeader title="Akun Saya" subtitle="Profil dan keamanan akun" />
    <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div class="space-y-5">
        <section class="card space-y-2 p-5 text-sm">
          <h2 class="mb-2 font-semibold text-slate-900">Profil</h2>
          <div class="flex justify-between gap-3"><span class="text-slate-500">Nama</span><span class="text-right font-medium">{{ auth.user?.name }}</span></div>
          <div class="flex justify-between gap-3"><span class="text-slate-500">Nama pengguna</span><span>{{ auth.user?.username }}</span></div>
          <div class="flex justify-between gap-3"><span class="text-slate-500">Email</span><span class="min-w-0 truncate">{{ auth.user?.email || '-' }}</span></div>
          <div class="flex justify-between gap-3"><span class="text-slate-500">Level</span><span>{{ auth.user?.role_label }}</span></div>
        </section>

        <!-- Login dengan Google -->
        <section class="card space-y-3 p-5 text-sm">
          <div>
            <h2 class="font-semibold text-slate-900">Masuk dengan Google</h2>
            <p class="text-slate-500">Opsional. Setelah ditautkan, Anda bisa masuk dengan tombol Google tanpa mengetik kata sandi.</p>
          </div>
          <template v-if="auth.user?.google_linked">
            <div class="flex items-center gap-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-emerald-800">
              <AppIcon name="check" :size="18" class="shrink-0" />
              <span class="min-w-0 flex-1 truncate">Tertaut ke <b>{{ auth.user.google_email }}</b></span>
            </div>
            <button type="button" class="btn-secondary btn-sm" @click="unlinkGoogle">Lepas tautan</button>
          </template>
          <template v-else-if="appInfo.google_client_id">
            <div ref="googleButton" class="flex min-h-10 justify-center" :class="{ 'pointer-events-none opacity-50': googleBusy }" />
            <p v-if="googleError" class="rounded-lg bg-red-50 px-3 py-2 text-red-700">{{ googleError }}</p>
          </template>
          <p v-else class="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">Belum diaktifkan di server (GOOGLE_CLIENT_ID). Hubungi pemilik toko.</p>
        </section>
      </div>

      <div class="space-y-5">
        <form class="card grid gap-4 p-5 sm:grid-cols-2" @submit.prevent="save">
          <h2 class="font-semibold sm:col-span-2">Ganti kata sandi</h2>
          <input type="text" :value="auth.user?.username" autocomplete="username" class="hidden" readonly />
          <div class="sm:col-span-2">
            <label class="label">Kata sandi saat ini</label>
            <input v-model="form.current_password" type="password" class="input" :class="{ 'input-error': errors.current_password }" autocomplete="current-password" required />
            <p v-if="errors.current_password" class="error-text">{{ errors.current_password }}</p>
          </div>
          <div>
            <label class="label">Kata sandi baru</label>
            <input v-model="form.password" type="password" class="input" :class="{ 'input-error': errors.password }" autocomplete="new-password" minlength="8" required />
            <p v-if="errors.password" class="error-text">{{ errors.password }}</p>
          </div>
          <div>
            <label class="label">Ulangi kata sandi baru</label>
            <input v-model="form.password_confirmation" type="password" class="input" autocomplete="new-password" required />
          </div>
          <div class="flex justify-end sm:col-span-2">
            <button class="btn-primary" type="submit" :disabled="saving">Simpan</button>
          </div>
        </form>

        <!-- Verifikasi 2 langkah -->
        <section class="card space-y-4 p-5 text-sm">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h2 class="flex items-center gap-2 font-semibold text-slate-900">
                Verifikasi 2 langkah (MFA)
                <span v-if="auth.user?.two_factor_enabled" class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">Aktif</span>
              </h2>
              <p class="text-slate-500">Opsional. Saat masuk, selain kata sandi diminta 6 digit kode dari aplikasi authenticator di HP (Google Authenticator, Microsoft Authenticator, Authy, dll.).</p>
            </div>
            <button v-if="!auth.user?.two_factor_enabled && !setup" type="button" class="btn-primary btn-sm" @click="askPassword('enable')"><AppIcon name="shield" :size="14" /> Aktifkan</button>
          </div>

          <!-- Aktivasi: scan QR lalu masukkan kode -->
          <form v-if="setup" class="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-[11rem_minmax(0,1fr)]" @submit.prevent="confirmTwoFactor">
            <div class="mx-auto w-44 rounded-lg bg-white p-1 ring-1 ring-slate-200 [&>svg]:h-auto [&>svg]:w-full" v-html="qrSvg" />
            <div class="space-y-3">
              <ol class="list-decimal space-y-1 pl-4 text-slate-600">
                <li>Buka aplikasi authenticator, pilih <b>tambah akun</b> → <b>pindai kode QR</b>.</li>
                <li>Tidak bisa memindai? Masukkan kunci ini secara manual:</li>
              </ol>
              <p class="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs break-all select-all">{{ groupedSecret }}</p>
              <div>
                <label class="label" for="two-factor-code">3. Kode 6 digit dari aplikasi</label>
                <input id="two-factor-code" v-model.trim="setup.code" class="input max-w-40 text-center tracking-[0.3em] tabular-nums" :class="{ 'input-error': twoFactorError }" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" required />
                <p v-if="twoFactorError" class="error-text">{{ twoFactorError }}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button type="submit" class="btn-primary btn-sm" :disabled="twoFactorBusy">{{ twoFactorBusy ? 'Memeriksa…' : 'Konfirmasi & aktifkan' }}</button>
                <button type="button" class="btn-secondary btn-sm" @click="setup = null">Batal</button>
              </div>
            </div>
          </form>

          <!-- Kode pemulihan: tampil sekali -->
          <div v-if="recoveryCodes" class="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div>
              <p class="font-semibold text-amber-900">Simpan kode pemulihan ini</p>
              <p class="text-xs text-amber-800">Pakai salah satu kode bila HP hilang / aplikasi authenticator terhapus. Setiap kode hanya bisa dipakai sekali dan tidak akan ditampilkan lagi.</p>
            </div>
            <ul class="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-white px-3 py-2 font-mono text-sm">
              <li v-for="code in recoveryCodes" :key="code">{{ code }}</li>
            </ul>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn-secondary btn-sm" @click="copyCodes"><AppIcon name="copy" :size="14" /> Salin</button>
              <button type="button" class="btn-secondary btn-sm" @click="downloadCodes"><AppIcon name="download" :size="14" /> Unduh .txt</button>
              <button type="button" class="btn-primary btn-sm" @click="recoveryCodes = null">Sudah saya simpan</button>
            </div>
          </div>

          <div v-if="auth.user?.two_factor_enabled && !recoveryCodes" class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary btn-sm" @click="askPassword('codes')"><AppIcon name="refresh" :size="14" /> Buat ulang kode pemulihan</button>
            <button type="button" class="btn-secondary btn-sm text-red-600" @click="askPassword('disable')">Nonaktifkan</button>
          </div>
        </section>
      </div>
    </div>

    <AppModal v-if="prompt" :title="prompt.title" size="sm" @close="prompt = null">
      <form id="password-prompt" class="space-y-3" @submit.prevent="confirmPrompt">
        <input type="text" :value="auth.user?.username" autocomplete="username" class="hidden" readonly />
        <p v-if="prompt.note" class="text-sm text-slate-600">{{ prompt.note }}</p>
        <div>
          <label class="label" for="prompt-password">Masukkan kata sandi Anda</label>
          <input id="prompt-password" v-model="promptPassword" type="password" class="input" :class="{ 'input-error': promptError }" autocomplete="current-password" required autofocus />
          <p v-if="promptError" class="error-text">{{ promptError }}</p>
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="prompt = null">Batal</button>
        <button :class="prompt.danger ? 'btn-danger' : 'btn-primary'" type="submit" form="password-prompt" :disabled="promptBusy">{{ prompt.button }}</button>
      </template>
    </AppModal>
  </div>
</template>
