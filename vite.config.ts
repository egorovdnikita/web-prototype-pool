import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  /* GitHub Pages раздаёт проект из подпапки, поэтому сборка для неё идёт
     с BASE_PATH=/web-prototype-pool/. При раздаче с корня домена (Vercel и
     прочие) переменной нет и база остаётся «/». */
  base: process.env.BASE_PATH || '/',
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
