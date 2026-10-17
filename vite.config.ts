import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  // Percorsi relativi: il sito funziona in qualsiasi sottocartella (GitHub Pages compreso).
  base: './',
  plugins: [svelte()],
  server: { port: 5190 },
  // Three.js pesa ~500 kB ma si carica solo quando si apre la vista 3D.
  build: { chunkSizeWarningLimit: 600 },
})
