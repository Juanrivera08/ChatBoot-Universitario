import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJs from 'vite-plugin-css-injected-by-js';

// Build del widget como IIFE autocontenido para embeber en cualquier web.
// Uso: npm run build:widget
// Resultado: dist-widget/ush-chat-widget.iife.js  (CSS incluido dentro del JS)
// Embed: <script src="https://servidor/widget/ush-chat-widget.iife.js"></script>
export default defineConfig({
  plugins: [
    react(),
    // Inyecta el CSS dentro del JS — widget queda en un solo archivo
    cssInjectedByJs(),
  ],
  mode: 'production',
  define: {
    // React usa process.env.NODE_ENV internamente; en el browser no existe
    'process.env.NODE_ENV': '"production"',
    'process.env': '{}',
    global: 'globalThis',
  },
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
