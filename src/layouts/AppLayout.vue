<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http from '../api/http'
import { printerConfig, reconnect as reconnectPrinter } from '../utils/printer'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'
import { hariTanggal, tanggal } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import InstallPrompt from '../components/InstallPrompt.vue'
import UserAvatar from '../components/UserAvatar.vue'
import { MAX_SHORTCUTS, MENU, shortcutOption } from '../utils/menu'

const auth = useAuthStore()
const meta = useMetaStore()
const route = useRoute()
const router = useRouter()
const online = ref(navigator.onLine)
const drawer = ref(false)

const permitted = (name) => {
  const permission = router.resolve({ name }).meta.permission
  return !permission || auth.can(permission)
}

/** Menu sesuai hak akses; induk yang tinggal satu sub-menu ditampilkan sebagai entri tunggal. */
const menu = computed(() =>
  MENU.flatMap((entry) => {
    if (!entry.children) return permitted(entry.name) ? [{ ...entry, key: entry.name }] : []
    const children = entry.children.filter((child) => permitted(child.name))
    if (children.length === 1) return [{ ...children[0], key: children[0].name }]
    return children.length ? [{ ...entry, children }] : []
  }),
)

/** Menu pintasan (Profil Saya / bawaan role) tepat di bawah Dashboard; yang tidak diizinkan dilewati. */
const shortcuts = computed(() =>
  (auth.user?.shortcuts || [])
    .map(shortcutOption)
    .filter((item) => item && permitted(item.name))
    .slice(0, MAX_SHORTCUTS)
    .map((item, index, list) => ({ ...item, key: `shortcut-${item.name}`, first: index === 0, last: index === list.length - 1 })),
)
const navItems = computed(() => {
  const items = [...menu.value]
  items.splice(items[0]?.key === 'dashboard' ? 1 : 0, 0, ...shortcuts.value)
  return items
})

const isActive = (item) => item.match.includes(route.name)
const entryActive = (entry) => (entry.children ? entry.children.some(isActive) : isActive(entry))
const hasPending = (entry) => pendingCash.value > 0 && (entry.children ? entry.children.some((child) => child.name === 'cash') : entry.name === 'cash')

// ---- Mode sidebar desktop: penuh / mini (ikon saja) / disembunyikan; diingat per perangkat ----
const stored = (key) => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
const remember = (key, value) => {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // Penyimpanan browser tidak tersedia; pilihan hanya berlaku sampai halaman dimuat ulang.
  }
}
const mini = ref(stored('sidebar.mini'))
const hidden = ref(stored('sidebar.hidden'))
watch(mini, (value) => remember('sidebar.mini', value))
watch(hidden, (value) => remember('sidebar.hidden', value))

const desktopQuery = window.matchMedia('(min-width: 1024px)')
const desktop = ref(desktopQuery.matches)
const onDesktopChange = (event) => (desktop.value = event.matches)
/** Mode mini hanya berlaku di desktop; drawer di HP selalu tampil penuh. */
const collapsed = computed(() => desktop.value && mini.value)
const contentPadding = computed(() => (hidden.value ? 'lg:pl-0' : mini.value ? 'lg:pl-[4.5rem]' : 'lg:pl-64'))

function toggleMenu() {
  if (desktop.value) hidden.value = !hidden.value
  else drawer.value = true
}

// ---- Sub-menu: satu induk terbuka (accordion) ----
const openKey = ref(null)
const activeEntry = computed(() => menu.value.find(entryActive))
watch(() => route.name, () => (openKey.value = activeEntry.value?.children ? activeEntry.value.key : null), { immediate: true })

function toggleGroup(entry, event) {
  if (collapsed.value) {
    showFlyout(entry, event)
    return
  }
  openKey.value = openKey.value === entry.key ? null : entry.key
}

// ---- Mode mini: sub-menu / nama menu muncul melayang di samping ikon ----
const flyout = ref(null)
let hideTimer = null
function showFlyout(entry, event) {
  if (!collapsed.value) return
  clearTimeout(hideTimer)
  const rect = event.currentTarget.getBoundingClientRect()
  const height = entry.children ? 44 + entry.children.length * 36 : rect.height
  flyout.value = { entry, top: Math.max(8, Math.min(rect.top, window.innerHeight - height - 8)) }
}
function hideFlyout() {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => (flyout.value = null), 150)
}
const keepFlyout = () => clearTimeout(hideTimer)

