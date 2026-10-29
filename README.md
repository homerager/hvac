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
npm run db:migrate     # apply migrations
npm run db:seed        # settings + demo data (idempotent, safe to re-run)
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
| `npm run db:migrate` | `prisma migrate dev`: create/apply migrations in development |
| `npm run db:deploy` | `prisma migrate deploy`: apply migrations in production |
| `npm run db:generate` | Regenerate the Prisma client into `server/generated/prisma` (also runs on `postinstall`) |
| `npm run db:seed` | Seed settings and, outside production, demo users/customers/jobs (`SEED_DEMO=0/1` overrides) |
| `npm run db:studio` | Prisma Studio |

## Conventions

Components, pages and layouts are written in TSX (`defineComponent` + render function), not `.vue` SFC templates. Import components explicitly from `#components`.

### Database

- Schema: `prisma/schema.prisma` (Prisma 7, `pg` driver adapter). Server code gets the client via `usePrisma()` (`server/utils/prisma.ts`).
- Money is `Int` cents; tax rates are `Int` basis points. Balances are derived from `CONFIRMED` payments only.
- Idempotency is enforced by unique keys: `Request.idempotencyKey`, `Job.requestId`, `Invoice.jobId`, `Payment.stripePaymentIntentId`, `StripeEvent.id`, `WorkEntry.clientId`.
- Finalized invoices are not edited; corrections are appended as `InvoiceAdjustment` rows.
- CHECK constraints that Prisma can't express (e.g. a `CHECK` payment requires a photo) are hand-written at the end of the migration SQL. Run `prisma migrate dev --create-only` when a change needs one.

## Layout

```
app/            pages, components, composables, layouts, stores
server/         api routes, plugins, utils (Nitro)
shared/         code shared by app and server (auto-imported from shared/utils)
prisma/         schema.prisma, migrations, seed.ts
tests/          unit, nuxt, e2e
docker/         local Postgres init scripts
```
