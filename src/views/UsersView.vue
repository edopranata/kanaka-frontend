<script setup>
import { onMounted, ref } from 'vue'
import http, { errorMessage, validationErrors } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'

const auth = useAuthStore()
const toast = useToastStore()

const users = ref([])
const form = ref(null)
const errors = ref({})
const saving = ref(false)
// Kata sandi sementara yang gagal terkirim lewat email → ditampilkan sekali untuk diserahkan langsung.
const issued = ref(null)
const busy = ref('')

const roles = ref([])
// Role yang boleh diberikan oleh pengguna yang sedang login (akses tidak melebihi miliknya).
const assignable = () => roles.value.filter((role) => role.manageable)

async function load() {
  const [usersResponse, rolesResponse] = await Promise.all([http.get('/users'), http.get('/roles')])
  users.value = usersResponse.data.data
  roles.value = rolesResponse.data.data
}

function openForm(user = null) {
  errors.value = {}
  const kasir = assignable().find((role) => role.slug === 'kasir') || assignable().at(-1)
  form.value = user ? { ...user } : { id: null, name: '', username: '', email: '', role_id: kasir?.id ?? null, is_active: true }
}

const formatDate = (value) => new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
const passwordStatus = (user) => {
  if (!user.must_change_password) return null
  return new Date(user.password_expires_at) < new Date() ? 'sandi_kedaluwarsa' : 'sandi_sementara'
}

/** Hasil kirim kata sandi sementara: toast bila terkirim, atau tampilkan kata sandinya bila email gagal. */
function mailResult(data) {
  if (data.mail.sent) {
    toast.success(`Kata sandi sementara dikirim ke ${data.mail.to}.`)
  } else {
    issued.value = { user: data.data, password: data.mail.temporary_password, to: data.mail.to }
  }
}

