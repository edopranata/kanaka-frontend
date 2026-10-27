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

export const printerState = reactive({ connected: false, connecting: false, name: '' })

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

async function openPort(selected) {
  if (!selected.readable) await selected.open({ baudRate: 9600 })
  port = selected
  printerState.connected = true
  printerState.name = portName(selected.getInfo?.())
  selected.addEventListener?.('disconnect', () => {
    if (port === selected) disconnected()
  })
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

/** Pilih printer (membuka dialog pilihan perangkat dari browser — harus dari klik pengguna). */
export async function choosePrinter() {
  printerState.connecting = true
  try {
    await disconnect()
    if (printerConfig.mode === 'serial') {
      await openPort(await navigator.serial.requestPort({ allowedBluetoothServiceClassIds: [SPP] }))
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
      if (known) await openPort(known)
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
    if (port) await port.close()
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

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Kirim byte ESC/POS ke printer (dipotong kecil-kecil agar buffer printer tidak penuh). */
export async function sendBytes(bytes) {
  if (!(await reconnect())) {
    throw new Error('Printer belum terhubung. Buka Pengaturan → Printer lalu klik "Hubungkan printer".')
  }

  if (port) {
    const writer = port.writable.getWriter()
    try {
      for (let offset = 0; offset < bytes.length; offset += 512) {
        await writer.write(bytes.slice(offset, offset + 512))
      }
    } finally {
      writer.releaseLock()
    }
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
      await characteristic.writeValue(chunk)
    }
  }
}
