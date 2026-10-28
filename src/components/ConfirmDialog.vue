<script setup>
import { ref, watch } from 'vue'
import { useConfirmStore } from '../stores/confirm'
import AppIcon from './AppIcon.vue'
import AppModal from './AppModal.vue'

const store = useConfirmStore()
const value = ref('')
const confirmButton = ref(null)
const inputField = ref(null)

const tones = {
  danger: { icon: 'alert', badge: 'bg-red-50 text-red-600', button: 'btn-danger' },
  warning: { icon: 'alert', badge: 'bg-amber-50 text-amber-600', button: 'btn-primary' },
  primary: { icon: 'info', badge: 'bg-brand-50 text-brand-700', button: 'btn-primary' },
}
const tone = (dialog) => tones[dialog.tone] || tones.primary

watch(() => store.current?.id, () => (value.value = store.current?.input?.value ?? ''))
// Seperti confirm() bawaan: Enter langsung menjawab "ya" (atau mengisi teks bila ada isian).
watch([confirmButton, inputField], ([button, input]) => (input || button)?.focus())

function submit(close) {
  const dialog = store.current
  if (dialog.input?.required && !value.value.trim()) return
  store.answer(dialog.input ? value.value.trim() : true)
  close()
}
</script>

<template>
  <AppModal v-if="store.current" :key="store.current.id" :title="store.current.title" size="sm" @close="store.dismiss(store.current.id)">
    <template #default="{ close }">
      <form :id="`confirm-${store.current.id}`" class="flex items-start gap-3" @submit.prevent="submit(close)">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full" :class="tone(store.current).badge">
          <AppIcon :name="store.current.icon || tone(store.current).icon" :size="20" />
        </span>
        <div class="min-w-0 flex-1 space-y-3 pt-0.5">
          <p v-if="store.current.message" class="text-sm whitespace-pre-line text-slate-600">{{ store.current.message }}</p>
          <div v-if="store.current.input">
            <label class="label" :for="`confirm-input-${store.current.id}`">{{ store.current.input.label }}</label>
            <input :id="`confirm-input-${store.current.id}`" ref="inputField" v-model="value" class="input" :placeholder="store.current.input.placeholder" maxlength="255" />
          </div>
        </div>
      </form>
    </template>
    <template #footer="{ close }">
      <button type="button" class="btn-secondary" @click="close">{{ store.current.cancelLabel }}</button>
      <button
        ref="confirmButton"
        type="submit"
        :form="`confirm-${store.current.id}`"
        :class="tone(store.current).button"
        :disabled="store.current.input?.required && !value.trim()"
      >
        {{ store.current.confirmLabel }}
      </button>
    </template>
  </AppModal>
</template>
