# Servora HVAC

Single-tenant field service, invoicing and payments app for an HVAC company.
Nuxt 4 (full-stack), Nuxt UI, Pinia, Zod, PostgreSQL.

## Requirements

- Node.js 22.12+ (see `.nvmrc`)
- Docker (for local Postgres)

## Setup

```sh
cp .env.example .env
npm install
npm run db:up          # Postgres 17 on localhost:5432 (databases: hvac, hvac_test)
npm run dev            # http://localhost:3000
```

The server validates its environment at startup (`server/utils/env.ts`) and refuses to start with a missing or invalid `DATABASE_URL`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm run preview` | Production build / preview |
| `npm run lint` / `npm run lint:fix` | ESLint (Nuxt config + stylistic rules) |
| `npm run typecheck` | `vue-tsc` across app, server, shared and tests |
| `npm test` | Vitest: `tests/unit` (node) and `tests/nuxt` (Nuxt runtime) |
| `npm run test:e2e` | Playwright on desktop, tablet and phone viewports (`npx playwright install chromium` once) |
| `npm run db:up` / `npm run db:down` | Start / stop local Postgres |

## Conventions

Components, pages and layouts are written in TSX (`defineComponent` + render function), not `.vue` SFC templates. Import components explicitly from `#components`.

## Layout

```
app/            pages, components, composables, layouts, stores
server/         api routes, plugins, utils (Nitro)
shared/         code shared by app and server (auto-imported from shared/utils)
tests/          unit, nuxt, e2e
docker/         local Postgres init scripts
```
