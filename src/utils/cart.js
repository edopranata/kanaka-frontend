/**
 * Utilitas keranjang untuk paket / menu olahan.
 */

/** Kunci baris: satuan + bahan opsional yang dihilangkan (varian berbeda = baris berbeda). */
export function lineKey(unitId, omit = []) {
  return omit.length ? `${unitId}:${[...omit].sort((a, b) => a - b).join(',')}` : String(unitId)
}

/** Bahan opsional sebuah paket (yang boleh dihilangkan pemesan). */
export function optionalComponents(product) {
  return (product.components || []).filter((component) => component.is_optional)
}

/** Harga satu porsi setelah bahan opsional dihilangkan. */
export function packagePrice(basePrice, options, omit) {
  return basePrice - options.filter((option) => omit.includes(option.id)).reduce((sum, option) => sum + option.omit_price, 0)
}
