<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import http from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'
import { hariTanggal, tanggal } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import InstallPrompt from '../components/InstallPrompt.vue'

const auth = useAuthStore()
const meta = useMetaStore()
const route = useRoute()
const router = useRouter()
const online = ref(navigator.onLine)
const drawer = ref(false)

const groups = [
  {
    label: null,
    items: [
      { name: 'dashboard', label: 'Dashboard', icon: 'home', match: ['dashboard'] },
      { name: 'pos', label: 'Kasir (POS)', icon: 'cart', match: ['pos'] },
      { name: 'credit-sales', label: 'Penjualan Kredit (Bon)', icon: 'book', match: ['credit-sales', 'credit-sale-create'] },
      { name: 'sales', label: 'Riwayat Penjualan', icon: 'receipt', match: ['sales', 'sale'] },
      { name: 'discounts', label: 'Diskon & Promo', icon: 'percent', match: ['discounts'] },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { name: 'products', label: 'Produk & Kategori', icon: 'cube', match: ['products', 'stock-card'] },
      { name: 'packages', label: 'Paket / Menu Olahan', icon: 'fire', match: ['packages'] },
      { name: 'purchases', label: 'Pembelian', icon: 'truck', match: ['purchases', 'purchase', 'purchase-create'] },
      { name: 'consignments', label: 'Barang Titipan', icon: 'inbox', match: ['consignments', 'consignment-receive', 'consignment-receipt', 'consignment-settle', 'consignment-settlement'] },
      { name: 'adjustments', label: 'Penyesuaian & Opname', icon: 'archive', match: ['adjustments', 'adjustment', 'adjustment-create'] },
      { name: 'suppliers', label: 'Supplier', icon: 'tag', match: ['suppliers'] },
      { name: 'customers', label: 'Pelanggan', icon: 'users', match: ['customers'] },
    ],
  },
  {
    label: 'Keuangan',
    items: [
      { name: 'cash', label: 'Kas & Bank', icon: 'cash', match: ['cash'] },
      { name: 'bills', label: 'Tagihan & Piutang', icon: 'document', match: ['bills', 'bill'] },
      { name: 'expenses', label: 'Pengeluaran', icon: 'wallet', match: ['expenses'] },
      { name: 'closings', label: 'Closing Harian', icon: 'lock', match: ['closings', 'closing'] },
      { name: 'reports', label: 'Laporan', icon: 'chart', match: ['reports'] },
    ],
  },
  {
    label: 'Administrasi',
    items: [
      { name: 'users', label: 'Pengguna', icon: 'user', match: ['users'] },
      { name: 'roles', label: 'Role & Hak Akses', icon: 'shield', match: ['roles'] },
      { name: 'logs', label: 'Log Aktivitas', icon: 'clipboard', match: ['logs'] },
      { name: 'settings', label: 'Pengaturan Aplikasi', icon: 'cog', match: ['settings'] },
    ],
  },
]

const permitted = (name) => {
  const permission = router.resolve({ name }).meta.permission
  return !permission || auth.can(permission)
}

const menu = computed(() =>
  groups
    .map((group) => ({ ...group, items: group.items.filter((item) => permitted(item.name)) }))
    .filter((group) => group.items.length),
)

const isActive = (item) => item.match.includes(route.name)
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
  checkPendingCash()
})

const setOnline = () => (online.value = true)
const setOffline = () => (online.value = false)
onMounted(() => {
  checkPendingCash(true)
  window.addEventListener('cash-pending-changed', refreshPendingCash)
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOffline)
})
onBeforeUnmount(() => {
  window.removeEventListener('cash-pending-changed', refreshPendingCash)
  window.removeEventListener('online', setOnline)
  window.removeEventListener('offline', setOffline)
})
</script>

<template>
  <div class="min-h-dvh lg:pl-64 print:pl-0">
    <!-- Overlay drawer (mobile) -->
    <Transition name="fade">
      <div v-if="drawer" class="no-print fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px] lg:hidden" @click="drawer = false" />
    </Transition>

    <!-- Sidebar -->
    <aside
      class="no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-800 text-white shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:translate-x-0 lg:shadow-none"
      :class="drawer ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex items-center gap-3 px-5 py-4">
        <img src="/logo.svg" alt="" class="h-10 w-10 rounded-xl" />
        <div class="min-w-0 leading-tight">
          <p class="truncate font-semibold">{{ meta.store.name }}</p>
          <p class="truncate text-xs text-brand-200">{{ meta.app.name }}</p>
        </div>
      </div>
      <nav class="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        <div v-for="group in menu" :key="group.label || 'main'">
          <p v-if="group.label" class="px-3 pb-1 text-[11px] font-semibold tracking-wider text-brand-200/80 uppercase">{{ group.label }}</p>
          <RouterLink
            v-for="item in group.items"
            :key="item.name"
            :to="{ name: item.name }"
            class="group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition duration-200"
            :class="isActive(item) ? 'bg-white/15 text-white' : 'text-brand-100 hover:translate-x-0.5 hover:bg-white/10 hover:text-white'"
          >
            <span class="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-accent-500 transition-transform duration-300" :class="isActive(item) ? 'scale-y-100' : 'scale-y-0'" />
            <AppIcon :name="item.icon" class="transition-transform duration-200 group-hover:scale-110" />
            {{ item.label }}
            <span v-if="item.name === 'cash' && pendingCash" class="ml-auto rounded-full bg-accent-500 px-1.5 text-[11px] font-bold text-white tabular-nums" title="Serah terima kas menunggu konfirmasi Anda">{{ pendingCash }}</span>
          </RouterLink>
        </div>
      </nav>
      <div class="space-y-1 border-t border-white/10 p-3">
        <InstallPrompt class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-100 hover:bg-white/10 hover:text-white" />
        <div class="flex items-center justify-between gap-2 rounded-lg px-3 py-2">
          <RouterLink :to="{ name: 'account' }" class="min-w-0 text-sm hover:underline">
            <p class="truncate font-medium">{{ auth.user?.name }}</p>
            <p class="truncate text-xs text-brand-200">{{ auth.user?.role_label }}</p>
          </RouterLink>
          <button class="rounded-lg p-2 text-brand-100 hover:bg-white/10 hover:text-white" title="Keluar" @click="logout">
            <AppIcon name="logout" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Top bar -->
    <header class="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6 lg:px-8">
      <div class="flex min-w-0 items-center gap-2 py-2.5">
        <button class="-ml-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Menu" @click="drawer = true">
          <AppIcon name="menu" />
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

    <main class="print:p-0" :class="fullWidth ? 'px-3 py-3 sm:px-4 lg:px-5' : 'px-4 py-5 sm:px-6 lg:px-8 lg:py-7 2xl:px-10'">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>
