<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import http, { errorMessage } from '../api/http'
import { useToastStore } from '../stores/toast'
import { monthStart, number, tanggal, today, waktu } from '../utils/format'
import DateRange from '../components/DateRange.vue'
import EmptyState from '../components/EmptyState.vue'
import PageHeader from '../components/PageHeader.vue'
import StatCard from '../components/StatCard.vue'

const route = useRoute()
const toast = useToastStore()
const filters = reactive({ from: monthStart(), to: today() })
const card = ref(null)

const links = {
  sale: (id) => ({ name: 'sale', params: { id } }),
  purchase: (id) => ({ name: 'purchase', params: { id } }),
  stock_adjustment: (id) => ({ name: 'adjustment', params: { id } }),
  consignment_receipt: (id) => ({ name: 'consignment-receipt', params: { id } }),
  consignment_settlement: (id) => ({ name: 'consignment-settlement', params: { id } }),
}

async function load() {
  try {
    const { data } = await http.get(`/products/${route.params.id}/movements`, { params: filters })
    card.value = data
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

onMounted(load)
</script>

<template>
  <div class="stagger">
    <PageHeader :title="card ? `Kartu Stok: ${card.product.name}` : 'Kartu Stok'" :subtitle="card ? `${card.product.sku} · stok saat ini ${number(card.product.stock)} ${card.product.unit}` : ''" :back="{ name: 'products' }" />

    <div class="card mb-4 p-4">
      <DateRange v-model:from="filters.from" v-model:to="filters.to" @change="load" />
    </div>

    <template v-if="card">
      <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Saldo awal" :value="number(card.opening)" tone="slate" />
        <StatCard label="Masuk" :value="number(card.total_in)" tone="green" />
        <StatCard label="Keluar" :value="number(card.total_out)" tone="red" />
        <StatCard label="Saldo akhir" :value="number(card.closing)" />
      </div>

      <div class="card overflow-hidden">
        <div class="table-wrap">
          <table v-stack class="table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Jenis</th>
                <th>Referensi</th>
                <th>Keterangan</th>
                <th class="num">Masuk</th>
                <th class="num">Keluar</th>
                <th class="num">Saldo</th>
                <th>Oleh</th>
              </tr>
            </thead>
            <tbody>
              <tr class="bg-slate-50 text-slate-500">
                <td colspan="6">Saldo awal per {{ tanggal(filters.from) }}</td>
                <td class="num font-medium">{{ number(card.opening) }}</td>
                <td></td>
              </tr>
              <tr v-for="movement in card.data" :key="movement.id">
                <td>{{ tanggal(movement.date) }}<p class="text-xs text-slate-400">{{ waktu(movement.created_at) }}</p></td>
                <td>{{ movement.type_label }}</td>
                <td>
                  <RouterLink v-if="movement.reference_number && links[movement.reference_type]" :to="links[movement.reference_type](movement.reference_id)" class="text-brand-700 hover:underline">
                    {{ movement.reference_number }}
                  </RouterLink>
                  <span v-else>-</span>
                </td>
                <td class="max-w-56 truncate text-slate-500">{{ movement.notes || '' }}</td>
                <td class="num text-emerald-700">{{ movement.qty > 0 ? number(movement.qty) : '' }}</td>
                <td class="num text-red-600">{{ movement.qty < 0 ? number(-movement.qty) : '' }}</td>
                <td class="num font-medium">{{ number(movement.stock_after) }}</td>
                <td>{{ movement.user || 'Sistem' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <EmptyState v-if="!card.data.length" icon="archive" title="Tidak ada mutasi" text="Tidak ada pergerakan stok pada periode ini." />
      </div>
    </template>
  </div>
</template>
