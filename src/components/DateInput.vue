<script setup>
import { computed, nextTick, ref } from 'vue'
import { useFloating } from '../utils/floating'
import { isoDate } from '../utils/format'
import AppIcon from './AppIcon.vue'

/**
 * Pengganti <input type="date"> / <input type="month"> bawaan browser: kalender bergaya aplikasi (Senin di awal
 * minggu, nama bulan Indonesia), dengan batas min/max dan tombol Hari ini. Nilai tetap string
 * "YYYY-MM-DD" (type="date") atau "YYYY-MM" (type="month"). Atribut lain diteruskan ke tombol.
 */
defineOptions({ inheritAttrs: false })
const props = defineProps({
  type: { type: String, default: 'date', validator: (value) => ['date', 'month'].includes(value) },
  min: { type: String, default: '' },
  max: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  /** Tampilkan tombol Hapus (nilai boleh kosong). */
  clearable: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
const model = defineModel({ type: String, default: '' })
const emit = defineEmits(['change'])

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const monthName = (month, style = 'long') => new Date(2000, month, 1).toLocaleDateString('id-ID', { month: style })
const pad = (value) => String(value).padStart(2, '0')
const monthKey = (year, month) => `${year}-${pad(month + 1)}`

const isMonth = computed(() => props.type === 'month')
const minMonth = computed(() => props.min.slice(0, 7))
const maxMonth = computed(() => props.max.slice(0, 7))
const outOfRange = (value, length = 10) => (props.min && value < props.min.slice(0, length)) || (props.max && value > props.max.slice(0, length))

const label = computed(() => {
  if (!model.value) return props.placeholder || (isMonth.value ? 'Pilih bulan' : 'Pilih tanggal')
  if (isMonth.value) {
    const [year, month] = model.value.split('-').map(Number)
    return `${monthName(month - 1)} ${year}`
  }
  return new Date(`${model.value}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
})

const open = ref(false)
const view = ref('days')
const year = ref(0)
const month = ref(0)
const focused = ref('')
const trigger = ref(null)
const panel = ref(null)
const { style } = useFloating(trigger, panel, open, { matchWidth: false })

const todayIso = isoDate(new Date())
const days = computed(() => {
  const offset = (new Date(year.value, month.value, 1).getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year.value, month.value, 1 - offset + index)
    const iso = isoDate(date)
    return { iso, day: date.getDate(), inMonth: date.getMonth() === month.value, disabled: outOfRange(iso), today: iso === todayIso }
  })
})
const months = computed(() =>
  Array.from({ length: 12 }, (_, index) => {
    const key = monthKey(year.value, index)
    return { index, key, label: monthName(index, 'short'), disabled: outOfRange(key, 7), current: key === todayIso.slice(0, 7) }
  }),
)
const canPrev = computed(() => (view.value === 'days' ? !props.min || monthKey(year.value, month.value) > minMonth.value : !props.min || year.value > Number(props.min.slice(0, 4))))
const canNext = computed(() => (view.value === 'days' ? !props.max || monthKey(year.value, month.value) < maxMonth.value : !props.max || year.value < Number(props.max.slice(0, 4))))

function setCursor(iso) {
  const [y, m] = iso.split('-').map(Number)
  year.value = y
  month.value = m - 1
}

async function show() {
  if (props.disabled || open.value) return
  // Kalender dibuka di bulan nilai terpilih; bila kosong di hari ini (dibatasi min/max).
  let start = model.value || todayIso
  if (props.max && start > props.max) start = props.max
  if (props.min && start < props.min) start = props.min
  if (isMonth.value) start = `${start.slice(0, 7)}-01`
  setCursor(start)
  focused.value = isMonth.value ? '' : start
  view.value = isMonth.value ? 'months' : 'days'
  open.value = true
  await nextTick()
  panel.value?.focus({ preventScroll: true })
}

function hide(focusTrigger = true) {
  open.value = false
  if (focusTrigger) trigger.value?.focus({ preventScroll: true })
}

function select(value) {
  const changed = value !== model.value
  model.value = value
  hide()
  if (changed) emit('change', value)
}

function shift(step) {
  if (view.value === 'months') {
    year.value += step
    return
  }
  const date = new Date(year.value, month.value + step, 1)
  year.value = date.getFullYear()
  month.value = date.getMonth()
}

function pickMonth(item) {
  if (item.disabled) return
  if (isMonth.value) return select(item.key)
  month.value = item.index
  view.value = 'days'
}

function pickToday() {
  const value = isMonth.value ? todayIso.slice(0, 7) : todayIso
  if (!outOfRange(value, value.length)) select(value)
}
const todayAllowed = computed(() => !outOfRange(isMonth.value ? todayIso.slice(0, 7) : todayIso, isMonth.value ? 7 : 10))

function clear() {
  select('')
}

/** Navigasi keyboard di tampilan tanggal: panah = hari/minggu, PageUp/PageDown = bulan. */
function moveFocus(daysStep, monthsStep = 0) {
  const base = new Date(`${focused.value || todayIso}T00:00:00`)
  const date = monthsStep ? new Date(base.getFullYear(), base.getMonth() + monthsStep, Math.min(base.getDate(), 28)) : new Date(base.getFullYear(), base.getMonth(), base.getDate() + daysStep)
  focused.value = isoDate(date)
  setCursor(focused.value)
}

function onKeydown(event) {
  const actions = {
    Escape: () => hide(),
    ArrowLeft: () => view.value === 'days' && moveFocus(-1),
    ArrowRight: () => view.value === 'days' && moveFocus(1),
    ArrowUp: () => view.value === 'days' && moveFocus(-7),
    ArrowDown: () => view.value === 'days' && moveFocus(7),
    PageUp: () => (view.value === 'days' ? moveFocus(0, -1) : shift(-1)),
    PageDown: () => (view.value === 'days' ? moveFocus(0, 1) : shift(1)),
    Enter: () => view.value === 'days' && focused.value && !outOfRange(focused.value) && select(focused.value),
  }
  if (actions[event.key]) {
    event.preventDefault()
    // Escape tidak ikut menutup dialog di belakangnya.
    event.stopPropagation()
    actions[event.key]()
  } else if (event.key === 'Tab') {
    hide(false)
  }
}

function onTriggerKeydown(event) {
  if (['ArrowDown', 'Enter', ' '].includes(event.key)) {
    event.preventDefault()
    show()
  }
}
</script>

<template>
  <button
    ref="trigger"
    type="button"
    v-bind="$attrs"
    class="text-left disabled:cursor-not-allowed"
    :disabled="disabled"
    aria-haspopup="dialog"
    :aria-expanded="open"
    @click="open ? hide() : show()"
    @keydown="onTriggerKeydown"
  >
    <span class="flex min-w-0 items-center gap-2">
      <AppIcon name="calendar" :size="16" class="shrink-0 text-slate-400" />
      <span class="min-w-0 flex-1 truncate" :class="{ 'text-slate-400': !model }">{{ label }}</span>
    </span>
  </button>
  <Teleport to="body">
    <Transition name="pop">
      <div
        v-if="open"
        ref="panel"
        tabindex="-1"
        role="dialog"
        :aria-label="isMonth ? 'Pilih bulan' : 'Pilih tanggal'"
        class="fixed z-[70] w-72 rounded-xl bg-white p-3 text-sm text-slate-700 shadow-xl ring-1 ring-slate-900/10 outline-none"
        :style="style"
        @keydown="onKeydown"
      >
        <!-- Kepala: bulan/tahun & navigasi -->
        <div class="mb-2 flex items-center justify-between gap-1">
          <button type="button" class="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-30" :disabled="!canPrev" :aria-label="view === 'days' ? 'Bulan sebelumnya' : 'Tahun sebelumnya'" @click="shift(-1)">
            <AppIcon name="chevronDown" :size="16" class="rotate-90" />
          </button>
          <button
            type="button"
            class="rounded-lg px-2.5 py-1 font-semibold text-slate-800 transition"
            :class="view === 'days' ? 'hover:bg-slate-100' : 'cursor-default'"
            :title="view === 'days' ? 'Pilih bulan' : ''"
            @click="view === 'days' && (view = 'months')"
          >
            {{ view === 'days' ? `${monthName(month)} ${year}` : year }}
          </button>
          <button type="button" class="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-30" :disabled="!canNext" :aria-label="view === 'days' ? 'Bulan berikutnya' : 'Tahun berikutnya'" @click="shift(1)">
            <AppIcon name="chevronDown" :size="16" class="-rotate-90" />
          </button>
        </div>

        <!-- Tanggal -->
        <div v-if="view === 'days'" class="grid grid-cols-7 gap-0.5 text-center">
          <span v-for="weekday in WEEKDAYS" :key="weekday" class="py-1 text-[11px] font-semibold text-slate-400 uppercase">{{ weekday }}</span>
          <button
            v-for="cell in days"
            :key="cell.iso"
            type="button"
            class="relative grid h-9 place-items-center rounded-lg tabular-nums transition-colors duration-100"
            :class="[
              cell.iso === model
                ? 'bg-brand-600 font-semibold text-white hover:bg-brand-700'
                : cell.disabled
                  ? 'cursor-not-allowed text-slate-300'
                  : [cell.today ? 'font-semibold text-brand-700' : cell.inMonth ? 'text-slate-700' : 'text-slate-400', 'hover:bg-brand-50 hover:text-brand-800'],
              cell.iso === focused && cell.iso !== model ? 'ring-2 ring-brand-300' : '',
            ]"
            :disabled="cell.disabled"
            :aria-pressed="cell.iso === model"
            :aria-label="cell.iso"
            @click="select(cell.iso)"
          >
            {{ cell.day }}
            <span v-if="cell.today" class="absolute bottom-1 h-1 w-1 rounded-full" :class="cell.iso === model ? 'bg-white' : 'bg-brand-500'" />
          </button>
        </div>

        <!-- Bulan -->
        <div v-else class="grid grid-cols-3 gap-1.5">
          <button
            v-for="item in months"
            :key="item.key"
            type="button"
            class="rounded-lg py-2.5 transition-colors duration-100"
            :class="
              (isMonth ? item.key === model : item.index === month)
                ? 'bg-brand-600 font-semibold text-white hover:bg-brand-700'
                : item.disabled
                  ? 'cursor-not-allowed text-slate-300'
                  : ['hover:bg-brand-50 hover:text-brand-800', item.current ? 'font-semibold text-brand-700' : 'text-slate-700']
            "
            :disabled="item.disabled"
            @click="pickMonth(item)"
          >
            {{ item.label }}
          </button>
        </div>

        <div class="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
          <button type="button" class="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-40" :disabled="!todayAllowed" @click="pickToday">
            {{ isMonth ? 'Bulan ini' : 'Hari ini' }}
          </button>
          <button v-if="clearable && model" type="button" class="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100" @click="clear">Hapus</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
