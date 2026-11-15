import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5174);
const apiHost = process.env.API_HOST || '127.0.0.1';
const apiPort = Number(process.env.API_PORT || 8000);

const cleanRoutes = new Set([
  'abcxyz',
  'accept-invite',
  'admin',
  'contact',
  'dashboard',
  'forecaster',
  'index',
  'inventory',
  'mlforecaster',
  'privacy',
  'reset-password',
  'terminal',
  'terms',
]);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function safeFilePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const fullPath = resolve(join(root, relative));
  return fullPath.startsWith(root) ? fullPath : null;
}

function routeTarget(pathname) {
  if (pathname === '/') return '/index.html';
  const slug = pathname.slice(1);
  if (cleanRoutes.has(slug)) return `/${slug}.html`;
  return pathname;
}

function redirectLocation(slug, search) {
  if (slug === 'index' || slug === 'terminal') return `/${search}`;
  return `/${slug}${search}`;
}

function proxyApi(req, res) {
  const headers = { ...req.headers, host: `${apiHost}:${apiPort}` };
  delete headers.connection;
  const proxyReq = httpRequest(
    {
      hostname: apiHost,
      port: apiPort,
      path: req.url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      const responseHeaders = { ...proxyRes.headers };
      delete responseHeaders.connection;
      res.writeHead(proxyRes.statusCode || 502, responseHeaders);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', () => {
    if (!res.headersSent) {
      send(res, 502, 'API unavailable', { 'Content-Type': 'text/plain; charset=utf-8' });
    } else {
      res.destroy();
    }
  });
  req.pipe(proxyReq);
}

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    const pathname = url.pathname;

    const htmlMatch = pathname.match(/^\/([A-Za-z0-9_-]+)\.html$/);
    if (htmlMatch && cleanRoutes.has(htmlMatch[1])) {
      res.writeHead(301, {
        Location: redirectLocation(htmlMatch[1], url.search),
        'Cache-Control': 'no-store',
      });
      res.end();
      return;
    }

    const target = routeTarget(pathname);
    const fullPath = safeFilePath(target);
    if (!fullPath || !existsSync(fullPath) || !statSync(fullPath).isFile()) {
      proxyApi(req, res);
      return;
    }

    const type = mimeTypes[extname(fullPath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': type,
    });
    createReadStream(fullPath).pipe(res);
  } catch (error) {
    send(res, 500, 'Internal Server Error', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
});

server.listen(port, host, () => {
  console.log(`Operartis frontend server running at http://${host}:${port}/`);
  console.log(`API proxy: /auth, /contact, and other backend routes → http://${apiHost}:${apiPort}`);
  console.log('Clean URLs enabled: /forecaster, /mlforecaster, /inventory, /abcxyz, /dashboard, /contact');
});
