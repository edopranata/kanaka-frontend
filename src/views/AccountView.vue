<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { renderSVG } from 'uqr'
import http, { errorMessage, validationErrors } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { appInfo, loadAppInfo } from '../utils/appInfo'
import { renderGoogleButton } from '../utils/google'
import { MAX_SHORTCUTS, SHORTCUT_OPTIONS } from '../utils/menu'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import AvatarCropper from '../components/AvatarCropper.vue'
import PageHeader from '../components/PageHeader.vue'
import UserAvatar from '../components/UserAvatar.vue'

const auth = useAuthStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

// ---- Tab (tersimpan di ?tab= agar bisa dibuka langsung dari menu pengguna di sidebar) ----
const tabs = [
  { key: 'profil', label: 'Profil', icon: 'user' },
  { key: 'keamanan', label: 'Keamanan', icon: 'shield' },
  { key: 'google', label: 'Akun Google', icon: 'switch' },
  { key: 'menu', label: 'Menu Pintasan', icon: 'menu' },
]
const tabFromQuery = () => (tabs.some((item) => item.key === route.query.tab) ? route.query.tab : 'profil')
const tab = ref(tabFromQuery())
watch(() => route.query.tab, () => (tab.value = tabFromQuery()))
watch(tab, (value) => {
  if (route.query.tab !== value) router.replace({ query: { ...route.query, tab: value } })
})

// ---- Profil: nama & email ----
const profile = reactive({ name: '', email: '', current_password: '' })
const profileErrors = ref({})
const profileSaving = ref(false)
const resetProfile = () => Object.assign(profile, { name: auth.user?.name || '', email: auth.user?.email || '', current_password: '' })
resetProfile()
const emailChanged = computed(() => profile.email.trim().toLowerCase() !== (auth.user?.email || '').toLowerCase())
const profileDirty = computed(() => profile.name !== auth.user?.name || emailChanged.value)

async function saveProfile() {
  profileSaving.value = true
  profileErrors.value = {}
  try {
    const { data } = await http.put('/auth/profile', { name: profile.name, email: profile.email, current_password: emailChanged.value ? profile.current_password : null })
    auth.user = { ...auth.user, ...data.data }
    resetProfile()
    toast.success('Profil disimpan.')
  } catch (e) {
    profileErrors.value = validationErrors(e)
    if (!Object.keys(profileErrors.value).length) toast.error(errorMessage(e))
  } finally {
    profileSaving.value = false
  }
}

// ---- Foto profil: pilih → potong (di browser) → unggah ----
const fileInput = ref(null)
const cropFile = ref(null)
const cropper = ref(null)
const avatarBusy = ref(false)

function pickPhoto(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) return toast.error('Pilih file gambar (JPG, PNG, atau WebP).')
  if (file.size > 15 * 1024 * 1024) return toast.error('Foto terlalu besar (maks. 15 MB sebelum dipotong).')
  cropFile.value = file
}

async function uploadPhoto() {
  avatarBusy.value = true
  try {
    const blob = await cropper.value.crop()
    const body = new FormData()
    body.append('avatar', blob, `avatar.${blob.type.split('/')[1] || 'png'}`)
    const { data } = await http.post('/auth/profile/avatar', body)
    auth.user = { ...auth.user, ...data.data }
    cropFile.value = null
    toast.success('Foto profil diperbarui.')
  } catch (e) {
    toast.error(validationErrors(e).avatar || errorMessage(e))
  } finally {
    avatarBusy.value = false
  }
}

async function removePhoto() {
  if (!confirm('Hapus foto profil?')) return
  avatarBusy.value = true
  try {
    const { data } = await http.delete('/auth/profile/avatar')
    auth.user = { ...auth.user, ...data.data }
    toast.success('Foto profil dihapus.')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    avatarBusy.value = false
  }
}

