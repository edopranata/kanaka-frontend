import { computed, reactive, watch } from 'vue'

/**
 * Printer struk per perangkat (disimpan di browser ini, bukan di server):
 * - browser   : dialog cetak browser (cara lama, butuh driver printer di sistem).
 * - serial    : Web Serial — port COM / Bluetooth klasik (SPP). Untuk Windows: printer Bluetooth yang sudah
 *               di-pairing muncul sebagai "Standard Serial over Bluetooth link (COMx)"; juga printer USB-serial.
 * - bluetooth : Web Bluetooth (BLE) — printer thermal yang mendukung Bluetooth Low Energy.
 * Mode serial & bluetooth mengirim perintah ESC/POS langsung tanpa dialog cetak (Chrome / Edge).
 */
const KEY = 'penjualan.printer'
// Layanan BLE umum printer thermal (ISSC/Microchip, 18F0, FF00, E781…).
const BLE_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
]

// deviceName: nama perangkat ini (mis. "Kasir Depan") agar mudah dikenali bila ada beberapa PC / HP kasir.
const DEFAULTS = { mode: 'browser', paper: '', autoPrint: false, feed: 3, cut: true, qrSize: 'sedang', deviceId: '', deviceName: '', hideBrowserNotice: false }

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export const printerConfig = reactive(load())
watch(printerConfig, (value) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // penyimpanan browser tidak tersedia
  }
}, { deep: true })

// status: '' (belum dicek) | checking | ready | unpaired (belum dipilih) | offline (tidak merespons / terputus)
export const printerState = reactive({ connected: false, connecting: false, name: '', lastError: '', status: '', log: [] })

/** Catatan diagnostik singkat (tampil di halaman Printer Struk). */
function log(message) {
  const time = new Date().toLocaleTimeString('id-ID')
  printerState.log.unshift(`${time}  ${message}`)
  printerState.log.splice(12)
}

/** Batasi lama sebuah langkah agar aplikasi tidak menunggu printer yang diam selamanya. */
function withTimeout(promise, ms, message) {
  let timer
  return Promise.race([promise, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(message)), ms)))]).finally(() => clearTimeout(timer))
}

export const support = {
  serial: typeof navigator !== 'undefined' && 'serial' in navigator,
  bluetooth: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
}

let port = null
let ble = null // { device, characteristic }

export const isDirect = () => printerConfig.mode === 'serial' || printerConfig.mode === 'bluetooth'

function portName(info) {
  if (info?.bluetoothServiceClassId) return 'Printer Bluetooth (serial)'
  if (info?.usbVendorId) return `Printer USB (${info.usbVendorId.toString(16)}:${(info.usbProductId || 0).toString(16)})`
  return 'Printer (port serial / COM)'
}

/**
 * Port serial disimpan saat dipilih (izin dari browser). Port dibuka saat mencetak dan ditutup otomatis
 * setelah beberapa detik menganggur (lihat writeSerial), karena printer Bluetooth (SPP) memutus koneksi
 * yang lama menganggur.
 */
function usePort(selected) {
  port = selected
  printerState.connected = true
  printerState.name = portName(selected.getInfo?.())
  log(`Port dipilih: ${printerState.name} ${JSON.stringify(selected.getInfo?.() || {})}`)
  selected.addEventListener?.('disconnect', () => {
    if (port === selected) {
      log('Port dilepas oleh sistem (printer mati / Bluetooth terputus).')
      disconnected()
      printerState.status = 'offline'
      printerState.lastError = 'Printer terputus (mati / Bluetooth terputus).'
    }
  })
}

async function closePort(target) {
  try {
    if (target && (target.readable || target.writable)) await target.close()
  } catch {
    // sudah tertutup / masih dipakai
  }
}

let idleTimer = null
let queue = Promise.resolve()

/**
 * Tulis ke port serial. Port dibuka bila perlu lalu DIBIARKAN TERBUKA beberapa detik setelah menulis:
 * write() selesai begitu data masuk antrean sistem, padahal koneksi Bluetooth ke printer baru tersambung
 * ±1–2 detik setelah port dibuka — bila port langsung ditutup, data belum sampai & tidak tercetak.
 * Setelah menganggur, port ditutup (printer Bluetooth memutus koneksi yang lama menganggur).
 */
function writeSerial(target, bytes) {
  const job = queue.then(() => writeSerialNow(target, bytes))
  queue = job.catch(() => {})
  return job
}

