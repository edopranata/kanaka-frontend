/**
 * Cetak hanya elemen .receipt-print (struk), bukan seluruh halaman.
 */
export function printReceipt() {
  document.body.classList.add('printing-receipt')
  const cleanup = () => {
    document.body.classList.remove('printing-receipt')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  setTimeout(() => window.print(), 50)
}