// ---- Menu pintasan sidebar (maks. MAX_SHORTCUTS, di bawah Dashboard) ----
const permitted = (name) => {
  const permission = router.resolve({ name }).meta.permission
  return !permission || auth.can(permission)
}
const shortcutChoices = computed(() => SHORTCUT_OPTIONS.filter((item) => permitted(item.name)))
const shortcutGroups = computed(() => {
  const groups = []
  for (const item of shortcutChoices.value) {
    const label = item.group || 'Lainnya'
    let group = groups.find((entry) => entry.label === label)
    if (!group) groups.push((group = { label, items: [] }))
    group.items.push(item)
  }
  return groups
})
const optionOf = (name) => shortcutChoices.value.find((item) => item.name === name)
const savedShortcuts = computed(() => (auth.user?.shortcuts || []).filter(optionOf))
const shortcutDraft = ref([...savedShortcuts.value])
const shortcutSaving = ref(false)
const shortcutsDirty = computed(() => shortcutDraft.value.join() !== savedShortcuts.value.join())
const resetShortcutDraft = () => (shortcutDraft.value = [...savedShortcuts.value])

function toggleShortcut(name) {
  const index = shortcutDraft.value.indexOf(name)
  if (index >= 0) shortcutDraft.value.splice(index, 1)
  else if (shortcutDraft.value.length < MAX_SHORTCUTS) shortcutDraft.value.push(name)
  else toast.error(`Maksimal ${MAX_SHORTCUTS} menu pintasan. Hapus salah satu terlebih dahulu.`)
}
function moveShortcut(index, step) {
  const list = shortcutDraft.value
  ;[list[index], list[index + step]] = [list[index + step], list[index]]
}

async function saveShortcuts(useRoleDefault = false) {
  shortcutSaving.value = true
  try {
    const { data } = await http.put('/auth/profile/shortcuts', { shortcuts: useRoleDefault ? null : shortcutDraft.value })
    auth.user = { ...auth.user, ...data.data }
    resetShortcutDraft()
    toast.success(useRoleDefault ? 'Menu pintasan kembali ke bawaan role.' : 'Menu pintasan disimpan.')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    shortcutSaving.value = false
  }
}

// ---- Keamanan: ganti kata sandi ----
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

// Tombol Google digambar saat wadahnya muncul (tab dibuka / tautan dilepas / info aplikasi selesai dimuat).
watch(googleButton, (element) => element && showGoogleButton())

onMounted(loadAppInfo)
</script>

