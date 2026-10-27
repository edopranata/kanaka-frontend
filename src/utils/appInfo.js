import { ref } from 'vue'
import http from '../api/http'

/**
 * Info aplikasi publik (tanpa login) untuk halaman masuk / lupa kata sandi: nama aplikasi, toko, dan client ID
 * Google (tombol "Masuk dengan Google" hanya tampil bila diisi di server).
 */
export const appInfo = ref({ app_name: 'Aplikasi Penjualan', app_tagline: 'Kasir · Inventory · Closing · Laporan', store_name: '', google_client_id: null })

let request = null

export function loadAppInfo() {
  request ??= http
    .get('/app-info')
    .then(({ data }) => (appInfo.value = data))
    .catch(() => {
      // Tetap tampilkan nama bawaan bila server belum bisa dihubungi; coba lagi di pemanggilan berikutnya.
      request = null
    })
  return request
}
