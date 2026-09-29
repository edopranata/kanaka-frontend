import { defineStore } from 'pinia'

let nextId = 1

export const useToastStore = defineStore('toast', {
  state: () => ({ items: [] }),
  actions: {
    show(message, type = 'success', timeout = 3500) {
      const id = nextId++
      this.items.push({ id, message, type })
      setTimeout(() => this.dismiss(id), timeout)
    },
    success(message) {
      this.show(message, 'success')
    },
    error(message) {
      this.show(message, 'error', 6000)
    },
    dismiss(id) {
      this.items = this.items.filter((item) => item.id !== id)
    },
  },
})
