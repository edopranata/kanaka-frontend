<script setup>
import { computed, onMounted, ref } from 'vue'
import { useMetaStore } from '../stores/meta'
import { useToastStore } from '../stores/toast'
import { columnsFor, receiptBytes, testPageBytes } from '../utils/escpos'
import { printWithBrowser, receiptPaper } from '../utils/print'
import { choosePrinter, disconnect, forgetPrinter, isDirect, printerConfig, printerState, reconnect, sendBytes, support } from '../utils/printer'
import AppIcon from './AppIcon.vue'
import ReceiptPrint from './ReceiptPrint.vue'

/**
 * Pengaturan printer struk untuk PERANGKAT INI (tersimpan di browser), termasuk tes cetak.
 */
const meta = useMetaStore()
const toast = useToastStore()
const busy = ref(false)

const modes = [
  { value: 'browser', label: 'Dialog cetak browser', hint: 'Cara lama: printer harus terpasang di sistem (driver). Muncul dialog cetak.', available: true },
  { value: 'serial', label: 'Bluetooth / port COM', hint: 'Disarankan untuk Windows: printer Bluetooth yang sudah di-pairing (muncul sebagai COM) atau printer USB-serial. Langsung cetak tanpa dialog.', available: support.serial },
  { value: 'bluetooth', label: 'Bluetooth LE', hint: 'Untuk printer yang mendukung Bluetooth Low Energy (BLE), mis. di tablet Android.', available: support.bluetooth },
]

const paper = computed(() => receiptPaper())
const columns = computed(() => columnsFor(paper.value))
const connection = computed(() => (printerConfig.mode === 'browser' ? 'Dialog cetak browser' : printerState.connected ? printerState.name : 'Belum terhubung'))

// Struk contoh untuk "Cetak contoh struk".
const sample = computed(() => ({
  number: 'INV-CONTOH-0001',
  created_at: new Date().toISOString(),
  cashier: 'Kasir',
  customer: null,
  items: [
    { id: 1, product_name: 'Indomie Goreng', unit: 'PCS', qty: 2, price: 3500, discount: 0 },
    { id: 2, product_name: 'Kopi Kapal Api Special Mix 25 gr', unit: 'SACHET', qty: 3, price: 2000, discount: 600, promo: 'Promo Kopi' },
    { id: 3, product_name: 'Aqua 600ml', unit: 'BTL', qty: 1, price: 4000, discount: 0 },
  ],
  subtotal: 16400,
  discount: 0,
  tax: 0,
  total: 16400,
  payment_method: 'tunai',
  payment_label: 'Tunai',
  paid: 20000,
  change: 3600,
  status: 'selesai',
}))
const showSample = ref(false)

function setMode(mode) {
  if (printerConfig.mode === mode) return
  disconnect()
  printerConfig.mode = mode
  if (mode !== 'browser') reconnect()
}

async function connect() {
  try {
    await choosePrinter()
    toast.success(`Terhubung ke ${printerState.name}.`)
  } catch (e) {
    // NotFoundError = dialog pilihan ditutup tanpa memilih.
    if (e?.name !== 'NotFoundError') toast.error(e?.message || 'Printer tidak dapat dihubungkan.')
  }
}

async function forget() {
  await forgetPrinter()
  toast.success('Printer dilupakan di perangkat ini.')
}

async function run(bytes) {
  busy.value = true
  try {
    await sendBytes(bytes)
    toast.success('Dikirim ke printer.')
  } catch (e) {
    toast.error(e?.message || 'Gagal mencetak.')
  } finally {
    busy.value = false
  }
}

function testPrint() {
  const options = { store: meta.store, columns: columns.value, feed: printerConfig.feed, cut: printerConfig.cut }
  if (!isDirect()) {
    showSample.value = true
    return setTimeout(printWithBrowser, 50)
  }
  run(testPageBytes({ ...options, paper: paper.value, connection: connection.value }))
}

function samplePrint() {
  if (!isDirect()) {
    showSample.value = true
    return setTimeout(printWithBrowser, 50)
  }
  run(receiptBytes(sample.value, { store: meta.store, columns: columns.value, feed: printerConfig.feed, cut: printerConfig.cut }))
}

onMounted(() => reconnect())
</script>