// ---- Menu pengguna (bawah sidebar) ----
const userMenu = ref(null)
const userMenuOpen = ref(false)
const closeUserMenuOutside = (event) => userMenuOpen.value && !userMenu.value?.contains(event.target) && (userMenuOpen.value = false)
const closeUserMenuOnEscape = (event) => event.key === 'Escape' && (userMenuOpen.value = false)
const fullWidth = computed(() => route.meta.fullWidth)

async function logout() {
  if (!confirm('Keluar dari aplikasi?')) return
  await auth.logout().catch(() => {})
  router.replace({ name: 'login' })
}

// Serah terima kas yang menunggu konfirmasi saya (penanda di menu & top bar).
const pendingCash = ref(0)
let lastCheck = 0
async function checkPendingCash(force = false) {
  if (!force && Date.now() - lastCheck < 20000) return
  lastCheck = Date.now()
  try {
    const { data } = await http.get('/cash/transfers/pending')
    pendingCash.value = data.count
  } catch {
    // abaikan: penanda saja
  }
}
const refreshPendingCash = () => checkPendingCash(true)

watch(() => route.fullPath, () => {
  drawer.value = false
  flyout.value = null
  userMenuOpen.value = false
  checkPendingCash()
})

const setOnline = () => (online.value = true)
const setOffline = () => (online.value = false)
onMounted(() => {
  desktopQuery.addEventListener('change', onDesktopChange)
  document.addEventListener('pointerdown', closeUserMenuOutside)
  document.addEventListener('keydown', closeUserMenuOnEscape)
  checkPendingCash(true)
  // Sambungkan kembali printer struk perangkat ini (bila memakai printer langsung) agar cetak pertama cepat.
  reconnectPrinter()
  window.addEventListener('cash-pending-changed', refreshPendingCash)
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOffline)
})
onBeforeUnmount(() => {
  clearTimeout(hideTimer)
  desktopQuery.removeEventListener('change', onDesktopChange)
  document.removeEventListener('pointerdown', closeUserMenuOutside)
  document.removeEventListener('keydown', closeUserMenuOnEscape)
  window.removeEventListener('cash-pending-changed', refreshPendingCash)
  window.removeEventListener('online', setOnline)
  window.removeEventListener('offline', setOffline)
})
</script>

