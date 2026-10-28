<script setup>
import { computed, onMounted, ref } from 'vue'
import http from '../api/http'
import AppSelect from './AppSelect.vue'

/**
 * Pilih rekening untuk pembayaran non tunai. Tunai selalu memakai kas fisik pengguna yang mencatat.
 * Hanya tampil bila rekening aktif lebih dari satu; kosong = rekening default metode (Pengaturan).
 */
const props = defineProps({
  method: { type: String, default: 'tunai' },
  label: { type: String, default: 'Rekening' },
})
const model = defineModel({ type: [Number, null], default: null })

let cache = null
const banks = ref([])
const visible = computed(() => props.method !== 'tunai' && banks.value.length > 1)

onMounted(async () => {
  cache ??= http.get('/cash/accounts').then(({ data }) => data.data.filter((account) => account.type === 'bank' && account.is_active))
  banks.value = await cache.catch(() => [])
})
</script>

<template>
  <div v-if="visible">
    <label class="label">{{ label }}</label>
    <AppSelect v-model="model" class="input" :options="banks" value-key="id" label-key="name" empty="Default untuk metode ini" :empty-value="null" />
  </div>
</template>
