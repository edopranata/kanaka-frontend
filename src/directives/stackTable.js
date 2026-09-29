/**
 * v-stack: di layar kecil setiap baris tabel ditampilkan sebagai kartu.
 * Label tiap sel diambil otomatis dari judul kolom (thead) ke atribut data-label.
 * Baris tfoot berbentuk "keterangan (colspan) + nilai" ditandai .stack-split agar tampil sebaris.
 */
function label(el) {
  const headers = []
  el.querySelectorAll('thead tr:first-child th').forEach((th) => {
    for (let i = 0; i < (th.colSpan || 1); i++) headers.push(th.textContent.trim())
  })

  el.querySelectorAll('tbody tr, tfoot tr').forEach((tr) => {
    const split = tr.parentElement.tagName === 'TFOOT' && tr.children[0]?.colSpan > 1
    tr.classList.toggle('stack-split', split)

    let column = 0
    for (const td of tr.children) {
      const text = split || td.colSpan > 1 ? '' : headers[column] || ''
      if (td.dataset.label !== text) td.dataset.label = text
      column += td.colSpan || 1
    }
  })
}

export default {
  mounted(el) {
    el.classList.add('table-stack')
    label(el)
  },
  updated(el) {
    label(el)
  },
}
