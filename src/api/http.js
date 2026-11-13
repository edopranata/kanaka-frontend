import axios from 'axios'
import { useLoadingStore } from '../stores/loading'

export const TOKEN_KEY = 'penjualan.token'

const http = axios.create({
  // Frontend selalu disajikan Laravel di domain yang sama dengan API.
  baseURL: '/api/v1',
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
    // Masih memakai kata sandi sementara: wajib membuat kata sandi baru dulu.
    if (error.response?.status === 403 && error.response.data?.code === 'password_change_required' && !location.pathname.startsWith('/ganti-kata-sandi')) {
      location.assign(`/ganti-kata-sandi?redirect=${encodeURIComponent(location.pathname + location.search)}`)
    }
    return Promise.reject(error)
  },
)

/**
 * Ambil pesan error yang ramah dari response Laravel.
 */
export function errorMessage(error) {
  if (!error.response) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return error.config?.headers?.['Idempotency-Key']
        ? 'Server tidak merespons. Silakan coba lagi — transaksi yang sama tidak akan tercatat dua kali.'
        : 'Server terlalu lama merespons. Silakan coba lagi.'
    }
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

/** Batas waktu request transaksi: lebih dari ini dianggap gagal dan kasir boleh mencoba lagi dengan aman. */
export const TRANSACTION_TIMEOUT = 30_000

/** Kunci acak untuk satu transaksi (crypto.randomUUID hanya ada di HTTPS / localhost). */
export function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Kunci transaksi yang dipakai ulang selama isi transaksinya sama. holder = { key, fingerprint } (boleh disimpan di
 * localStorage bersama keranjang) — setelah layar macet / muat ulang, Bayar lagi memakai kunci yang sama sehingga server
 * mengembalikan transaksi yang sudah tersimpan, bukan membuat yang baru. Isi berubah → kunci baru.
 */
export function transactionKey(holder, content) {
  const fingerprint = JSON.stringify(content)
  if (holder?.key && holder.fingerprint === fingerprint) return holder
  return { key: newIdempotencyKey(), fingerprint }
}

/**
 * POST transaksi sekali-jadi (kasir, bon, bayar piutang): header Idempotency-Key + batas waktu.
 * response.replayed = true bila server mengembalikan transaksi yang sudah tersimpan sebelumnya.
 */
export async function postTransaction(url, data, key) {
  const response = await http.post(url, data, { headers: { 'Idempotency-Key': key }, timeout: TRANSACTION_TIMEOUT })
  response.replayed = response.headers['idempotent-replayed'] === 'true'
  return response
}

export const REPLAYED_MESSAGE = 'Transaksi ini sudah tersimpan sebelumnya — tidak dicatat dua kali.'

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
