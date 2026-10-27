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

function header(doc, store) {
  doc.align('center').bold(true)
  if (toAscii(store.name).length <= doc.columns / 2) {
    doc.size(2, 2).line(store.name).size(1, 1)
  } else {
    doc.wrap(store.name).forEach((line) => doc.line(line))
  }
  doc.bold(false)
  if (store.address) doc.wrap(store.address).forEach((line) => doc.line(line))
  if (store.phone) doc.line(`Telp. ${store.phone}`)
  return doc.align('left')
}

/**
 * Struk penjualan / bon — isi sama dengan tampilan cetak HTML (ReceiptPrint.vue).
 *
 * @param {object} sale  data penjualan dari API (SaleResource)
 * @param {{ store: object, columns: number, feed?: number, cut?: boolean }} options
 */
export function receiptBytes(sale, { store, columns, feed = 3, cut = true }) {
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
  if (store.receipt_footer) doc.center(store.receipt_footer)
  doc.feed(feed)
  if (cut) doc.cut()
  return doc.build()
}

/** Halaman tes printer: lebar kolom, perataan, huruf tebal/besar, dan contoh baris struk. */
export function testPageBytes({ store, columns, paper, connection, feed = 3, cut = true }) {
  const doc = new EscPos(columns)
  header(doc, store)
  doc.separator('=').align('center').bold(true).line('TES PRINTER').bold(false).line(waktu(new Date().toISOString())).align('left').separator('=')
  doc.line(`Kertas  : ${paper} mm (${columns} karakter)`)
  doc.line(`Koneksi : ${connection}`)
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
  doc.feed(feed)
  if (cut) doc.cut()
  return doc.build()
}
