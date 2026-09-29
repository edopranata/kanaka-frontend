import axios from 'axios'
import { useLoadingStore } from '../stores/loading'

export const TOKEN_KEY = 'penjualan.token'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { Accept: 'application/json' },
})

http.interceptors.request.use((config) => {
  useLoadingStore().start()
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (response) => {
    useLoadingStore().done()
    return response
  },
  (error) => {
    useLoadingStore().done()
    if (error.response?.status === 401 && !error.config.url.endsWith('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY)
      if (!location.pathname.startsWith('/login')) {
        location.assign(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
      }
    }
    return Promise.reject(error)
  },
)

/**
 * Ambil pesan error yang ramah dari response Laravel.
 */
export function errorMessage(error) {
  if (!error.response) {
    return navigator.onLine ? 'Tidak dapat terhubung ke server.' : 'Anda sedang offline.'
  }
  const data = error.response.data
  if (data?.errors) {
    return Object.values(data.errors).flat()[0]
  }
  return data?.message || 'Terjadi kesalahan.'
}

/**
 * Error validasi per field: { field: 'pesan' }.
 */
export function validationErrors(error) {
  const errors = error.response?.status === 422 ? error.response.data.errors || {} : {}
  return Object.fromEntries(Object.entries(errors).map(([key, messages]) => [key, messages[0]]))
}

/**
 * Unduh file (Excel) dari endpoint yang membutuhkan token.
 */
export async function download(url, params, fallbackName) {
  const response = await http.get(url, { params, responseType: 'blob' })
  const disposition = response.headers['content-disposition'] || ''
  const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  const fileName = match ? decodeURIComponent(match[1]) : fallbackName

  const href = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

export default http
