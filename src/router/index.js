import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'
import AppLayout from '../layouts/AppLayout.vue'

const view = (name) => () => import(`../views/${name}.vue`)

// Hak akses laporan per jenis (lihat backend ReportService::TYPES).
export const REPORT_PERMISSIONS = ['sales', 'products', 'categories', 'cashiers', 'payments', 'closings', 'receivables', 'discounts', 'profit_loss', 'expenses', 'stock', 'purchases'].map((type) => `reports.${type}`)

// Hak akses tab Pengaturan Aplikasi (lihat backend SettingTabs).
export const SETTINGS_PERMISSIONS = ['app', 'store', 'numbering', 'transaction', 'closing', 'security', 'maintenance'].map((tab) => `settings.${tab}`)

const routes = [
  {
    // Struk digital publik (QR di struk) — tanpa login & tanpa menu aplikasi.
    path: '/struk/:token',
    name: 'public-receipt',
    component: view('ReceiptPublicView'),
    meta: { public: true, title: 'Struk digital' },
  },
  // Tautan pendek untuk QR di struk (QR lebih kecil & cepat dicetak).
  { path: '/s/:token', redirect: (to) => ({ name: 'public-receipt', params: { token: to.params.token } }) },
  {
    path: '/login',
    name: 'login',
    component: view('LoginView'),
    meta: { guest: true, title: 'Masuk' },
  },
  {
    path: '/lupa-kata-sandi',
    name: 'forgot-password',
    component: view('ForgotPasswordView'),
    meta: { guest: true, title: 'Lupa kata sandi' },
  },
  {
    // Tautan dari email "Lupa kata sandi" — bisa dibuka walau sedang login di perangkat ini.
    path: '/reset-kata-sandi',
    name: 'reset-password',
    component: view('ResetPasswordView'),
    meta: { public: true, title: 'Atur ulang kata sandi' },
  },
  {
    // Wajib setelah masuk dengan kata sandi sementara (akun baru / diatur ulang pemilik).
    path: '/ganti-kata-sandi',
    name: 'change-password',
    component: view('ChangePasswordView'),
    meta: { auth: true, title: 'Buat kata sandi baru' },
  },
  {
    path: '/',
    component: AppLayout,
    meta: { auth: true },
    children: [
      { path: '', name: 'dashboard', component: view('DashboardView'), meta: { title: 'Dashboard', permission: 'dashboard' } },
      { path: 'kasir', name: 'pos', component: view('PosView'), meta: { title: 'Kasir', permission: 'pos', fullWidth: true } },
      { path: 'penjualan', name: 'sales', component: view('SalesView'), meta: { title: 'Riwayat Penjualan', permission: ['pos', 'credit.sell', 'sales.view_all'] } },
      { path: 'penjualan/:id', name: 'sale', component: view('SaleDetailView'), meta: { title: 'Detail Penjualan', permission: ['pos', 'credit.sell', 'sales.view_all'] } },
      { path: 'diskon', name: 'discounts', component: view('DiscountsView'), meta: { title: 'Diskon & Promo', permission: 'discounts.view' } },
      { path: 'kredit', name: 'credit-sales', component: view('CreditSalesView'), meta: { title: 'Penjualan Kredit', permission: 'credit.sell' } },
      { path: 'kredit/baru', name: 'credit-sale-create', component: view('CreditSaleFormView'), meta: { title: 'Bon Baru', permission: 'credit.sell' } },
      { path: 'tagihan', name: 'bills', component: view('BillsView'), meta: { title: 'Tagihan & Piutang', permission: 'receivables.view' } },
      { path: 'tagihan/:id', name: 'bill', component: view('BillDetailView'), meta: { title: 'Detail Tagihan', permission: 'receivables.view' } },

      { path: 'produk', name: 'products', component: view('ProductsView'), meta: { title: 'Produk', permission: 'products.view' } },
      { path: 'paket', name: 'packages', component: view('PackagesView'), meta: { title: 'Paket / Menu Olahan', permission: 'products.view' } },
      { path: 'produk/:id/kartu-stok', name: 'stock-card', component: view('StockCardView'), meta: { title: 'Kartu Stok', permission: 'stock.view' } },
      { path: 'supplier', name: 'suppliers', component: view('ContactsView'), props: { type: 'suppliers' }, meta: { title: 'Supplier', permission: 'suppliers.view' } },
      { path: 'pelanggan', name: 'customers', component: view('ContactsView'), props: { type: 'customers' }, meta: { title: 'Pelanggan', permission: 'customers.view' } },

      { path: 'pembelian', name: 'purchases', component: view('PurchasesView'), meta: { title: 'Pembelian', permission: 'purchases.view' } },
      { path: 'pembelian/baru', name: 'purchase-create', component: view('PurchaseFormView'), meta: { title: 'Pembelian Baru', permission: 'purchases.create' } },
      { path: 'pembelian/:id', name: 'purchase', component: view('PurchaseDetailView'), meta: { title: 'Detail Pembelian', permission: 'purchases.view' } },
      { path: 'titipan', name: 'consignments', component: view('ConsignmentsView'), meta: { title: 'Barang Titipan', permission: 'consignments.view' } },
      { path: 'titipan/masuk/baru', name: 'consignment-receive', component: view('ConsignmentReceiptFormView'), meta: { title: 'Titipan Masuk', permission: 'consignments.receive' } },
      { path: 'titipan/masuk/:id', name: 'consignment-receipt', component: view('ConsignmentReceiptDetailView'), meta: { title: 'Detail Titipan Masuk', permission: 'consignments.view' } },
      { path: 'titipan/selesaikan', name: 'consignment-settle', component: view('ConsignmentSettleView'), meta: { title: 'Penyelesaian Titipan', permission: 'consignments.settle' } },
      { path: 'titipan/penyelesaian/:id', name: 'consignment-settlement', component: view('ConsignmentSettlementDetailView'), meta: { title: 'Detail Penyelesaian Titipan', permission: 'consignments.view' } },
      { path: 'stok', name: 'adjustments', component: view('AdjustmentsView'), meta: { title: 'Penyesuaian Stok', permission: ['stock.adjust', 'stock.opname', 'stock.view_all'] } },
      { path: 'stok/baru', name: 'adjustment-create', component: view('AdjustmentFormView'), meta: { title: 'Penyesuaian Stok Baru', permission: ['stock.adjust', 'stock.opname'] } },
      { path: 'stok/:id', name: 'adjustment', component: view('AdjustmentDetailView'), meta: { title: 'Detail Penyesuaian', permission: ['stock.adjust', 'stock.opname', 'stock.view_all'] } },

      { path: 'kas', name: 'cash', component: view('CashView'), meta: { title: 'Kas & Bank' } },
      { path: 'pengeluaran', name: 'expenses', component: view('ExpensesView'), meta: { title: 'Pengeluaran', permission: 'expenses.view' } },
      { path: 'closing', name: 'closings', component: view('ClosingsView'), meta: { title: 'Closing Harian', permission: 'closings.view' } },
      { path: 'closing/:id', name: 'closing', component: view('ClosingDetailView'), meta: { title: 'Detail Closing', permission: 'closings.view' } },
      { path: 'laporan', name: 'reports', component: view('ReportsView'), meta: { title: 'Laporan', permission: REPORT_PERMISSIONS } },

      { path: 'role', name: 'roles', component: view('RolesView'), meta: { title: 'Role & Hak Akses', permission: 'roles.manage' } },
      { path: 'pengguna', name: 'users', component: view('UsersView'), meta: { title: 'Pengguna', permission: 'users.view' } },
      { path: 'log-aktivitas', name: 'logs', component: view('ActivityLogsView'), meta: { title: 'Log Aktivitas', permission: 'logs.view' } },
      { path: 'pengaturan', name: 'settings', component: view('SettingsView'), meta: { title: 'Pengaturan', permission: SETTINGS_PERMISSIONS } },
      // Printer struk per perangkat (tersimpan di browser) — untuk semua pengguna.
      { path: 'printer', name: 'printer', component: view('PrinterView'), meta: { title: 'Printer Struk' } },
      { path: 'profil', alias: 'akun', name: 'account', component: view('AccountView'), meta: { title: 'Profil Saya' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.matched.some((record) => record.meta.auth) && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guest && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }
  if (auth.isAuthenticated) {
    await auth.fetchUser().catch(() => {})
    if (!to.meta.public) {
      if (auth.mustChangePassword && to.name !== 'change-password') return { name: 'change-password', query: { redirect: to.fullPath } }
      if (!auth.mustChangePassword && auth.user && to.name === 'change-password') return auth.homePath()
    }
    if (auth.mustChangePassword) return
    // Tautan lama Pengaturan → tab Printer.
    if (to.name === 'settings' && to.query.tab === 'printer') return { name: 'printer' }
    await useMetaStore().load().catch(() => {})

    if (to.meta.permission && !auth.can(to.meta.permission)) {
      return to.name === 'dashboard' ? { name: 'account' } : { name: 'dashboard' }
    }
  }
})

// Setelah rilis baru, file halaman versi lama sudah dihapus dari server: muat ulang ke halaman tujuan
// (sekali saja dalam 10 detik agar tidak berulang bila memang sedang offline).
router.onError((error, to) => {
  if (!/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error?.message || '')) return
  try {
    if (Date.now() - Number(sessionStorage.getItem('chunk-reload') || 0) < 10000) return
    sessionStorage.setItem('chunk-reload', String(Date.now()))
  } catch {
    // tanpa penyimpanan sesi: tetap coba muat ulang
  }
  window.location.assign(to.fullPath)
})

router.afterEach((to) => {
  const meta = useMetaStore()
  const store = meta.store?.name || meta.app?.name || 'Aplikasi Penjualan'
  document.title = to.meta.title ? `${to.meta.title} · ${store}` : store
})

export default router
