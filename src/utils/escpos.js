import { encode } from 'uqr'
import { itemName, number, tanggalAngka, taxLabel, waktu } from './format'

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

/** Bentuk cetakan struk thermal (Pengaturan → Toko & Struk → Struk). Isi, identitas toko, catatan kaki & QR sama. */
export const RECEIPT_TEMPLATES = [
  { value: 'standar', label: 'Standar', hint: 'Harga satuan di bawah tiap barang, TOTAL besar.' },
  { value: 'ringkas', label: 'Ringkas', hint: 'Satu baris per barang & header kecil, hemat kertas.' },
  { value: 'detail', label: 'Detail', hint: 'Kolom Qty / Harga / Total, jumlah item, dan total hemat promo.' },
]

/**
 * Struk penjualan / bon dalam bentuk sesuai pengaturan (store.receipt_template). Bentuk standar sama dengan
 * tampilan cetak HTML (ReceiptPrint.vue).
 *
 * @param {object} sale  data penjualan dari API (SaleResource)
 * @param {{ store: object, columns: number, feed?: number, cut?: boolean, qrUrl?: string|null }} options
 */
export function receiptBytes(sale, { store, columns, feed = 3, cut = true, qrUrl = null, qrSize = 'sedang' }) {
  const doc = new EscPos(columns)
  const layout = { ringkas: compactReceipt, detail: detailedReceipt }[store.receipt_template] ?? standardReceipt
  layout(doc, sale, store)
  footer(doc, store, qrUrl, qrSize)
  doc.feed(feed)
  if (cut) doc.cut()
  return doc.build()
}

/** Nama barang + varian paket, mis. "H2 Nasi Putih" / "Indomie Telur (tanpa Telur)". */
const lineName = (item) => `${itemName(item)}${item.variant ? ` (${item.variant})` : ''}`

/** Subtotal, diskon & pajak (bila ada), lalu TOTAL. */
function totals(doc, sale, { always = true, big = true } = {}) {
  if (always || sale.discount || sale.tax) doc.pair('Subtotal', number(sale.subtotal))
  if (sale.discount) doc.pair('Diskon', `-${number(sale.discount)}`)
  if (sale.tax) doc.pair(taxLabel(sale), number(sale.tax))
  doc.bold(true)
  if (big) doc.size(1, 2)
  doc.pair('TOTAL', number(sale.total)).size(1, 1).bold(false)
}

/** Pembayaran (atau keterangan bon, bisa disembunyikan di Pengaturan) dan tanda batal. */
function payment(doc, sale, store) {
  if (sale.payment_method === 'piutang') {
    if (store.credit_note !== false) doc.line().center('*** BON - BAYAR NANTI ***').center('Ditagih pada tagihan bulanan')
    doc.line().pair('Penerima', `( ${sale.customer?.name ?? '-'} )`)
  } else {
    doc.pair(sale.payment_label || 'Bayar', number(sale.paid))
    if (sale.change) doc.pair('Kembali', number(sale.change))
  }
  if (sale.status === 'batal') doc.line().bold(true).center('*** DIBATALKAN ***').bold(false)
}

/** Standar: nama barang, lalu "qty satuan x harga" & jumlah; TOTAL besar. */
function standardReceipt(doc, sale, store) {
  header(doc, store).separator()
  doc.line(`No   : ${sale.number}`)
  doc.line(`Tgl  : ${waktu(sale.created_at)}`)
  doc.line(`Kasir: ${sale.cashier ?? '-'}`)
  if (sale.customer) doc.line(`Plg  : ${sale.customer.name}`)
  doc.separator()

  for (const item of sale.items || []) {
    doc.wrap(itemName(item)).forEach((line) => doc.line(line))
    if (item.variant) doc.wrap(`  (${item.variant})`).forEach((line) => doc.line(line))
    doc.pair(`  ${item.qty} ${item.unit} x ${number(item.price)}`, number(item.qty * item.price))
    if (item.discount) doc.pair(`  ${promoLabel(item)}`, `-${number(item.discount)}`)
  }

  doc.separator()
  totals(doc, sale)
  payment(doc, sale, store)
  doc.separator()
}

