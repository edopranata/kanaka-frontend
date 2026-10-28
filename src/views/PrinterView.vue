<script setup>
import { computed } from 'vue'
import { printerConfig } from '../utils/printer'
import PageHeader from '../components/PageHeader.vue'
import PrinterSettings from '../components/PrinterSettings.vue'

// Printer struk per perangkat: bisa dibuka semua pengguna (menu pengguna → Printer struk), tanpa hak akses Pengaturan.
const subtitle = computed(() => (printerConfig.deviceName.trim() ? `Perangkat ini: ${printerConfig.deviceName.trim()}` : 'Pengaturan printer untuk perangkat & browser ini'))
</script>

<template>
  <div class="stagger">
    <PageHeader title="Printer Struk" :subtitle="subtitle" />
    <PrinterSettings />
  </div>
</template>
