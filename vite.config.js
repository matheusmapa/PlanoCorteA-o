import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Garante que o build para produção seja otimizado
    outDir: 'dist',
    sourcemap: false
  }
})