async function save() {
  saving.value = true
  errors.value = {}
  const { id, name, username, email, role_id, is_active } = form.value
  const payload = { name, username, email, role_id, is_active }
  try {
    if (id) {
      await http.put(`/users/${id}`, payload)
      toast.success('Pengguna disimpan.')
    } else {
      const { data } = await http.post('/users', payload)
      mailResult(data)
    }
    form.value = null
    load()
  } catch (e) {
    errors.value = validationErrors(e)
    if (!Object.keys(errors.value).length) toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

async function resendPassword(user) {
  if (!confirm(`Kirim kata sandi sementara baru ke ${user.email}?\n\nKata sandi ${user.name} saat ini tidak berlaku lagi dan semua perangkatnya akan keluar.`)) return
  busy.value = 'password'
  try {
    const { data } = await http.post(`/users/${user.id}/temporary-password`)
    mailResult(data)
    form.value = null
    load()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = ''
  }
}

async function resetTwoFactor(user) {
  if (!confirm(`Nonaktifkan verifikasi 2 langkah ${user.name}?\n\nGunakan bila HP-nya hilang dan kode pemulihan tidak ada. ${user.name} perlu masuk ulang dan bisa mengaktifkannya lagi di Akun Saya.`)) return
  busy.value = 'two_factor'
  try {
    const { data } = await http.delete(`/users/${user.id}/two-factor`)
    form.value = { ...form.value, two_factor_enabled: data.data.two_factor_enabled }
    toast.success('Verifikasi 2 langkah dinonaktifkan.')
    load()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = ''
  }
}

async function copyPassword() {
  try {
    await navigator.clipboard.writeText(issued.value.password)
    toast.success('Kata sandi disalin.')
  } catch {
    toast.error('Tidak dapat menyalin.')
  }
}

async function remove(user) {
  if (!confirm(`Hapus pengguna ${user.name}?`)) return
  try {
    await http.delete(`/users/${user.id}`)
    toast.success('Pengguna dihapus.')
    load()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

onMounted(() => load().catch((e) => toast.error(errorMessage(e))))
</script>

<template>
  <div class="stagger">
    <PageHeader title="Pengguna" subtitle="Akun dan role (jabatan) masing-masing">
      <template #actions>
        <RouterLink v-if="auth.can('roles.manage')" :to="{ name: 'roles' }" class="btn-secondary"><AppIcon name="shield" :size="16" /> Role & Hak Akses</RouterLink>
        <button class="btn-primary" @click="openForm()"><AppIcon name="plus" :size="16" /> Pengguna Baru</button>
      </template>
    </PageHeader>

    <div class="mb-4 grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
      <div v-for="role in roles" :key="role.id" class="card p-4">
        <p class="flex items-center justify-between gap-2 font-semibold text-slate-900">
          <span class="truncate">{{ role.name }}</span>
          <span class="shrink-0 text-xs font-normal text-slate-500">{{ role.users_count }} pengguna</span>
        </p>
        <p class="mt-1 text-xs text-slate-500">{{ role.description || '—' }}</p>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="table-wrap">
        <table v-stack class="table">
          <thead><tr><th>Nama</th><th>Nama Pengguna</th><th>Role</th><th>Email</th><th>Keamanan</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td class="font-medium">{{ user.name }} <span v-if="user.id === auth.user?.id" class="text-xs text-slate-400">(Anda)</span></td>
              <td>{{ user.username }}</td>
              <td>{{ user.role_label }}</td>
              <td>{{ user.email || '-' }}</td>
              <td>
                <div class="flex flex-wrap gap-1">
                  <span v-if="user.two_factor_enabled" class="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-600/20 ring-inset" title="Verifikasi 2 langkah aktif"><AppIcon name="shield" :size="12" /> 2FA</span>
                  <span v-if="user.google_linked" class="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-600/20 ring-inset" title="Bisa masuk dengan Google">Google</span>
                  <span v-if="!user.two_factor_enabled && !user.google_linked" class="text-slate-400">-</span>
                </div>
              </td>
              <td>
                <div class="flex flex-wrap gap-1">
                  <StatusBadge :status="user.is_active ? 'aktif' : 'nonaktif'" />
                  <StatusBadge v-if="passwordStatus(user)" :status="passwordStatus(user)" :title="`Kata sandi sementara berlaku sampai ${formatDate(user.password_expires_at)}`" />
                </div>
              </td>
              <td class="text-right">
                <template v-if="user.can_manage">
                  <button class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Ubah" @click="openForm(user)"><AppIcon name="pencil" :size="16" /></button>
                  <button v-if="user.id !== auth.user?.id" class="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Hapus" @click="remove(user)"><AppIcon name="trash" :size="16" /></button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <AppModal v-if="form" :title="form.id ? 'Ubah Pengguna' : 'Pengguna Baru'" @close="form = null">
      <form id="user-form" class="grid gap-3 sm:grid-cols-2" @submit.prevent="save">
        <div class="sm:col-span-2">
          <label class="label">Nama lengkap</label>
          <input v-model="form.name" class="input" :class="{ 'input-error': errors.name }" required />
          <p v-if="errors.name" class="error-text">{{ errors.name }}</p>
        </div>
        <div>
          <label class="label">Nama pengguna (login)</label>
          <input v-model.trim="form.username" class="input" :class="{ 'input-error': errors.username }" autocapitalize="off" required />
          <p v-if="errors.username" class="error-text">{{ errors.username }}</p>
        </div>
        <div>
          <label class="label">Email</label>
          <input v-model.trim="form.email" type="email" class="input" :class="{ 'input-error': errors.email }" autocapitalize="off" required />
          <p v-if="errors.email" class="error-text">{{ errors.email }}</p>
        </div>
        <div>
          <label class="label">Role</label>
          <select v-model="form.role_id" class="input" :class="{ 'input-error': errors.role_id }" :disabled="form.id === auth.user?.id" required>
            <option v-if="form.id === auth.user?.id" :value="form.role_id">{{ form.role_label }}</option>
            <option v-for="role in assignable()" :key="role.id" :value="role.id">{{ role.name }}</option>
          </select>
          <p v-if="errors.role_id" class="error-text">{{ errors.role_id }}</p>
        </div>
        <p v-if="!form.id" class="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 sm:col-span-2">
          <AppIcon name="inbox" :size="16" class="mt-px shrink-0" />
          Kata sandi sementara dikirim otomatis ke email di atas. Pengguna wajib membuat kata sandi baru saat pertama kali masuk.
        </p>
        <label v-if="form.id" class="flex items-center gap-2 text-sm sm:col-span-2">
          <input v-model="form.is_active" type="checkbox" class="h-4 w-4 rounded border-slate-300" :disabled="form.id === auth.user?.id" /> Akun aktif
        </label>

        <!-- Keamanan akun pengguna lain -->
        <div v-if="form.id && form.id !== auth.user?.id" class="space-y-2 rounded-xl border border-slate-200 p-3 text-sm sm:col-span-2">
          <p class="font-medium">Keamanan</p>
          <p v-if="passwordStatus(form)" class="text-xs text-slate-500">Masih memakai kata sandi sementara (berlaku sampai {{ formatDate(form.password_expires_at) }}).</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary btn-sm" :disabled="!!busy" @click="resendPassword(form)"><AppIcon name="inbox" :size="14" /> {{ busy === 'password' ? 'Mengirim…' : 'Kirim kata sandi sementara baru' }}</button>
            <button v-if="form.two_factor_enabled" type="button" class="btn-secondary btn-sm text-red-600" :disabled="!!busy" @click="resetTwoFactor(form)"><AppIcon name="shield" :size="14" /> Nonaktifkan 2FA</button>
          </div>
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="form = null">Batal</button>
        <button class="btn-primary" type="submit" form="user-form" :disabled="saving">{{ saving ? 'Menyimpan…' : form.id ? 'Simpan' : 'Simpan & kirim email' }}</button>
      </template>
    </AppModal>

    <AppModal v-if="issued" title="Email gagal terkirim" size="sm" @close="issued = null">
      <div class="space-y-3 text-sm">
        <p class="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
          Kata sandi sementara untuk <b>{{ issued.user.name }}</b> tidak dapat dikirim ke {{ issued.to }}. Periksa pengaturan email (Pengaturan → Keamanan), lalu serahkan kata sandi ini langsung kepada pengguna.
        </p>
        <div class="space-y-1 rounded-xl bg-slate-50 p-3">
          <div class="flex justify-between gap-3"><span class="text-slate-500">Nama pengguna</span><b>{{ issued.user.username }}</b></div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-slate-500">Kata sandi sementara</span>
            <span class="flex items-center gap-1"><b class="font-mono text-base select-all">{{ issued.password }}</b><button type="button" class="rounded p-1 text-slate-500 hover:bg-slate-200" title="Salin" @click="copyPassword"><AppIcon name="copy" :size="14" /></button></span>
          </div>
          <div class="flex justify-between gap-3"><span class="text-slate-500">Berlaku sampai</span><span>{{ formatDate(issued.user.password_expires_at) }}</span></div>
        </div>
        <p class="text-xs text-slate-500">Kata sandi ini hanya ditampilkan sekali.</p>
      </div>
      <template #footer>
        <button class="btn-primary" @click="issued = null">Selesai</button>
      </template>
    </AppModal>
  </div>
</template>
