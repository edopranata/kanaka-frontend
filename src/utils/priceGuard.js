/**
 * Pengaman harga jual (sama dengan App\Support\PriceGuard di backend).
 *
 * Harga minimum satuan = HPP per satuan dasar × isi satuan × (1 + margin minimum %).
 * Di bawah HPP = "rugi" (ditolak server); di bawah minimum = "margin" (wajib konfirmasi).
 */
const round2 = (value) => Math.round(value * 100) / 100

/** Margin minimum produk: per produk bila diisi, selain itu global dari Pengaturan. */
export function marginOf(product, meta) {
  const own = product?.min_margin_percent
  return own !== null && own !== undefined && own !== '' ? Number(own) : Number(meta.min_margin_percent ?? 7.5)
}

export const minPrice = (baseCost, conversion, margin) => Math.ceil(round2(baseCost * conversion * (1 + margin / 100)))
export const unitCost = (baseCost, conversion) => Math.ceil(round2(baseCost * conversion))
/** Harga saran: minimum dibulatkan ke atas ke kelipatan Rp 100. */
export const suggestPrice = (min) => Math.ceil(min / 100) * 100

/** HPP rata-rata bergerak setelah barang masuk (2 desimal, seperti StockService::receive). */
export function averageCost(stock, cost, qty, incomingCost) {
  const current = Math.max(0, Number(stock) || 0)
  const total = current + qty
  return total > 0 ? round2((current * (Number(cost) || 0) + qty * incomingCost) / total) : Number(cost) || 0
}

/**
 * Periksa satuan jual terhadap HPP.
 *
 * @param {Array<{name: string, conversion: number, sell_price: number}>} units
 * @returns {Array<{unit: object, cost: number, min: number, suggested: number, level: 'rugi'|'margin'|null}>}
 */
export function checkUnits(units, baseCost, margin) {
  return (units || []).map((unit) => {
    const conversion = Number(unit.conversion) || 1
    const price = Number(unit.sell_price) || 0
    const cost = unitCost(baseCost, conversion)
    const min = minPrice(baseCost, conversion, margin)
    const level = baseCost > 0 && price > 0 && price < min ? (price < cost ? 'rugi' : 'margin') : null
    return { unit, price, cost, min, suggested: suggestPrice(min), level }
  })
}

/** Margin aktual terhadap HPP (persen, 1 desimal); null bila HPP/harga belum ada. */
export function marginPercent(price, cost) {
  return cost > 0 && price > 0 ? Math.round(((price - cost) / cost) * 1000) / 10 : null
}

/**
 * Tinjauan harga setelah HPP berubah (pembelian / titipan masuk).
 *
 * @param {Array<{product_id: number, name: string, base_unit: string, old_cost: number, new_cost: number, margin: number, units: Array}>} lines
 * @param {Record<number, number>} prices harga jual baru per product_unit_id (yang diubah di dialog)
 */
export function reviewPrices(lines, prices) {
  const rows = lines.map((line) => {
    const units = line.units.filter((unit) => unit.id && unit.sell_price > 0)   // satuan tanpa harga = tidak dijual
    const before = checkUnits(units, line.new_cost, line.margin).filter((check) => check.level)
    const after = checkUnits(
      units.map((unit) => ({ ...unit, sell_price: prices[unit.id] ?? unit.sell_price })),
      line.new_cost,
      line.margin,
    ).map((check, index) => ({ ...check, unit: units[index] }))   // unit = data lama, price = harga baru
    return { line, checks: after, flagged: before.length > 0 }
  })
  const flagged = rows.filter((row) => row.flagged || row.line.units.some((unit) => prices[unit.id] !== undefined && prices[unit.id] !== unit.sell_price))
  const levels = flagged.flatMap((row) => row.checks.map((check) => check.level))
  return {
    rows: flagged,
    loss: levels.filter((level) => level === 'rugi').length,
    low: levels.filter((level) => level === 'margin').length,
    /** Payload `prices` untuk server: hanya satuan yang harganya diubah. */
    payload: lines.flatMap((line) => line.units.filter((unit) => prices[unit.id] !== undefined && prices[unit.id] !== unit.sell_price).map((unit) => ({ product_unit_id: unit.id, sell_price: prices[unit.id] }))),
  }
}

/** Isi awal harga baru: satuan yang rugi langsung diisi harga saran. */
export function suggestLossPrices(lines) {
  const prices = {}
  for (const line of lines) {
    for (const check of checkUnits(line.units, line.new_cost, line.margin)) {
      if (check.level === 'rugi') prices[check.unit.id] = check.suggested
    }
  }
  return prices
}
