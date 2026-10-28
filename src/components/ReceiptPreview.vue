<script setup>
import { computed } from 'vue'
import { parseEscPos, rasterToDataUrl } from '../utils/escposPreview'

/**
 * Pratinjau kertas struk thermal dari perintah ESC/POS (receiptBytes / testPageBytes), jadi isinya sama
 * persis dengan hasil cetak: lebar 32/48 karakter, huruf tebal/besar, QR, jarak feed, dan garis potong.
 */
const props = defineProps({
  bytes: { type: Uint8Array, required: true },
  columns: { type: Number, default: 32 },
})

// Printer 58 mm = 384 titik / 32 karakter, 80 mm = 576 titik / 48 karakter → 12 titik per karakter.
const DOTS_PER_CHAR = 12
const lines = computed(() =>
  parseEscPos(props.bytes).map((line) => (line.type === 'image' ? { ...line, src: rasterToDataUrl(line), widthCh: line.width / DOTS_PER_CHAR, heightCh: line.height / DOTS_PER_CHAR } : line)),
)
const lineHeight = (line) => Math.max(1, ...line.segments.map((segment) => segment.height))
const justify = (align) => ({ center: 'justify-center', right: 'justify-end' })[align] ?? ''
</script>

<template>
  <!-- Huruf mengecil bila wadah lebih sempit dari kertas (mis. 80 mm di ponsel); 1ch ≈ 0,6em pada huruf mono.
       Bayangan lewat drop-shadow di pembungkus: mask di kertas ikut memotong box-shadow. -->
  <div class="@container">
    <div class="mx-auto w-fit drop-shadow-[0_1px_4px_rgb(15_23_42/0.18)]">
      <div class="receipt-paper bg-white px-[1.5ch] pt-4 pb-5 font-mono leading-[1.4] text-slate-900" :style="{ width: `${columns + 3}ch`, fontSize: `min(12px, calc(100cqw / ${((columns + 3) * 0.62).toFixed(2)}))` }">
        <template v-for="(line, index) in lines" :key="index">
          <div v-if="line.type === 'cut'" class="relative -mx-[1.5ch] my-2 border-t border-dashed border-slate-300">
            <span class="absolute -top-2 left-1 bg-white px-1 text-[10px] leading-none text-slate-400">✂ potong</span>
          </div>
          <div v-else-if="line.type === 'image'" class="flex" :class="justify(line.align)">
            <img :src="line.src" alt="QR struk digital" class="[image-rendering:pixelated]" :style="{ width: `${line.widthCh}ch`, height: `${line.heightCh}ch` }" />
          </div>
          <div v-else class="flex items-end overflow-hidden whitespace-pre" :class="justify(line.align)" :style="{ height: `${1.4 * lineHeight(line)}em` }">
            <span
              v-for="(segment, segmentIndex) in line.segments"
              :key="segmentIndex"
              class="inline-block origin-bottom"
              :class="{ 'font-bold': segment.bold }"
              :style="{ fontSize: `${segment.width}em`, transform: segment.height !== segment.width ? `scaleY(${segment.height / segment.width})` : null }"
              >{{ segment.text }}</span
            >
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Tepi bawah bergerigi seperti kertas struk yang disobek. */
.receipt-paper {
  --tooth: 8px;
  mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / calc(var(--tooth) * 2) 100%;
}
</style>
