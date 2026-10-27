<script setup>
import { useMetaStore } from '../stores/meta'
import { number, waktu } from '../utils/format'
import { computed } from 'vue'
import { renderSVG } from 'uqr'
import { footerLines, headerGap, headerLines, promoLabel } from '../utils/escpos'
import { receiptPaper, receiptUrl } from '../utils/print'

/**
 * Struk thermal (58/80mm). Hanya tampil saat dicetak lewat printReceipt().
 */
const props = defineProps({
  sale: { type: Object, required: true },
})
const meta = useMetaStore()
const qrSvg = computed(() => {
  const url = receiptUrl(props.sale)
  return url ? renderSVG(url, { ecc: 'L', border: 2 }) : ''
})
</script>

<template>
  <Teleport to="body">
    <div class="receipt-print">
      <div class="receipt" :class="{ narrow: receiptPaper() === '58' }">
        <div class="center">
          <p class="bold big">{{ meta.store.name }}</p>
          <p v-for="(line, index) in headerLines(meta.store)" :key="index">{{ line }}</p>
        </div>
        <div :style="{ height: `${headerGap(meta.store) * 1.35}em` }" />
        <hr />
        <p>No : {{ sale.number }}</p>
        <p>Tgl: {{ waktu(sale.created_at) }}</p>
        <p>Kasir: {{ sale.cashier }}</p>
        <p v-if="sale.customer">Plg: {{ sale.customer.name }}</p>
        <hr />
        <div v-for="item in sale.items" :key="item.id" class="item">
          <p>{{ item.product_name }}</p>
          <p v-if="item.variant">&nbsp;&nbsp;({{ item.variant }})</p>
          <p class="row">
            <span>{{ item.qty }} {{ item.unit }} x {{ number(item.price) }}</span>
            <span>{{ number(item.qty * item.price) }}</span>
          </p>
          <p v-if="item.discount" class="row">
            <span>&nbsp;&nbsp;{{ promoLabel(item) }}</span>
            <span>-{{ number(item.discount) }}</span>
          </p>
        </div>
        <hr />
        <p class="row"><span>Subtotal</span><span>{{ number(sale.subtotal) }}</span></p>
        <p v-if="sale.discount" class="row"><span>Diskon</span><span>-{{ number(sale.discount) }}</span></p>
        <p v-if="sale.tax" class="row"><span>Pajak</span><span>{{ number(sale.tax) }}</span></p>
        <p class="row bold big"><span>TOTAL</span><span>{{ number(sale.total) }}</span></p>
        <template v-if="sale.payment_method === 'piutang'">
          <p class="center bold">*** BON - BAYAR NANTI ***</p>
          <p class="center">Ditagih pada tagihan bulanan</p>
          <br />
          <p class="row"><span>Penerima</span><span>( {{ sale.customer?.name }} )</span></p>
          <br />
        </template>
        <template v-else>
          <p class="row"><span>{{ sale.payment_label }}</span><span>{{ number(sale.paid) }}</span></p>
          <p v-if="sale.change" class="row"><span>Kembali</span><span>{{ number(sale.change) }}</span></p>
        </template>
        <p v-if="sale.status === 'batal'" class="center bold">*** DIBATALKAN ***</p>
        <hr />
        <p v-for="(line, index) in footerLines(meta.store.receipt_footer)" :key="index" class="center">{{ line }}</p>
        <template v-if="qrSvg">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="qr" v-html="qrSvg" />
          <p class="center">Scan untuk struk digital</p>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.receipt {
  width: 72mm;
  padding: 2mm;
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.35;
  color: #000;
}
.receipt.narrow {
  width: 48mm;
  font-size: 10px;
}
.center {
  text-align: center;
}
.bold {
  font-weight: 700;
}
.big {
  font-size: 13px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.item {
  margin-bottom: 2px;
}
.qr {
  width: 20mm;
  margin: 6px auto 2px;
}
.narrow .qr {
  width: 17mm;
}
.qr :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}
hr {
  border: 0;
  border-top: 1px dashed #000;
  margin: 4px 0;
}
</style>
