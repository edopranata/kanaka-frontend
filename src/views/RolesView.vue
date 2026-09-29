<script setup>
import { computed, onMounted, ref } from 'vue'
import http, { errorMessage, validationErrors } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import PageHeader from '../components/PageHeader.vue'

const auth = useAuthStore()
const meta = useMetaStore()
const toast = useToastStore()

const homes = { dashboard: 'Dashboard', pos: 'Kasir (POS)' }

const roles = ref([])
const catalog = ref([])
const loading = ref(false)

const byKey = computed(() => Object.fromEntries(catalog.value.map((item) => [item.key, item])))
const groups = computed(() => {
  const result = []
  for (const item of catalog.value) {
    let group = result.find((entry) => entry.name === item.group)
    if (!group) result.push((group = { name: item.group, items: [] }))
    group.items.push(item)
  }
  return result
})

async function load() {
  loading.value = true
  try {
    const [rolesResponse, catalogResponse] = await Promise.all([http.get('/roles'), catalog.value.length ? null : http.get('/roles/permissions')])
    roles.value = rolesResponse.data.data
    if (catalogResponse) catalog.value = catalogResponse.data.data
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

// ---- Form ----
const form = ref(null)
const errors = ref({})
const saving = ref(false)
const search = ref('')

/** Hak akses beserta semua ketergantungannya. */
function closure(keys) {
  const result = new Set()
  const queue = [...keys]
  while (queue.length) {
    const key = queue.shift()
    if (result.has(key) || !byKey.value[key]) continue
    result.add(key)
    queue.push(...byKey.value[key].requires)
  }
  return result
}

function openForm(role = null, copy = false) {
  errors.value = {}
  search.value = ''
  form.value = role
    ? {
        id: copy ? null : role.id,
        name: copy ? `${role.name} (salinan)` : role.name,
        description: role.description || '',
        home: role.home,
        is_system: !copy && role.is_system,
        permissions: new Set(role.is_system && copy ? catalog.value.map((item) => item.key).filter(ownsPermission) : role.permissions),
      }
    : { id: null, name: '', description: '', home: 'dashboard', is_system: false, permissions: new Set(['dashboard']) }
}

/** Pemilik bisa memberi semua hak akses; pengelola lain hanya hak akses yang ia miliki. */
const ownsPermission = (key) => auth.user?.is_owner || auth.can(key)

/** Hak akses yang dicentang lain dan membutuhkan `key` (tidak bisa dicabut selama masih dibutuhkan). */
function requiredBy(key) {
  return [...form.value.permissions].filter((other) => other !== key && byKey.value[other]?.requires.includes(key)).map((other) => byKey.value[other].label)
}

function toggle(key, checkbox = null) {
  const selected = new Set(form.value.permissions)
  if (!form.value.is_system && ownsPermission(key)) {
    const needed = selected.has(key) ? requiredBy(key) : []
    if (needed.length) {
      toast.error(`Dibutuhkan oleh: ${needed.join(', ')}.`)
    } else if (selected.has(key)) {
      selected.delete(key)
    } else {
      closure([key]).forEach((item) => selected.add(item))
    }
  }
  form.value.permissions = selected
  // Samakan tanda centang dengan data (mis. saat pencabutan ditolak karena masih dibutuhkan).
  if (checkbox) checkbox.checked = selected.has(key)
}

function toggleGroup(group, on) {
  if (form.value.is_system) return
  const keys = group.items.map((item) => item.key).filter(ownsPermission)
  const selected = new Set(form.value.permissions)
  if (on) {
    closure(keys).forEach((key) => ownsPermission(key) && selected.add(key))
  } else {
    keys.forEach((key) => selected.delete(key))
    // Kembalikan yang masih dibutuhkan hak akses lain yang tetap dicentang.
    closure([...selected]).forEach((key) => selected.add(key))
  }
  form.value.permissions = selected
}

const groupState = (group) => {
  const count = group.items.filter((item) => form.value.permissions.has(item.key)).length
  return count === 0 ? 'none' : count === group.items.length ? 'all' : 'some'
}

const visibleGroups = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return groups.value
  return groups.value
    .map((group) => ({ ...group, items: group.items.filter((item) => `${item.label} ${item.description} ${item.key}`.toLowerCase().includes(term)) }))
    .filter((group) => group.items.length)
})