<template>
  <div class="stagger">
    <PageHeader title="Profil Saya" subtitle="Data diri, foto, dan keamanan akun Anda" />

    <div class="grid items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div class="space-y-3 lg:sticky lg:top-20">
        <!-- Ringkasan profil -->
        <section class="card flex items-center gap-4 p-4 lg:flex-col lg:p-5 lg:text-center">
          <UserAvatar :user="auth.user" :size="72" />
          <div class="min-w-0">
            <p class="truncate font-semibold text-slate-900">{{ auth.user?.name }}</p>
            <p class="truncate text-sm text-slate-500">@{{ auth.user?.username }}</p>
            <span class="mt-1.5 inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-600/15 ring-inset">{{ auth.user?.role_label }}</span>
          </div>
        </section>

        <!-- Navigasi tab -->
        <nav class="flex gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1 lg:flex-col lg:bg-transparent lg:p-0">
          <button
            v-for="item in tabs"
            :key="item.key"
            type="button"
            class="flex flex-1 shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition duration-200 lg:justify-start"
            :class="tab === item.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:bg-white/70'"
            @click="tab = item.key"
          >
            <AppIcon :name="item.icon" :size="18" />
            {{ item.label }}
            <span v-if="item.key === 'keamanan' && auth.user?.two_factor_enabled" class="ml-auto hidden h-2 w-2 rounded-full bg-emerald-500 lg:block" title="Verifikasi 2 langkah aktif" />
            <span v-if="item.key === 'google' && auth.user?.google_linked" class="ml-auto hidden h-2 w-2 rounded-full bg-emerald-500 lg:block" title="Tertaut" />
          </button>
        </nav>
      </div>

      <Transition name="page" mode="out-in">
        <!-- Tab Profil -->
        <div v-if="tab === 'profil'" key="profil" class="space-y-5">
          <section class="card p-5">
            <h2 class="font-semibold text-slate-900">Foto profil</h2>
            <p class="text-sm text-slate-500">Tampil di menu samping dan daftar pengguna. JPG, PNG, atau WebP.</p>
            <div class="mt-4 flex flex-wrap items-center gap-5">
              <button type="button" class="group relative rounded-full" title="Ganti foto" :disabled="avatarBusy" @click="fileInput.click()">
                <UserAvatar :user="auth.user" :size="96" />
                <span class="absolute inset-0 grid place-items-center rounded-full bg-slate-900/45 text-white opacity-0 transition group-hover:opacity-100">
                  <AppIcon name="camera" :size="24" />
                </span>
              </button>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn-primary btn-sm" :disabled="avatarBusy" @click="fileInput.click()">
                  <AppIcon name="upload" :size="14" /> {{ auth.user?.avatar_url ? 'Ganti foto' : 'Unggah foto' }}
                </button>
                <button v-if="auth.user?.avatar_url" type="button" class="btn-secondary btn-sm text-red-600" :disabled="avatarBusy" @click="removePhoto">
                  <AppIcon name="trash" :size="14" /> Hapus
                </button>
              </div>
              <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="pickPhoto" />
            </div>
          </section>

          <form class="card grid gap-4 p-5 sm:grid-cols-2" @submit.prevent="saveProfile">
            <div class="sm:col-span-2">
              <h2 class="font-semibold text-slate-900">Data diri</h2>
              <p class="text-sm text-slate-500">Email dipakai untuk lupa kata sandi dan pemberitahuan akun.</p>
            </div>
            <div class="sm:col-span-2">
              <label class="label" for="profile-name">Nama lengkap</label>
              <input id="profile-name" v-model="profile.name" class="input" :class="{ 'input-error': profileErrors.name }" maxlength="255" autocomplete="name" required />
              <p v-if="profileErrors.name" class="error-text">{{ profileErrors.name }}</p>
            </div>
            <div class="sm:col-span-2">
              <label class="label" for="profile-email">Email</label>
              <input id="profile-email" v-model.trim="profile.email" type="email" class="input" :class="{ 'input-error': profileErrors.email }" autocomplete="email" required />
              <p v-if="profileErrors.email" class="error-text">{{ profileErrors.email }}</p>
            </div>
            <Transition name="fade">
              <div v-if="emailChanged" class="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:col-span-2">
                <input type="text" :value="auth.user?.username" autocomplete="username" class="hidden" readonly />
                <label class="label" for="profile-password">Kata sandi saat ini (untuk mengganti email)</label>
                <input id="profile-password" v-model="profile.current_password" type="password" class="input bg-white" :class="{ 'input-error': profileErrors.current_password }" autocomplete="current-password" required />
                <p v-if="profileErrors.current_password" class="error-text">{{ profileErrors.current_password }}</p>
              </div>
            </Transition>
            <div>
              <label class="label">Nama pengguna</label>
              <input :value="auth.user?.username" class="input" disabled />
            </div>
            <div>
              <label class="label">Role</label>
              <input :value="auth.user?.role_label" class="input" disabled />
            </div>
            <p class="text-xs text-slate-500 sm:col-span-2">Nama pengguna dan role diatur oleh pengelola di menu Pengguna.</p>
            <div class="flex justify-end gap-2 sm:col-span-2">
              <button v-if="profileDirty" type="button" class="btn-secondary" @click="resetProfile">Batal</button>
              <button class="btn-primary" type="submit" :disabled="profileSaving || !profileDirty">{{ profileSaving ? 'Menyimpan…' : 'Simpan profil' }}</button>
            </div>
          </form>
        </div>

        <!-- Tab Keamanan -->
        <div v-else-if="tab === 'keamanan'" key="keamanan" class="space-y-5">
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

        <!-- Tab Menu Pintasan -->
        <section v-else-if="tab === 'menu'" key="menu" class="card space-y-5 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h2 class="flex items-center gap-2 font-semibold text-slate-900">
                Menu pintasan sidebar
                <span v-if="!auth.user?.shortcuts_custom" class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Bawaan role</span>
              </h2>
              <p class="text-sm text-slate-500">Pilih maksimal {{ MAX_SHORTCUTS }} menu yang paling sering Anda pakai. Menu ini tampil di bawah Dashboard, sesuai urutan di sini.</p>
            </div>
          </div>

          <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <!-- Pintasan terpilih (berurutan) -->
            <div>
              <p class="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Pintasan Anda · {{ shortcutDraft.length }}/{{ MAX_SHORTCUTS }}</p>
              <TransitionGroup tag="ol" class="relative space-y-2" move-class="transition-transform duration-300 ease-out-soft" enter-active-class="transition duration-200 ease-out" enter-from-class="-translate-x-2 opacity-0" leave-active-class="absolute inset-x-0 transition duration-150 ease-in" leave-to-class="opacity-0">
                <li v-for="(name, index) in shortcutDraft" :key="name" class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{{ index + 1 }}</span>
                  <AppIcon :name="optionOf(name).icon" :size="18" class="shrink-0 text-slate-500" />
                  <span class="min-w-0 flex-1 leading-tight">
                    <span class="block truncate text-sm font-medium text-slate-800">{{ optionOf(name).label }}</span>
                    <span v-if="optionOf(name).group" class="block truncate text-xs text-slate-400">{{ optionOf(name).group }}</span>
                  </span>
                  <span class="flex shrink-0 items-center">
                    <button type="button" class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" title="Naikkan" :disabled="index === 0" @click="moveShortcut(index, -1)">
                      <AppIcon name="chevronDown" :size="16" class="rotate-180" />
                    </button>
                    <button type="button" class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" title="Turunkan" :disabled="index === shortcutDraft.length - 1" @click="moveShortcut(index, 1)">
                      <AppIcon name="chevronDown" :size="16" />
                    </button>
                    <button type="button" class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus dari pintasan" @click="toggleShortcut(name)">
                      <AppIcon name="x" :size="16" />
                    </button>
                  </span>
                </li>
                <li v-for="slot in MAX_SHORTCUTS - shortcutDraft.length" :key="`kosong-${slot}`" class="flex h-[54px] items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-400">
                  Slot kosong — pilih dari daftar menu
                </li>
              </TransitionGroup>
            </div>

            <!-- Pilihan menu -->
            <div>
              <p class="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Pilih menu</p>
              <div class="space-y-3 rounded-xl border border-slate-200 p-3">
                <div v-for="group in shortcutGroups" :key="group.label">
                  <p class="mb-1.5 text-xs font-medium text-slate-400">{{ group.label }}</p>
                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="item in group.items"
                      :key="item.name"
                      type="button"
                      class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition duration-150"
                      :class="
                        shortcutDraft.includes(item.name)
                          ? 'border-brand-300 bg-brand-50 text-brand-800'
                          : shortcutDraft.length >= MAX_SHORTCUTS
                            ? 'cursor-not-allowed border-slate-200 text-slate-400'
                            : 'border-slate-200 text-slate-600 hover:border-brand-300 hover:bg-brand-50/50'
                      "
                      :aria-pressed="shortcutDraft.includes(item.name)"
                      @click="toggleShortcut(item.name)"
                    >
                      <AppIcon :name="shortcutDraft.includes(item.name) ? 'check' : item.icon" :size="14" />
                      {{ item.label }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button v-if="auth.user?.shortcuts_custom" type="button" class="btn-secondary mr-auto" :disabled="shortcutSaving" @click="saveShortcuts(true)">
              <AppIcon name="refresh" :size="16" /> Kembalikan ke bawaan role
            </button>
            <button v-if="shortcutsDirty" type="button" class="btn-secondary" @click="resetShortcutDraft">Batal</button>
            <button type="button" class="btn-primary" :disabled="shortcutSaving || !shortcutsDirty" @click="saveShortcuts()">{{ shortcutSaving ? 'Menyimpan…' : 'Simpan pintasan' }}</button>
          </div>
        </section>

        <!-- Tab Akun Google -->
        <section v-else key="google" class="card space-y-3 p-5 text-sm">
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
            <div ref="googleButton" class="flex min-h-10 justify-center sm:justify-start" :class="{ 'pointer-events-none opacity-50': googleBusy }" />
            <p v-if="googleError" class="rounded-lg bg-red-50 px-3 py-2 text-red-700">{{ googleError }}</p>
          </template>
          <p v-else class="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">Belum diaktifkan di server (GOOGLE_CLIENT_ID). Hubungi pemilik toko.</p>
        </section>
      </Transition>
    </div>

    <AppModal v-if="cropFile" title="Atur foto profil" size="sm" @close="cropFile = null">
      <AvatarCropper ref="cropper" :file="cropFile" />
      <template #footer>
        <button class="btn-secondary" @click="cropFile = null">Batal</button>
        <button class="btn-primary" :disabled="avatarBusy" @click="uploadPhoto">{{ avatarBusy ? 'Mengunggah…' : 'Simpan foto' }}</button>
      </template>
    </AppModal>

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
