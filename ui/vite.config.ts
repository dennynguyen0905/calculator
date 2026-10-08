import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/** strict Content-Security-Policy for production builds (dev server needs inline scripts for HMR) */
const csp: Plugin = {
  name: 'fx580-csp',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      if (!ctx.bundle) return html;
      const policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'";
      return html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  },
};

export default defineConfig({
  plugins: [react(), csp],
  base: './',
  resolve: {
    alias: { 'fx580-engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)) },
  },
  build: { target: 'es2022', outDir: 'dist', sourcemap: false },
  server: { port: 5173 },
});
