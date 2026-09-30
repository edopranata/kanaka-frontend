/**
 * Pembaca barcode dari kamera.
 *
 * Memakai BarcodeDetector bawaan browser bila tersedia (Chrome/Edge Android), selain itu ZXing (WebAssembly) dari
 * paket barcode-detector — dimuat hanya saat pemindai pertama kali dibuka. File .wasm ikut di-bundle aplikasi
 * (bukan CDN) sehingga tetap jalan di hosting sendiri / PWA.
 */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'qr_code']

let detector = null

export function cameraSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext
}

export function getDetector() {
  detector ??= (async () => {
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats()
        const formats = FORMATS.filter((format) => supported.includes(format))
        if (formats.includes('ean_13')) return new window.BarcodeDetector({ formats })
      } catch {
        // lanjut ke ZXing
      }
    }
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ])
    prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } })
    return new BarcodeDetector({ formats: FORMATS })
  })().catch((error) => {
    detector = null
    throw error
  })
  return detector
}

let audio = null

/** Bunyi "bip" singkat + getar sebagai tanda barcode terbaca. */
export function feedback(ok = true) {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.frequency.value = ok ? 1480 : 330
    gain.gain.value = 0.08
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + (ok ? 0.09 : 0.25))
  } catch {
    // tanpa suara
  }
  navigator.vibrate?.(ok ? 60 : [80, 60, 80])
}

/** Pesan yang mudah dipahami untuk error kamera. */
export function cameraError(error) {
  if (!window.isSecureContext) return 'Kamera hanya bisa dipakai lewat HTTPS.'
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Izin kamera ditolak. Izinkan akses kamera untuk situs ini di pengaturan browser, lalu coba lagi.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Kamera tidak ditemukan di perangkat ini.'
    case 'NotReadableError':
      return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.'
    default:
      return `Kamera tidak dapat dibuka${error?.message ? `: ${error.message}` : '.'}`
  }
}
