<script setup>
import { reactive, ref } from 'vue'
import http, { errorMessage, validationErrors } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import PageHeader from '../components/PageHeader.vue'

const auth = useAuthStore()
const toast = useToastStore()
const form = reactive({ current_password: '', password: '', password_confirmation: '' })
const errors = ref({})
const saving = ref(false)

async function save() {
  saving.value = true
  errors.value = {}
  try {
    await http.put('/auth/password', form)
    Object.assign(form, { current_password: '', password: '', password_confirmation: '' })
    toast.success('Kata sandi diperbarui.')
  } catch (e) {
    errors.value = validationErrors(e)
    if (!Object.keys(errors.value).length) toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="stagger">
    <PageHeader title="Akun Saya" subtitle="Profil dan keamanan akun" />
    <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
    <section class="card space-y-2 p-5 text-sm">
      <h2 class="mb-2 font-semibold text-slate-900">Profil</h2>
      <div class="flex justify-between"><span class="text-slate-500">Nama</span><span class="font-medium">{{ auth.user?.name }}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Nama pengguna</span><span>{{ auth.user?.username }}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Level</span><span>{{ auth.user?.role_label }}</span></div>
    </section>
    <form class="card grid gap-4 p-5 sm:grid-cols-2" @submit.prevent="save">
      <h2 class="font-semibold sm:col-span-2">Ganti kata sandi</h2>
      <div class="sm:col-span-2">
        <label class="label">Kata sandi saat ini</label>
        <input v-model="form.current_password" type="password" class="input" :class="{ 'input-error': errors.current_password }" autocomplete="current-password" required />
        <p v-if="errors.current_password" class="error-text">{{ errors.current_password }}</p>
      </div>
      <div>
        <label class="label">Kata sandi baru</label>
        <input v-model="form.password" type="password" class="input" :class="{ 'input-error': errors.password }" autocomplete="new-password" required />
        <p v-if="errors.password" class="error-text">{{ errors.password }}</p>
      </div>
      <div>
        <label class="label">Ulangi kata sandi baru</label>
        <input v-model="form.password_confirmation" type="password" class="input" autocomplete="new-password" required />
      </div>
      <div class="flex justify-end sm:col-span-2">
        <button class="btn-primary" type="submit" :disabled="saving">Simpan</button>
      </div>
    </form>
    </div>
  </div>
</template>
