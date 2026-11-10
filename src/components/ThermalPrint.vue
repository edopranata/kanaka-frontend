<script setup>
import ReceiptPreview from './ReceiptPreview.vue'

/**
 * Dokumen thermal (perintah ESC/POS) untuk dialog cetak browser, mis. nota tagihan pada perangkat tanpa printer
 * langsung. Hanya tampil saat dicetak lewat printWithBrowser(), isinya sama dengan cetakan printer thermal.
 */
defineProps({
  bytes: { type: Uint8Array, required: true },
  columns: { type: Number, default: 32 },
})
</script>

<template>
  <Teleport to="body">
    <div class="receipt-print">
      <ReceiptPreview :bytes="bytes" :columns="columns" print />
    </div>
  </Teleport>
</template>
