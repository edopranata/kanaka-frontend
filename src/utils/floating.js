import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Posisi panel melayang (dropdown / kalender) yang di-Teleport ke body agar tidak terpotong modal atau tabel:
 * menempel di bawah pemicu, pindah ke atas bila ruang di bawah kurang, ikut bergeser saat halaman di-scroll,
 * dan tertutup saat klik di luar pemicu & panel.
 *
 * @param {import('vue').Ref<HTMLElement>} trigger
 * @param {import('vue').Ref<HTMLElement>} panel
 * @param {import('vue').Ref<boolean>} open
 * @param {{ matchWidth?: boolean, maxHeight?: number }} options
 */
export function useFloating(trigger, panel, open, { matchWidth = true, maxHeight = null } = {}) {
  const style = ref({})
  const GAP = 6
  const EDGE = 8

  function update() {
    if (!trigger.value || !panel.value) return
    const anchor = trigger.value.getBoundingClientRect()
    const below = window.innerHeight - anchor.bottom - GAP - EDGE
    const above = anchor.top - GAP - EDGE
    const natural = maxHeight ? Math.min(panel.value.scrollHeight, maxHeight) : panel.value.offsetHeight
    const up = natural > below && above > below
    const width = Math.max(matchWidth ? anchor.width : 0, panel.value.offsetWidth)
    style.value = {
      left: `${Math.max(EDGE, Math.min(anchor.left, window.innerWidth - width - EDGE))}px`,
      ...(up ? { bottom: `${window.innerHeight - anchor.top + GAP}px` } : { top: `${anchor.bottom + GAP}px` }),
      ...(matchWidth ? { minWidth: `${anchor.width}px` } : {}),
      ...(maxHeight ? { maxHeight: `${Math.max(160, Math.min(maxHeight, up ? above : below))}px` } : {}),
    }
  }

  function onPointerDown(event) {
    if (trigger.value?.contains(event.target) || panel.value?.contains(event.target)) return
    open.value = false
  }

  function listen(on) {
    const method = on ? 'addEventListener' : 'removeEventListener'
    window[method]('scroll', update, { capture: true, passive: true })
    window[method]('resize', update)
    document[method]('pointerdown', onPointerDown, true)
  }

  watch(open, async (value) => {
    listen(false)
    if (!value) return
    await nextTick()
    update()
    listen(true)
  })
  onBeforeUnmount(() => listen(false))

  return { style, update }
}
