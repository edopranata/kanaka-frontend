/**
 * Build frontend untuk disajikan langsung oleh Laravel (satu domain dengan API).
 *
 * - File statis (assets/, service worker PWA, manifest, ikon) → backend/public
 * - index.html → backend/resources/spa/index.html, disajikan oleh routes/web.php untuk semua route Vue
 *
 * Jalankan: npm run build:laravel
 * Lokasi project Laravel bisa diatur lewat LARAVEL_PATH (default ../backend), mis. di GitHub Actions.
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const laravel = resolve(root, process.env.LARAVEL_PATH || '../backend')
const publicDir = join(laravel, 'public')
const spaDir = join(laravel, 'resources/spa')

if (!existsSync(join(laravel, 'artisan'))) {
  console.error(`Project Laravel tidak ditemukan di ${laravel}. Atur LARAVEL_PATH.`)
  process.exit(1)
}

// Bersihkan hasil build sebelumnya (file milik Laravel seperti index.php, .htaccess, robots.txt tidak disentuh).
const generated = (name) => name === 'assets' || name === 'index.html' || name === 'manifest.webmanifest' || name === 'registerSW.js' || /^(sw|workbox-[\w-]+)\.js(\.map)?$/.test(name)
for (const name of readdirSync(publicDir)) {
  if (generated(name)) rmSync(join(publicDir, name), { recursive: true, force: true })
}

execSync('npx vite build --mode laravel', { cwd: root, stdio: 'inherit', env: { ...process.env, LARAVEL_PATH: laravel } })

mkdirSync(spaDir, { recursive: true })
if (!existsSync(join(publicDir, 'index.html'))) {
  console.error('index.html tidak ditemukan di backend/public setelah build.')
  process.exit(1)
}
renameSync(join(publicDir, 'index.html'), join(spaDir, 'index.html'))

console.log('\n✓ Frontend siap disajikan Laravel:')
console.log(`  - aset    → ${publicDir}`)
console.log(`  - halaman → ${join(spaDir, 'index.html')}`)
