import { defineStore } from 'pinia'
import http, { TOKEN_KEY } from '../api/http'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY),
    user: null,
    // Login menunggu kode verifikasi 2 langkah (challenge dari server, berlaku 5 menit).
    challenge: null,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
    permissions: (state) => state.user?.permissions || [],
    mustChangePassword: (state) => Boolean(state.user?.must_change_password),
  },
  actions: {
    /**
     * Cek hak akses. Terima satu atau beberapa permission (cukup salah satu).
     */
    can(...permissions) {
      return permissions.flat().some((permission) => this.permissions.includes(permission))
    },
    /** Halaman pertama setelah login (diatur per role: Dashboard / Kasir). */
    homePath() {
      if (this.user?.home === 'pos' && this.can('pos')) return '/kasir'
      return this.can('dashboard') ? '/' : '/profil'
    },
    /**
     * Masuk dengan nama pengguna & kata sandi. Hasil: 'ok' atau 'two_factor' (lanjut ke verifyTwoFactor).
     */
    async login(username, password) {
      const { data } = await http.post('/auth/login', { username, password, device_name: navigator.userAgent.slice(0, 100) })
      return this.handleLogin(data)
    },
    async loginWithGoogle(credential) {
      const { data } = await http.post('/auth/google', { credential, device_name: navigator.userAgent.slice(0, 100) })
      return this.handleLogin(data)
    },
    /** @param {{ code?: string, recovery_code?: string }} payload */
    async verifyTwoFactor(payload) {
      const { data } = await http.post('/auth/two-factor-challenge', { challenge: this.challenge, ...payload })
      return this.handleLogin(data)
    },
    handleLogin(data) {
      if (data.two_factor) {
        this.challenge = data.challenge
        return 'two_factor'
      }
      this.challenge = null
      this.token = data.token
      this.user = data.user
      localStorage.setItem(TOKEN_KEY, data.token)
      return 'ok'
    },
    async fetchUser() {
      if (!this.token || this.user) return
      const { data } = await http.get('/auth/me')
      this.user = data.data
    },
    async logout() {
      try {
        await http.post('/auth/logout')
      } finally {
        this.token = null
        this.user = null
        this.challenge = null
        localStorage.removeItem(TOKEN_KEY)
      }
    },
  },
})
