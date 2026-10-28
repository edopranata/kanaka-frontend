/**
 * Baca ulang perintah ESC/POS (hasil EscPos.build()) menjadi baris-baris untuk pratinjau di layar, agar
 * pratinjau sama persis dengan yang dikirim ke printer. Hanya perintah yang dipakai escpos.js yang dikenali:
 * ESC @, ESC a (rata), ESC E (tebal), GS ! (ukuran), GS v 0 (gambar QR), ESC d (feed), GS V (potong).
 *
 * Hasil: [{ type: 'text', align, segments: [{ text, bold, width, height }] }
 *         | { type: 'image', align, width, height, rows: Uint8Array[] }   (width/height dalam titik printer)
 *         | { type: 'cut' }]
 */
export function parseEscPos(bytes) {
  const lines = []
  let align = 'left'
  let bold = false
  let width = 1
  let height = 1
  let segments = []
  let text = ''

  const flushText = () => {
    if (text) segments.push({ text, bold, width, height })
    text = ''
  }
  const newline = () => {
    flushText()
    lines.push({ type: 'text', align, segments })
    segments = []
  }

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]
    if (byte === 0x1b) {
      const command = bytes[++i]
      if (command === 0x40) {
        flushText()
        ;[align, bold, width, height] = ['left', false, 1, 1]
      } else if (command === 0x61) {
        align = ['left', 'center', 'right'][bytes[++i]] ?? 'left'
      } else if (command === 0x45) {
        flushText()
        bold = bytes[++i] === 1
      } else if (command === 0x64) {
        if (segments.length || text) newline()
        for (let n = bytes[++i]; n > 0; n--) lines.push({ type: 'text', align, segments: [] })
      }
    } else if (byte === 0x1d) {
      const command = bytes[++i]
      if (command === 0x21) {
        flushText()
        const size = bytes[++i]
        width = (size >> 4) + 1
        height = (size & 0x0f) + 1
      } else if (command === 0x76) {
        // GS v 0 m xL xH yL yH data — satu pita gambar; pita berurutan selebar sama digabung jadi satu gambar.
        const widthBytes = bytes[i + 3] | (bytes[i + 4] << 8)
        const rowCount = bytes[i + 5] | (bytes[i + 6] << 8)
        i += 6
        const rows = []
        for (let row = 0; row < rowCount; row++, i += widthBytes) rows.push(bytes.slice(i + 1, i + 1 + widthBytes))
        const last = lines.at(-1)
        if (last?.type === 'image' && last.width === widthBytes * 8 && !segments.length && !text) {
          last.rows.push(...rows)
          last.height += rowCount
        } else {
          lines.push({
            type: 'image',
            align,
            width: widthBytes * 8,
            height: rowCount,
            rows,
          })
        }
      } else if (command === 0x56) {
        i += 2
        lines.push({ type: 'cut' })
      }
    } else if (byte === 0x0a) {
      newline()
    } else {
      text += String.fromCharCode(byte)
    }
  }
  if (segments.length || text) newline()
  return lines
}

/** Gambar raster (baris bit, 1 = hitam) menjadi data URL PNG untuk <img>. */
export function rasterToDataUrl({ width, height, rows }) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  const image = context.createImageData(width, height)
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const black = row[x >> 3] & (0x80 >> (x & 7))
      const offset = (y * width + x) * 4
      image.data.fill(black ? 0 : 255, offset, offset + 3)
      image.data[offset + 3] = black ? 255 : 0
    }
  })
  context.putImageData(image, 0, 0)
  return canvas.toDataURL()
}
