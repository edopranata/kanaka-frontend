<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, required: true },
})

const styles = {
  selesai: ['Selesai', 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'],
  batal: ['Dibatalkan', 'bg-red-50 text-red-700 ring-red-600/20'],
  aktif: ['Aktif', 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'],
  nonaktif: ['Nonaktif', 'bg-slate-100 text-slate-600 ring-slate-500/20'],
  manual: ['Manual', 'bg-sky-50 text-sky-700 ring-sky-600/20'],
  otomatis: ['Otomatis', 'bg-violet-50 text-violet-700 ring-violet-600/20'],
  masuk: ['Stok Masuk', 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'],
  keluar: ['Stok Keluar', 'bg-red-50 text-red-700 ring-red-600/20'],
  opname: ['Stok Opname', 'bg-amber-50 text-amber-700 ring-amber-600/20'],
  menipis: ['Menipis', 'bg-amber-50 text-amber-700 ring-amber-600/20'],
  belum: ['Belum Dibayar', 'bg-amber-50 text-amber-700 ring-amber-600/20'],
  sebagian: ['Dibayar Sebagian', 'bg-sky-50 text-sky-700 ring-sky-600/20'],
  lunas: ['Lunas', 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'],
  jatuh_tempo: ['Lewat Jatuh Tempo', 'bg-red-50 text-red-700 ring-red-600/20'],
  belum_ditagih: ['Belum Ditagih', 'bg-slate-100 text-slate-600 ring-slate-500/20'],
  paket: ['Paket', 'bg-violet-50 text-violet-700 ring-violet-600/20'],
  titipan: ['Titipan', 'bg-sky-50 text-sky-700 ring-sky-600/20'],
  berjalan: ['Berjalan', 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'],
  terjadwal: ['Terjadwal', 'bg-sky-50 text-sky-700 ring-sky-600/20'],
  berakhir: ['Berakhir', 'bg-slate-100 text-slate-500 ring-slate-500/20'],
  master: ['Belum dijual', 'bg-slate-100 text-slate-600 ring-slate-500/20'],
  terbuka: ['Belum Closing', 'bg-amber-50 text-amber-700 ring-amber-600/20'],
}

const style = computed(() => styles[props.status] || [props.status, 'bg-slate-100 text-slate-600 ring-slate-500/20'])
</script>

<template>
  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset" :class="style[1]">
    {{ style[0] }}
  </span>
</template>