/** "10/11/26 14.10" — tanggal & jam singkat untuk struk ringkas. */
const shortTime = (value) => {
  const date = new Date(value)
  const pad = (number) => String(number).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear()).slice(2)} ${pad(date.getHours())}.${pad(date.getMinutes())}`
}

/** Ringkas (hemat kertas): header tanpa huruf besar, info 2 baris, satu baris per barang, total tanpa huruf tinggi. */
function compactReceipt(doc, sale, store) {
  doc.align('center').bold(true)
  doc.wrap(store.name).forEach((line) => doc.line(line))
  doc.bold(false)
  headerLines(store).forEach((text) => doc.wrap(text).forEach((line) => doc.line(line)))
  doc.align('left')
  for (let i = 0; i < headerGap(store); i++) doc.line()
  doc.separator()
  doc.pair(sale.number, shortTime(sale.created_at))
  if (sale.customer) doc.pair(`Kasir: ${sale.cashier ?? '-'}`, `Plg: ${sale.customer.name}`)
  else doc.line(`Kasir: ${sale.cashier ?? '-'}`)
  doc.separator()

  for (const item of sale.items || []) {
    doc.pair(`${item.qty} ${item.unit} ${lineName(item)}`, number(item.qty * item.price))
    if (item.discount) doc.pair(`  ${promoLabel(item)}`, `-${number(item.discount)}`)
  }

  doc.separator()
  totals(doc, sale, { always: false, big: false })
  payment(doc, sale, store)
  doc.separator()
}

/** Detail: info dua kolom, tabel Qty / Harga / Total, jumlah item, dan total hemat promo. */
function detailedReceipt(doc, sale, store) {
  header(doc, store).separator('=')
  doc.pair('No. Nota', sale.number)
  doc.pair('Tanggal', waktu(sale.created_at))
  doc.pair('Kasir', sale.cashier ?? '-')
  if (sale.customer) doc.pair('Pelanggan', sale.customer.name)
  doc.separator('=')

  // Kolom: qty (sisa lebar) · harga · total, rata kanan.
  const wide = doc.columns >= 48
  const priceWidth = wide ? 12 : 9
  const totalWidth = wide ? 13 : 10
  const row = (qty, price, total) => {
    const left = toAscii(qty).slice(0, doc.columns - priceWidth - totalWidth)
    return left + toAscii(price).padStart(doc.columns - totalWidth - left.length) + toAscii(total).padStart(totalWidth)
  }
  doc.bold(true).line(row('Barang / Qty', 'Harga', 'Total')).bold(false)
  doc.separator()
  let items = 0
  let saved = Number(sale.discount) || 0
  for (const item of sale.items || []) {
    items += Number(item.qty) || 0
    saved += Number(item.discount) || 0
    doc.wrap(lineName(item)).forEach((line) => doc.line(line))
    doc.line(row(`  ${item.qty} ${item.unit}`, number(item.price), number(item.qty * item.price)))
    if (item.discount) doc.pair(`  ${promoLabel(item)}`, `-${number(item.discount)}`)
  }

  doc.separator()
  doc.pair('Jumlah', `${number(items)} item (${(sale.items || []).length} barang)`)
  totals(doc, sale)
  payment(doc, sale, store)
  if (saved > 0) doc.line().bold(true).center(`Anda hemat Rp ${number(saved)}`).bold(false)
  doc.separator('=')
}

/** "2026-11-03" → "03-11-2026". */
const dmy = (value) => tanggalAngka(value, '-', '')
const rp = (value) => `${value < 0 ? '-' : ''}Rp ${number(Math.abs(value))}`

/**
 * Nota tagihan untuk printer thermal: header & catatan kaki mengikuti pengaturan struk; isi per bon (nomor & tanggal)
 * dengan barangnya, lalu total, sudah dibayar, dan sisa tagihan.
 *
 * @param {object} bill  data tagihan dari API (/bills/{id}), termasuk sales.items
 * @param {{ store: object, template?: object, columns: number, feed?: number, cut?: boolean }} options  template = meta.invoice (judul)
 */
export function billBytes(bill, { store, template = {}, columns, feed = 3, cut = true }) {
  const doc = new EscPos(columns)
  header(doc, store).separator()
  doc.bold(true).pair(template.title || 'TAGIHAN', bill.number).bold(false)
  doc.pair('Kepada', bill.customer?.name ?? '-')
  doc.pair('Periode', new Date(`${bill.period}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }))
  doc.pair('Jatuh tempo', dmy(bill.due_date))
  doc.separator()

  for (const [index, sale] of (bill.sales || []).entries()) {
    if (index) doc.line()
    doc.bold(true).wrap(`${sale.number} (${dmy(sale.business_date)})`).forEach((line) => doc.line(line))
    doc.bold(false)
    for (const item of sale.items || []) {
      doc.pair(`${item.qty} ${item.unit} ${lineName(item)}`, rp(item.qty * item.price))
      if (item.discount) doc.pair(`  ${promoLabel(item)}`, rp(-item.discount))
    }
    if (sale.discount) doc.pair('  Diskon', rp(-sale.discount))
    if (sale.tax) doc.pair(`  ${taxLabel(sale)}`, rp(sale.tax))
  }

  doc.separator()
  doc.pair('Total tagihan', rp(bill.total))
  doc.pair('Sudah dibayar', rp(bill.paid))
  doc.bold(true).size(1, 2).pair('SISA TAGIHAN', rp(bill.remaining)).size(1, 1).bold(false)
  if (bill.status === 'lunas') doc.line().bold(true).center('*** LUNAS ***').bold(false)
  doc.separator()
  footerLines(store.receipt_footer).forEach((line) => doc.center(line))
  doc.feed(feed)
  if (cut) doc.cut()
  return doc.build()
}

/**
 * Bukti pembayaran piutang (per baris bon) untuk printer thermal: header & catatan kaki mengikuti pengaturan struk;
 * baris yang dibayar dikelompokkan per bon, lalu total bayar, metode, dan sisa piutang pelanggan.
 *
 * @param {object} payment  data pembayaran dari API (/receivable-payments), termasuk items
 * @param {{ store: object, columns: number, outstanding?: number|null, feed?: number, cut?: boolean }} options
 */
