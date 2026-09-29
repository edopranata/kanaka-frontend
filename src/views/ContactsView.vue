<script setup>
import { computed, onMounted, ref } from 'vue'
import http, { errorMessage, validationErrors } from '../api/http'
import { useToastStore } from '../stores/toast'
import { rupiah } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import EmptyState from '../components/EmptyState.vue'
import MoneyInput from '../components/MoneyInput.vue'
import PageHeader from '../components/PageHeader.vue'
import PaginationBar from '../components/PaginationBar.vue'

/**
 * Halaman bersama untuk Supplier dan Pelanggan.
 */
const props = defineProps({
  type: { type: String, required: true }, // suppliers | customers
})

const toast = useToastStore()
const label = computed(() => (props.type === 'suppliers' ? 'Supplier' : 'Pelanggan'))

const search = ref('')
const contacts = ref([])
const pagination = ref(null)
const loading = ref(false)
const form = ref(null)
const errors = ref({})
const saving = ref(false)

async function load(page = 1) {
  loading.value = true
  try {
    const { data } = await http.get(`/${props.type}`, { params: { search: search.value, page } })
    contacts.value = data.data
    pagination.value = data
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

function openForm(contact = null) {
  errors.value = {}
  form.value = contact ? { ...contact } : { id: null, name: '', phone: '', address: '', notes: '', credit_limit: 0 }
}

async function save() {
  saving.value = true
  errors.value = {}
  try {
    if (form.value.id) {
      await http.put(`/${props.type}/${form.value.id}`, form.value)
    } else {
      await http.post(`/${props.type}`, form.value)
    }
    toast.success(`${label.value} disimpan.`)
    form.value = null
    load(pagination.value?.current_page || 1)
  } catch (e) {
    errors.value = validationErrors(e)
    if (!Object.keys(errors.value).length) toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

async function remove(contact) {
  if (!confirm(`Hapus ${label.value.toLowerCase()} ${contact.name}?`)) return
  try {
    await http.delete(`/${props.type}/${contact.id}`)
    toast.success(`${label.value} dihapus.`)
    load()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

onMounted(() => load())
</script>

<template>
  <div class="stagger">
    <PageHeader :title="label" :subtitle="type === 'suppliers' ? 'Pemasok barang untuk pembelian' : 'Data pelanggan untuk transaksi kasir'">
      <template #actions>
        <button class="btn-primary" @click="openForm()"><AppIcon name="plus" :size="16" /> {{ label }} Baru</button>
      </template>
    </PageHeader>

    <div class="card mb-4 p-4">
      <input v-model="search" type="search" class="input" placeholder="Cari nama / telepon…" @keydown.enter="load()" @search="load()" />
    </div>

    <div class="card overflow-hidden">
      <div class="table-wrap">
        <table v-stack class="table">
          <thead>
            <tr><th>Nama</th><th>Telepon</th><th>Alamat</th><th v-if="type === 'customers'" class="num">Batas Kredit</th><th>Catatan</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="contact in contacts" :key="contact.id">
              <td class="font-medium">{{ contact.name }}</td>
              <td>{{ contact.phone || '-' }}</td>
              <td class="max-w-64 truncate">{{ contact.address || '-' }}</td>
              <td v-if="type === 'customers'" class="num">{{ contact.credit_limit ? rupiah(contact.credit_limit, false) : 'Tanpa batas' }}</td>
              <td class="max-w-64 truncate text-slate-500">{{ contact.notes || '' }}</td>
              <td class="text-right">
                <button class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Ubah" @click="openForm(contact)"><AppIcon name="pencil" :size="16" /></button>
                <button class="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Hapus" @click="remove(contact)"><AppIcon name="trash" :size="16" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-if="!loading && !contacts.length" icon="users" :title="`Belum ada ${label.toLowerCase()}`" />
      <PaginationBar :meta="pagination" @page="load" />
    </div>

    <AppModal v-if="form" :title="form.id ? `Ubah ${label}` : `${label} Baru`" @close="form = null">
      <form id="contact-form" class="space-y-3" @submit.prevent="save">
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
        <div v-if="type === 'customers'">
          <label class="label">Batas kredit (bon)</label>
          <MoneyInput v-model="form.credit_limit" placeholder="0 = tanpa batas" />
          <p class="mt-1 text-xs text-slate-500">Maksimal total piutang pelanggan. Isi 0 bila tidak dibatasi.</p>
        </div>
        <div>
          <label class="label">Catatan</label>
          <textarea v-model="form.notes" rows="2" class="input" />
        </div>
      </form>
      <template #footer>
        <button class="btn-secondary" @click="form = null">Batal</button>
        <button class="btn-primary" type="submit" form="contact-form" :disabled="saving">Simpan</button>
      </template>
    </AppModal>
  </div>
</template>
