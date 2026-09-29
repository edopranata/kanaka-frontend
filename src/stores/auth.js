import { defineStore } from 'pinia'
import http, { TOKEN_KEY } from '../api/http'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY),
    user: null,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
    permissions: (state) => state.user?.permissions || [],
  },
  actions: {
    /**
     * Cek hak akses. Terima satu atau beberapa permission (cukup salah satu).
     */
    can(...permissions) {
      return permissions.flat().some((permission) => this.permissions.includes(permission))
    },
    async login(username, password) {
      const { data } = await http.post('/auth/login', {
        username,
        password,
        device_name: navigator.userAgent.slice(0, 100),
      })
      this.token = data.token
      this.user = data.user
      localStorage.setItem(TOKEN_KEY, data.token)
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
        localStorage.removeItem(TOKEN_KEY)
      }
    },
  },
})
