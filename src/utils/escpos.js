import { encode } from 'uqr'
import { number, waktu } from './format'

/**
 * Penyusun perintah ESC/POS untuk printer thermal (Rongta, Epson, Xprinter, dll.).
 * Lebar baris: 58 mm = 32 karakter, 80 mm = 48 karakter (font A).
 */
const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

/** Ubah teks menjadi ASCII (printer thermal memakai code page 437): hilangkan aksen & karakter khusus. */
export function toAscii(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7e]/g, '?')
}

export class EscPos {
  constructor(columns = 32) {
    this.columns = columns
    this.bytes = []
    this.raw(ESC, 0x40) // inisialisasi
  }

  raw(...bytes) {
    this.bytes.push(...bytes)
    return this
  }

  text(value) {
    for (const char of toAscii(value)) this.bytes.push(char.charCodeAt(0))
    return this
  }

  line(value = '') {
    return this.text(value).raw(LF)
  }

  align(position) {
    return this.raw(ESC, 0x61, { left: 0, center: 1, right: 2 }[position] ?? 0)
  }

  bold(on = true) {
    return this.raw(ESC, 0x45, on ? 1 : 0)
  }

  /** Ukuran huruf: lebar & tinggi 1–4 kali. */
  size(width = 1, height = 1) {
    return this.raw(GS, 0x21, ((width - 1) << 4) | (height - 1))
  }

  separator(char = '-') {
    return this.line(char.repeat(this.columns))
  }

  /** Potong teks panjang menjadi beberapa baris selebar kertas (per kata bila bisa); spasi awal (indentasi) dipertahankan. */
  wrap(value, width = this.columns) {
    const text = toAscii(value)
    const indent = text.match(/^ */)[0].slice(0, Math.max(0, width - 1))
    if (indent) return this.wrap(text.slice(indent.length), width - indent.length).map((line) => indent + line)
    const words = text.split(/\s+/).filter(Boolean)
    const lines = []
    let current = ''
    for (let word of words) {
      while (word.length > width) {
        if (current) lines.push(current), (current = '')
        lines.push(word.slice(0, width))
        word = word.slice(width)
      }
      if (!word) continue
      if ((current ? current.length + 1 : 0) + word.length > width) {
        lines.push(current)
        current = word
      } else {
        current = current ? `${current} ${word}` : word
      }
    }
    if (current) lines.push(current)
    return lines.length ? lines : ['']
  }

  /** Teks rata kiri & kanan dalam satu baris (kiri dipotong ke baris berikutnya bila terlalu panjang). */
  pair(left, right, width = this.columns) {
    const value = toAscii(right)
    const space = Math.max(1, width - value.length - 1)
    const lines = this.wrap(left, space)
    lines.slice(0, -1).forEach((line) => this.line(line))
    const last = lines.at(-1)
    return this.line(last + ' '.repeat(Math.max(1, width - last.length - value.length)) + value)
  }

  center(value) {
    this.align('center')
    this.wrap(value).forEach((line) => this.line(line))
    return this.align('left')
  }