<template>
  <div class="min-h-dvh transition-[padding] duration-300 ease-out-soft print:pl-0" :class="contentPadding">
    <!-- Overlay drawer (mobile) -->
    <Transition name="fade">
      <div v-if="drawer" class="no-print fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px] lg:hidden" @click="drawer = false" />
    </Transition>

    <!-- Sidebar -->
    <aside
      class="no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-800 text-white shadow-xl transition-[width,translate] duration-300 ease-out-soft lg:shadow-none"
      :class="[drawer ? 'translate-x-0' : '-translate-x-full', hidden ? 'lg:-translate-x-full' : 'lg:translate-x-0', { 'lg:w-[4.5rem]': mini }]"
    >
      <div class="flex h-16 shrink-0 items-center gap-3 overflow-hidden px-4">
        <img src="/logo.svg" alt="" class="h-10 w-10 shrink-0 rounded-xl" />
        <div class="min-w-0 leading-tight whitespace-nowrap transition-opacity duration-200" :class="collapsed ? 'opacity-0' : 'opacity-100'">
          <p class="truncate font-semibold">{{ meta.store.name }}</p>
          <p class="truncate text-xs text-brand-200">{{ meta.app.name }}</p>
        </div>
      </div>
      <button
        type="button"
        class="absolute top-5 -right-3 z-10 hidden h-6 w-6 place-items-center rounded-full bg-white text-brand-700 shadow-md ring-1 ring-slate-200 transition hover:scale-110 hover:text-brand-900 lg:grid"
        :class="{ 'pointer-events-none opacity-0': hidden }"
        :title="mini ? 'Perlebar menu' : 'Perkecil menu (ikon saja)'"
        :aria-label="mini ? 'Perlebar menu' : 'Perkecil menu'"
        @click="mini = !mini"
      >
        <AppIcon name="chevronsLeft" :size="14" class="transition-transform duration-300" :class="{ 'rotate-180': mini }" />
      </button>

      <nav class="flex-1 space-y-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-2">
        <div v-for="entry in navItems" :key="entry.key">
          <p v-if="entry.first" class="flex h-6 items-center gap-2 px-3.5 pt-1 text-[11px] font-semibold tracking-wider whitespace-nowrap text-brand-200/80 uppercase">
            <span class="transition-opacity duration-200" :class="collapsed ? 'opacity-0' : 'opacity-100'">Pintasan</span>
            <span class="h-px flex-1 bg-white/10" />
          </p>
          <!-- Entri tunggal -->
          <RouterLink
            v-if="!entry.children"
            :to="{ name: entry.name }"
            class="group relative flex h-10 items-center gap-3 overflow-hidden rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-200"
            :class="isActive(entry) ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'"
            @mouseenter="showFlyout(entry, $event)"
            @mouseleave="hideFlyout"
          >
            <span class="absolute inset-y-2 left-0 w-1 rounded-r-full bg-accent-500 transition-transform duration-300" :class="isActive(entry) ? 'scale-y-100' : 'scale-y-0'" />
            <AppIcon :name="entry.icon" class="shrink-0 transition-transform duration-200 group-hover:scale-110" />
            <span class="flex-1 truncate transition-opacity duration-200" :class="collapsed ? 'opacity-0' : 'opacity-100'">{{ entry.label }}</span>
            <span v-if="hasPending(entry)" class="absolute top-1.5 left-7 h-2 w-2 rounded-full bg-accent-500 ring-2 ring-brand-800" />
          </RouterLink>

          <!-- Menu induk + sub-menu -->
          <template v-else>
            <button
              type="button"
              class="group relative flex h-10 w-full items-center gap-3 overflow-hidden rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-200"
              :class="[
                entryActive(entry) && (collapsed || openKey !== entry.key) ? 'bg-white/15 text-white' : entryActive(entry) ? 'text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white',
                { 'bg-white/10': !entryActive(entry) && openKey === entry.key && !collapsed },
              ]"
              :aria-expanded="!collapsed && openKey === entry.key"
              @click="toggleGroup(entry, $event)"
              @mouseenter="showFlyout(entry, $event)"
              @mouseleave="hideFlyout"
            >
              <span class="absolute inset-y-2 left-0 w-1 rounded-r-full bg-accent-500 transition-transform duration-300" :class="entryActive(entry) ? 'scale-y-100' : 'scale-y-0'" />
              <AppIcon :name="entry.icon" class="shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span class="flex-1 truncate text-left transition-opacity duration-200" :class="collapsed ? 'opacity-0' : 'opacity-100'">{{ entry.label }}</span>
              <AppIcon
                name="chevronDown"
                :size="16"
                class="shrink-0 text-brand-200 transition duration-300"
                :class="[openKey === entry.key ? 'rotate-180' : '', collapsed ? 'opacity-0' : 'opacity-100']"
              />
              <span v-if="hasPending(entry) && (collapsed || openKey !== entry.key)" class="absolute top-1.5 left-7 h-2 w-2 rounded-full bg-accent-500 ring-2 ring-brand-800" />
            </button>
            <div
              class="grid transition-[grid-template-rows,opacity] duration-300 ease-out-soft"
              :class="openKey === entry.key && !collapsed ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
              :inert="openKey !== entry.key || collapsed"
            >
              <div class="min-h-0 overflow-hidden">
                <div
                  class="mt-1 mb-2 ml-6 space-y-0.5 border-l border-white/15 pl-3 transition-transform duration-300 ease-out-soft"
                  :class="openKey === entry.key ? 'translate-y-0' : '-translate-y-2'"
                >
                  <RouterLink
                    v-for="child in entry.children"
                    :key="child.name"
                    :to="{ name: child.name }"
                    class="relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] whitespace-nowrap transition duration-200"
                    :class="isActive(child) ? 'bg-white/15 font-medium text-white' : 'text-brand-100/90 hover:translate-x-0.5 hover:bg-white/10 hover:text-white'"
                  >
                    <span class="absolute top-1/2 -left-[13px] h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent-500 transition-transform duration-300" :class="isActive(child) ? 'scale-y-100' : 'scale-y-0'" />
                    <span class="truncate">{{ child.label }}</span>
                    <span v-if="child.name === 'cash' && pendingCash" class="ml-auto rounded-full bg-accent-500 px-1.5 text-[11px] font-bold text-white tabular-nums" title="Serah terima kas menunggu konfirmasi Anda">{{ pendingCash }}</span>
                  </RouterLink>
                </div>
              </div>
            </div>
          </template>
          <div v-if="entry.last" class="mx-3.5 mt-2 mb-1 h-px bg-white/10" />
        </div>
      </nav>

      <!-- Menu pengguna: profil, keamanan, install aplikasi, keluar -->
      <div ref="userMenu" class="relative border-t border-white/10 p-3">
        <Transition
          enter-active-class="transition duration-200 ease-out-soft"
          leave-active-class="transition duration-150 ease-in"
          :enter-from-class="collapsed ? '-translate-x-1 opacity-0' : 'translate-y-1 opacity-0'"
          :leave-to-class="collapsed ? '-translate-x-1 opacity-0' : 'translate-y-1 opacity-0'"
        >
          <div
            v-show="userMenuOpen"
            class="absolute z-50 overflow-hidden rounded-xl bg-white text-slate-700 shadow-2xl ring-1 ring-slate-900/10"
            :class="collapsed ? 'bottom-3 left-full ml-3 w-64' : 'right-3 bottom-full left-3 mb-2'"
            role="menu"
          >
            <div class="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-3.5 py-3">
              <UserAvatar :user="auth.user" :size="40" />
              <div class="min-w-0 leading-tight">
                <p class="truncate text-sm font-semibold text-slate-900">{{ auth.user?.name }}</p>
                <p class="truncate text-xs text-slate-500">@{{ auth.user?.username }} · {{ auth.user?.role_label }}</p>
              </div>
            </div>
            <div class="p-1.5">
              <RouterLink :to="{ name: 'account', query: { tab: 'profil' } }" class="user-menu-item" role="menuitem" @click="userMenuOpen = false">
                <AppIcon name="user" :size="18" /> Profil saya
              </RouterLink>
              <RouterLink :to="{ name: 'account', query: { tab: 'keamanan' } }" class="user-menu-item" role="menuitem" @click="userMenuOpen = false">
                <AppIcon name="shield" :size="18" /> Keamanan akun
              </RouterLink>
              <RouterLink :to="{ name: 'printer' }" class="user-menu-item" role="menuitem" @click="userMenuOpen = false">
                <AppIcon name="printer" :size="18" /> Printer struk
                <span v-if="printerConfig.deviceName.trim()" class="ml-auto max-w-24 truncate text-xs font-normal text-slate-400">{{ printerConfig.deviceName.trim() }}</span>
              </RouterLink>
              <InstallPrompt class="user-menu-item w-full" role="menuitem" />
            </div>
            <div class="border-t border-slate-100 p-1.5">
              <button type="button" class="user-menu-item w-full text-red-600 hover:bg-red-50! hover:text-red-700!" role="menuitem" @click="logout">
                <AppIcon name="logout" :size="18" class="text-red-500!" /> Keluar
              </button>
            </div>
          </div>
        </Transition>

        <button
          type="button"
          class="flex w-full items-center gap-3 overflow-hidden rounded-xl p-1.5 text-left transition-colors duration-200"
          :class="userMenuOpen ? 'bg-white/15' : 'hover:bg-white/10'"
          :title="collapsed ? auth.user?.name : undefined"
          aria-haspopup="menu"
          :aria-expanded="userMenuOpen"
          @click="userMenuOpen = !userMenuOpen"
        >
          <UserAvatar :user="auth.user" :size="36" tone="dark" />
          <span class="min-w-0 flex-1 leading-tight whitespace-nowrap transition-opacity duration-200" :class="collapsed ? 'opacity-0' : 'opacity-100'">
            <span class="block truncate text-sm font-medium">{{ auth.user?.name }}</span>
            <span class="block truncate text-xs text-brand-200">{{ auth.user?.role_label }}</span>
          </span>
          <AppIcon
            name="chevronDown"
            :size="16"
            class="shrink-0 text-brand-200 transition duration-300"
            :class="[userMenuOpen ? '' : 'rotate-180', collapsed ? 'opacity-0' : 'opacity-100']"
          />
        </button>
      </div>
    </aside>

    <!-- Mode mini: sub-menu / nama menu melayang di samping ikon -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      leave-active-class="transition duration-100 ease-in"
      enter-from-class="-translate-x-1 opacity-0"
      leave-to-class="-translate-x-1 opacity-0"
    >
      <div
        v-if="flyout && collapsed"
        class="no-print fixed left-[5rem] z-50 rounded-xl bg-brand-800 text-white shadow-xl ring-1 ring-black/10"
        :class="flyout.entry.children ? 'w-56 p-1.5' : 'px-3 py-2 text-sm font-medium whitespace-nowrap'"
        :style="{ top: `${flyout.top}px` }"
        @mouseenter="keepFlyout"
        @mouseleave="hideFlyout"
      >
        <template v-if="flyout.entry.children">
          <p class="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-brand-200 uppercase">{{ flyout.entry.label }}</p>
          <RouterLink
            v-for="child in flyout.entry.children"
            :key="child.name"
            :to="{ name: child.name }"
            class="flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] transition-colors"
            :class="isActive(child) ? 'bg-white/15 font-medium text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'"
          >
            <AppIcon :name="child.icon" :size="16" class="shrink-0 opacity-80" />
            <span class="truncate">{{ child.label }}</span>
            <span v-if="child.name === 'cash' && pendingCash" class="ml-auto rounded-full bg-accent-500 px-1.5 text-[11px] font-bold text-white tabular-nums">{{ pendingCash }}</span>
          </RouterLink>
        </template>
        <template v-else>{{ flyout.entry.label }}</template>
      </div>
    </Transition>

    <!-- Top bar -->
    <header class="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6 lg:px-8">
      <div class="flex min-w-0 items-center gap-2 py-2.5">
        <button
          class="-ml-2 rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100"
          :aria-label="desktop ? (hidden ? 'Tampilkan menu' : 'Sembunyikan menu') : 'Menu'"
          :title="desktop ? (hidden ? 'Tampilkan menu' : 'Sembunyikan menu') : 'Menu'"
          @click="toggleMenu"
        >
          <AppIcon :name="desktop && !hidden ? 'sidebar' : 'menu'" />
        </button>
        <div class="min-w-0 text-sm">
          <p class="truncate text-slate-500">
            <span class="hidden sm:inline">Tanggal usaha: </span>
            <span class="sm:hidden">Tgl usaha: </span>
            <span class="font-medium text-slate-800">
              <span class="hidden sm:inline">{{ hariTanggal(meta.business_date) }}</span>
              <span class="sm:hidden">{{ tanggal(meta.business_date) }}</span>
            </span>
          </p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <RouterLink v-if="pendingCash && route.name !== 'cash'" :to="{ name: 'cash' }" class="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-600/20 transition hover:bg-amber-200">
          <AppIcon name="handover" :size="14" /> <span class="hidden sm:inline">Terima kas</span> ({{ pendingCash }})
        </RouterLink>
        <RouterLink v-if="auth.can('pos') && route.name !== 'pos'" :to="{ name: 'pos' }" class="btn-primary btn-sm">
          <AppIcon name="cart" :size="16" /> Buka Kasir
        </RouterLink>
      </div>
    </header>

    <Transition name="fade">
    <div v-if="!online" class="no-print flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white">
      <AppIcon name="wifiOff" :size="16" /> Anda sedang offline. Data tidak dapat dimuat atau disimpan.
    </div>
    </Transition>

    <!-- isolate: z-index apa pun di dalam halaman (kartu aktif, dropdown, header tabel sticky) tetap di bawah top bar. -->
    <main class="isolate print:p-0" :class="fullWidth ? 'px-3 py-3 sm:px-4 lg:px-5' : 'px-4 py-5 sm:px-6 lg:px-8 lg:py-7 2xl:px-10'">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>