/**
 * Bukti bayar titipan ke penitip (bayar sekaligus beberapa penyelesaian): rincian per hari, total, metode, sisa hutang.
 */
export function consignmentPaymentBytes(payment, { store, columns, outstanding = null, feed = 3, cut = true }) {
  const doc = new EscPos(columns)
  header(doc, store).separator()
  doc.bold(true).center('BUKTI BAYAR TITIPAN').bold(false)
  doc.pair('Tanggal', payment.created_at ? waktu(payment.created_at) : dmy(payment.date))
  doc.pair('Penitip', payment.supplier?.name ?? '-')
  doc.pair('Dibayar oleh', payment.user ?? '-')
  doc.separator()
  for (const line of payment.lines || []) doc.pair(`${line.number} (${dmy(line.date)})`, rp(line.amount))
  doc.separator()
  doc.bold(true).size(1, 2).pair('TOTAL BAYAR', rp(payment.total)).size(1, 1).bold(false)
  doc.pair('Metode', payment.payment_label ?? '-')
  if (outstanding !== null && outstanding !== undefined) doc.pair('Sisa hutang', rp(outstanding))
  doc.line()
  doc.pair('Penerima', `( ${payment.supplier?.name ?? ''} )`)
  doc.separator()
  footerLines(store.receipt_footer).forEach((line) => doc.center(line))
  doc.feed(feed)
  if (cut) doc.cut()
  return doc.build()
}

export function paymentBytes(payment, { store, columns, outstanding = null, feed = 3, cut = true }) {
  const doc = new EscPos(columns)
  header(doc, store).separator()
  doc.bold(true).center('BUKTI PEMBAYARAN').bold(false)
  doc.pair('No.', payment.number ?? '-')
  doc.pair('Tanggal', payment.created_at ? waktu(payment.created_at) : dmy(payment.date))
  doc.pair('Pelanggan', payment.customer?.name ?? '-')
  doc.pair('Kasir', payment.user ?? '-')
  doc.separator()

  let current = null
  for (const line of payment.items || []) {
    if (line.sale_id !== current) {
      if (current !== null) doc.line()
      current = line.sale_id
      doc.bold(true).wrap(`${line.sale_number} (${dmy(line.business_date)})`).forEach((text) => doc.line(text))
      doc.bold(false)
    }
    doc.pair(`${line.qty} ${line.unit} ${lineName(line)}`, rp(line.amount))
  }

  doc.separator()
  doc.bold(true).size(1, 2).pair('TOTAL BAYAR', rp(payment.amount)).size(1, 1).bold(false)
  if (payment.received !== null && payment.received !== undefined) {
    doc.pair(payment.payment_label || 'Tunai', rp(payment.received))
    doc.pair('Kembali', rp(payment.change ?? 0))
  } else {
    doc.pair('Metode', payment.payment_label ?? '-')
  }
  if (outstanding !== null && outstanding !== undefined) doc.pair('Sisa piutang', rp(outstanding))
  doc.separator()
  footerLines(store.receipt_footer).forEach((line) => doc.center(line))
  doc.feed(feed)
  if (cut) doc.cut()
  return doc.build()
}

/**
 * Transaksi contoh untuk "Cetak contoh struk" dan pratinjau struk di Pengaturan: 3 barang (satu kena promo).
 *
 * @param {{ number?: string, cashier?: string, taxName?: string, taxPercent?: number, credit?: boolean }} options
 *   credit = bon (bayar nanti) atas nama pelanggan contoh, bukan tunai.
 */
export function sampleSale({ number = 'INV-CONTOH-0001', cashier = 'Kasir', taxName = 'PPN', taxPercent = 0, credit = false } = {}) {
  const items = [
    { id: 1, product_name: 'Indomie Goreng', unit: 'PCS', qty: 2, price: 3500, discount: 0 },
    { id: 2, product_name: 'Kopi Kapal Api Special Mix 25 gr', unit: 'SACHET', qty: 3, price: 2000, discount: 600, promo: 'Promo Kopi' },
    { id: 3, product_name: 'Aqua 600ml', unit: 'BTL', qty: 1, price: 4000, discount: 0 },
  ]
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.price - item.discount, 0)
  const tax = Math.round((subtotal * (Number(taxPercent) || 0)) / 100)
  const total = subtotal + tax
  const paid = credit ? 0 : Math.ceil(total / 10000) * 10000
  return {
    number,
    created_at: new Date().toISOString(),
    cashier,
    customer: credit ? { name: 'Budi Santoso' } : null,
    items,
    subtotal,
    discount: 0,
    tax,
    tax_name: tax ? taxName : null,
    tax_percent: tax ? Number(taxPercent) : null,
    total,
    payment_method: credit ? 'piutang' : 'tunai',
    payment_label: credit ? 'Bon' : 'Tunai',
    paid,
    change: credit ? 0 : paid - total,
    status: 'selesai',
    receipt_token: 'CONTOH',
  }
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