async function writeSerialNow(target, bytes) {
  clearTimeout(idleTimer)
  const started = performance.now()
  if (!target.writable) {
    try {
      await withTimeout(target.open({ baudRate: 9600 }), 15000, 'Printer tidak merespons saat dihubungkan (15 dtk). Pastikan printer menyala, tidak terhubung ke perangkat lain, dan port yang dipilih benar.')
    } catch (e) {
      // Pesan bawaan browser ("Failed to open serial port") diganti penjelasan yang bisa ditindaklanjuti kasir.
      if (/failed to open/i.test(e?.message)) throw new Error('Port printer tidak bisa dibuka: printer mati, di luar jangkauan Bluetooth, atau sedang terhubung ke perangkat lain.')
      throw e
    }
    log(`Port terbuka (${Math.round(performance.now() - started)} ms)`)
  }
  const writer = target.writable.getWriter()
  try {
    for (let offset = 0; offset < bytes.length; offset += 256) {
      await withTimeout(writer.write(bytes.slice(offset, offset + 256)), 10000, 'Printer tidak menerima data (10 dtk). Coba matikan-nyalakan printer lalu Tes Print lagi.')
      // Jeda kecil (±10 KB/dtk) agar buffer printer tidak meluap — printer tanpa kontrol aliran data
      // membuang data berlebih sehingga gambar/QR tercetak separuh.
      await pause(25)
    }
    await withTimeout(writer.ready, 10000, 'Pengiriman data ke printer tidak selesai (10 dtk).')
    log(`Dikirim ${bytes.length} byte ke antrean (${Math.round(performance.now() - started)} ms)`)
  } catch (e) {
    try {
      await writer.abort()
    } catch {
      // abaikan
    }
    writer.releaseLock()
    await closePort(target)
    throw e
  }
  writer.releaseLock()

  // Tutup setelah menganggur: cukup lama agar koneksi Bluetooth tersambung & semua data terkirim.
  const hold = Math.max(5000, bytes.length * 5)
  idleTimer = setTimeout(async () => {
    await closePort(target)
    log('Port ditutup (menganggur)')
  }, hold)
}

async function connectBle(device) {
  const server = await device.gatt.connect()
  for (const uuid of BLE_SERVICES) {
    let service
    try {
      service = await server.getPrimaryService(uuid)
    } catch {
      continue
    }
    for (const characteristic of await service.getCharacteristics()) {
      if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
        ble = { device, characteristic }
        printerState.connected = true
        printerState.name = device.name || 'Printer Bluetooth'
        printerConfig.deviceId = device.id
        device.addEventListener('gattserverdisconnected', () => {
          if (ble?.device !== device) return
          disconnected()
          printerState.status = 'offline'
          printerState.lastError = 'Printer Bluetooth terputus.'
        }, { once: true })
        return
      }
    }
  }
  device.gatt.disconnect()
  throw new Error('Printer ini tidak menyediakan layanan cetak BLE yang dikenali. Coba mode "Port serial / Bluetooth COM".')
}

function disconnected() {
  port = null
  ble = null
  printerState.connected = false
  printerState.status = ''
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Pilih printer (membuka dialog pilihan perangkat dari browser — harus dari klik pengguna). */
export async function choosePrinter() {
  printerState.connecting = true
  try {
    await disconnect()
    if (printerConfig.mode === 'serial') {
      // Tanpa allowedBluetoothServiceClassIds: daftar hanya berisi port serial sistem (COMx di Windows,
      // cu.NAMA di Mac). Entri Bluetooth bawaan Chrome gagal dibuka untuk printer SPP seperti RPP02N.
      usePort(await navigator.serial.requestPort())
      // Uji koneksi: kirim perintah inisialisasi (ESC @) — tidak mencetak apa pun.
      try {
        await writeSerial(port, new Uint8Array([0x1b, 0x40]))
      } catch (e) {
        printerState.lastError = e.message
        log(`GAGAL uji koneksi: ${e.message}`)
        disconnected()
        printerState.status = 'offline'
        throw e
      }
    } else if (printerConfig.mode === 'bluetooth') {
      await connectBle(await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES }))
    }
    printerState.status = 'ready'
    printerState.lastError = ''
  } finally {
    printerState.connecting = false
  }
}

/** Sambungkan kembali printer yang sudah pernah dipilih di browser ini (tanpa dialog). */
export async function reconnect() {
  if (printerState.connected || printerState.connecting || !isDirect()) return printerState.connected
  printerState.connecting = true
  try {
    if (printerConfig.mode === 'serial' && support.serial) {
      const [known] = await navigator.serial.getPorts()
      if (known) usePort(known)
    } else if (printerConfig.mode === 'bluetooth' && navigator.bluetooth?.getDevices) {
      const device = (await navigator.bluetooth.getDevices()).find((item) => item.id === printerConfig.deviceId)
      if (device) await connectBle(device)
    }
  } catch {
    disconnected()
  } finally {
    printerState.connecting = false
  }
  return printerState.connected
}

