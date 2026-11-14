// Vite settings shared by the module apps. Each app is served under its own
// folder (for example /inventory/), built into that folder in the frontend
// root, and loads the plain operartis-*.js scripts from the root.
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, UserConfig } from 'vite';

const frontendRoot = new URL('../', import.meta.url);

const contentTypes: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** On the dev and preview servers, serve the root's shared scripts, styles and icons. */
function sharedRootAssets(base: string): Plugin {
  const allowed = /^\/(operartis-[\w.-]+\.(?:js|css|svg)|[\w.-]+\.(?:png|ico))$/;
  type Middlewares = { use: (handler: (request: { url?: string }, response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: Uint8Array) => void }, next: () => void) => void) => void };
  const install = (middlewares: Middlewares) => {
    middlewares.use(async (request, response, next) => {
      let pathname = new URL(request.url || '/', 'http://localhost').pathname;
      if (pathname.startsWith(base)) pathname = `/${pathname.slice(base.length)}`;
      const match = allowed.exec(pathname);
      if (!match) return next();
      try {
        const body = await readFile(fileURLToPath(new URL(match[1], frontendRoot)));
        response.statusCode = 200;
        response.setHeader('Content-Type', contentTypes[extname(match[1])] || 'application/octet-stream');
        response.end(body);
      } catch {
        next();
      }
    });
  };
  return {
    name: 'operartis-shared-root-assets',
    configureServer(server) { install(server.middlewares); },
    configurePreviewServer(server) { install(server.middlewares); },
  };
}

/**
 * @param appDir     the app's source folder, as import.meta.url of its vite.config.ts
 * @param name       folder name it is served from and built into (for example "inventory")
 * @param apiPrefix  the module's backend path prefix (for example "/inventory")
 */
export function moduleConfig({ appDir, name, apiPrefix, port }: { appDir: string; name: string; apiPrefix: string; port: number }): UserConfig {
  const base = `/${name}/`;
  const backend = 'http://127.0.0.1:8000';
  const proxy = {
    '/auth': { target: backend, changeOrigin: true },
    [`/api${apiPrefix}`]: {
      target: backend,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ''),
    },
  };
  return {
    root: fileURLToPath(new URL('.', appDir)),
    base,
    plugins: [sharedRootAssets(base)],
    build: {
      outDir: `../${name}`,
      emptyOutDir: true,
      sourcemap: false,
    },
    server: { host: '127.0.0.1', port, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: port + 1, strictPort: true, proxy },
  };
}