  /**
   * QR sebagai gambar raster (GS v 0), didukung hampir semua printer thermal (berbeda dengan perintah QR
   * bawaan GS ( k yang tidak tersedia di sebagian printer murah). Hanya selebar QR (bukan selebar kertas) dan
   * ditengahkan dengan ESC a agar data kecil: area hitam yang lebar membuat printer thermal melambat dan
   * data besar bisa meluapkan buffer printer (QR tercetak separuh).
   *
   * @param {string} text
   * @param {{ module?: number }} options  ukuran satu kotak QR dalam titik printer (3 kecil · 4 sedang · 5 besar)
   */
  qr(text, { module = 4 } = {}) {
    const { size, data } = encode(text, { ecc: 'L', border: 0 })
    const quiet = 2
    const pixels = (size + quiet * 2) * module
    const widthBytes = Math.ceil(pixels / 8)

    const rows = []
    for (let y = 0; y < pixels; y++) {
      const row = new Uint8Array(widthBytes)
      const my = Math.floor(y / module) - quiet
      if (my >= 0 && my < size) {
        for (let x = 0; x < pixels; x++) {
          const mx = Math.floor(x / module) - quiet
          if (mx >= 0 && mx < size && data[my][mx]) row[x >> 3] |= 0x80 >> (x & 7)
        }
      }
      rows.push(row)
    }

    this.align('center')
    // Per 64 baris piksel agar buffer printer tidak penuh.
    for (let start = 0; start < rows.length; start += 64) {
      const band = rows.slice(start, start + 64)
      this.raw(GS, 0x76, 0x30, 0x00, widthBytes & 0xff, widthBytes >> 8, band.length & 0xff, band.length >> 8)
      band.forEach((row) => this.bytes.push(...row))
    }
    return this.align('left')
  }

  feed(lines = 3) {
    return this.raw(ESC, 0x64, lines)
  }

  /** Potong kertas (diabaikan printer tanpa pemotong). */
  cut() {
    return this.raw(GS, 0x56, 0x42, 0x00)
  }

  build() {
    return new Uint8Array(this.bytes)
  }
}

export const columnsFor = (paper) => (String(paper) === '80' ? 48 : 32)

/** "Promo Kopi" atau "Diskon"; tidak menggandakan kata promo bila nama promonya sudah diawali "Promo". */
export const promoLabel = (item) => (!item.promo ? 'Diskon' : /^promo\b/i.test(item.promo) ? item.promo : `Promo ${item.promo}`)

/**
 * Baris header struk sesudah nama toko: alamat, alamat 2 (opsional), lalu kontak (Telp / Email sesuai
 * Pengaturan). Data lama tanpa "contact" memakai telepon.
 */
export const headerLines = (store) => [store.address, store.address2, store.contact ?? (store.phone ? `Telp. ${store.phone}` : '')].map((line) => String(line || '').trim()).filter(Boolean)

/** Jarak (baris kosong) antara header dan isi struk: 1–3. */
export const headerGap = (store) => Math.min(3, Math.max(1, Number(store.header_gap) || 1))

function header(doc, store) {
  doc.align('center').bold(true)
  if (toAscii(store.name).length <= doc.columns / 2) {
    doc.size(2, 2).line(store.name).size(1, 1)
  } else {
    doc.wrap(store.name).forEach((line) => doc.line(line))
  }
  doc.bold(false)
  headerLines(store).forEach((text) => doc.wrap(text).forEach((line) => doc.line(line)))
  doc.align('left')
  for (let i = 0; i < headerGap(store); i++) doc.line()
  return doc
}