<template>
  <section class="card space-y-5 p-5">
    <div>
      <h2 class="font-semibold">Printer struk</h2>
      <p class="text-sm text-slate-500">Pengaturan ini hanya berlaku untuk <b>perangkat & browser ini</b> (setiap PC kasir bisa berbeda).</p>
    </div>

    <!-- Cara mencetak -->
    <div>
      <p class="label">Cara mencetak</p>
      <div class="grid gap-2 lg:grid-cols-3">
        <button
          v-for="item in modes"
          :key="item.value"
          type="button"
          class="rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50"
          :class="printerConfig.mode === item.value ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:bg-slate-50'"
          :disabled="!item.available"
          @click="setMode(item.value)"
        >
          <span class="block text-sm font-semibold text-slate-800">{{ item.label }}</span>
          <span class="mt-0.5 block text-xs text-slate-500">{{ item.available ? item.hint : 'Tidak didukung browser ini — gunakan Google Chrome atau Microsoft Edge versi terbaru.' }}</span>
        </button>
      </div>
    </div>

    <!-- Koneksi -->
    <div v-if="isDirect()" class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4">
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full" :class="printerState.connected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'">
        <AppIcon name="printer" :size="20" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="font-medium" :class="printerState.connected ? 'text-emerald-700' : 'text-slate-700'">
          {{ printerState.connecting ? 'Menghubungkan…' : printerState.connected ? `Terhubung: ${printerState.name}` : 'Belum terhubung' }}
        </p>
        <p class="text-xs text-slate-500">
          <template v-if="printerConfig.mode === 'serial'">
            Windows: pairing printer dulu di <b>Settings → Bluetooth & devices</b> (PIN biasanya 0000 atau 1234), lalu pilih printernya / port <b>COM</b> “Standard Serial over Bluetooth link”.
          </template>
          <template v-else>Nyalakan printer di dekat perangkat, lalu pilih namanya dari daftar.</template>
        </p>
      </div>
      <div class="flex gap-2">
        <button class="btn-primary" :disabled="printerState.connecting" @click="connect">
          <AppIcon name="printer" :size="16" /> {{ printerState.connected ? 'Ganti printer' : 'Hubungkan printer' }}
        </button>
        <button v-if="printerState.connected" class="btn-secondary" @click="forget">Lupakan</button>
      </div>
    </div>

    <p v-if="isDirect() && printerState.lastError" class="rounded-lg bg-red-50 p-3 text-sm text-red-700">
      <AppIcon name="alert" :size="16" class="inline" /> {{ printerState.lastError }}
    </p>
    <details v-if="isDirect() && printerState.log.length" class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
      <summary class="cursor-pointer font-medium">Diagnostik printer</summary>
      <pre class="mt-2 font-mono whitespace-pre-wrap">{{ printerState.log.join('\n') }}</pre>
    </details>

    <!-- Kertas & opsi -->
    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <p class="label">Lebar kertas di perangkat ini</p>
        <div class="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
          <button type="button" class="tab justify-center" :class="{ 'tab-active': !printerConfig.paper }" @click="printerConfig.paper = ''">Bawaan ({{ meta.app.receipt_paper }} mm)</button>
          <button type="button" class="tab justify-center" :class="{ 'tab-active': printerConfig.paper === '58' }" @click="printerConfig.paper = '58'">58 mm</button>
          <button type="button" class="tab justify-center" :class="{ 'tab-active': printerConfig.paper === '80' }" @click="printerConfig.paper = '80'">80 mm</button>
        </div>
        <p class="mt-1 text-xs text-slate-500">{{ paper }} mm = {{ columns }} karakter per baris. Samakan dengan pengaturan kertas di printer.</p>
      </div>
      <div>
        <label class="label">Jarak kertas setelah struk (baris)</label>
        <input v-model.number="printerConfig.feed" type="number" min="0" max="10" class="input max-w-32" />
      </div>
      <label class="flex items-start gap-2 text-sm">
        <input v-model="printerConfig.autoPrint" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
        <span><b>Cetak otomatis</b> setelah transaksi kasir & bon tersimpan</span>
      </label>
      <label v-if="isDirect()" class="flex items-start gap-2 text-sm">
        <input v-model="printerConfig.cut" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
        <span>Potong kertas otomatis <span class="text-slate-500">(untuk printer yang punya pemotong)</span></span>
      </label>
    </div>

    <!-- Tes -->
    <div class="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
      <button class="btn-primary" :disabled="busy || (isDirect() && printerState.connecting)" @click="testPrint"><AppIcon name="printer" :size="16" /> {{ busy ? 'Mencetak…' : 'Tes Print' }}</button>
      <button class="btn-secondary" :disabled="busy" @click="samplePrint"><AppIcon name="receipt" :size="16" /> Cetak contoh struk</button>
      <p class="text-xs text-slate-500">Tes print mencetak penggaris lebar kertas, perataan, dan ukuran huruf untuk memastikan pengaturan sudah benar.</p>
    </div>

    <ReceiptPrint v-if="showSample" :sale="sample" />
  </section>
</template>
