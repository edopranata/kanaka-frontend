import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { columnsFor, receiptBytes } from './escpos'
import { isDirect, printerConfig, sendBytes } from './printer'

/** Ukuran kertas struk di perangkat ini (pengaturan printer), atau bawaan dari Pengaturan Aplikasi. */
export function receiptPaper() {
  return printerConfig.paper || useMetaStore().app.receipt_paper || '80'
}

/** URL struk digital untuk QR di bawah struk (null bila QR dimatikan di Pengaturan atau tidak ada token). */
export function receiptUrl(sale) {
  // Tautan pendek /s/{token} → QR lebih kecil (versi 3) daripada /struk/{token}.
  return useMetaStore().app.receipt_qr !== false && sale?.receipt_token ? `${window.location.origin}/s/${sale.receipt_token}` : null
}

/**
 * Cetak struk. Bila perangkat ini memakai printer langsung (port serial / Bluetooth), struk dikirim sebagai
 * perintah ESC/POS tanpa dialog. Selain itu (atau bila gagal) memakai dialog cetak browser untuk elemen
 * .receipt-print (ReceiptPrint.vue).
 */
export async function printReceipt(sale = null) {
  if (sale && isDirect()) {
    try {
      const meta = useMetaStore()
      await sendBytes(receiptBytes(sale, { store: meta.store, columns: columnsFor(receiptPaper()), feed: printerConfig.feed, cut: printerConfig.cut, qrUrl: receiptUrl(sale), qrSize: printerConfig.qrSize }))
      useToastStore().success('Struk dikirim ke printer.')
      return
    } catch (e) {
      useToastStore().error(`${e.message || 'Gagal mencetak ke printer.'} Memakai dialog cetak browser.`)
    }
  }
  printWithBrowser()
}

/** Cetak hanya elemen .receipt-print (struk), bukan seluruh halaman. */
export function printWithBrowser() {
  document.body.classList.add('printing-receipt')
  const cleanup = () => {
    document.body.classList.remove('printing-receipt')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  setTimeout(() => window.print(), 50)
}
