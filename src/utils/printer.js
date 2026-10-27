import { reactive, watch } from 'vue'

/**
 * Printer struk per perangkat (disimpan di browser ini, bukan di server):
 * - browser   : dialog cetak browser (cara lama, butuh driver printer di sistem).
 * - serial    : Web Serial — port COM / Bluetooth klasik (SPP). Untuk Windows: printer Bluetooth yang sudah
 *               di-pairing muncul sebagai "Standard Serial over Bluetooth link (COMx)"; juga printer USB-serial.
 * - bluetooth : Web Bluetooth (BLE) — printer thermal yang mendukung Bluetooth Low Energy.
 * Mode serial & bluetooth mengirim perintah ESC/POS langsung tanpa dialog cetak (Chrome / Edge).
 */
const KEY = 'penjualan.printer'
const SPP = '00001101-0000-1000-8000-00805f9b34fb'
// Layanan BLE umum printer thermal (ISSC/Microchip, 18F0, FF00, E781…).
const BLE_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
]

function load() {
  try {
    return { mode: 'browser', paper: '', autoPrint: false, feed: 3, cut: true, deviceId: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { mode: 'browser', paper: '', autoPrint: false, feed: 3, cut: true, deviceId: '' }
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

export const printerState = reactive({ connected: false, connecting: false, name: '', lastError: '', log: [] })

/** Catatan diagnostik singkat (tampil di Pengaturan → Printer). */
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
  return 'Port serial / COM'
}

/**
 * Port serial hanya disimpan (izin dari browser), BUKAN dibiarkan terbuka: printer Bluetooth (SPP) biasanya
 * memutus koneksi yang menganggur sehingga port "terbuka" tidak lagi menyampaikan data. Port dibuka & ditutup
 * setiap kali mencetak (lihat writeSerial).
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

async function writeSerial(target, bytes) {
  const started = performance.now()
  if (target.readable || target.writable) await closePort(target) // sisa koneksi lama
  await withTimeout(target.open({ baudRate: 9600 }), 15000, 'Printer tidak merespons saat dihubungkan (15 dtk). Pastikan printer menyala, tidak terhubung ke perangkat lain, dan port COM yang dipilih benar.')
  log(`Port terbuka (${Math.round(performance.now() - started)} ms)`)
  const writer = target.writable.getWriter()
  try {
    for (let offset = 0; offset < bytes.length; offset += 256) {
      await withTimeout(writer.write(bytes.slice(offset, offset + 256)), 10000, 'Printer tidak menerima data (10 dtk). Coba matikan-nyalakan printer lalu Tes Print lagi.')
    }
    // Tunggu semua data benar-benar terkirim sebelum port ditutup.
    await withTimeout(writer.close(), 10000, 'Pengiriman data ke printer tidak selesai (10 dtk).')
    log(`Terkirim ${bytes.length} byte (${Math.round(performance.now() - started)} ms)`)
  } catch (e) {
    try {
      await writer.abort()
    } catch {
      // abaikan
    }
    throw e
  } finally {
    writer.releaseLock?.()
    // Beri jeda sebentar agar printer selesai menerima sebelum koneksi Bluetooth diputus.
    await pause(400)
    await closePort(target)
  }
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
        device.addEventListener('gattserverdisconnected', () => ble?.device === device && disconnected(), { once: true })
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
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Pilih printer (membuka dialog pilihan perangkat dari browser — harus dari klik pengguna). */
export async function choosePrinter() {
  printerState.connecting = true
  try {
    await disconnect()
    if (printerConfig.mode === 'serial') {
      usePort(await navigator.serial.requestPort({ allowedBluetoothServiceClassIds: [SPP] }))
      // Uji koneksi: kirim perintah inisialisasi (ESC @) — tidak mencetak apa pun.
      try {
        await writeSerial(port, new Uint8Array([0x1b, 0x40]))
      } catch (e) {
        printerState.lastError = e.message
        log(`GAGAL uji koneksi: ${e.message}`)
        disconnected()
        throw e
      }
    } else if (printerConfig.mode === 'bluetooth') {
      await connectBle(await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES }))
    }
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
      throw new Error('Printer belum dipilih. Buka Pengaturan → Printer lalu klik "Hubungkan printer".')
    }

    if (port) return await writeSerial(port, bytes)

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
  } catch (e) {
    printerState.lastError = e?.message || String(e)
    log(`GAGAL: ${printerState.lastError}`)
    throw e
  }
}
