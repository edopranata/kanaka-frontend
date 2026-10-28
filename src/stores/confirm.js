import { defineStore } from 'pinia'

let nextId = 1

/**
 * Dialog konfirmasi bergaya aplikasi, pengganti confirm() / prompt() bawaan browser.
 * Ditampilkan oleh ConfirmDialog (dipasang sekali di App.vue).
 */
export const useConfirmStore = defineStore('confirm', {
  state: () => ({ current: null }),
  actions: {
    /**
     * @param {{ title: string, message?: string, confirmLabel?: string, cancelLabel?: string, tone?: 'danger'|'warning'|'primary', icon?: string,
     *   input?: { label: string, value?: string, placeholder?: string, required?: boolean } }} options
     * @returns {Promise<boolean|string|null>} true/false; dengan `input`: teks isian atau null bila dibatalkan.
     */
    ask(options) {
      this.cancel()
      return new Promise((resolve) => {
        this.current = { id: nextId++, confirmLabel: 'Ya, lanjutkan', cancelLabel: 'Batal', tone: 'primary', ...options, resolve, answered: false }
      })
    },
    /** Jawab tanpa menunggu animasi tutup; dialog tetap tampil sampai animasinya selesai (dismiss). */
    answer(result) {
      const current = this.current
      if (!current || current.answered) return
      current.answered = true
      current.resolve(result)
    },
    cancel() {
      this.answer(this.current?.input ? null : false)
    },
    dismiss(id) {
      if (this.current?.id !== id) return
      this.cancel()
      this.current = null
    },
  },
})

/** Pintasan: `if (!(await confirmDialog({ title, message }))) return` */
export const confirmDialog = (options) => useConfirmStore().ask(options)
