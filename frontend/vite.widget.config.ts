import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build del widget como IIFE autocontenido para embeber en WordPress u otras webs.
// Uso: npm run build:widget
// Resultado: dist-widget/ush-chat-widget.iife.js + dist-widget/ush-chat-widget.iife.css
export default defineConfig({
  plugins: [react()],
  // Garantiza que import.meta.env.DEV === false en el bundle
  mode: 'production',
  build: {
    outDir: 'dist-widget',
    emptyOutDir: true,
    lib: {
      entry: 'src/widget-entry.tsx',
      name: 'USHChatWidget',
      fileName: 'ush-chat-widget',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
