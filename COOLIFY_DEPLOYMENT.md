# Coolify Frontend Deployment

## Application

- Type: Static site
- Base directory: `frontend`
- Build command: leave empty
- Output directory: leave empty / root
- Production domains: `https://operartis.io`, `https://www.operartis.io`
- Staging domain: `https://staging.operartis.io`

## DNS

Create DNS records pointing to the Hetzner CPX32 public IP:

- `A @`
- `A www`
- `A api`
- Optional: `A staging`

Use `AAAA` records only if IPv6 is configured on the server.

## Backend

Set the backend Coolify domain to:

- `https://api.operartis.io`

Set the backend environment variable if you want to override the default CORS list:

```text
ALLOWED_ORIGINS=https://operartis.io,https://www.operartis.io,https://staging.operartis.io
```

Recommended backend abuse-protection variables:

```text
MAX_REQUEST_BYTES=26214400
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_REQUESTS=600
HEAVY_RATE_LIMIT_REQUESTS=20
```

The backend defaults now allow only the three Operartis HTTPS origins. Add local origins to `ALLOWED_ORIGINS` only while actively testing from your Mac.

## Security Headers

For the frontend Coolify Static app, paste the full Nginx configuration for the matching environment:

- Staging frontend: `.coolify/nginx-staging.conf`
- Production frontend: `.coolify/nginx-production.conf`

The staging configuration includes `X-Robots-Tag: noindex, nofollow` and allows `https://api-staging.operartis.io` in the CSP. The production configuration does not include `noindex` and allows `https://api.operartis.io`.

These `.coolify/` helper files are intentionally listed in `.dockerignore` so they stay in Git for deployment operations but are not copied into the public static site when the build pack honors `.dockerignore`.

The current CSP is intentionally temporary/relaxed because the static frontend still uses inline scripts and runtime Babel. After the future React/Vite rebuild, remove `'unsafe-inline'` and `'unsafe-eval'`.

## Module apps built with Vite

The inventory module is a TypeScript + React app. Its source is in `inventory-app/` (shared frame code in `app-shared/`) and its built files are committed in `inventory/`, so the Static site still needs no build command.

After changing the source, run from `frontend/`:

```bash
pnpm install
pnpm test:inventory
pnpm build:inventory
```

and commit the updated `inventory/` folder together with the source.

- The built page is served at `/inventory/`. While `inventory.html` still exists, `/inventory` (no trailing slash) serves that old page.
- The Nginx configurations in `.coolify/` deny requests to `node_modules`, `inventory-app`, `app-shared`, `package.json` and the pnpm files; paste the updated configuration into Coolify when deploying this change.
- Local development: `pnpm dev:inventory` (http://127.0.0.1:4176/inventory/, needs the backend on port 8000). `pnpm preview:inventory` serves the built files on port 4177.

## Root Page

`index.html` is the single source for the Operartis terminal / landing experience at `/`.

`terminal.html` is a lightweight redirect to `/` so old bookmarks to `/terminal.html` keep working without maintaining a second copy of the app.

Optional server redirect (preferred over the HTML stub if your reverse proxy supports it):

```nginx
location = /terminal.html {
    return 301 /;
}
```

## Cutover Checklist

- Confirm `https://api.operartis.io/` returns the backend health response.
- Confirm `https://operartis.io/` opens the Operartis terminal.
- Confirm `forecaster.html`, `mlforecaster.html`, and `inventory.html` call `https://api.operartis.io`.
- Keep Vercel online for 7 days as rollback, then remove or disable it.
