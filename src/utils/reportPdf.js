import { number } from './format'

/**
 * Export PDF laporan dengan tata letak sama seperti export Excel (ReportExporter.php): nama toko, judul &
 * periode di atas, lalu tabel bergaris dengan header abu-abu, angka rata kanan, baris subtotal/total tebal,
 * dan baris TOTAL di akhir. Kertas & orientasi dari Pengaturan → Aplikasi.
 */

/** Ukuran kertas portrait (mm). F4 = Folio Indonesia 215 × 330 mm. */
export const REPORT_PAPERS = { A4: [210, 297], F4: [215, 330], Letter: [215.9, 279.4], Legal: [215.9, 355.6] }

const MARGIN = 12
const FONT_SIZE = 8
const PADDING = 1.5
const NUMERIC = ['money', 'number', 'percent']
const HEAD_FILL = [226, 232, 240] // #E2E8F0, sama dengan header Excel
const TOTAL_FILL = [241, 245, 249]
const percentFormatter = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Format sel seperti Excel: #,##0 untuk angka, 0,0% untuk persen, dd/mm/yyyy untuk tanggal. */
export function formatCell(value, type) {
  if (value === null || value === undefined) return ''
  switch (type) {
    case 'money':
    case 'number':
      return number(Math.round(Number(value)))
    case 'percent':
      return `${percentFormatter.format(Number(value) || 0)}%`
    case 'date': {
      const [year, month, day] = String(value).slice(0, 10).split('-')
      return `${day}/${month}/${year}`
    }
    default:
      return String(value)
  }
}

/** Lebar tabel bila tiap kolom selebar isinya (kolom teks panjang dibatasi, sisanya dilipat). */
function naturalWidth(doc, columns, body) {
  doc.setFontSize(FONT_SIZE)
  return columns.reduce((sum, column, index) => {
    doc.setFont('helvetica', 'bold')
    let width = doc.getTextWidth(column.label)
    doc.setFont('helvetica', 'normal')
    for (const row of body.slice(0, 300)) width = Math.max(width, doc.getTextWidth(row[index]))
    return sum + Math.min(width, 70) + PADDING * 2
  }, 0)
}

/**
 * @param {{ title: string, subtitle: string, columns: {key: string, label: string, type: string}[], rows: object[], totals?: object }} report
 * @param {{ storeName: string, paper?: string, orientation?: 'auto'|'portrait'|'landscape', printedAt?: Date }} options
 * @returns {Promise<import('jspdf').jsPDF>}
 */
export async function buildReportPdf(report, { storeName, paper = 'A4', orientation = 'auto', printedAt = new Date() }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const size = REPORT_PAPERS[paper] ?? REPORT_PAPERS.A4
  const { columns, rows } = report
  const body = rows.map((row) => columns.map((column) => formatCell(row[column.key], column.type)))

  let landscape = orientation === 'landscape'
  if (orientation === 'auto') landscape = naturalWidth(new jsPDF({ unit: 'mm', format: size }), columns, body) > size[0] - MARGIN * 2

  const doc = new jsPDF({ unit: 'mm', format: size, orientation: landscape ? 'landscape' : 'portrait', compress: true })
  doc.setProperties({ title: `${report.title} — ${report.subtitle}`, subject: storeName, creator: storeName })

  // Baris 1–3 seperti Excel: nama toko, judul laporan, periode.
  doc.setTextColor(15).setFont('helvetica', 'bold').setFontSize(13)
  doc.text(storeName || '', MARGIN, MARGIN + 4)
  doc.text(report.title, MARGIN, MARGIN + 10)
  doc.setFont('helvetica', 'normal').setFontSize(10)
  doc.text(report.subtitle || '', MARGIN, MARGIN + 15.5)

  const foot = report.totals && rows.length
    ? [columns.map((column, index) => (index === 0 ? 'TOTAL' : column.key in report.totals ? formatCell(report.totals[column.key], column.type) : ''))]
    : undefined

  autoTable(doc, {
    head: [columns.map((column) => column.label)],
    body: rows.length ? body : [[{ content: 'Tidak ada data pada periode ini.', colSpan: columns.length, styles: { halign: 'center', textColor: 100 } }]],
    foot,
    startY: MARGIN + 21,
    margin: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN + 6 },
    theme: 'grid',
    showHead: 'everyPage',
    showFoot: 'lastPage',
    styles: { font: 'helvetica', fontSize: FONT_SIZE, cellPadding: PADDING, textColor: 20, lineColor: [148, 163, 184], lineWidth: 0.1, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: HEAD_FILL, textColor: 20, fontStyle: 'bold' },
    footStyles: { fillColor: TOTAL_FILL, textColor: 20, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(columns.map((column, index) => [index, NUMERIC.includes(column.type) ? { halign: 'right' } : { halign: 'left' }])),
    didParseCell({ section, column, row, cell }) {
      const definition = columns[column.index]
      if (definition && NUMERIC.includes(definition.type)) cell.styles.halign = 'right'
      const source = section === 'body' ? rows[row.index] : null
      if (!source) return
      if (source.style === 'subtotal' || source.style === 'total') cell.styles.fontStyle = 'bold'
      if (source.style === 'total') cell.styles.fillColor = TOTAL_FILL
      if (source.style === 'indent' && column.index === 0) cell.styles.cellPadding = { top: PADDING, right: PADDING, bottom: PADDING, left: PADDING + 5 }
    },
  })

  // Kaki halaman: judul & waktu cetak, nomor halaman.
  const pages = doc.getNumberOfPages()
  const printed = printedAt.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    const width = doc.internal.pageSize.getWidth()
    const height = doc.internal.pageSize.getHeight()
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(100)
    doc.text(`${report.title} · ${report.subtitle} · dicetak ${printed}`, MARGIN, height - MARGIN + 2)
    doc.text(`Halaman ${page} dari ${pages}`, width - MARGIN, height - MARGIN + 2, { align: 'right' })
  }
  return doc
}

/** Buat lalu unduh PDF laporan. */
export async function downloadReportPdf(report, options, fileName) {
  const doc = await buildReportPdf(report, options)
  doc.save(fileName)
}
