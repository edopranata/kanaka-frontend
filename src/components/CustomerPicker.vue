<script setup>
import { onBeforeUnmount, reactive, ref } from 'vue'
import http, { errorMessage, validationErrors } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { rupiah } from '../utils/format'
import AppIcon from './AppIcon.vue'
import AppModal from './AppModal.vue'
import MoneyInput from './MoneyInput.vue'

/**
 * Pilih pelanggan (bisa dicari) + tambah pelanggan baru. v-model berisi objek pelanggan atau null.
 */
const model = defineModel({ type: Object, default: null })
const props = defineProps({
  invalid: { type: Boolean, default: false },
  /** Tampilkan info batas kredit (untuk bon). Di kasir tidak perlu. */
  showCredit: { type: Boolean, default: true },
  placeholder: { type: String, default: 'Cari nama / telepon pelanggan…' },
  /** Label tombol saat pelanggan sudah dipilih. */
  clearLabel: { type: String, default: 'Ganti' },
})

const auth = useAuthStore()
const toast = useToastStore()
const term = ref('')
const results = ref([])
const open = ref(false)
const input = ref(null)
let timer = null

async function search() {
  const { data } = await http.get('/customers', { params: { search: term.value, per_page: 10 } })
  results.value = data.data
  open.value = true
}

function onInput() {
  clearTimeout(timer)
  timer = setTimeout(search, 200)
}

function closeSoon() {
  setTimeout(() => (open.value = false), 150)
}

function choose(customer) {
  model.value = customer
  term.value = ''
  open.value = false
}

function clear() {
  model.value = null
  setTimeout(() => input.value?.focus(), 50)
}

// ---- Pelanggan baru ----
const form = ref(null)
const errors = ref({})

async function save() {
  errors.value = {}
  try {
    const { data } = await http.post('/customers', form.value)
    choose(data.data)
    form.value = null
  } catch (e) {
    errors.value = validationErrors(e)
    if (!Object.keys(errors.value).length) toast.error(errorMessage(e))
  }
}

onBeforeUnmount(() => clearTimeout(timer))
defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div>
    <Transition name="pop" mode="out-in">
      <div v-if="model" class="flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5">
        <div class="min-w-0">
          <p class="truncate font-semibold text-brand-900">{{ model.name }}</p>
          <p class="text-xs text-brand-800/70">
            {{ model.phone || 'Tanpa telepon' }}<template v-if="props.showCredit"> · Batas kredit {{ model.credit_limit ? rupiah(model.credit_limit) : 'tanpa batas' }}</template>
          </p>
        </div>
        <button type="button" class="btn-secondary btn-sm" @click="clear">{{ props.clearLabel }}</button>
      </div>
      <div v-else class="flex gap-2">
        <div class="relative flex-1">
          <input
            ref="input"
            v-model="term"
            type="search"
            class="input"
            :class="{ 'input-error': invalid }"
            :placeholder="props.placeholder"
            autocomplete="off"
            @input="onInput"
            @focus="search"
            @blur="closeSoon"
          />
          <Transition name="pop">
            <div v-if="open" class="absolute inset-x-0 top-full z-30 mt-1 max-h-72 origin-top overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              <p v-if="!results.length" class="px-3 py-3 text-sm text-slate-500">Pelanggan tidak ditemukan.</p>
              <button
                v-for="customer in results"
                :key="customer.id"
                type="button"
                class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-brand-50"
                @mousedown.prevent="choose(customer)"
              >
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{ customer.name }}</span>
                  <span class="text-xs text-slate-500">{{ customer.phone || '-' }}</span>
                </span>
                <span v-if="props.showCredit" class="shrink-0 text-xs text-slate-500">{{ customer.credit_limit ? `Limit ${rupiah(customer.credit_limit)}` : '' }}</span>
              </button>
            </div>
          </Transition>
        </div>
        <button v-if="auth.can('customers.manage')" type="button" class="btn-secondary px-3" title="Pelanggan baru" @click="form = { name: term, phone: '', address: '', credit_limit: 0 }">
          <AppIcon name="plus" :size="18" />
        </button>
      </div>
    </Transition>

    <AppModal v-if="form" title="Pelanggan Baru" size="sm" @close="form = null">
      <form id="customer-picker-form" class="space-y-3" @submit.prevent="save">
        <div>
          <label class="label">Nama</label>
          <input v-model="form.name" class="input" :class="{ 'input-error': errors.name }" required />
          <p v-if="errors.name" class="error-text">{{ errors.name }}</p>
        </div>
        <div>
          <label class="label">Telepon</label>
          <input v-model="form.phone" class="input" inputmode="tel" />
        </div>
        <div>
          <label class="label">Alamat</label>
          <input v-model="form.address" class="input" />
        </div>
        <div>
          <label class="label">Batas kredit</label>
          <MoneyInput v-model="form.credit_limit" placeholder="0 = tanpa batas" />
          <p class="mt-1 text-xs text-slate-500">Isi 0 bila tidak dibatasi.</p>
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="form = null">Batal</button>
        <button class="btn-primary" type="submit" form="customer-picker-form">Simpan</button>
      </template>
    </AppModal>
  </div>
</template>
