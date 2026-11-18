<script setup>
import { computed } from 'vue'
import { number, percent, rupiah } from '../utils/format'
import { marginPercent } from '../utils/priceGuard'
import AppIcon from './AppIcon.vue'
import MoneyInput from './MoneyInput.vue'

/**
 * Tinjauan harga jual di dialog konfirmasi Pembelian / Titipan Masuk.
 * `review` = hasil reviewPrices(); harga baru diisi ke `prices` (per product_unit_id).
 */
const props = defineProps({
  review: { type: Object, required: true },
  prices: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  /** false = tanpa hak "Ubah harga jual": hanya melihat, harga dinaikkan pemilik/admin lewat menu Produk. */
  editable: { type: Boolean, default: true },
})
const confirmed = defineModel('confirmed', { type: Boolean, default: false })

const serverErrors = computed(() => [props.errors.prices, props.errors.confirm_low_margin].flat().filter(Boolean))

function setPrice(unit, value) {
  props.prices[unit.id] = value
}
</script>

<template>
  <div v-if="review.rows.length" class="rounded-xl border p-3" :class="review.loss ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'">
    <p class="font-semibold" :class="review.loss ? 'text-red-800' : 'text-amber-800'">
      <AppIcon name="alert" :size="16" class="mr-1 inline" />
      <template v-if="review.loss"> {{ review.loss }} harga jual di bawah HPP baru — wajib dinaikkan</template>
      <template v-else-if="review.low"> {{ review.low }} harga jual di bawah margin minimum</template>
      <template v-else> HPP naik — harga jual ikut diperbarui ({{ review.payload.length }} satuan)</template>
    </p>
    <p v-if="editable" class="mt-0.5 text-xs text-slate-600">Harga yang di bawah HPP baru sudah diisi harga saran; periksa / ubah sebelum menyimpan. Harga baru langsung berlaku di kasir.</p>
    <p v-else-if="review.loss" class="mt-0.5 text-xs text-red-700">Anda tidak punya hak mengubah harga jual. Minta pemilik/admin menaikkan harga di menu Produk, lalu simpan lagi.</p>

    <div class="mt-2 max-h-64 space-y-2 overflow-auto overscroll-contain">
      <div v-for="row in review.rows" :key="row.line.product_id" class="rounded-lg bg-white p-2 ring-1 ring-slate-200">
        <p class="text-sm font-medium">
          {{ row.line.name }}
          <span class="text-xs font-normal text-slate-500">· HPP/{{ row.line.base_unit }} {{ number(Math.round(row.line.old_cost)) }} → <b class="text-slate-800">{{ number(Math.round(row.line.new_cost)) }}</b> · margin min. {{ percent(row.line.margin) }}</span>
        </p>
        <!-- Per satuan: info di kiri, harga baru di kanan (muat juga di layar HP). -->
        <div class="mt-1 divide-y divide-slate-100 text-xs">
          <div v-for="check in row.checks" :key="check.unit.id" class="flex items-center justify-between gap-3 py-1.5">
            <div class="min-w-0">
              <p class="font-medium text-slate-800">
                {{ check.unit.name }}<span v-if="check.unit.conversion > 1" class="font-normal text-slate-400"> (isi {{ number(check.unit.conversion) }})</span>
                <span class="font-normal text-slate-500"> · lama {{ number(check.unit.sell_price) }}</span>
              </p>
              <p class="text-slate-500 tabular-nums">HPP {{ number(check.cost) }} · minimal {{ number(check.min) }}</p>
            </div>
            <div class="w-32 shrink-0 sm:w-36">
              <div class="[&_input]:h-8 [&_input]:py-0 [&_input]:text-xs"><MoneyInput :model-value="check.price" :invalid="check.level === 'rugi'" :disabled="!editable" @update:model-value="setPrice(check.unit, $event)" /></div>
              <p class="mt-0.5 text-right" :class="check.level === 'rugi' ? 'text-red-600' : check.level === 'margin' ? 'text-amber-700' : 'text-emerald-700'">
                <template v-if="check.level === 'rugi'">rugi</template>
                <template v-else>margin {{ marginPercent(check.price, check.cost) === null ? '-' : percent(marginPercent(check.price, check.cost)) }}</template>
                <button v-if="check.level && editable" type="button" class="ml-1 underline" :title="`Pakai ${rupiah(check.suggested)}`" @click="setPrice(check.unit, check.suggested)">saran {{ number(check.suggested) }}</button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <label v-if="review.low && !review.loss" class="mt-2 flex items-start gap-2 text-xs text-amber-900">
      <input v-model="confirmed" type="checkbox" class="mt-0.5" />
      <span>Saya sadar {{ review.low }} harga di atas berada di bawah margin minimum dan tetap ingin menyimpan.</span>
    </label>
    <p v-for="message in serverErrors" :key="message" class="error-text">{{ message }}</p>
  </div>
</template>
