/**
 * Pelapor error otomatis ke Log Error (POST /api/v1/client-errors).
 *
 * - Error halaman (window.onerror), proses (promise tanpa catch), dan tampilan (Vue).
 * - Server tidak merespons (timeout) / koneksi terputus dari request API — tidak terlihat di log server.
 * - Error yang sama dikirim paling banyak sekali per menit, maksimal 20 laporan per sesi halaman.
 * - Gagal kirim (mis. sedang offline) → disimpan sementara di perangkat dan dikirim saat online lagi.
 * - Hanya saat sudah login; pelaporan tidak pernah menimbulkan error baru.
 */
const TOKEN_KEY = 'penjualan.token'
const QUEUE_KEY = 'penjualan.error-queue'
const ENDPOINT = '/api/v1/client-errors'
const MAX_PER_SESSION = 20
const SAME_ERROR_GAP = 60_000

const lastSent = new Map()
let sentCount = 0

/** Versi aplikasi = nama file bundle utama (berubah setiap build). */
function appVersion() {
  const src = document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src') || ''
  return src.match(/index-([\w-]+)\.js/)?.[1] || 'dev'
}

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

function writeQueue(queue) {
  try {
    if (queue.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-20)))
    else localStorage.removeItem(QUEUE_KEY)
  } catch {
    // penyimpanan penuh / diblokir: abaikan
  }
}

async function send(report) {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return true   // belum login: buang
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(report),
      keepalive: true,
    })
    // 4xx (mis. 422/401/429) tidak akan berhasil bila diulang → anggap selesai.
    return response.status < 500
  } catch {
    return false
  }
}

/** Kirim laporan yang tertunda (dipanggil saat kembali online & setelah laporan berhasil). */
export async function flushQueue() {
  const queue = readQueue()
  if (!queue.length || !navigator.onLine) return
  writeQueue([])
  const failed = []
  for (const report of queue) {
    if (!(await send(report))) failed.push(report)
  }
  writeQueue([...failed, ...readQueue()])
}

/**
 * @param {{kind: 'error'|'promise'|'vue'|'timeout'|'network'|'chunk', message: string, stack?: string, location?: string, method?: string}} error
 */
export function reportError({ kind, message, stack, location, method }) {
  try {
    const text = String(message || '').trim().slice(0, 2000)
    if (!text || !localStorage.getItem(TOKEN_KEY)) return
    const key = `${kind}|${text}|${location || ''}`
    const now = Date.now()
    if (sentCount >= MAX_PER_SESSION || now - (lastSent.get(key) || 0) < SAME_ERROR_GAP) return
    lastSent.set(key, now)
    sentCount++

    const report = {
      kind,
      message: text,
      stack: stack ? String(stack).slice(0, 6000) : null,
      location: location ? String(location).slice(0, 300) : null,
      method: method || null,
      url: `${window.location.pathname}${window.location.search}`.slice(0, 500),
      version: appVersion(),
    }
    send(report).then((ok) => {
      if (ok) flushQueue()
      else writeQueue([...readQueue(), report])
    })
  } catch {
    // jangan pernah menggagalkan aplikasi karena pelaporan
  }
}

// Pesan yang bukan bug aplikasi (ekstensi browser, ResizeObserver, skrip lintas domain tanpa detail).
const IGNORED = /ResizeObserver loop|^Script error\.?$|chrome-extension:|moz-extension:|safari-extension:/i

/** Pasang penangkap error global + Vue. */
export function installErrorReporter(app) {
  window.addEventListener('error', (event) => {
    const message = event.message || event.error?.message
    if (!message || IGNORED.test(message) || IGNORED.test(event.filename || '')) return
    reportError({ kind: 'error', message, stack: event.error?.stack, location: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : null })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    // Error request API sudah dilaporkan lewat interceptor (timeout/koneksi) atau tercatat di server (500).
    if (reason?.isAxiosError || reason?.name === 'CanceledError') return
    const message = reason?.message || (typeof reason === 'string' ? reason : '')
    if (!message || IGNORED.test(message)) return
    reportError({ kind: 'promise', message, stack: reason?.stack })
  })

  const previous = app.config.errorHandler
  app.config.errorHandler = (error, instance, info) => {
    const component = instance?.$options?.name || instance?.$options?.__name || 'komponen'
    reportError({ kind: 'vue', message: error?.message || String(error), stack: error?.stack, location: `${component} (${info})` })
    if (previous) previous(error, instance, info)
    else console.error(error)
  }

  window.addEventListener('online', () => flushQueue())
  flushQueue()
}
