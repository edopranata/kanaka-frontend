<script setup>
import { ref } from 'vue'
import AppModal from './AppModal.vue'

/**
 * Modal konfirmasi dengan isian alasan (void penjualan/pembelian, dsb.).
 */
defineProps({
  title: { type: String, required: true },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Ya, batalkan' },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['close', 'confirm'])
const reason = ref('')
</script>

<template>
  <AppModal :title="title" size="sm" @close="emit('close')">
    <p v-if="message" class="mb-3 text-sm text-slate-600">{{ message }}</p>
    <label class="label">Alasan</label>
    <textarea v-model="reason" rows="2" class="input" :class="{ 'input-error': error }" placeholder="Wajib diisi" />
    <p v-if="error" class="error-text">{{ error }}</p>
    <template #footer>
      <button class="btn-secondary" @click="emit('close')">Kembali</button>
      <button class="btn-danger" :disabled="saving || !reason.trim()" @click="emit('confirm', reason.trim())">
        {{ saving ? 'Memproses…' : confirmLabel }}
      </button>
    </template>
  </AppModal>
</template>
