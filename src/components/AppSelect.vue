<script setup>
import { computed, nextTick, ref } from 'vue'
import { useFloating } from '../utils/floating'
import AppIcon from './AppIcon.vue'

/**
 * Pengganti <select> bawaan browser: daftar pilihan bergaya aplikasi, bisa dicari (otomatis bila pilihan > 8),
 * dikelompokkan (`group`), dan dipakai dengan keyboard. Atribut lain (class, title, id) diteruskan ke tombol.
 *
 * options : [{ value, label, disabled?, group? }] atau objek lain dengan value-key / label-key (string / fungsi).
 * empty   : pilihan tambahan paling atas, mis. "Semua kategori", bernilai empty-value ('' bawaan).
 * Pilihan dipilih → update:modelValue lalu change(value) bila nilainya berubah.
 */
defineOptions({ inheritAttrs: false })
const props = defineProps({
  options: { type: Array, default: () => [] },
  valueKey: { type: String, default: 'value' },
  labelKey: { type: [String, Function], default: 'label' },
  empty: { type: String, default: null },
  emptyValue: { type: [String, Number, null], default: '' },
  placeholder: { type: String, default: 'Pilih…' },
  searchable: { type: Boolean, default: null },
  disabled: { type: Boolean, default: false },
})
const model = defineModel({ type: null })
const emit = defineEmits(['change'])

const same = (a, b) => (a ?? null) === (b ?? null) || (a != null && b != null && String(a) === String(b))

const items = computed(() => {
  const list = props.options.map((option) =>
    option !== null && typeof option === 'object'
      ? {
          value: option[props.valueKey],
          label: String(typeof props.labelKey === 'function' ? props.labelKey(option) : option[props.labelKey]),
          disabled: Boolean(option.disabled),
          group: option.group ?? null,
        }
      : { value: option, label: String(option), disabled: false, group: null },
  )
  return props.empty !== null ? [{ value: props.emptyValue, label: props.empty, disabled: false, group: null }, ...list] : list
})
const selected = computed(() => items.value.find((item) => same(item.value, model.value)))
const isSearchable = computed(() => props.searchable ?? items.value.length > 8)

const open = ref(false)
const query = ref('')
const active = ref(-1)
const trigger = ref(null)
const panel = ref(null)
const list = ref(null)
const search = ref(null)
const { style } = useFloating(trigger, panel, open, { maxHeight: 320 })

const filtered = computed(() => {
  const term = query.value.trim().toLowerCase()
  return term ? items.value.filter((item) => item.label.toLowerCase().includes(term) || (item.group || '').toLowerCase().includes(term)) : items.value
})
const enabledIndex = (from, step) => {
  for (let index = from; index >= 0 && index < filtered.value.length; index += step) if (!filtered.value[index].disabled) return index
  return -1
}

function scrollToActive() {
  nextTick(() => list.value?.querySelector(`[data-index="${active.value}"]`)?.scrollIntoView({ block: 'nearest' }))
}

async function show(initialQuery = '') {
  if (props.disabled || open.value) return
  query.value = initialQuery
  open.value = true
  const current = filtered.value.findIndex((item) => same(item.value, model.value))
  active.value = current >= 0 ? current : enabledIndex(0, 1)
  await nextTick()
  ;(isSearchable.value ? search.value : list.value)?.focus({ preventScroll: true })
  scrollToActive()
}

function hide(focusTrigger = true) {
  open.value = false
  if (focusTrigger) trigger.value?.focus({ preventScroll: true })
}

function choose(item) {
  if (!item || item.disabled) return
  const changed = !same(item.value, model.value)
  model.value = item.value
  hide()
  if (changed) emit('change', item.value)
}

function move(step) {
  const next = enabledIndex(active.value + step, step)
  if (next >= 0) active.value = next
  scrollToActive()
}

const printable = (event) => event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey

function onTriggerKeydown(event) {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
    event.preventDefault()
    show()
  } else if (isSearchable.value && printable(event)) {
    event.preventDefault()
    show(event.key)
  }
}

function onPanelKeydown(event) {
  const keys = {
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    Home: () => ((active.value = enabledIndex(0, 1)), scrollToActive()),
    End: () => ((active.value = enabledIndex(filtered.value.length - 1, -1)), scrollToActive()),
    Enter: () => choose(filtered.value[active.value]),
    Escape: () => hide(),
  }
  if (keys[event.key]) {
    event.preventDefault()
    // Escape tidak ikut menutup dialog di belakangnya.
    event.stopPropagation()
    keys[event.key]()
  } else if (event.key === 'Tab') {
    hide(false)
  } else if (!isSearchable.value && printable(event)) {
    // Lompat ke pilihan berawalan huruf yang diketik.
    const key = event.key.toLowerCase()
    const order = [...filtered.value.keys()].map((index) => (active.value + 1 + index) % filtered.value.length)
    const next = order.find((index) => !filtered.value[index].disabled && filtered.value[index].label.toLowerCase().startsWith(key))
    if (next !== undefined) ((active.value = next), scrollToActive())
  }
}

function onSearch() {
  active.value = enabledIndex(0, 1)
  scrollToActive()
}
</script>

<template>
  <button
    ref="trigger"
    type="button"
    v-bind="$attrs"
    class="text-left disabled:cursor-not-allowed"
    :disabled="disabled"
    aria-haspopup="listbox"
    :aria-expanded="open"
    @click="open ? hide() : show()"
    @keydown="onTriggerKeydown"
  >
    <span class="flex min-w-0 items-center gap-2">
      <span class="min-w-0 flex-1 truncate" :class="{ 'text-slate-400': !selected }">{{ selected ? selected.label : placeholder }}</span>
      <AppIcon name="chevronDown" :size="16" class="shrink-0 text-slate-400 transition-transform duration-200" :class="{ 'rotate-180': open }" />
    </span>
  </button>
  <Teleport to="body">
    <Transition name="pop">
      <div
        v-if="open"
        ref="panel"
        class="fixed z-[70] flex max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl bg-white text-sm text-slate-700 shadow-xl ring-1 ring-slate-900/10"
        :style="style"
        @keydown="onPanelKeydown"
      >
        <div v-if="isSearchable" class="shrink-0 border-b border-slate-100 p-2">
          <div class="relative">
            <AppIcon name="search" :size="16" class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
            <input ref="search" v-model="query" type="text" class="input py-1.5 pl-8" placeholder="Cari…" aria-label="Cari pilihan" @input="onSearch" />
          </div>
        </div>
        <ul ref="list" role="listbox" tabindex="-1" class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 outline-none">
          <template v-for="(item, index) in filtered" :key="`${index}-${item.value}`">
            <li v-if="item.group && item.group !== filtered[index - 1]?.group" class="px-2.5 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase" role="presentation">
              {{ item.group }}
            </li>
            <li
              role="option"
              :data-index="index"
              :aria-selected="same(item.value, model)"
              :aria-disabled="item.disabled"
              class="flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors duration-100"
              :class="[
                item.disabled ? 'cursor-not-allowed text-slate-300' : 'cursor-pointer',
                index === active && !item.disabled ? 'bg-brand-50 text-brand-800' : '',
                same(item.value, model) ? 'font-medium' : '',
              ]"
              @mousemove="!item.disabled && (active = index)"
              @click="choose(item)"
            >
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              <AppIcon v-if="same(item.value, model)" name="check" :size="16" class="shrink-0 text-brand-600" />
            </li>
          </template>
          <li v-if="!filtered.length" class="px-2.5 py-3 text-center text-slate-400">Tidak ditemukan</li>
        </ul>
      </div>
    </Transition>
  </Teleport>
</template>
