import { headerLines } from './escpos'

/** Baris teks tidak kosong dari isian beberapa baris. */
export const textLines = (text) => String(text || '').split('\n').filter((line) => line.trim() !== '')

/**
 * Header nota tagihan: nama & baris kustom dari Pengaturan → Toko & Struk → Nota tagihan, atau identitas toko bila kosong.
 *
 * @returns {{ name: string, lines: string[] }}
 */
export function invoiceHeader(store, template = {}) {
  const custom = textLines(template.header_lines)
  return { name: template.header_name?.trim() || store.name || '', lines: custom.length ? custom : headerLines(store) }
}

/** "2026-11" → "November 2026". */
export const periodLabel = (period) => new Date(`${period}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
