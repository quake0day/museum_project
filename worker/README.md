# MuseIQ — Cloudflare Worker

Edge-rendered rewrite of the MuseIQ museum-interaction backend.
Replaces the Go + Gin + SQLite + local-filesystem stack with:

- **Hono** on Cloudflare Workers — routing, HTML, JSON API
- **D1** — SQLite-compatible store for interaction metadata
- **R2** — object store for image payloads
- **Workers Assets** — zero-cost static serving for CSS/JS/fonts

The iOS contract (`POST /api/interactions/list` with a JSON array of
`{id, response, image (base64 data URL), date}`) is byte-for-byte
compatible — no iOS changes required.

## Prerequisites

- [Bun](https://bun.sh) — used for the migration script (`bun run scripts/migrate.ts`)
- A Cloudflare account with Workers + D1 + R2 enabled
- `wrangler login` once to authenticate

```bash
npm install         # or: bun install
```

## One-time Cloudflare setup

```bash
# 1. Create the D1 database — copy the returned database_id into wrangler.toml
wrangler d1 create museum-db

# 2. Create the R2 bucket (default name matches wrangler.toml)
wrangler r2 bucket create museum-media

# 3. Apply schema to production D1
npm run db:init        # == wrangler d1 execute museum-db --file=migrations/0001_init.sql --remote
```

After step 1 you must paste the `database_id` into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "museum-db"
database_id = "REPLACE_WITH_D1_ID"   # ← here
```

## Data migration (Django SQLite → D1 + R2)

The repository root contains the legacy data:

- `db.sqlite3::api_interaction` — 222 rows
- `media/images/*.jpeg` — 193 original images (29 rows point at deleted files)

The migration script reads both, normalizes IDs/dates, emits
`migrations/seed.sql`, and uploads each image to R2 via wrangler.

```bash
bun run migrate            # production (default)
bun run migrate --local    # local wrangler simulator
bun run migrate --sql-only # just regenerate seed.sql, skip R2 uploads
bun run migrate --skip-existing  # skip R2 uploads for keys already present
```

Then apply the generated seed:

```bash
npm run db:seed            # wrangler d1 execute ... --file=migrations/seed.sql --remote
```

Environment overrides:

| var | default | meaning |
|-----|---------|---------|
| `SRC_DB` | `../db.sqlite3` | source SQLite file |
| `SRC_MEDIA` | `../media` | source image directory |
| `R2_BUCKET` | `museum-media` | destination R2 bucket |

## Local development

```bash
npm run db:init:local      # apply schema to local D1
bun run migrate --local    # seed local D1 + R2
npm run db:seed:local      # apply seed.sql to local D1
npm run dev                # wrangler dev — http://localhost:8787
```

## Deploy

```bash
npm run deploy             # wrangler deploy
```

Point the iOS app at:

```
POST https://museiq.<your-subdomain>.workers.dev/api/interactions/list
```

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Dashboard: stats + feature overview |
| GET | `/interactions/view` | Paginated grid with search + lightbox |
| GET | `/media/*` | Streams images from R2 with long-lived cache |
| GET | `/api/health` | Liveness |
| GET | `/api/stats` | `{ total, today, week, latest_at }` |
| GET | `/api/interactions/list?page=&q=` | Paginated JSON with text search |
| POST | `/api/interactions/list` | **iOS endpoint** — unchanged contract |

## Limits to keep in mind

- **Workers CPU**: 30s on paid, 10ms on free. Batching 10 base64-decoded
  images costs a handful of ms of CPU (most time is R2 I/O, async).
- **D1 writes**: 50k writes/day on free tier, 50M on $5 Workers Paid.
- **R2 storage**: 10GB free, $0.015/GB after.

## Layout

```
worker/
├── src/
│   ├── index.ts        # Hono app: routes, POST handler, media streaming
│   ├── db.ts           # D1 queries (list + stats + save)
│   ├── templates.ts    # Server-rendered HTML
│   └── util.ts         # date / base64 / escape helpers
├── public/
│   ├── static/css/style.css   # Full design system (light + dark)
│   ├── static/js/main.js      # Theme toggle · lightbox · search debounce
│   └── favicon.svg
├── migrations/
│   └── 0001_init.sql          # D1 schema
├── scripts/
│   └── migrate.ts             # Django → D1 + R2 migration (Bun)
├── wrangler.toml
└── package.json
```

The original Go code in the repo root (`main.go`, `controllers/`,
`models/`, `templates/`, `static/`) is superseded by this Worker and
can be archived or deleted once the migration is verified.
