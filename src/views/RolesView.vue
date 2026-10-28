<script setup>
import { computed, onMounted, ref } from 'vue'
import http, { errorMessage, validationErrors } from '../api/http'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import PageHeader from '../components/PageHeader.vue'
import AppSelect from '../components/AppSelect.vue'
import { MAX_SHORTCUTS, SHORTCUT_OPTIONS, shortcutOption } from '../utils/menu'

const auth = useAuthStore()
const meta = useMetaStore()
const toast = useToastStore()
const router = useRouter()

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
        sidebar_shortcuts: [...(role.sidebar_shortcuts || [])],
        permissions: new Set(role.is_system && copy ? catalog.value.map((item) => item.key).filter(ownsPermission) : role.permissions),
      }
    : { id: null, name: '', description: '', home: 'dashboard', is_system: false, sidebar_shortcuts: [], permissions: new Set(['dashboard']) }
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

/** Centang / hapus beberapa hak akses sekaligus (grup, baris modul, atau kolom aksi). */
function toggleItems(items, on) {
  if (form.value.is_system) return
  const keys = items.map((item) => item.key).filter(ownsPermission)
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

const itemsState = (items) => {
  const count = items.filter((item) => form.value.is_system || form.value.permissions.has(item.key)).length
  return count === 0 ? 'none' : count === items.length ? 'all' : 'some'
}

// ---- Matriks: baris = modul, kolom = aksi (Lihat / Tambah / Ubah / Hapus / Lainnya) ----
const ACTIONS = [
  ['view', 'Lihat'],
  ['create', 'Tambah'],
  ['update', 'Ubah'],
  ['delete', 'Hapus'],
  ['other', 'Lainnya'],
]
/** Label pendek di sel yang berisi lebih dari satu hak akses / cakupan data. */
const SHORT = {
  'sales.view_all': 'Semua',
  'purchases.view': 'Sendiri',
  'purchases.view_all': 'Semua',
  'expenses.view': 'Sendiri',
  'expenses.view_all': 'Semua',
  'stock.view': 'Kartu stok',
  'stock.view_all': 'Semua',
  'cash.view_all': 'Semua',
}
const matrix = (group) => {
  const modules = []
  for (const item of group.items) {
    let row = modules.find((entry) => entry.name === item.module)
    if (!row) modules.push((row = { name: item.module, items: [], cells: Object.fromEntries(ACTIONS.map(([action]) => [action, []])) }))
    row.items.push(item)
    row.cells[item.action]?.push(item)
  }
  return modules
}
const ACTION_WIDTH = { view: 'w-24', create: 'w-20', update: 'w-20', delete: 'w-20', other: '' }
/** Semua hak akses satu kolom aksi pada modul yang sedang tampil (hasil pencarian). */
const columnItems = (action) => visibleGroups.value.filter((group) => !listOnly(group)).flatMap((group) => group.items.filter((item) => item.action === action))
const selectedCount = (items) => items.filter((item) => form.value.is_system || form.value.permissions.has(item.key)).length
/** Grup yang isinya hanya aksi khusus (Laporan, Pengaturan) ditampilkan sebagai daftar, bukan per kolom. */
const listOnly = (group) => group.items.every((item) => item.action === 'other')

const visibleGroups = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return groups.value
  return groups.value
    .map((group) => ({ ...group, items: group.items.filter((item) => `${item.module} ${item.label} ${item.description} ${item.key}`.toLowerCase().includes(term)) }))
    .filter((group) => group.items.length)
})

const itemLabel = (item, wrap = false) => ({
  class: [
    'inline-flex items-center gap-1.5 text-xs text-slate-700',
    wrap ? '' : 'whitespace-nowrap',
    !form.value.is_system && !ownsPermission(item.key) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
  ],
  title: [item.label, item.description, !form.value.is_system && form.value.permissions.has(item.key) && requiredBy(item.key).length ? `Dibutuhkan: ${requiredBy(item.key).join(', ')}` : '']
    .filter(Boolean)
    .join(' — '),
})
const itemCheckbox = (item) => ({
  type: 'checkbox',
  class: 'h-4 w-4 shrink-0 rounded border-slate-300',
  checked: form.value.is_system || form.value.permissions.has(item.key),
  disabled: form.value.is_system || !ownsPermission(item.key),
})

