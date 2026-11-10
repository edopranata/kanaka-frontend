<script setup>
import ConfirmDialog from './components/ConfirmDialog.vue'
import LoadingBar from './components/LoadingBar.vue'
import ThermalPrint from './components/ThermalPrint.vue'
import ToastContainer from './components/ToastContainer.vue'
import UpdatePrompt from './components/UpdatePrompt.vue'
import { thermalDocument } from './utils/print'
</script>

<template>
  <LoadingBar />
  <RouterView v-slot="{ Component }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <ToastContainer />
  <UpdatePrompt />
  <ConfirmDialog />
  <ThermalPrint v-if="thermalDocument.bytes" :bytes="thermalDocument.bytes" :columns="thermalDocument.columns" />
</template>
