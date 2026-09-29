import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useMetaStore } from '../stores/meta'
import AppLayout from '../layouts/AppLayout.vue'

const view = (name) => () => import(`../views/${name}.vue`)

const routes = [
  {
    path: '/login',
    name: 'login',
    component: view('LoginView'),
    meta: { guest: true, title: 'Masuk' },
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
      { path: 'diskon', name: 'discounts', component: view('DiscountsView'), meta: { title: 'Diskon & Promo', permission: 'discounts.manage' } },
      { path: 'kredit', name: 'credit-sales', component: view('CreditSalesView'), meta: { title: 'Penjualan Kredit', permission: 'credit.sell' } },
      { path: 'kredit/baru', name: 'credit-sale-create', component: view('CreditSaleFormView'), meta: { title: 'Bon Baru', permission: 'credit.sell' } },
      { path: 'tagihan', name: 'bills', component: view('BillsView'), meta: { title: 'Tagihan & Piutang', permission: 'receivables.manage' } },
      { path: 'tagihan/:id', name: 'bill', component: view('BillDetailView'), meta: { title: 'Detail Tagihan', permission: 'receivables.manage' } },

      { path: 'produk', name: 'products', component: view('ProductsView'), meta: { title: 'Produk', permission: 'products.view' } },
      { path: 'paket', name: 'packages', component: view('PackagesView'), meta: { title: 'Paket / Menu Olahan', permission: 'products.view' } },
      { path: 'produk/:id/kartu-stok', name: 'stock-card', component: view('StockCardView'), meta: { title: 'Kartu Stok', permission: 'stock.view' } },
      { path: 'supplier', name: 'suppliers', component: view('ContactsView'), props: { type: 'suppliers' }, meta: { title: 'Supplier', permission: 'suppliers.manage' } },
      { path: 'pelanggan', name: 'customers', component: view('ContactsView'), props: { type: 'customers' }, meta: { title: 'Pelanggan', permission: 'customers.manage' } },

      { path: 'pembelian', name: 'purchases', component: view('PurchasesView'), meta: { title: 'Pembelian', permission: 'purchases.manage' } },
      { path: 'pembelian/baru', name: 'purchase-create', component: view('PurchaseFormView'), meta: { title: 'Pembelian Baru', permission: 'purchases.manage' } },
      { path: 'pembelian/:id', name: 'purchase', component: view('PurchaseDetailView'), meta: { title: 'Detail Pembelian', permission: 'purchases.manage' } },
      { path: 'titipan', name: 'consignments', component: view('ConsignmentsView'), meta: { title: 'Barang Titipan', permission: 'consignments.manage' } },
      { path: 'titipan/masuk/baru', name: 'consignment-receive', component: view('ConsignmentReceiptFormView'), meta: { title: 'Titipan Masuk', permission: 'consignments.manage' } },
      { path: 'titipan/masuk/:id', name: 'consignment-receipt', component: view('ConsignmentReceiptDetailView'), meta: { title: 'Detail Titipan Masuk', permission: 'consignments.manage' } },
      { path: 'titipan/selesaikan', name: 'consignment-settle', component: view('ConsignmentSettleView'), meta: { title: 'Penyelesaian Titipan', permission: 'consignments.manage' } },
      { path: 'titipan/penyelesaian/:id', name: 'consignment-settlement', component: view('ConsignmentSettlementDetailView'), meta: { title: 'Detail Penyelesaian Titipan', permission: 'consignments.manage' } },
      { path: 'stok', name: 'adjustments', component: view('AdjustmentsView'), meta: { title: 'Penyesuaian Stok', permission: 'stock.manage' } },
      { path: 'stok/baru', name: 'adjustment-create', component: view('AdjustmentFormView'), meta: { title: 'Penyesuaian Stok Baru', permission: 'stock.manage' } },
      { path: 'stok/:id', name: 'adjustment', component: view('AdjustmentDetailView'), meta: { title: 'Detail Penyesuaian', permission: 'stock.manage' } },

      { path: 'kas', name: 'cash', component: view('CashView'), meta: { title: 'Kas & Bank' } },
      { path: 'pengeluaran', name: 'expenses', component: view('ExpensesView'), meta: { title: 'Pengeluaran', permission: 'expenses.manage' } },
      { path: 'closing', name: 'closings', component: view('ClosingsView'), meta: { title: 'Closing Harian', permission: 'closings.view' } },
      { path: 'closing/:id', name: 'closing', component: view('ClosingDetailView'), meta: { title: 'Detail Closing', permission: 'closings.view' } },
      { path: 'laporan', name: 'reports', component: view('ReportsView'), meta: { title: 'Laporan', permission: ['reports.sales', 'reports.profit', 'reports.stock'] } },

      { path: 'pengguna', name: 'users', component: view('UsersView'), meta: { title: 'Pengguna', permission: 'users.manage' } },
      { path: 'log-aktivitas', name: 'logs', component: view('ActivityLogsView'), meta: { title: 'Log Aktivitas', permission: 'logs.view' } },
      { path: 'pengaturan', name: 'settings', component: view('SettingsView'), meta: { title: 'Pengaturan Aplikasi', permission: 'settings.manage' } },
      { path: 'akun', name: 'account', component: view('AccountView'), meta: { title: 'Akun Saya' } },
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
    await useMetaStore().load().catch(() => {})

    if (to.meta.permission && !auth.can(to.meta.permission)) {
      return to.name === 'dashboard' ? { name: 'account' } : { name: 'dashboard' }
    }
  }
})

router.afterEach((to) => {
  const meta = useMetaStore()
  const store = meta.store?.name || meta.app?.name || 'Aplikasi Penjualan'
  document.title = to.meta.title ? `${to.meta.title} · ${store}` : store
})

export default router