/** Baris catatan kaki struk (diatur per baris di Pengaturan, maks. 32 karakter per baris). */
export const footerLines = (footer) => String(footer || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

/** Ukuran kotak QR (titik printer) per pilihan ukuran di halaman Printer Struk. */
export const QR_MODULES = { kecil: 3, sedang: 4, besar: 5 }

function footer(doc, store, qrUrl, qrSize) {
  footerLines(store.receipt_footer).forEach((line) => doc.center(line))
  if (qrUrl) {
    doc.line().qr(qrUrl, { module: QR_MODULES[qrSize] ?? QR_MODULES.sedang }).align('center').line('Scan untuk struk digital').align('left')
  }
}

/**
 * Struk penjualan / bon — isi sama dengan tampilan cetak HTML (ReceiptPrint.vue).
 *
 * @param {object} sale  data penjualan dari API (SaleResource)
 * @param {{ store: object, columns: number, feed?: number, cut?: boolean, qrUrl?: string|null }} options
 */
export function receiptBytes(sale, { store, columns, feed = 3, cut = true, qrUrl = null, qrSize = 'sedang' }) {
  const doc = new EscPos(columns)
  header(doc, store).separator()
  doc.line(`No   : ${sale.number}`)
  doc.line(`Tgl  : ${waktu(sale.created_at)}`)
  doc.line(`Kasir: ${sale.cashier ?? '-'}`)
  if (sale.customer) doc.line(`Plg  : ${sale.customer.name}`)
  doc.separator()

  for (const item of sale.items || []) {
    doc.wrap(item.product_name).forEach((line) => doc.line(line))
    if (item.variant) doc.wrap(`  (${item.variant})`).forEach((line) => doc.line(line))
    doc.pair(`  ${item.qty} ${item.unit} x ${number(item.price)}`, number(item.qty * item.price))
    if (item.discount) doc.pair(`  ${promoLabel(item)}`, `-${number(item.discount)}`)
  }

  doc.separator()
  doc.pair('Subtotal', number(sale.subtotal))
  if (sale.discount) doc.pair('Diskon', `-${number(sale.discount)}`)
  if (sale.tax) doc.pair('Pajak', number(sale.tax))
  doc.bold(true).size(1, 2).pair('TOTAL', number(sale.total)).size(1, 1).bold(false)

  if (sale.payment_method === 'piutang') {
    doc.line().center('*** BON - BAYAR NANTI ***').center('Ditagih pada tagihan bulanan').line()
    doc.pair('Penerima', `( ${sale.customer?.name ?? '-'} )`)
  } else {
    doc.pair(sale.payment_label || 'Bayar', number(sale.paid))
    if (sale.change) doc.pair('Kembali', number(sale.change))
  }
  if (sale.status === 'batal') doc.line().bold(true).center('*** DIBATALKAN ***').bold(false)

  doc.separator()
  footer(doc, store, qrUrl, qrSize)
  doc.feed(feed)
  if (cut) doc.cut()
  return doc.build()
}

/** Halaman tes printer: lebar kolom, perataan, huruf tebal/besar, dan contoh baris struk. */
export function testPageBytes({ store, columns, paper, connection, device = '', feed = 3, cut = true, qrUrl = null, qrSize = 'sedang' }) {
  const doc = new EscPos(columns)
  header(doc, store)
  doc.separator('=').align('center').bold(true).line('TES PRINTER').bold(false).line(waktu(new Date().toISOString())).align('left').separator('=')
  doc.line(`Kertas  : ${paper} mm (${columns} karakter)`)
  doc.line(`Koneksi : ${connection}`)
  if (device) doc.line(`Perangkat: ${device}`)
  doc.separator()
  doc.line('Penggaris lebar kertas:')
  doc.line('1234567890'.repeat(Math.ceil(columns / 10)).slice(0, columns))
  doc.line('|' + '-'.repeat(columns - 2) + '|')
  doc.separator()
  doc.line('Rata kiri')
  doc.align('center').line('Rata tengah').align('right').line('Rata kanan').align('left')
  doc.bold(true).line('Huruf tebal').bold(false)
  doc.size(1, 2).line('Tinggi ganda').size(2, 2).line('BESAR').size(1, 1)
  doc.separator()
  doc.line('Indomie Goreng')
  doc.pair('  2 PCS x 3.500', '7.000')
  doc.line('Aqua 600ml')
  doc.pair('  1 BTL x 4.000', '4.000')
  doc.bold(true).size(1, 2).pair('TOTAL', '11.000').size(1, 1).bold(false)
  doc.separator()
  doc.center('Bila penggaris di atas pas satu baris, ukuran kertas sudah benar.')
  if (qrUrl) {
    doc.separator().center(`Tes QR (${qrSize}):`).qr(qrUrl, { module: QR_MODULES[qrSize] ?? QR_MODULES.sedang }).center('QR harus utuh & bisa di-scan.')
  }
  doc.feed(feed)
  if (cut) doc.cut()
  return doc.build()
}
