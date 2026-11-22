# Operartis Vehicle Routing frontend

This directory contains the React, TypeScript, Vite, MapLibre, and TanStack Query source for the Operartis VRP module.

The production build is emitted to `frontend/vrp/`, which lets the existing static Nginx application serve the module at `/vrp/` without changing the legacy module runtime.

## Commands

Run from `frontend/`:

```bash
pnpm install
pnpm dev:vrp
pnpm build:vrp
```

## Integration

- Existing Operartis theme, language, API, authentication UI, and access-gate scripts are loaded from the frontend root.
- The visual access gate is bypassed on `localhost`, `127.0.0.1`, and `::1`, while backend operations still use the existing Operartis session and CSRF protection; use the header's **Sign In** control before importing or optimizing locally.
- Production and staging continue to require the current Operartis session and CSRF flow.
- The default local basemap uses OSM Standard tiles for interactive development only.
- Non-local builds expect a same-origin tile endpoint at `/map-tiles/{z}/{x}/{y}.png` unless `VITE_VRP_TILE_URL` is provided during the build.

## Backend integration

The module imports the Operartis VRP XLSX template or a JSON scenario through `POST /vrp/scenarios/import`, runs backend validation, submits asynchronous solve jobs, polls their progress, renders the verified result on the map and vehicle timeline, and downloads backend-generated XLSX exports. The Vite development server proxies `/auth` and its local `/api/vrp` alias to `127.0.0.1:8000` so the existing session and CSRF flow remains same-origin locally without intercepting the frontend `/vrp/` route.
