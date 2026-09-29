import { defineStore } from 'pinia'
import http from '../api/http'

/**
 * Data referensi: info toko (untuk struk), metode bayar, tanggal usaha, dll.
 */
export const useMetaStore = defineStore('meta', {
  state: () => ({
    loaded: false,
    app: { name: 'Aplikasi Penjualan', tagline: '', receipt_paper: '80' },
    defaults: { unit: 'PCS', min_stock: 5, package_unit: 'PORSI' },
    store: { name: 'Aplikasi Penjualan', address: '', phone: '', receipt_footer: '' },
    tax_percent: 0,
    business_date: null,
    payment_methods: [],
    roles: [],
    adjustment_types: [],
    expense_categories: [],
  }),
  getters: {
    paymentLabel: (state) => (value) => state.payment_methods.find((method) => method.value === value)?.label || value,
    roleLabel: (state) => (value) => state.roles.find((role) => role.value === value)?.label || value,
  },
  actions: {
    async load(force = false) {
      if (this.loaded && !force) return
      const { data } = await http.get('/meta')
      Object.assign(this, data, { loaded: true })
    },
  },
})
