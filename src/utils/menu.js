/**
 * Struktur menu sidebar: entri tunggal atau menu induk dengan sub-menu. `name` = nama route; `match` = route yang
 * menandai menu aktif. Dipakai sidebar, pengaturan menu pintasan (Profil Saya), dan pintasan bawaan role.
 */
export const MENU = [
  { name: 'dashboard', label: 'Dashboard', icon: 'home', match: ['dashboard'] },
  {
    key: 'sales',
    label: 'Penjualan',
    icon: 'cart',
    children: [
      { name: 'pos', label: 'Kasir (POS)', icon: 'cart', match: ['pos'] },
      { name: 'credit-sales', label: 'Penjualan Kredit (Bon)', icon: 'book', match: ['credit-sales', 'credit-sale-create'] },
      { name: 'sales', label: 'Riwayat Penjualan', icon: 'receipt', match: ['sales', 'sale'] },
      { name: 'discounts', label: 'Diskon & Promo', icon: 'percent', match: ['discounts'] },
      { name: 'customers', label: 'Pelanggan', icon: 'users', match: ['customers'] },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: 'cube',
    children: [
      { name: 'products', label: 'Produk & Kategori', icon: 'cube', match: ['products', 'stock-card'] },
      { name: 'packages', label: 'Paket / Menu Olahan', icon: 'fire', match: ['packages'] },
      { name: 'purchases', label: 'Pembelian', icon: 'truck', match: ['purchases', 'purchase', 'purchase-create'] },
      { name: 'consignments', label: 'Barang Titipan', icon: 'inbox', match: ['consignments', 'consignment-receive', 'consignment-receipt', 'consignment-settle', 'consignment-settlement'] },
      { name: 'adjustments', label: 'Penyesuaian & Opname', icon: 'archive', match: ['adjustments', 'adjustment', 'adjustment-create'] },
      { name: 'suppliers', label: 'Supplier', icon: 'tag', match: ['suppliers'] },
    ],
  },
  {
    key: 'finance',
    label: 'Keuangan',
    icon: 'wallet',
    children: [
      { name: 'cash', label: 'Kas & Bank', icon: 'cash', match: ['cash'] },
      { name: 'bills', label: 'Tagihan & Piutang', icon: 'document', match: ['bills', 'bill'] },
      { name: 'expenses', label: 'Pengeluaran', icon: 'wallet', match: ['expenses'] },
      { name: 'closings', label: 'Closing Harian', icon: 'lock', match: ['closings', 'closing'] },
    ],
  },
  { name: 'reports', label: 'Laporan', icon: 'chart', match: ['reports'] },
  {
    key: 'admin',
    label: 'Administrasi',
    icon: 'shield',
    children: [
      { name: 'users', label: 'Pengguna', icon: 'user', match: ['users'] },
      { name: 'roles', label: 'Role & Hak Akses', icon: 'shield', match: ['roles'] },
      { name: 'logs', label: 'Log Aktivitas', icon: 'clipboard', match: ['logs'] },
      { name: 'settings', label: 'Pengaturan', icon: 'cog', match: ['settings'] },
    ],
  },
]

/** Batas jumlah menu pintasan di sidebar (sama dengan MenuShortcuts::MAX di backend). */
export const MAX_SHORTCUTS = 4

/** Semua halaman yang bisa dijadikan pintasan (kecuali Dashboard), beserta nama grupnya. */
export const SHORTCUT_OPTIONS = MENU.flatMap((entry) =>
  entry.children ? entry.children.map((child) => ({ ...child, group: entry.label })) : entry.name === 'dashboard' ? [] : [{ ...entry, group: null }],
)
export const shortcutOption = (name) => SHORTCUT_OPTIONS.find((item) => item.name === name)