// ---- Menu pintasan bawaan role (pengguna bisa menimpanya di Profil Saya) ----
/** Halaman bisa dibuka dengan hak akses yang sedang dicentang di form. */
function roleCanOpen(name) {
  if (form.value.is_system) return true
  const permission = router.resolve({ name }).meta.permission
  return !permission || [permission].flat().some((key) => form.value.permissions.has(key))
}
const shortcutGroups = computed(() => {
  const groups = []
  for (const item of SHORTCUT_OPTIONS) {
    if (!form.value || !roleCanOpen(item.name) || form.value.sidebar_shortcuts.includes(item.name)) continue
    const label = item.group || 'Lainnya'
    let group = groups.find((entry) => entry.label === label)
    if (!group) groups.push((group = { label, items: [] }))
    group.items.push(item)
  }
  return groups
})
const canEditShortcuts = computed(() => form.value && (!form.value.is_system || auth.user?.is_owner))

function addShortcut(name) {
  if (name && form.value.sidebar_shortcuts.length < MAX_SHORTCUTS) form.value.sidebar_shortcuts.push(name)
}

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
  const payload = {
    name: form.value.name,
    description: form.value.description || null,
    home: form.value.home,
    permissions: [...form.value.permissions],
    // Pintasan yang tidak bisa dibuka role ini tidak disimpan.
    sidebar_shortcuts: form.value.sidebar_shortcuts.filter(roleCanOpen),
  }
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

    <AppModal v-if="form" :title="form.is_system ? `Role ${form.name}` : form.id ? 'Ubah Role' : 'Role Baru'" size="2xl" fixed-body maximizable="role-form" @close="form = null">
      <form id="role-form" class="grid grid-cols-1 gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]" @submit.prevent="save">
        <div class="min-w-0 space-y-3">
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
            <AppSelect v-model="form.home" class="input" :options="Object.entries(homes).map(([value, label]) => ({ value, label }))" :disabled="form.is_system" />
          </div>
          <div v-if="!form.is_system">
            <label class="label">Salin hak akses dari</label>
            <AppSelect class="input" model-value="" :options="roles.filter((item) => item.id !== form.id)" value-key="id" label-key="name" placeholder="Pilih role…" @update:model-value="copyFrom" />
          </div>
          <div>
            <label class="label">Menu pintasan bawaan <span class="font-normal text-slate-400">({{ form.sidebar_shortcuts.length }}/{{ MAX_SHORTCUTS }})</span></label>
            <ol v-if="form.sidebar_shortcuts.length" class="mb-2 space-y-1">
              <li
                v-for="(name, index) in form.sidebar_shortcuts"
                :key="name"
                class="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
                :class="roleCanOpen(name) ? 'border-slate-200' : 'border-dashed border-amber-300 bg-amber-50 text-amber-800'"
                :title="roleCanOpen(name) ? '' : 'Role ini tidak punya akses ke halaman ini — tidak disimpan'"
              >
                <span class="w-4 text-xs font-semibold text-slate-400">{{ index + 1 }}</span>
                <AppIcon :name="shortcutOption(name)?.icon || 'menu'" :size="16" class="shrink-0 text-slate-500" />
                <span class="min-w-0 flex-1 truncate" :class="{ 'line-through': !roleCanOpen(name) }">{{ shortcutOption(name)?.label || name }}</span>
                <button v-if="canEditShortcuts" type="button" class="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus" @click="form.sidebar_shortcuts.splice(index, 1)">
                  <AppIcon name="x" :size="14" />
                </button>
              </li>
            </ol>
            <AppSelect
              v-if="canEditShortcuts && form.sidebar_shortcuts.length < MAX_SHORTCUTS"
              class="input"
              model-value=""
              :options="shortcutGroups.flatMap((group) => group.items.map((item) => ({ value: item.name, label: item.label, group: group.label })))"
              placeholder="Tambah menu pintasan…"
              @update:model-value="addShortcut"
            />
            <p class="mt-1 text-xs text-slate-500">Tampil di bawah Dashboard bagi pengguna role ini yang belum mengatur pintasan sendiri di Profil Saya.</p>
          </div>
          <p class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <template v-if="form.is_system">Role Pemilik selalu memiliki <b>semua</b> hak akses dan tidak dapat diubah<template v-if="auth.user?.is_owner">, kecuali menu pintasan bawaannya</template>.</template>
            <template v-else>
              <b>{{ form.permissions.size }}</b> hak akses dipilih. Hak akses yang dibutuhkan fitur lain ikut tercentang otomatis.
              <template v-if="!auth.user?.is_owner"> Anda hanya bisa memberi hak akses yang Anda miliki.</template>
            </template>
          </p>
          <p v-if="errors.permissions" class="error-text">{{ errors.permissions }}</p>
        </div>

        <div class="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 lg:min-h-0">
          <div class="border-b border-slate-200 p-3">
            <input v-model="search" type="search" class="input" placeholder="Cari hak akses…" />
          </div>
          <!-- Layar kecil: satu kartu per modul (form di-scroll sebagai satu halaman). -->
          <div class="md:hidden">
            <section v-for="group in visibleGroups" :key="group.name">
              <label class="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300"
                  :checked="itemsState(group.items) === 'all'"
                  :indeterminate="itemsState(group.items) === 'some'"
                  :disabled="form.is_system"
                  @change="toggleItems(group.items, $event.target.checked)"
                />
                {{ group.name }}
                <span class="font-normal tracking-normal text-slate-400 normal-case">{{ selectedCount(group.items) }}/{{ group.items.length }}</span>
              </label>
              <div v-for="row in matrix(group)" :key="row.name" class="border-b border-slate-100 px-3 py-2.5">
                <button
                  type="button"
                  class="text-left text-sm font-medium text-slate-800"
                  :class="{ 'text-brand-700': itemsState(row.items) === 'all' }"
                  :disabled="form.is_system"
                  @click="toggleItems(row.items, itemsState(row.items) !== 'all')"
                >{{ row.name }}</button>
                <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                  <label v-for="item in row.items" :key="item.key" v-bind="itemLabel(item, true)">
                    <input v-bind="itemCheckbox(item)" @change="toggle(item.key, $event.target)" />
                    <span>{{ item.label }}</span>
                  </label>
                </div>
              </div>
            </section>
          </div>
          <div class="scroll-area overflow-x-auto overscroll-contain lg:min-h-48 lg:flex-1 lg:overflow-auto">
            <table class="hidden w-full min-w-[44rem] md:table table-fixed border-separate border-spacing-0 text-sm">
              <colgroup>
                <col class="w-44" />
                <col v-for="[action] in ACTIONS" :key="action" :class="ACTION_WIDTH[action]" />
              </colgroup>
              <thead>
                <tr class="text-xs text-slate-500">
                  <th class="sticky top-0 left-0 z-30 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium">Modul</th>
                  <th
                    v-for="[action, label] in ACTIONS"
                    :key="action"
                    class="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium"
                  >
                    <button
                      v-if="!form.is_system && columnItems(action).length"
                      type="button"
                      class="-mx-1 rounded px-1 hover:bg-slate-200 hover:text-slate-800"
                      :title="`Centang / hapus kolom ${label} untuk semua modul yang tampil`"
                      @click="toggleItems(columnItems(action), itemsState(columnItems(action)) !== 'all')"
                    >{{ label }}</button>
                    <template v-else>{{ label }}</template>
                  </th>
                </tr>
              </thead>
              <tbody v-for="group in visibleGroups" :key="group.name">
                <tr>
                  <th :colspan="ACTIONS.length + 1" class="border-b border-slate-200 bg-white px-3 pt-4 pb-2 text-left">
                    <label class="sticky left-3 inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                      <input
                        type="checkbox"
                        class="h-4 w-4 rounded border-slate-300"
                        :checked="itemsState(group.items) === 'all'"
                        :indeterminate="itemsState(group.items) === 'some'"
                        :disabled="form.is_system"
                        @change="toggleItems(group.items, $event.target.checked)"
                      />
                      {{ group.name }}
                      <span class="font-normal tracking-normal text-slate-400 normal-case">{{ selectedCount(group.items) }}/{{ group.items.length }}</span>
                    </label>
                  </th>
                </tr>
                <tr v-for="row in matrix(group)" :key="row.name" class="group/row align-top">
                  <th class="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-2.5 text-left font-medium text-slate-800 group-hover/row:bg-slate-50">
                    <button
                      v-if="!form.is_system"
                      type="button"
                      class="rounded text-left hover:text-brand-700"
                      :class="{ 'text-brand-700': itemsState(row.items) === 'all' }"
                      title="Centang / hapus semua hak akses modul ini"
                      @click="toggleItems(row.items, itemsState(row.items) !== 'all')"
                    >{{ row.name }}</button>
                    <template v-else>{{ row.name }}</template>
                  </th>
                  <!-- Grup yang isinya hanya aksi khusus (Laporan, Pengaturan): satu sel lebar berisi daftar. -->
                  <td v-if="listOnly(group)" :colspan="ACTIONS.length" class="border-b border-slate-100 px-3 py-2.5 group-hover/row:bg-slate-50">
                    <div class="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-4 gap-y-2">
                      <label v-for="item in row.items" :key="item.key" v-bind="itemLabel(item)">
                        <input v-bind="itemCheckbox(item)" @change="toggle(item.key, $event.target)" />
                        <span>{{ item.label }}</span>
                      </label>
                    </div>
                  </td>
                  <template v-else>
                    <td
                      v-for="[action] in ACTIONS"
                      :key="action"
                      class="border-b border-slate-100 px-3 py-2.5 group-hover/row:bg-slate-50"
                    >
                      <div v-if="action === 'other'" class="flex flex-wrap gap-x-4 gap-y-2">
                        <label v-for="item in row.cells.other" :key="item.key" v-bind="itemLabel(item)">
                          <input v-bind="itemCheckbox(item)" @change="toggle(item.key, $event.target)" />
                          <span>{{ item.label }}</span>
                        </label>
                      </div>
                      <div v-else class="flex flex-col items-start gap-2">
                        <label v-for="item in row.cells[action]" :key="item.key" v-bind="itemLabel(item)">
                          <input v-bind="itemCheckbox(item)" @change="toggle(item.key, $event.target)" />
                          <span v-if="SHORT[item.key]" class="text-[11px] text-slate-500">{{ SHORT[item.key] }}</span>
                        </label>
                      </div>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
            <p v-if="!visibleGroups.length" class="p-6 text-center text-sm text-slate-500">Tidak ada hak akses yang cocok.</p>
            <p class="p-3 text-xs text-slate-500">
              Arahkan kursor ke kotak centang untuk melihat penjelasannya. <b>Sendiri</b> = hanya data yang dicatat pengguna itu; <b>Semua</b> = termasuk data pengguna lain.
            </p>
          </div>
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="form = null">{{ canEditShortcuts ? 'Batal' : 'Tutup' }}</button>
        <button v-if="canEditShortcuts" class="btn-primary" type="submit" form="role-form" :disabled="saving">{{ saving ? 'Menyimpan…' : form.is_system ? 'Simpan Pintasan' : 'Simpan Role' }}</button>
      </template>
    </AppModal>
  </div>
</template>
