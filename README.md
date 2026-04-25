# MuseIQ

> Museum interaction platform — students photograph exhibits with the iOS app, the
> response is captured, everything lives at the edge, and it's all browsable in
> a polished web UI.

**Live:** [museiq.darlingtree.com](https://museiq.darlingtree.com) ·
fallback [museiq.quake0day.workers.dev](https://museiq.quake0day.workers.dev)

[![Deploy MuseIQ Worker](https://github.com/quake0day/museum_project/actions/workflows/deploy.yml/badge.svg)](https://github.com/quake0day/museum_project/actions/workflows/deploy.yml)

## What it does

- iOS app captures `{photo, description, timestamp}` per exhibit and POSTs a
  batched JSON array to `/api/interactions/list`.
- The server decodes each base64 image, streams it into Cloudflare R2,
  records the metadata in D1, and returns a status payload.
- The web side serves a server-rendered dashboard, a paginated grid with full
  text search, and an image lightbox — light and dark themes included.

## Architecture

| | |
|---|---|
| **Runtime** | Cloudflare Workers (Hono router, TypeScript) |
| **Database** | Cloudflare D1 (`interactions` table) |
| **Object store** | Cloudflare R2 (`museum-media` bucket, immutable cache) |
| **Static assets** | Workers Assets (`worker/public/`) |
| **Auto-deploy** | GitHub Actions on push to `worker/**` |

```
iOS app ──POST JSON─▶ Worker ──base64 decode─▶ R2.put(images/<uuid>.<ext>)
                          └────────────────────▶ D1 INSERT (id, response, image, date)
                                                    │
browser ◀── HTML/CSS/JS ── Worker ◀──── D1 SELECT ───┘
                            └────── R2.get → /media/* ──▶
```

The iOS POST contract was preserved byte-for-byte from the original Go +
Gin backend, so the app code didn't change when the server moved to the edge.

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/interactions/list` | iOS submission — JSON array of `{id, response, image, date}` |
| `GET`  | `/api/interactions/list?page=&q=` | Paginated JSON with optional text search |
| `GET`  | `/api/stats` | `{ total, today, week, latest_at }` |
| `GET`  | `/api/health` | Liveness probe |
| `GET`  | `/media/*` | Streams images from R2 with `Cache-Control: immutable` |

## Web pages

| Path | What |
|---|---|
| `/` | Dashboard with live stats and feature overview |
| `/interactions/view` | Searchable grid · 12/page · click-to-zoom lightbox |

## Repo layout

```
museum_project/
├── worker/                       # ★ Cloudflare Worker (the live service)
│   ├── src/
│   │   ├── index.ts              # Hono routes
│   │   ├── db.ts                 # D1 queries (list, stats, save)
│   │   ├── templates.ts          # Server-rendered HTML
│   │   └── util.ts               # base64, date, escape helpers
│   ├── public/                   # Static assets (CSS, JS, favicon)
│   ├── migrations/0001_init.sql  # D1 schema
│   ├── scripts/migrate.ts        # Django sqlite → D1 + R2 (one-shot)
│   └── wrangler.toml
├── .github/workflows/deploy.yml  # Auto-deploy on push to worker/**
├── api/  config/  controllers/   # Legacy Django + Go versions (archived)
└── media/ db.sqlite3             # Original local data (kept for migration)
```

The legacy Django and Go code in the repo root (`api/`, `controllers/`,
`models/`, `museum_project/`, `main.go`, etc.) is the historical record of
the project's earlier incarnations. The live service is `worker/`.

## Auto-deploy

Pushing any change under `worker/**` (or to the workflow file itself)
triggers `.github/workflows/deploy.yml`, which runs:

1. `npm ci`
2. `tsc --noEmit -p tsconfig.json` (type-check)
3. `cloudflare/wrangler-action@v3` → `wrangler deploy`

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN` — API token with the **Edit Cloudflare Workers** template
- `CLOUDFLARE_ACCOUNT_ID` — your account id

End-to-end push-to-prod takes ~30 seconds.

## Local development

```bash
cd worker
npm install
npm run db:init:local       # apply schema to local D1 simulator
bun run migrate --local     # seed local D1 + local R2
npm run db:seed:local
npm run dev                 # http://localhost:8787
```

Full deployment & migration playbook: [`worker/README.md`](worker/README.md).

## Data

The current production data set is **379 interactions** spanning Oct 2024
to Oct 2025, sourced from the legacy Django installation on a LAN host and
migrated via `worker/scripts/migrate.ts`.

## Roadmap

- **Workers AI auto-tagging** — classify each interaction by era, medium,
  movement, and subject as it arrives, surface tags in the grid view.
- **Knowledge wiki** — derived per-tag pages that synthesize what's in the
  archive into an evolving, browsable mini-Wikipedia of the exhibits the
  student has photographed.
- **Multi-user knowledge bases** — let each student build their own wiki
  from their own captures.

See the inline issues for the active workstream.

## License

MIT — see [`LICENSE`](LICENSE).

## Contact

[quake0day@gmail.com](mailto:quake0day@gmail.com)
