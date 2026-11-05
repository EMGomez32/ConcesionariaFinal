/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  build: {
    rolldownOptions: {
      output: {
        // Vite 8 empaqueta con Rolldown, que no acepta manualChunks como objeto: los
        // mismos tres grupos de antes, decididos por la ruta del módulo.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router-dom|react-router|scheduler)[\\/]/.test(id)) return 'vendor';
          if (/[\\/]node_modules[\\/](lucide-react|react-helmet-async)[\\/]/.test(id)) return 'ui';
          if (/[\\/]node_modules[\\/]axios[\\/]/.test(id)) return 'utils';
          return undefined;
        },
      },
    },
  },
})
