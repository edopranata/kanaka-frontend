<script setup>
import { onMounted, ref } from 'vue'
import http, { errorMessage } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { hariTanggal, jam, number, rupiah, tanggal } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import PageHeader from '../components/PageHeader.vue'
import SalesChart from '../components/SalesChart.vue'
import StatCard from '../components/StatCard.vue'

const auth = useAuthStore()
const toast = useToastStore()
const data = ref(null)

async function load() {
  try {
    const response = await http.get('/dashboard')
    data.value = response.data
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

onMounted(load)
</script>

<template>
  <div class="stagger">
    <PageHeader :title="`Halo, ${auth.user?.name || ''}`" :subtitle="data ? hariTanggal(data.business_date) : ''">
      <template #actions>
        <button class="btn-secondary" @click="load"><AppIcon name="refresh" :size="16" /> Muat ulang</button>
      </template>
    </PageHeader>

    <div v-if="!data" class="py-16 text-center text-slate-500">Memuat…</div>

    <template v-else>
      <!-- Peringatan closing -->
      <RouterLink
        v-if="data.closing.pending_days > 0 && auth.can('closings.view')"
        :to="{ name: 'closings' }"
        class="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition hover:bg-amber-100"
      >
        <AppIcon name="alert" class="shrink-0" />
        <span>
          Ada <b>{{ data.closing.pending_days }} hari</b> yang belum di-closing (mulai {{ tanggal(data.closing.next_closing_date) }}).
          Closing otomatis berjalan setiap pukul 00:00.
        </span>
      </RouterLink>

      <RouterLink
        v-if="data.receivables && (data.receivables.billed || data.receivables.unbilled)"
        :to="{ name: 'bills' }"
        class="card card-hover mb-5 flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4 text-sm"
      >
        <span class="flex items-center gap-2 font-semibold text-slate-900"><AppIcon name="document" class="text-brand-600" /> Piutang pelanggan</span>
        <span><span class="text-slate-500">Tagihan belum lunas</span> <b class="tabular-nums">{{ rupiah(data.receivables.billed) }}</b></span>
        <span><span class="text-slate-500">Bon belum ditagih</span> <b class="tabular-nums">{{ rupiah(data.receivables.unbilled) }}</b></span>
        <span v-if="data.receivables.overdue" class="text-red-600">
          Lewat jatuh tempo <b class="tabular-nums">{{ rupiah(data.receivables.overdue) }}</b> ({{ data.receivables.overdue_count }} tagihan)
        </span>
      </RouterLink>

      <template v-if="data.today">
        <p v-if="data.scope === 'own'" class="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Penjualan Anda</p>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
          <StatCard label="Penjualan hari ini" :value="rupiah(data.today.total)" :hint="`${data.today.count} transaksi`" />
          <StatCard label="Rata-rata / transaksi" :value="rupiah(data.today.average)" tone="slate" />
          <StatCard
            v-if="data.today.profit !== null"
            label="Laba kotor hari ini"
            :value="rupiah(data.today.profit)"
            tone="green"
          />
          <StatCard label="Penjualan bulan ini" :value="rupiah(data.month.total)" :hint="`${number(data.month.count)} transaksi`" tone="accent" />
          <StatCard
            v-if="data.month.profit !== null"
            label="Laba kotor bulan ini"
            :value="rupiah(data.month.profit)"
            tone="green"
          />
        </div>

        <div class="mt-5 grid gap-5 lg:grid-cols-3 2xl:grid-cols-4">
          <section class="card p-5 lg:col-span-2 2xl:col-span-3">
            <h2 class="font-semibold text-slate-900">Penjualan 14 hari terakhir</h2>
            <p class="mb-5 text-xs text-slate-500">Total penjualan per tanggal usaha</p>
            <SalesChart :data="data.chart" />
          </section>

          <section class="card p-5">
            <h2 class="mb-3 font-semibold text-slate-900">Produk terlaris bulan ini</h2>
            <ol v-if="data.top_products.length" class="space-y-3">
              <li v-for="(product, index) in data.top_products" :key="product.product_id" class="flex items-center gap-3 text-sm">
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{{ index + 1 }}</span>
                <span class="min-w-0 flex-1 truncate">{{ product.name }}</span>
                <span class="text-right tabular-nums">
                  <span class="block font-medium">{{ number(product.qty) }}</span>
                  <span class="block text-xs text-slate-500">{{ rupiah(product.total) }}</span>
                </span>
              </li>
            </ol>
            <p v-else class="text-sm text-slate-500">Belum ada penjualan bulan ini.</p>
          </section>
        </div>
      </template>

      <div class="mt-5 grid gap-5 lg:grid-cols-[repeat(auto-fit,minmax(24rem,1fr))]">
        <section v-if="data.low_stock" class="card">
          <header class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 class="font-semibold text-slate-900">Stok menipis</h2>
              <p class="text-xs text-slate-500">{{ data.low_stock.count }} dari {{ data.product_count }} produk aktif di bawah stok minimum</p>
            </div>
            <RouterLink :to="{ name: 'products', query: { low_stock: 1 } }" class="shrink-0 text-sm font-medium text-brand-700 hover:underline">Lihat semua</RouterLink>
          </header>
          <ul v-if="data.low_stock.items.length" class="divide-y divide-slate-100">
            <li v-for="item in data.low_stock.items" :key="item.id" class="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <span class="min-w-0">
                <span class="block truncate font-medium">{{ item.name }}</span>
                <span class="text-xs text-slate-500">{{ item.sku }} · min. {{ item.min_stock }}</span>
              </span>
              <span class="shrink-0 font-semibold tabular-nums" :class="item.stock <= 0 ? 'text-red-600' : 'text-amber-600'">
                {{ number(item.stock) }} {{ item.unit }}
              </span>
            </li>
          </ul>
          <p v-else class="px-5 py-6 text-sm text-slate-500">Semua stok aman.</p>
        </section>

        <section v-if="data.recent_sales" class="card">
          <header class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 class="font-semibold text-slate-900">Transaksi terakhir</h2>
            <RouterLink :to="{ name: 'sales' }" class="text-sm font-medium text-brand-700 hover:underline">Riwayat</RouterLink>
          </header>
          <ul v-if="data.recent_sales.length" class="divide-y divide-slate-100">
            <li v-for="sale in data.recent_sales" :key="sale.id">
              <RouterLink :to="{ name: 'sale', params: { id: sale.id } }" class="flex items-center justify-between gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-slate-50">
                <span class="min-w-0">
                  <span class="block font-medium">{{ sale.number }}</span>
                  <span class="text-xs text-slate-500">{{ jam(sale.created_at) }} · {{ sale.cashier }} · {{ sale.payment_label }}</span>
                </span>
                <span class="shrink-0 font-semibold tabular-nums">{{ rupiah(sale.total) }}</span>
              </RouterLink>
            </li>
          </ul>
          <p v-else class="px-5 py-6 text-sm text-slate-500">Belum ada transaksi.</p>
        </section>
      </div>
    </template>
  </div>
</template>
