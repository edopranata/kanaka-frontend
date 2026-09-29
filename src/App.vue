<script setup>
import LoadingBar from './components/LoadingBar.vue'
import ToastContainer from './components/ToastContainer.vue'
</script>

<template>
  <LoadingBar />
  <RouterView v-slot="{ Component }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <ToastContainer />
</template>
