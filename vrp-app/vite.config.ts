import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sharedDevAssets = new Map([
  ['/vrp/operartis-theme.js', '../operartis-theme.js'],
  ['/vrp/operartis-lang.js', '../operartis-lang.js'],
  ['/vrp/operartis-security.js', '../operartis-security.js'],
  ['/vrp/operartis-api.js', '../operartis-api.js'],
  ['/vrp/operartis-auth-ui.js', '../operartis-auth-ui.js'],
  ['/vrp/operartis-access-gate.js', '../operartis-access-gate.js'],
  ['/vrp/operartis-access-shell.css', '../operartis-access-shell.css'],
  ['/vrp/icononly_transparent_quadratic.png', '../icononly_transparent_quadratic.png'],
]);

const sharedAssetsPlugin = {
  name: 'operartis-shared-dev-assets',
  configureServer(server: { middlewares: { use: (handler: (request: { url?: string }, response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: Uint8Array) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use(async (request, response, next) => {
      const pathname = new URL(request.url || '/', 'http://localhost').pathname;
      const relativePath = sharedDevAssets.get(pathname);
      if (!relativePath) {
        next();
        return;
      }
      try {
        const body = await readFile(fileURLToPath(new URL(relativePath, import.meta.url)));
        response.statusCode = 200;
        response.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css; charset=utf-8' : pathname.endsWith('.png') ? 'image/png' : 'text/javascript; charset=utf-8');
        response.end(body);
      } catch {
        next();
      }
    });
  },
};

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  base: '/vrp/',
  plugins: [sharedAssetsPlugin, react()],
  build: {
    outDir: '../vrp',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 4174,
    proxy: {
      '/auth': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/api/vrp': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4175,
  },
});