function copyFrom(roleId) {
  const source = roles.value.find((role) => role.id === Number(roleId))
  if (!source) return
  const keys = source.is_system ? catalog.value.map((item) => item.key) : source.permissions
  form.value.permissions = closure(keys.filter(ownsPermission))
  toast.success(`Hak akses disalin dari ${source.name}.`)
}

async function save() {
  saving.value = true
  errors.value = {}
  const payload = { name: form.value.name, description: form.value.description || null, home: form.value.home, permissions: [...form.value.permissions] }
  try {
    if (form.value.id) {
      await http.put(`/roles/${form.value.id}`, payload)
    } else {
      await http.post('/roles', payload)
    }
    toast.success('Role disimpan.')
    form.value = null
    load()
    meta.load(true)
  } catch (e) {
    errors.value = validationErrors(e)
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

async function remove(role) {
  if (!confirm(`Hapus role ${role.name}?`)) return
  try {
    await http.delete(`/roles/${role.id}`)
    toast.success('Role dihapus.')
    load()
    meta.load(true)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

onMounted(load)
</script>

<template>
  <div class="stagger">
    <PageHeader title="Role & Hak Akses" subtitle="Atur jabatan dan hak akses. Setiap pengguna memiliki satu role.">
      <template #actions>
        <button class="btn-primary" @click="openForm()"><AppIcon name="plus" :size="16" /> Role Baru</button>
      </template>
    </PageHeader>

    <div class="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]">
      <article v-for="role in roles" :key="role.id" class="card card-hover flex flex-col p-5">
        <header class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="flex items-center gap-1.5 text-base font-semibold text-slate-900">
              <AppIcon v-if="role.is_system" name="lock" :size="16" class="text-amber-600" />
              <span class="truncate">{{ role.name }}</span>
            </p>
            <p class="text-xs text-slate-500">Halaman awal: {{ homes[role.home] }}</p>
          </div>
          <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{{ role.users_count }} pengguna</span>
        </header>
        <p class="mt-2 flex-1 text-sm text-slate-600">{{ role.description || '—' }}</p>
        <p class="mt-3 text-xs text-slate-500">
          <template v-if="role.is_system"><b class="text-amber-700">Semua hak akses</b> · termasuk fitur baru di masa depan</template>
          <template v-else><b class="text-slate-700">{{ role.permissions.length }}</b> dari {{ catalog.length }} hak akses</template>
        </p>
        <footer class="mt-4 flex items-center justify-end gap-1 border-t border-slate-100 pt-3">
          <button class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Salin menjadi role baru" @click="openForm(role, true)"><AppIcon name="copy" :size="16" /></button>
          <button class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" :title="role.is_system ? 'Lihat hak akses' : 'Ubah'" @click="openForm(role)">
            <AppIcon :name="role.is_system ? 'eye' : 'pencil'" :size="16" />
          </button>
          <button
            v-if="!role.is_system"
            class="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            :disabled="role.users_count > 0 || !role.manageable"
            :title="role.users_count > 0 ? 'Masih dipakai pengguna' : 'Hapus'"
            @click="remove(role)"
          >
            <AppIcon name="trash" :size="16" />
          </button>
        </footer>
      </article>
    </div>

    <AppModal v-if="form" :title="form.is_system ? `Role ${form.name}` : form.id ? 'Ubah Role' : 'Role Baru'" size="xl" fixed-body @close="form = null">
      <form id="role-form" class="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]" @submit.prevent="save">
        <div class="space-y-3">
          <div>
            <label class="label">Nama role / jabatan</label>
            <input v-model="form.name" class="input" :class="{ 'input-error': errors.name }" placeholder="mis. Supervisor Kasir" :disabled="form.is_system" required />
            <p v-if="errors.name" class="error-text">{{ errors.name }}</p>
          </div>
          <div>
            <label class="label">Deskripsi</label>
            <textarea v-model="form.description" rows="3" class="input" placeholder="Tugas / tanggung jawab" :disabled="form.is_system" />
          </div>
          <div>
            <label class="label">Halaman awal setelah login</label>
            <select v-model="form.home" class="input" :disabled="form.is_system">
              <option v-for="(label, value) in homes" :key="value" :value="value">{{ label }}</option>
            </select>
          </div>
          <div v-if="!form.is_system">
            <label class="label">Salin hak akses dari</label>
            <select class="input" @change="copyFrom($event.target.value); $event.target.value = ''">
              <option value="">Pilih role…</option>
              <option v-for="role in roles.filter((item) => item.id !== form.id)" :key="role.id" :value="role.id">{{ role.name }}</option>
            </select>
          </div>
          <p class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <template v-if="form.is_system">Role Pemilik selalu memiliki <b>semua</b> hak akses dan tidak dapat diubah.</template>
            <template v-else>
              <b>{{ form.permissions.size }}</b> hak akses dipilih. Hak akses yang dibutuhkan fitur lain ikut tercentang otomatis.
              <template v-if="!auth.user?.is_owner"> Anda hanya bisa memberi hak akses yang Anda miliki.</template>
            </template>
          </p>
          <p v-if="errors.permissions" class="error-text">{{ errors.permissions }}</p>
        </div>

        <div class="flex min-h-0 flex-col rounded-xl border border-slate-200">
          <div class="border-b border-slate-100 p-3">
            <input v-model="search" type="search" class="input" placeholder="Cari hak akses…" />
          </div>
          <div class="scroll-area min-h-48 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
            <section v-for="group in visibleGroups" :key="group.name">
              <label class="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300"
                  :checked="groupState(group) === 'all'"
                  :indeterminate="groupState(group) === 'some'"
                  :disabled="form.is_system"
                  @change="toggleGroup(group, $event.target.checked)"
                />
                {{ group.name }}
              </label>
              <div class="grid gap-1.5 sm:grid-cols-2">
                <label
                  v-for="item in group.items"
                  :key="item.key"
                  class="flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition"
                  :class="[
                    form.permissions.has(item.key) || form.is_system ? 'border-brand-300 bg-brand-50/60' : 'border-slate-200 hover:bg-slate-50',
                    !form.is_system && !ownsPermission(item.key) ? 'cursor-not-allowed opacity-50' : '',
                  ]"
                >
                  <input
                    type="checkbox"
                    class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                    :checked="form.is_system || form.permissions.has(item.key)"
                    :disabled="form.is_system || !ownsPermission(item.key)"
                    @change="toggle(item.key, $event.target)"
                  />
                  <span class="min-w-0 text-sm">
                    <span class="block font-medium text-slate-800">{{ item.label }}</span>
                    <span class="block text-xs text-slate-500">{{ item.description }}</span>
                    <span v-if="!form.is_system && form.permissions.has(item.key) && requiredBy(item.key).length" class="mt-0.5 block text-[11px] text-brand-700">
                      Dibutuhkan: {{ requiredBy(item.key).join(', ') }}
                    </span>
                  </span>
                </label>
              </div>
            </section>
          </div>
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="form = null">{{ form.is_system ? 'Tutup' : 'Batal' }}</button>
        <button v-if="!form.is_system" class="btn-primary" type="submit" form="role-form" :disabled="saving">{{ saving ? 'Menyimpan…' : 'Simpan Role' }}</button>
      </template>
    </AppModal>
  </div>
</template>