export async function disconnect() {
  clearTimeout(idleTimer)
  try {
    await closePort(port)
    if (ble?.device.gatt.connected) ble.device.gatt.disconnect()
  } catch {
    // sudah terputus
  }
  disconnected()
}

/** Lupakan printer (izin browser untuk port / perangkat ini dicabut). */
export async function forgetPrinter() {
  const current = port
  await disconnect()
  try {
    await current?.forget?.()
  } catch {
    // tidak didukung
  }
  printerConfig.deviceId = ''
}

/** Kirim byte ESC/POS ke printer (dipotong kecil-kecil agar buffer printer tidak penuh). */
export async function sendBytes(bytes) {
  printerState.lastError = ''
  try {
    if (!(await reconnect())) {
      throw new Error('Printer belum dipilih. Buka menu pengguna → Printer struk, lalu klik "Hubungkan printer".')
    }

    if (port) {
      await writeSerial(port, bytes)
      printerState.status = 'ready'
      return
    }

    const { characteristic } = ble
    const size = characteristic.properties.writeWithoutResponse ? 180 : 100
    for (let offset = 0; offset < bytes.length; offset += size) {
      const chunk = bytes.slice(offset, offset + size)
      if (characteristic.properties.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(chunk)
        await pause(20)
      } else {
        await withTimeout(characteristic.writeValue(chunk), 10000, 'Printer Bluetooth tidak merespons (10 dtk).')
      }
    }
    log(`Terkirim ${bytes.length} byte via Bluetooth LE`)
    printerState.status = 'ready'
  } catch (e) {
    printerState.status = printerState.connected ? 'offline' : 'unpaired'
    printerState.lastError = e?.message || String(e)
    log(`GAGAL: ${printerState.lastError}`)
    throw e
  }
}

/**
 * Cek printer tanpa mencetak: sambungkan printer yang sudah dipilih lalu kirim perintah inisialisasi (ESC @).
 * Hasilnya di printerState.status (lihat printerNotice).
 */
export async function checkPrinter() {
  if (!isDirect() || printerState.status === 'checking') return printerState.status
  if (!support[printerConfig.mode]) return (printerState.status = 'offline')
  printerState.status = 'checking'
  try {
    if (!(await reconnect())) return (printerState.status = 'unpaired')
    if (port) await writeSerial(port, new Uint8Array([0x1b, 0x40]))
    printerState.status = 'ready'
    printerState.lastError = ''
    log('Cek printer: siap')
  } catch (e) {
    printerState.status = 'offline'
    printerState.lastError = e?.message || String(e)
    log(`Cek printer GAGAL: ${printerState.lastError}`)
  }
  return printerState.status
}

/**
 * Pemberitahuan status printer untuk halaman kasir: null bila siap (atau sedang memakai dialog browser dan
 * pemberitahuannya disembunyikan).
 * level: info | warn | error
 */
export const printerNotice = computed(() => {
  if (printerConfig.mode === 'browser') {
    return printerConfig.hideBrowserNotice ? null : { level: 'info', key: 'browser', title: 'Printer struk belum diatur di perangkat ini', detail: 'Struk dicetak lewat dialog cetak browser. Atur printer Bluetooth / COM agar struk langsung tercetak.' }
  }
  if (!support[printerConfig.mode]) {
    return { level: 'error', key: 'unsupported', title: 'Browser tidak bisa terhubung ke printer', detail: window.isSecureContext ? 'Gunakan Google Chrome atau Microsoft Edge versi terbaru.' : 'Buka aplikasi lewat HTTPS agar bisa mencetak langsung ke printer.' }
  }
  switch (printerState.status) {
    case 'checking':
      return { level: 'info', key: 'checking', title: 'Memeriksa printer…', detail: 'Menyambungkan ke printer.' }
    case 'unpaired':
      return { level: 'warn', key: 'unpaired', title: 'Printer belum dipilih di perangkat ini', detail: 'Buka menu pengguna → Printer struk, lalu klik "Hubungkan printer".' }
    case 'offline':
      return { level: 'error', key: 'offline', title: 'Printer tidak terhubung', detail: `${printerState.lastError || 'Printer tidak merespons.'} Pastikan printer menyala & Bluetooth tersambung, lalu klik Cek lagi.` }
    default:
      return null
  }
})
