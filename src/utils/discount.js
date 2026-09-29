/**
 * Promo otomatis (cerminan aturan server di DiscountService / Discount::amountFor):
 * promo aktif untuk produk (dan satuan, bila dibatasi) dengan potongan terbesar, tidak ditumpuk.
 */
export function promoAmount(discount, qty, price) {
  if (qty < discount.min_qty) return 0
  const gross = qty * price
  const amount = discount.type === 'persen' ? Math.round((gross * discount.value) / 100) : Math.round(qty * discount.value)
  return Math.max(0, Math.min(amount, gross))
}

export function bestPromo(discounts, productId, unitId, qty, price) {
  let best = null
  let amount = 0
  for (const discount of discounts) {
    const applies = discount.items.some((item) => item.product_id === productId && (item.product_unit_id === null || item.product_unit_id === unitId))
    if (!applies) continue
    const value = promoAmount(discount, Number(qty) || 0, price)
    if (value > amount) {
      best = discount
      amount = value
    }
  }
  return { promo: best, amount }
}

/** Label singkat promo, mis. "10%" atau "Rp 3.000/pcs". */
export function promoLabel(discount, unit = '') {
  if (discount.type === 'persen') return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(discount.value)}%`
  return `Rp ${new Intl.NumberFormat('id-ID').format(discount.value)}${unit ? `/${unit}` : ''}`
}
