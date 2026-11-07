import { number, rupiah, tanggal } from './format'
import { invoiceHeader, periodLabel, textLines } from './invoice'

/**
 * PDF nota tagihan (A4 portrait), tata letak sama dengan BillDocument: header toko & judul, kepada & periode, tabel
 * bon, total, catatan kaki & tanda tangan. Teks asli (bisa disalin), dibuat di browser seperti export PDF laporan.
 */

const MARGIN = 15
const TEXT = [15, 23, 42] // slate-900
const BODY = [51, 65, 85] // slate-700
const MUTED = [100, 116, 139] // slate-500
const BRAND = [15, 118, 110] // brand-700
const LINE = [226, 232, 240] // slate-200
const FILL = [248, 250, 252] // slate-50
// Sama dengan StatusBadge.
const STATUS = { belum: 'Belum Dibayar', sebagian: 'Dibayar Sebagian', lunas: 'Lunas', jatuh_tempo: 'Lewat Jatuh Tempo' }

/**
 * @param {object} bill  Data tagihan dari API (/bills/{id}).
 * @param {{ store: object, template?: object, printedAt?: Date }} options  store = meta.store, template = meta.invoice.
 * @returns {Promise<import('jspdf').jsPDF>}
 */
export async function buildBillPdf(bill, { store, template = {}, printedAt = new Date() }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setLineHeightFactor(1.28) // ±3,6 mm per baris pada 8 pt, sama dengan jarak baris manual di bawah
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  const right = width - MARGIN
  const header = invoiceHeader(store, template)
  const title = template.title || 'TAGIHAN'
  doc.setProperties({ title: `${title} ${bill.number}`, subject: bill.customer.name, creator: header.name })

  // Header: nama & baris toko (kiri), judul, nomor & status (kanan).
  let left = MARGIN + 4
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...TEXT).text(header.name, MARGIN, left)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
  for (const line of header.lines) {
    const wrapped = doc.splitTextToSize(line, 105)
    doc.text(wrapped, MARGIN, left + 3.6)
    left += 3.6 * wrapped.length
  }
  let top = MARGIN + 5
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...BRAND).text(title, right, top, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...TEXT).text(bill.number, right, (top += 5), { align: 'right' })
  doc.setFontSize(7.5).setTextColor(...(bill.is_overdue ? [185, 28, 28] : MUTED)).text(STATUS[bill.is_overdue ? 'jatuh_tempo' : bill.status] || '', right, (top += 4), { align: 'right' })
  let y = Math.max(left, top) + 3
  doc.setDrawColor(...LINE).setLineWidth(0.2).line(MARGIN, y, right, y)

  // Kepada (kiri) & periode / tanggal (kanan).
  y += 5
  doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...MUTED).text('KEPADA', MARGIN, y)
  doc.setFontSize(8.5).setTextColor(...TEXT).text(bill.customer.name, MARGIN, (left = y + 4))
  doc.setFont('helvetica', 'normal').setTextColor(...BODY)
  for (const text of [bill.customer.address, bill.customer.phone].filter(Boolean)) {
    const wrapped = doc.splitTextToSize(text, 105)
    doc.text(wrapped, MARGIN, left + 3.6)
    left += 3.6 * wrapped.length
  }
  const details = [['Periode', periodLabel(bill.period)], ['Tanggal tagihan', tanggal(bill.issue_date, 'long')], ['Jatuh tempo', tanggal(bill.due_date, 'long')]]
  details.forEach(([label, value], index) => {
    const lineY = y + index * 3.8
    doc.setFont('helvetica', 'normal').setTextColor(...MUTED).text(label, right - 62, lineY)
    doc.setFont('helvetica', index === 1 ? 'normal' : 'bold').setTextColor(...(index === 2 && bill.is_overdue ? [185, 28, 28] : TEXT)).text(value, right, lineY, { align: 'right' })
  })
  y = Math.max(left, y + 3.8 * (details.length - 1)) + 4
  doc.line(MARGIN, y, right, y)

  // Tabel bon & total.
  const totals = [['Total tagihan', rupiah(bill.total)], ['Sudah dibayar', rupiah(bill.paid)], ['Sisa tagihan', rupiah(bill.remaining)]]
  autoTable(doc, {
    head: [['TANGGAL', 'NO. BON', 'BARANG', 'JUMLAH']],
    body: bill.sales.map((sale) => [
      tanggal(sale.business_date),
      sale.number,
      sale.items.map((item) => `${item.product_name}${item.variant ? ` ${item.variant}` : ''} (${number(item.qty)} ${item.unit})`).join(', '),
      rupiah(sale.total, false),
    ]),
    foot: totals.map(([label, value]) => [{ content: label, colSpan: 3, styles: { halign: 'right' } }, value]),
    startY: y + 2,
    margin: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN + 6 },
    theme: 'plain',
    showHead: 'everyPage',
    showFoot: 'lastPage',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1.2, bottom: 1.2, left: 2, right: 2 }, textColor: TEXT, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: FILL, textColor: MUTED, fontStyle: 'bold', fontSize: 7 },
    footStyles: { fillColor: FILL, textColor: TEXT, fontStyle: 'bold', valign: 'middle' },
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 36 }, 3: { cellWidth: 30, halign: 'right' } },
    didParseCell({ section, row, column, cell }) {
      if (section === 'head' && column.index === 3) cell.styles.halign = 'right'
      if (section === 'foot' && column.index === 3) cell.styles.halign = 'right'
      if (section === 'foot' && row.index === totals.length - 1 && column.index === 3) Object.assign(cell.styles, { textColor: BRAND, fontSize: 9.5 })
    },
    // Garis bawah tipis per baris (tanpa garis tegak), seperti tampilan di aplikasi.
    didDrawCell({ doc: pdf, cell }) {
      pdf.setDrawColor(...LINE).setLineWidth(0.2).line(cell.x, cell.y + cell.height, cell.x + cell.width, cell.y + cell.height)
    },
  })

  // Catatan kaki (kiri) & tanda tangan (kanan); pindah halaman bila tidak muat.
  const footer = textLines(template.footer).flatMap((line) => doc.setFontSize(8).splitTextToSize(line, template.signer ? 115 : right - MARGIN))
  const needed = Math.max(footer.length * 3.6, template.signer ? 26 : 0)
  y = doc.lastAutoTable.finalY + 7
  if (needed && y + needed > height - MARGIN - 6) {
    doc.addPage()
    y = MARGIN + 4
  }
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...BODY)
  footer.forEach((line, index) => doc.text(line, MARGIN, y + index * 3.6))
  if (template.signer) {
    const center = right - 25
    doc.text('Hormat kami,', center, y, { align: 'center' })
    doc.setDrawColor(148, 163, 184).line(right - 50, y + 17, right, y + 17)
    doc.setFont('helvetica', 'bold').setTextColor(...TEXT).text(template.signer, center, y + 21, { align: 'center' })
    if (template.signer_title) doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED).text(template.signer_title, center, y + 24.5, { align: 'center' })
  }

  // Kaki halaman: nomor tagihan, waktu cetak, nomor halaman.
  const pages = doc.getNumberOfPages()
  const printed = printedAt.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED)
    doc.text(`${title} ${bill.number} · dicetak ${printed}`, MARGIN, height - MARGIN + 4)
    doc.text(`Halaman ${page} dari ${pages}`, right, height - MARGIN + 4, { align: 'right' })
  }
  return doc
}

/** Buat lalu unduh PDF nota tagihan, mis. TG-202611-0001.pdf. */
export async function downloadBillPdf(bill, options) {
  const doc = await buildBillPdf(bill, options)
  doc.save(`${bill.number}.pdf`)
}
