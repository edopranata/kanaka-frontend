const numberFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

export function rupiah(value, withPrefix = true) {
  const amount = Number(value) || 0
  const text = numberFormatter.format(Math.abs(amount))
  const sign = amount < 0 ? '-' : ''
  return withPrefix ? `${sign}Rp ${text}` : `${sign}${text}`
}

export function number(value) {
  return numberFormatter.format(Number(value) || 0)
}

export function percent(value) {
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(Number(value) || 0)}%`
}

export function tanggal(value, month = 'short') {
  if (!value) return '-'
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit',
    month,
    year: 'numeric',
  })
}

export function hariTanggal(value) {
  if (!value) return '-'
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function waktu(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function jam(value) {
  if (!value) return '-'
  return new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function today() {
  return isoDate(new Date())
}

export function daysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return isoDate(date)
}

export function monthStart(offset = 0) {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() + offset)
  return isoDate(date)
}

export function monthEnd(offset = 0) {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() + offset + 1)
  date.setDate(0)
  return isoDate(date)
}
