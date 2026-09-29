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
  form.value = user ? { ...user, password: '' } : { id: null, name: '', username: '', email: '', role_id: kasir?.id ?? null, is_active: true, password: '' }
}

async function save() {
  saving.value = true
  errors.value = {}
  const payload = { ...form.value, email: form.value.email || null, password: form.value.password || null }
  try {
    if (payload.id) {
      await http.put(`/users/${payload.id}`, payload)
    } else {
      await http.post('/users', payload)
    }
    toast.success('Pengguna disimpan.')
    form.value = null
    load()
  } catch (e) {
    errors.value = validationErrors(e)
    if (!Object.keys(errors.value).length) toast.error(errorMessage(e))
  } finally {
    saving.value = false
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
          <thead><tr><th>Nama</th><th>Nama Pengguna</th><th>Role</th><th>Email</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td class="font-medium">{{ user.name }} <span v-if="user.id === auth.user?.id" class="text-xs text-slate-400">(Anda)</span></td>
              <td>{{ user.username }}</td>
              <td>{{ user.role_label }}</td>
              <td>{{ user.email || '-' }}</td>
              <td><StatusBadge :status="user.is_active ? 'aktif' : 'nonaktif'" /></td>
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
          <label class="label">Email (opsional)</label>
          <input v-model="form.email" type="email" class="input" :class="{ 'input-error': errors.email }" />
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
        <div>
          <label class="label">Kata sandi {{ form.id ? '(kosongkan jika tetap)' : '' }}</label>
          <input v-model="form.password" type="password" class="input" :class="{ 'input-error': errors.password }" autocomplete="new-password" :required="!form.id" />
          <p v-if="errors.password" class="error-text">{{ errors.password }}</p>
        </div>
        <label class="flex items-center gap-2 text-sm sm:col-span-2">
          <input v-model="form.is_active" type="checkbox" class="h-4 w-4 rounded border-slate-300" :disabled="form.id === auth.user?.id" /> Akun aktif
        </label>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="form = null">Batal</button>
        <button class="btn-primary" type="submit" form="user-form" :disabled="saving">Simpan</button>
      </template>
    </AppModal>
  </div>
</template>
