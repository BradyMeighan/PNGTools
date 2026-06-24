import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // onnxruntime-web ships its own worker + wasm glue; pre-bundling it with esbuild
  // breaks wasm init. Excluding it lets the browser load ORT's modules as-is.
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
})
