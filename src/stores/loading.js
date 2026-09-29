import { defineStore } from 'pinia'

/**
 * Hitung request yang sedang berjalan untuk menampilkan loading bar di atas layar.
 */
export const useLoadingStore = defineStore('loading', {
  state: () => ({ pending: 0 }),
  getters: {
    active: (state) => state.pending > 0,
  },
  actions: {
    start() {
      this.pending++
    },
    done() {
      this.pending = Math.max(0, this.pending - 1)
    },
  },
})
