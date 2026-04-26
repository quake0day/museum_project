# MuseIQ → Junior Curator AI · System Plan

> Turn every museum visit into a child's personal learning wiki.

This document is the canonical product + engineering plan for evolving MuseIQ
from "iOS photo dump + grid view" into a full **AI Personal Museum Knowledge
Graph** for kids. It is written to be read top-down once, then used as a
working roadmap — each version section is a self-contained slice that can be
shipped, tested, and demo'd independently.

---

## 0. North Star

**Product:** A child captures exhibits with the iOS app; the system understands
each exhibit through domain-aware AI, generates a kid-friendly wiki, and grows
a personal knowledge graph that links artifacts across time, place, civilization,
style, and concept. Parents and teachers see the learning that happened.

**Primary user:** child (age 5–13), as **Junior Curator**.
**Secondary users:** parent (dashboard), teacher (class mode).
**Tagline:** *Turn every museum visit into a personal learning wiki.*

**Why this is different from "AI photo caption":**

| Naive | MuseIQ |
|---|---|
| Photo → caption | Photo → domain → structured analysis → **persistent wiki page** → graph node |
| One-shot LLM | Per-domain prompts (history ≠ art ≠ science) |
| Disconnected pages | Cross-exhibit links: timeline · map · concept · style · civilization |
| RAG re-derives knowledge per query | **Compounding wiki** — knowledge is built once and maintained |
| Read-only | Quests · badges · "My Exhibition" · ask-AI grounded in *child's own* collection |

---

## 0.5 Architectural commitment: the LLM Wiki pattern

The knowledge layer of MuseIQ is **not** a traditional RAG store and **not** a
one-time JSON dump. It is a **persistent, LLM-maintained wiki** of interlinked
markdown pages, modelled on the LLM Wiki / Memex pattern.

**Three layers, strictly separated:**

```
┌───────────────────────────────────────────────────────────────┐
│ 1. RAW SOURCES (immutable)                                    │
│    R2 images + D1 interactions row + label-image OCR          │
│    The LLM reads these. Never mutates them.                   │
└───────────────────────────────────────────────────────────────┘
                              ▼
┌───────────────────────────────────────────────────────────────┐
│ 2. THE WIKI (LLM owns this layer end-to-end)                  │
│    Per-child collection of markdown pages in D1 wiki_pages.   │
│    The child reads it. The LLM writes & maintains it.         │
│    A graph index in D1 is a *derived* projection, not truth.  │
└───────────────────────────────────────────────────────────────┘
                              ▼
┌───────────────────────────────────────────────────────────────┐
│ 3. THE SCHEMA (`worker/src/wiki/SCHEMA.md`)                   │
│    The discipline doc the LLM must follow when ingesting,     │
│    querying, or linting. Co-evolved with the team.            │
└───────────────────────────────────────────────────────────────┘
```

**Three operations the LLM performs (the only three):**

1. **Ingest** — a new exhibit (raw source) arrives. The LLM:
   1. Reads the photo + description + label OCR
   2. Writes/overwrites `wiki/<user>/exhibits/<id>.md`
   3. Creates or updates linked **entity pages** — concept, place, period, person, style, material, theme — every one of them is its own markdown file, hand-tended by the LLM. A typical ingest touches 5–15 pages.
   4. Updates `wiki/<user>/index.md` (catalog with one-liners)
   5. Appends one row to `wiki/<user>/log.md` (chronological audit trail)
   6. Mirrors structured fields from frontmatter into D1 indexed columns so timeline / map / quests stay fast

2. **Query** — child or parent asks a question (UI or `/api/ask`). The LLM:
   1. Reads `index.md` first to find candidate pages
   2. Drills into the relevant pages
   3. Synthesizes an answer with **explicit citations** to wiki page paths
   4. **Files notable answers back as new wiki pages** (e.g. comparisons, themed walkthroughs) so explorations compound — they don't disappear into chat history

3. **Lint** — periodic health check. The LLM scans for:
   - Contradictions between pages
   - Stale claims superseded by newer sources
   - Orphan pages (no inbound links)
   - Concepts referenced in prose but lacking their own page
   - Missing cross-references
   - Knowledge gaps worth filling (suggests new outings / sources)

**Two special files per child:**

- `wiki/<user>/index.md` — content-oriented catalog. Every page listed with a one-line summary, grouped by kind (exhibits / concepts / places / periods / people / styles / themes). The LLM reads this **first** on every query.
- `wiki/<user>/log.md` — chronological, append-only. Every entry begins with `## [YYYY-MM-DD] {kind} | {title}` so it stays parseable.

**Why this matters here, not just in general:**

- A child returns to the same museum or visits a new one over months. A RAG
  approach re-discovers everything every time. A maintained wiki **remembers**
  that they've already seen a Han Dynasty bronze, so the next bronze gets a
  cross-link instead of a duplicated explanation.
- Parents and teachers can read the wiki directly — it's plain markdown, like
  a fan wiki the child grew. That's the artifact we hand to them.
- The wiki is a git-friendly, version-controlled blob. Export to a folder of
  `.md` files at any time → open in Obsidian → graph view → Marp slides for a
  show-and-tell at school.

**What we do NOT do:**

- We do **not** treat the LLM-emitted JSON as the durable artifact — JSON is a
  transport format, the markdown page is the durable form.
- We do **not** hand-design every page template top-down. We give the LLM a
  schema doc + a few exemplars, and let it stay disciplined within those rules.
- We do **not** rebuild the graph from raw photos on every query. The graph
  index in D1 is rebuilt only when wiki pages change.

The rest of this document is structured around this commitment.

---

## 1. Domain Model

### 1.1 Top-level taxonomy (5 domains, not mutually exclusive)

```
Museum Object
├── Natural Science      🦖   (fossil, mineral, animal specimen, astronomy)
├── History & Civilization 🏺  (artifact, weapon, tool, coin, manuscript, religious)
├── Art                  🎨   (painting, sculpture, calligraphy, textile, photo)
├── Technology           ⚙️   (machine, vehicle, instrument, invention)
└── Culture & Society    🌍   (festival object, music, daily life, folk craft)
```

An object has **one primary_domain** and any number of **secondary_domains**
(a bronze ritual vessel is *History* primary, *Art* + *Technology* secondary).

### 1.2 Unified object schema (every exhibit has this)

```jsonc
{
  "id": "uuid",
  "title": "Bronze Ritual Vessel",
  "original_title": "青铜礼器",
  "image_url": "/media/images/<id>.jpg",
  "label_image_url": "/media/labels/<id>.jpg",   // optional second photo of placard
  "museum": { "name": "Penn Museum", "location": "Philadelphia, PA" },
  "capture": {
    "user_id": "child_001",
    "visit_id": "visit_2026_04_26",
    "captured_at": "2026-04-26T14:30:00Z",
    "gps": null
  },
  "ocr": { "raw_text": "...", "cleaned_text": "...", "language": "en" },

  "classification": {
    "primary_domain": "history",
    "secondary_domains": ["art", "technology"],
    "object_type": "Ritual Vessel",
    "confidence": 0.86
  },

  "wiki": {
    "child_summary": "...",            // age 8–10 default
    "summaries_by_age": {
      "5_7":   "...",
      "8_10":  "...",
      "11_13": "..."
    },
    "key_facts": ["...", "..."],
    "looking_questions": ["...", "..."],
    "questions": ["..."],              // ask-AI suggestions
    "next_exploration": ["...", "..."],
    "activities": ["..."]              // optional do-at-home
  },

  "timeline": {
    "period": "Shang or Zhou Dynasty",
    "approx_year_start": -1600,
    "approx_year_end":   -256,
    "approx_year":       -1000          // single-point pin for the timeline
  },
  "map": {
    "origin_label": "Yellow River basin, China",
    "lat": 35.0, "lon": 113.0
  },

  "tags": ["bronze", "ritual", "ancestor-worship", "shang-dynasty"],
  "concepts": [
    { "name": "Bronze Age", "type": "history", "difficulty": 2 },
    { "name": "Ritual",     "type": "history", "difficulty": 1 }
  ],

  // domain-specific extension blocks (only populated for matching domain):
  "history_analysis": { /* see §1.3 */ },
  "art_analysis":     { /* see §1.3 */ },
  "science_analysis": { /* … */ },
  "tech_analysis":    { /* … */ },
  "culture_analysis": { /* … */ },

  "analysis_status": "done",            // pending | done | failed | skipped
  "analysis_version": 3,                // bump when prompt schema changes
  "analysis_provider": "deepseek-chat",
  "analyzed_at": "2026-04-26T14:31:02Z"
}
```

### 1.3 Per-domain extension schemas

#### History
```json
{
  "civilization": "Ancient China",
  "period": "Shang or Zhou Dynasty",
  "estimated_date": "c. 1000 BCE",
  "geographic_origin": "China",
  "material": ["bronze"],
  "function": "ritual use",
  "social_context": "used by elites in ceremonies",
  "technology": "bronze casting (piece-mold)",
  "symbolism": ["power", "ancestor worship", "ritual authority"],
  "related_events": [],
  "related_people": [],
  "comparison_today": "like trophies or family heirlooms — objects that show status"
}
```

#### Art
```json
{
  "artist": "Unknown",
  "title": "Landscape with River",
  "date": "19th century",
  "medium": "oil on canvas",
  "style": "Romanticism",
  "subject": ["landscape", "nature"],
  "visual_elements": {
    "color":       ["dark tones", "warm highlights"],
    "composition": "large sky, small human figures",
    "light":       "dramatic contrast",
    "texture":     "visible brushstrokes"
  },
  "techniques": ["perspective", "chiaroscuro", "layered brushwork"],
  "themes":     ["nature", "human smallness", "the sublime"],
  "symbols":    [],
  "art_history_context": "part of the Romantic movement that emphasized emotion and nature"
}
```

#### Natural Science
```json
{
  "scientific_name": "Tyrannosaurus rex",
  "kingdom_phylum_class": ["Animalia", "Chordata", "Reptilia"],
  "geological_period": "Late Cretaceous",
  "approx_age_years": 68000000,
  "habitat": "North American floodplains",
  "diet": "carnivore",
  "key_traits": ["bipedal", "large skull", "tiny forelimbs"],
  "evolution_context": "theropod dinosaur, related to modern birds",
  "discovery": { "year": 1902, "location": "Hell Creek, Montana", "people": ["Barnum Brown"] }
}
```

#### Technology
```json
{
  "name": "Difference Engine",
  "inventor": "Charles Babbage",
  "invented_year": 1822,
  "problem_solved": "manual calculation of mathematical tables",
  "how_it_works": "...",
  "predecessor": "manual log tables",
  "successor": "Analytical Engine, electronic computers",
  "engineering_principles": ["mechanical computation", "finite differences"],
  "modern_version": "smartphone calculator app"
}
```

#### Culture
```json
{
  "culture": "Mexican",
  "occasion": "Día de los Muertos",
  "users": "families honoring deceased relatives",
  "meaning": "celebration and remembrance of ancestors",
  "tradition": "altar offerings (ofrendas) with marigolds, candles, food",
  "construction": "papier-mâché and paint",
  "cross_cultural": ["Qingming (China)", "Obon (Japan)", "All Souls' Day (Catholic)"]
}
```

### 1.4 Knowledge graph (a *derived* projection of the wiki)

The graph is **not** the source of truth — the wiki pages are. The graph is a
fast index built by walking the markdown: links between pages become edges,
frontmatter fields become typed properties.

**Node types** (each is a markdown page in the wiki):
`Child`, `Museum`, `Visit`, `Exhibit`, `Concept`, `Person`, `Civilization`,
`TimePeriod`, `Place`, `Material`, `Technique`, `Style`, `Event`, `Theme`,
`Question`, `Quest`, `Badge`.

**Edge types** (each is a markdown link with a relation hint, e.g.
`[Bronze Age](/wiki/concepts/bronze-age) <!-- rel:teaches -->`):
```
Child       --collected-->          Exhibit
Exhibit     --belongs_to-->         Museum
Exhibit     --created_in-->         TimePeriod
Exhibit     --originated_from-->    Place
Exhibit     --made_by-->            Person
Exhibit     --made_of-->            Material
Exhibit     --uses_technique-->     Technique
Exhibit     --belongs_to_style-->   Style
Exhibit     --represents-->         Theme
Exhibit     --teaches-->            Concept
Concept     --prerequisite_of-->    Concept
Concept     --related_to-->         Concept
Exhibit     --similar_to-->         Exhibit
Exhibit     --contrasts_with-->     Exhibit
Quest       --requires-->           ExhibitType
Child       --earned-->             Badge
```

**Storage discipline:**

- Truth lives in **markdown** (`wiki_pages` table). Edges are the links you can
  read in the prose, plus typed declarations in frontmatter.
- D1 tables (`exhibit_edges`, `concepts`, `places`, …) are a **mirror** built
  by a deterministic indexer that runs after each wiki write.
- A wipe-and-rebuild of the index from the wiki must always produce the same
  result; the wiki is canonical.

This separation means: if the index gets corrupted, we rebuild from markdown.
If we want to ship to a graph DB later, we read markdown. If a parent wants
the raw artifact, we hand them a folder of `.md` files.

### 1.5 Per-child wiki layout

Every child has a private wiki tree, stored in D1 keyed by `(user_id, path)`:

```
wiki/<user_id>/
├── index.md                 ← LLM-maintained catalog (the entry point)
├── log.md                   ← append-only audit trail
├── README.md                ← child-friendly intro to "your wiki"
│
├── exhibits/
│   ├── <exhibit_id>.md      ← one page per captured exhibit (the rich page)
│
├── concepts/
│   ├── bronze-age.md
│   ├── perspective.md
│   ├── mummification.md
│
├── places/
│   ├── china-yellow-river.md
│   ├── ancient-egypt.md
│
├── periods/
│   ├── shang-dynasty.md
│   ├── 19th-century.md
│
├── people/
│   ├── claude-monet.md
│   ├── babbage.md
│
├── styles/
│   ├── impressionism.md
│   ├── romanticism.md
│
├── materials/
│   ├── bronze.md
│   ├── oil-paint.md
│
├── techniques/
│   ├── chiaroscuro.md
│   ├── piece-mold-casting.md
│
├── themes/
│   ├── death-and-afterlife.md
│   ├── trade-and-money.md
│
├── civilizations/
│   ├── shang-china.md
│   ├── ancient-greece.md
│
├── museums/
│   ├── penn-museum.md       ← grows visit history per museum
│
├── visits/
│   ├── 2026-04-26-penn.md   ← what we saw on this trip + connections
│
├── quests/
│   ├── bronze-hunter.md
│
└── exhibitions/             ← child's own curated shows (v1.2)
    └── my-ancient-civ.md
```

**Page anatomy** — every page has YAML frontmatter so the indexer can read it
without LLM help, and a body the LLM owns:

```markdown
---
kind: exhibit
title: Bronze Ritual Vessel
captured_at: 2026-04-26T14:30:00Z
museum: penn-museum
domain: history
secondary_domains: [art, technology]
period: shang-dynasty
place: china-yellow-river
materials: [bronze]
techniques: [piece-mold-casting]
themes: [ancestor-worship, ritual-authority]
concepts: [bronze-age, ritual]
approx_year: -1000
confidence: 0.86
analysis_version: 3
sources: [interactions/<id>]
---

# Bronze Ritual Vessel

> 这是古代中国人在祭祀祖先时使用的青铜礼器，是权力和身份的象征。

## What is it?

A bronze vessel used in religious ceremonies, made by ruling families in
[Shang and Zhou dynasty](/wiki/periods/shang-dynasty) China.

## Look closely

- The patterns are called *taotie* — a stylized animal mask. Find the eyes!
- See how the legs are heavy and the top is wide? It was made to stand on
  a fire and hold offerings of food.

## Time travel

Made roughly **3,000 years ago**, when bronze (see [Bronze](/wiki/materials/bronze))
was the most advanced metal humans could make. The people who used these
vessels believed their ancestors could receive offerings through them — see
[Ancestor worship](/wiki/themes/death-and-afterlife) and
[Ritual](/wiki/concepts/ritual).

## Connections

- **Same period:** other bronzes you've captured (auto-listed by indexer)
- **Same theme:** [death and afterlife](/wiki/themes/death-and-afterlife)
- **Compare with:** [Greek bronze armor](/wiki/exhibits/abc123) — different
  use of the same material

## Next to find

- [ ] A bronze object from another civilization
- [ ] A ritual object from any culture
- [ ] Something else from the [Shang dynasty](/wiki/periods/shang-dynasty)
```

The frontmatter is what the **deterministic indexer** reads to populate D1
graph tables. The body is what humans read.

---

## 2. System Architecture

### 2.1 Pipeline (single visit)

```
iOS App
  │  POST /api/interactions/list  (image + description + label_image?)
  ▼
Worker · ingest         ── R2.put(images/<id>.jpg)
                        ── R2.put(labels/<id>.jpg)
                        ── D1 INSERT exhibits (status=pending)
                        ── ctx.waitUntil(analyze(id))
  │
  ▼
analyze(id)
  ├── OCR(label_image)                         (Workers AI vision OR DeepSeek-VL)
  ├── classify(image, ocr, description)        → primary_domain + object_type
  ├── domain_analyzer[domain](…)               → per-domain JSON
  ├── extract_entities(analysis)               → Concept/Person/Place/etc rows
  ├── upsert_graph_edges(exhibit_id, entities)
  └── mark exhibits.analysis_status = done
  │
  ▼
Wiki page · /exhibit/:id
Knowledge graph · /me/graph
Timeline · /me/timeline
Map · /me/map
Quest engine · /me/quests
Parent dashboard · /parent/:child_id
```

### 2.2 Component map

```
Frontend (Workers HTML render + small JS)
├── /                              landing
├── /interactions/view             public grid (existing)
├── /exhibit/:id                   per-exhibit wiki  (v0.6)
├── /me                            child home        (v1.0)
├── /me/timeline                   timeline          (v0.8)
├── /me/map                        map               (v0.8)
├── /me/graph                      knowledge graph   (v0.7)
├── /me/quests                     quests            (v0.9)
├── /me/exhibition/:id             custom exhibitions (v1.2)
├── /parent/:child_id              parent dashboard  (v1.0)
├── /teacher                       teacher dashboard (v2.0)
└── /admin                         existing admin

Backend services (logical, all colocated in the Worker)
├── ingest service        (existing: R2 + D1 write)
├── ai pipeline           (classifier, domain analyzers, JSON validator)
├── graph service         (entity extraction + edge upsert)
├── recommendation        (next-exhibit, similar, related concepts)
├── quest/badge engine
├── quiz generator        (v2.1)
└── reporting             (parent / teacher)

Storage
├── D1                    structured (exhibits, concepts, edges, users, quests)
├── R2                    images, label images, generated worksheets
└── KV (optional)         hot recommendation cache, rate-limit counters

AI providers (abstracted behind one interface)
├── DeepSeek API          v0.5+ default (text + vision when available)
├── Cloudflare Workers AI fallback / cheap path / OCR
├── OpenAI / Anthropic    swap in via secret if higher quality needed
└── Provider selection by env var `AI_PROVIDER`
```

### 2.3 Tech stack (committed)

- **Runtime:** Cloudflare Workers (Hono)
- **DB:** D1 (sqlite at the edge)
- **Storage:** R2
- **Templates:** server-rendered HTML strings (current pattern); no SPA build step
- **AI:** DeepSeek (chat + reasoning) primary; Workers AI for OCR/embeddings; abstracted provider
- **Auth:** signed cookie (current admin pattern), extended for child/parent later
- **Deploy:** GitHub Actions on push to `worker/**` (already set up)

Rationale for staying on this stack: zero new infra, single language, edge-fast,
cheap. Switch only if we hit a real wall.

---

## 3. Data Layer

### 3.1 Current D1 schema (v0.4)

```sql
CREATE TABLE interactions (
  id        TEXT PRIMARY KEY,
  response  TEXT NOT NULL DEFAULT '',
  image     TEXT NOT NULL,
  date      TEXT NOT NULL
);
CREATE INDEX idx_interactions_date ON interactions(date DESC);
```

### 3.2 Target schema (≥ v1.0)

We will **not rename `interactions`** — the iOS app's POST contract is preserved.
Instead we add columns and side tables.

```sql
-- core ----------------------------------------------------------------
ALTER TABLE interactions ADD COLUMN label_image       TEXT;
ALTER TABLE interactions ADD COLUMN museum_name       TEXT;
ALTER TABLE interactions ADD COLUMN museum_location   TEXT;
ALTER TABLE interactions ADD COLUMN user_id           TEXT;       -- nullable until v1.0
ALTER TABLE interactions ADD COLUMN visit_id          TEXT;
ALTER TABLE interactions ADD COLUMN gps_lat           REAL;
ALTER TABLE interactions ADD COLUMN gps_lon           REAL;

-- analysis output (one JSON blob, validated against schema in code) ---
ALTER TABLE interactions ADD COLUMN analysis_json     TEXT;       -- the whole §1.2 doc
ALTER TABLE interactions ADD COLUMN analysis_status   TEXT NOT NULL DEFAULT 'pending';
                                                                  -- pending|running|done|failed|skipped
ALTER TABLE interactions ADD COLUMN analysis_version  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE interactions ADD COLUMN analysis_provider TEXT;
ALTER TABLE interactions ADD COLUMN analyzed_at       TEXT;
ALTER TABLE interactions ADD COLUMN analysis_error    TEXT;

-- denormalized columns for fast filter/sort (derived from analysis_json) -
ALTER TABLE interactions ADD COLUMN primary_domain    TEXT;
ALTER TABLE interactions ADD COLUMN object_type       TEXT;
ALTER TABLE interactions ADD COLUMN approx_year       INTEGER;     -- BCE negative
ALTER TABLE interactions ADD COLUMN origin_lat        REAL;
ALTER TABLE interactions ADD COLUMN origin_lon        REAL;

CREATE INDEX idx_int_domain     ON interactions(primary_domain);
CREATE INDEX idx_int_year       ON interactions(approx_year);
CREATE INDEX idx_int_status     ON interactions(analysis_status);
CREATE INDEX idx_int_user       ON interactions(user_id);

-- WIKI PAGES (the durable knowledge artifact, source of truth) ------
-- Path is canonical: 'index', 'log', 'exhibits/<id>', 'concepts/<slug>',
-- 'places/<slug>', 'periods/<slug>', etc. Single user uses 'default' as user_id
-- in v0.x, real user_id from v1.0.
CREATE TABLE wiki_pages (
  user_id          TEXT NOT NULL,
  path             TEXT NOT NULL,
  kind             TEXT NOT NULL,        -- exhibit|concept|place|period|person|style|
                                          -- material|technique|theme|civilization|
                                          -- museum|visit|quest|exhibition|index|log|other
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,        -- markdown
  frontmatter_json TEXT,                 -- parsed YAML, normalized
  body_hash        TEXT NOT NULL,        -- sha256 of body for change detection
  source_count     INTEGER NOT NULL DEFAULT 0,
  inbound_links    INTEGER NOT NULL DEFAULT 0,
  outbound_links   INTEGER NOT NULL DEFAULT 0,
  last_ingest_at   TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (user_id, path)
);
CREATE INDEX idx_wiki_user_kind ON wiki_pages(user_id, kind);
CREATE INDEX idx_wiki_updated   ON wiki_pages(updated_at DESC);

-- Inverse-index of wiki internal links (rebuilt by indexer on each write)
CREATE TABLE wiki_links (
  user_id   TEXT NOT NULL,
  src_path  TEXT NOT NULL,
  dst_path  TEXT NOT NULL,
  relation  TEXT,                         -- 'teaches'|'made_of'|null (untyped)
  PRIMARY KEY (user_id, src_path, dst_path, relation)
);
CREATE INDEX idx_wiki_links_dst ON wiki_links(user_id, dst_path);

-- Append-only log (mirror of log.md, rendered to that page on demand)
CREATE TABLE wiki_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT NOT NULL,
  ts        TEXT NOT NULL,
  kind      TEXT NOT NULL,                -- 'ingest'|'query'|'lint'|'edit'|'reanalyze'
  ref_path  TEXT,
  message   TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX idx_wiki_log_user_ts ON wiki_log(user_id, ts DESC);

-- knowledge graph (DERIVED from wiki — rebuildable from markdown) ---
CREATE TABLE concepts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,        -- 'bronze-age'
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL,               -- history|art|science|tech|culture|general
  difficulty INTEGER NOT NULL DEFAULT 1,
  description TEXT
);

CREATE TABLE places (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,              -- 'china-yellow-river'
  name TEXT NOT NULL,
  lat  REAL, lon REAL,
  parent_id INTEGER REFERENCES places(id)
);

CREATE TABLE periods (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,              -- 'shang-dynasty'
  name TEXT NOT NULL,
  year_start INTEGER, year_end INTEGER
);

CREATE TABLE people      (id INTEGER PK, slug TEXT UNIQUE, name TEXT, ...);
CREATE TABLE materials   (id INTEGER PK, slug TEXT UNIQUE, name TEXT);
CREATE TABLE techniques  (id INTEGER PK, slug TEXT UNIQUE, name TEXT);
CREATE TABLE styles      (id INTEGER PK, slug TEXT UNIQUE, name TEXT);
CREATE TABLE themes      (id INTEGER PK, slug TEXT UNIQUE, name TEXT);
CREATE TABLE civilizations (id INTEGER PK, slug TEXT UNIQUE, name TEXT, ...);

-- generic edge table — relation kind decides semantics --------------
CREATE TABLE exhibit_edges (
  exhibit_id  TEXT NOT NULL,
  relation    TEXT NOT NULL,              -- teaches|made_of|created_in|...
  target_type TEXT NOT NULL,              -- concept|place|period|person|...
  target_id   INTEGER NOT NULL,
  confidence  REAL DEFAULT 1.0,
  PRIMARY KEY (exhibit_id, relation, target_type, target_id)
);
CREATE INDEX idx_edges_target ON exhibit_edges(target_type, target_id);

-- users (introduced in v1.0) -----------------------------------------
CREATE TABLE users (
  id            TEXT PRIMARY KEY,         -- uuid
  kind          TEXT NOT NULL,            -- child|parent|teacher
  display_name  TEXT NOT NULL,
  age           INTEGER,                  -- nullable for parents/teachers
  parent_id     TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,           -- random
  user_id     TEXT NOT NULL REFERENCES users(id),
  expires_at  TEXT NOT NULL
);

-- quests / badges ----------------------------------------------------
CREATE TABLE quests (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  domain      TEXT,                       -- nullable for cross-domain
  rules_json  TEXT NOT NULL,              -- e.g. {"require":[{"period":"ancient-egypt"},...]}
  badge_slug  TEXT
);
CREATE TABLE quest_progress (
  user_id  TEXT, quest_id TEXT,
  status   TEXT NOT NULL,                 -- in_progress|complete
  progress_json TEXT,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, quest_id)
);
CREATE TABLE badges (
  slug  TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  description TEXT,
  icon  TEXT
);

-- exhibitions (v1.2) -------------------------------------------------
CREATE TABLE exhibitions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL,
  description  TEXT,
  cover_image  TEXT,
  is_public    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE TABLE exhibition_items (
  exhibition_id TEXT NOT NULL,
  exhibit_id    TEXT NOT NULL,
  position      INTEGER NOT NULL,
  caption       TEXT,
  PRIMARY KEY (exhibition_id, exhibit_id)
);
```

### 3.3 Migrations plan

- `migrations/0002_analysis.sql` — columns + indices for analysis (v0.5)
- `migrations/0003_graph.sql` — concepts + edges + reference tables (v0.7)
- `migrations/0004_users.sql` — users/sessions (v1.0)
- `migrations/0005_quests.sql` — quests/badges (v0.9)
- `migrations/0006_exhibitions.sql` — exhibitions (v1.2)

Each migration is forward-only and idempotent (`IF NOT EXISTS` everywhere).

---

## 4. AI Pipeline (Ingest · Query · Lint)

The LLM never has free reign — it operates inside a strict harness defined by
the **schema doc** (`worker/src/wiki/SCHEMA.md`, see §10) and inside three
named operations: **Ingest**, **Query**, **Lint**. Anything the LLM does maps
to one of these. Provider choice is abstracted away.

### 4.1 Provider abstraction

One interface, swappable implementations:

```ts
interface AiProvider {
  name: string;
  chat(opts: ChatOpts): Promise<ChatResult>;       // text-in, text/JSON-out
  vision?(opts: VisionOpts): Promise<ChatResult>;  // image+text-in
  embed?(text: string): Promise<number[]>;
}
```

Implementations: `DeepSeekProvider`, `WorkersAiProvider`, `OpenAiProvider`,
`AnthropicProvider`. Selected by env var `AI_PROVIDER` (default: `deepseek`).

This means **we can change models in one config flip** — important because
v0.5 ships with DeepSeek and we may want to A/B against Claude/GPT later.

### 4.2 The schema doc (`worker/src/wiki/SCHEMA.md`)

This is the discipline document — the same idea as a project's `CLAUDE.md`,
but specifically for the wiki maintainer role. It tells the LLM:

- The directory layout (what page kinds exist, how slugs are formed)
- The frontmatter contract for each page kind (required + optional fields)
- The page-body conventions (sections, headings, link syntax, "Look closely"
  vs "Time travel" vs "Connections" templates per domain)
- The internal link format and the `<!-- rel:teaches -->` annotation rule
- Refusal rules: when the LLM **must** decline (insufficient evidence to name
  an artist / a date / a civilization)
- The exact ingest workflow (10–15 page touch list)
- The "file good answers back" rule for queries
- The lint criteria

The schema is part of the codebase. Co-evolved with the team. The LLM reads
it on every Ingest / Query / Lint call as a prefix, so behavior stays
consistent even when the underlying model changes.

### 4.3 Ingest

Triggered when iOS POSTs a new interaction (`ctx.waitUntil`) or when an
admin clicks Re-analyze.

```
inputs:  exhibit_id, user_id, image, label_image?, description, ocr?
output:  N wiki pages written/updated, M D1 edge rows mirrored, 1 log entry

steps:
  1. read raw source from D1 + R2
  2. classify(image, description, ocr)        → {domain, object_type, confidence}
  3. domain-analyze[domain](…)                 → structured JSON (transport only)
  4. compose-page("exhibits/<id>")             → markdown body + frontmatter
                                                  (LLM call #2, schema doc loaded)
  5. for each linked entity (concept/place/period/person/style/material/theme):
       a. read existing wiki page if any
       b. compose-or-update page              → updated markdown
       c. write back through write_page() helper
  6. update index.md (deterministic regen from wiki_pages, no LLM call)
  7. append log.md (deterministic, single row insert)
  8. run indexer:
       - parse frontmatter of changed pages
       - rebuild wiki_links rows for those src_paths
       - mirror denorm columns (primary_domain, approx_year, origin_lat/lon)
         into the legacy interactions row
       - upsert concepts/places/periods/etc. tables from frontmatter
  9. mark interactions.analysis_status = 'done', bump analysis_version
```

A typical ingest = 2–4 LLM calls (classify + domain-page + a few entity-page
updates that the LLM can choose to batch). The deterministic steps (6, 7, 8)
do not call the LLM.

**Update vs. create rule for entity pages:** the LLM is shown the existing
page (if any) and instructed to *augment* it — adding cross-references,
strengthening the synthesis, noting contradictions — never to overwrite. If
two sources say different things about a Shang vessel, the page must show
both with attribution.

### 4.4 Query

Triggered when a child or parent asks something via UI or `/api/ask`.

```
inputs:  user_id, question, optional context (exhibit_id)
output:  answer (markdown) + citation list + optional new wiki page

steps:
  1. read wiki/<user>/index.md
  2. shortlist 5–15 candidate pages (heuristic + LLM scoring)
  3. read those pages
  4. answer the question with citations like [Bronze Age](/wiki/concepts/bronze-age)
  5. decide: is this answer worth filing?
       - comparison answers → file as wiki/<user>/comparisons/<slug>.md
       - thematic walkthroughs → wiki/<user>/themes/<slug>.md (or update existing)
       - "what should I look for next?" → don't file, ephemeral
  6. append log.md with the question and the pages cited
```

### 4.5 Lint

Manual or scheduled (weekly). The LLM walks the wiki and produces a report.

```
checks:
  - orphan pages (no inbound wiki_links)
  - dangling links (outbound link to nonexistent path)
  - contradictions: same fact stated differently across pages
  - stale: page last_ingest_at > 90d AND newer sources mention it
  - missing pages: prose mentions a concept that has no page
  - empty pages: created but body length < 200 chars
  - frontmatter drift: schema doc updated, pages still using old shape

output:  /wiki/<user>/_lint-report-<date>.md
         + suggested actions (each one-click "Apply" via admin)
```

Lint never auto-mutates the wiki without admin approval — the report is a
to-do list, not a destructive operation.

### 4.6 Cost & quota strategy

- Ingest budget: 2–6 LLM calls per exhibit (1 classify + 1 page compose + 1–4
  entity updates, batched when possible)
- Backfill of existing 379 entries: batched 5/sec with exponential backoff;
  expect ~15 min total runtime
- Per-day caps via KV counter `ai:calls:<yyyy-mm-dd>`. Block beyond cap.
- Re-ingest is gated behind admin only
- Query embedding (v1.1) is cached forever, keyed by `body_hash`
- Lint is rate-limited to 1 run per user per day

### 4.7 Quality gates

- Hard JSON schema validation on the classify call; retry once on fail
- Markdown frontmatter validation against schema doc; retry once on fail
- Word-count and reading-grade check on `child_summary` paragraph
  (Flesch-Kincaid grade target 3–5 for default age band)
- Profanity / unsafe-content filter (deterministic word list, EN+ZH)
- Refusal compliance: if classify returns `confidence < 0.3`, the page is
  written with explicit "We're not sure what this is" body and `kind: exhibit_unknown`
- Idempotency: same input + same `analysis_version` + same provider → same body_hash

### 4.8 Failure modes & retries

| Mode | Action |
|---|---|
| Provider 5xx | retry 3× with exp backoff, then `analysis_status='failed'` |
| JSON parse fail | retry 1× with `JSON.parse` error appended to system prompt |
| Schema validation fail | retry 1× with validator path + message |
| Frontmatter validation fail | retry 1× with field+reason in system prompt |
| Content safety reject | mark `skipped`, no page written, log entry |
| Low confidence (<0.3) | write `exhibit_unknown` page, no domain block, no entity pages created |
| Daily cap hit | enqueue, drain next day |

---

## 5. API Surface

### 5.1 Existing (v0.4)

```
POST  /api/interactions/list           # iOS submit (preserved byte-for-byte)
GET   /api/interactions/list           # paginated list + search
GET   /api/stats
GET   /api/health
GET   /media/*                         # R2 stream
GET   /                                # landing
GET   /interactions/view               # public grid
GET   /admin, POST /admin/login,
POST  /admin/logout, GET /admin/photos,
POST  /admin/delete                    # admin
```

### 5.2 New endpoints by version

```
v0.5  POST  /api/admin/analyze/:id          # force re-analyze one
      POST  /api/admin/analyze-batch        # backfill / batch
      GET   /api/exhibit/:id                # full analysis JSON
      GET   /exhibit/:id                    # per-exhibit wiki page

v0.6  GET   /exhibit/:id?tab=art|history|map|ai
      GET   /api/exhibit/:id/looking-questions

v0.7  GET   /api/concepts/:slug             # concept detail + linked exhibits
      GET   /api/places/:slug
      GET   /api/periods/:slug
      GET   /api/exhibits?concept=…&period=…&place=…

v0.8  GET   /me/timeline, /api/me/timeline
      GET   /me/map,      /api/me/map

v0.9  GET   /me/quests
      POST  /api/quests/:id/check-progress
      GET   /api/badges/:slug

v1.0  POST  /api/auth/child/login           # child PIN login
      POST  /api/auth/parent/login
      GET   /me, /parent/:child_id
      GET   /api/me                         # session-scoped data

v1.1  POST  /api/exhibit/:id/ask            # AI Q&A grounded in child's collection

v1.2  POST  /api/exhibitions                # create custom exhibition
      GET   /me/exhibition/:id
      POST  /api/exhibitions/:id/items

v1.3  GET   /api/compare?a=:id&b=:id        # AI comparison

v2.0  POST  /api/teacher/class
      GET   /teacher, /teacher/class/:id

v2.1  GET   /api/exhibit/:id/quiz           # generated quiz
      GET   /api/me/worksheet               # PDF/printable
```

---

## 6. UI Surfaces

### 6.1 Child wiki

The wiki is the navigation. Most pages are just `/wiki/<path>` rendering the
markdown from `wiki_pages`. Specialized routes (timeline, map, graph) are
*projections* over the same data.

**Wiki page render `/wiki/<user>/<path>`** (v0.5+):
- Server-renders the markdown body to HTML (use a small CSP-safe markdown lib)
- Injects a sidebar showing **inbound links** ("8 exhibits link here") for
  entity pages — the always-fresh "what cites this concept" panel
- Injects a sticky table of contents for long pages
- Renders frontmatter as a header chip strip (period · place · domain)
- Edit-trail footer: "Last updated by AI on 2026-04-26 from interactions/<id>"
- Print-friendly stylesheet (parents like printing visit summaries)

**Index `/wiki/<user>` → renders `index.md`** (v0.5+):
- Catalog of every page, grouped by kind
- "Recently updated" section
- Search box (full-text over wiki_pages.body in v0.7+)

**Log `/wiki/<user>/log`** (v0.5+):
- Renders chronological audit trail from `wiki_log`
- Filter by kind (ingest / query / lint)

**Per-exhibit page `/wiki/<user>/exhibits/<id>`** (v0.6):
```
┌─────────────────────────────────────────┐
│  [photo]            [label photo]       │
│                                         │
│  Bronze Ritual Vessel                   │
│  🏺 History · Art · Technology          │
│  c. 1000 BCE · China                    │
│                                         │
│  「这是古代中国人在祭祀祖先时使用的青铜礼器…」│
│                                         │
│  ┌───────┬─────────┬──────┬──────┬─────┐│
│  │ Story │ History │ Art  │ Map  │ Ask ││
│  └───────┴─────────┴──────┴──────┴─────┘│
│  …tab content…                          │
│                                         │
│  Look closely:                          │
│   · What patterns do you see?           │
│   · Why is the top wider than bottom?   │
│                                         │
│  Next to find:                          │
│   · A bronze object from another        │
│     civilization                        │
│   · A ritual object (any culture)       │
└─────────────────────────────────────────┘
```

**My Museum home `/me`** (v1.0):
- Counts (exhibits, museums, periods covered, places covered)
- Top 4 themes
- Latest 6 captures
- Active quests
- Most recent badge

**Timeline `/me/timeline`** (v0.8): horizontal axis, BCE/CE, exhibits as
draggable pins; click → exhibit page.

**Map `/me/map`** (v0.8): leaflet (OSS) world map, R2-hosted tiles via Cloudflare,
exhibits clustered by origin point.

**Knowledge graph `/me/graph`** (v0.7): force-directed view (cytoscape.js)
with concept/place/period/exhibit nodes. Click node → drill in.

**My Exhibition `/me/exhibition/:id`** (v1.2): curated subset, AI-suggested theme.

### 6.2 Admin (existing)

Stays as-is. Adds a "Re-analyze" button per row + bulk "Re-analyze selected"
in v0.5.

### 6.3 Parent dashboard `/parent/:child_id` (v1.0)

- Visit summary (last visit / last week / all time)
- Domains explored (pie)
- New concepts learned this week
- Recommended next outings (by gap analysis)
- Print learning report (PDF) — v2.1

### 6.4 Teacher dashboard `/teacher` (v2.0)

- Class list, students' captures
- Class shared wiki (aggregated knowledge graph)
- Assignments / quests for the class
- Worksheet generator

---

## 7. Roadmap

Each version is shippable and demo-able. We will not start v(N+1) until v(N)
is merged and live. Estimates assume one engineer.

### v0.4 — Shipped ✅
- iOS POST → R2 + D1
- Public grid, search, pagination
- Admin login + bulk delete
- DeepSeek API key configured as Cloudflare secret

### Status overview (2026-04-26)

| Version | Status | Live URL surfaces |
|---|---|---|
| v0.5 — AI ingest foundation | ✅ shipped | POST `/api/interactions/list` triggers ingest; admin Re-ingest |
| v0.6 — Domain templates + entity pages | ✅ shipped | `/wiki/<user>/exhibits/<id>` + auto-created concept/place/period/etc pages |
| v0.7 — index / log / search / lint / augment | ✅ shipped | `/wiki/<user>/index`, `/log`, `/_search`, `/admin/lint/<user>` |
| v0.8 — Timeline + Map | ✅ shipped | `/me/timeline`, `/me/map` |
| v0.9 — Quests + badges | ✅ shipped | `/me/quests`, 11 starter quests, auto-award on ingest |
| v1.1 — Ask the wiki | ✅ shipped | `/wiki/<user>/_ask`, `POST /api/wiki/<user>/ask` |
| v1.3 — Compare | ✅ shipped | `/wiki/<user>/_compare?a=…&b=…` |
| v2.1 — Quizzes | ✅ shipped | `/wiki/<user>/_quiz?p=…` |
| **v1.0 — Multi-user + auth** | 🛑 needs iOS + product | Requires iOS app to send `user_id`, child PIN flow, parent password flow — block on coordination |
| **v1.2 — My Exhibition** | ⏸ deferred | Requires v1.0 (per-user ownership) to be meaningful |
| **v2.0 — Teacher mode** | 🛑 needs business + v1.0 | Class accounts, roster, classroom integrations — needs product decisions |
| **v2.2 — Public KB / cross-museum themes** | 🛑 needs moderation policy | Requires multi-user + content moderation framework |

### v0.5 — AI ingest foundation + first wiki page per exhibit (≈ 2.5 days)

**Goal:** every exhibit has its own markdown wiki page in `wiki_pages`. The
wiki is born.

- D1 migration `0002_wiki.sql`
  - `interactions` analysis columns (status, version, provider, denorm fields)
  - `wiki_pages`, `wiki_links`, `wiki_log` tables
- `worker/src/wiki/SCHEMA.md` — discipline doc the LLM reads on every call
- `worker/src/ai/provider.ts` + `deepseek.ts`
- `worker/src/ai/prompts/{classify, exhibit-page-history, exhibit-page-art,
  exhibit-page-science, exhibit-page-tech, exhibit-page-culture,
  exhibit-page-general}.ts`
- `worker/src/wiki/ingest.ts` — orchestrator (classify → compose-page →
  validate frontmatter+body → write_page → indexer → log)
- `worker/src/wiki/write_page.ts` — single point of mutation (body_hash,
  link parsing, idempotency)
- `worker/src/wiki/indexer.ts` — deterministic frontmatter→D1 mirror
- `ctx.waitUntil(ingest(id))` after iOS POST
- `GET /wiki/<user>/exhibits/<id>` renders the markdown page
- Admin: per-row "Re-ingest" + bulk "Re-ingest selected"
- Backfill script `scripts/backfill-ingest.ts`
- Cards: append child_summary preview + domain emoji chip + link to
  `/wiki/default/exhibits/<id>`
- Health: `/api/health` includes wiki stats `{pages, by_kind, last_ingest}`

**Exit criteria:**
- All 379 existing rows have an `exhibits/<id>` page in `wiki_pages`
- Each page has valid frontmatter parseable by the indexer
- New POSTs produce a wiki page within 30s
- 0 PII / unsafe content in samples
- Re-ingest produces identical body_hash for unchanged input

### v0.6 — Domain templates + entity pages (≈ 3 days)

**Goal:** ingest creates not just the exhibit page but also concept / place /
period / person / style / material entity pages, linked from the exhibit page.

- Prompts gain a "linked entities" section that emits planned entity pages
- Ingest orchestrator now writes 5–15 pages per exhibit (with batching to
  cap LLM calls at ≤ 4)
- Workers AI vision OCR for label images (when 2nd photo present)
- Age-graded summaries (5–7, 8–10, 11–13) baked into frontmatter
- Generic wiki render adds: inbound-links sidebar, frontmatter chip header,
  Look-closely / Time-travel section detection
- `/wiki/<user>/concepts/<slug>` etc. render entity pages
- Public grid card click → exhibit wiki page (replaces v0.5 placeholder)
- Mobile layout pass

**Exit criteria:**
- Average ingest produces ≥ 5 entity pages per exhibit (across all entity kinds)
- Click any concept/place/period link from an exhibit → useful, linked page
- Lighthouse perf ≥ 90 on wiki render
- No "broken link" wiki edges in indexer report

### v0.7 — Wiki maintenance: index, log, lint, search (≈ 3 days)

**Goal:** the wiki is *maintained*, not just appended. Index stays current,
contradictions are flagged, gaps are surfaced.

- `wiki/<user>/index.md` auto-regenerated after every ingest (deterministic
  from `wiki_pages`)
- `wiki/<user>/log.md` rendered from `wiki_log` table
- Lint pass: `worker/src/wiki/lint.ts` runs the §4.5 checks
- Admin: `/admin/lint/<user>` renders the latest lint report with one-click
  "Apply" actions (e.g. fix orphan, create missing page)
- Re-ingest path now passes existing entity page contents to the LLM with
  instruction to **augment, not overwrite**
- Filter sidebar on the public grid (domain / period / place / concept) —
  driven by indexed frontmatter
- Full-text search across the user's wiki: D1 FTS5 virtual table over
  `wiki_pages.body`

**Exit criteria:**
- Re-ingest a previously-seen civilization → its civilization page is updated,
  not duplicated; log shows the diff
- Lint produces a clean report on the backfilled 379-entry wiki
- Search across the wiki returns relevant pages in p50 < 200ms

### v0.8 — Timeline + Map (≈ 2 days)

**Goal:** see the collection across time and space.

- `/me/timeline` (or `/timeline` while still single-user) — D3 or vanilla SVG horizontal axis with log-scale support (BCE prehistory → modern)
- `/me/map` — Leaflet + OSM tiles
- Filters: domain, period, place
- Cross-link: pin click → exhibit page

**Exit criteria:**
- Timeline scales smoothly from 200M BCE (fossils) to today
- Map shows all exhibits with origin metadata

### v0.9 — Quests + badges (≈ 2 days)

**Goal:** child has a "next mission" feeling.

- D1 migration `0005_quests.sql`
- Seed 10 starter quests (Ancient Civilizations Explorer, Color Detective, Bronze Hunter, Time Traveler, etc.)
- Quest engine: rules JSON evaluates against the child's exhibits
- Badge unlock + notification banner
- `/me/quests` page

**Exit criteria:**
- A simulated child with the existing 379 exhibits unlocks ≥ 5 badges

### v1.0 — Multi-user (≈ 4 days)

**Goal:** real child accounts + parent dashboard.

- D1 migration `0004_users.sql` (users + sessions)
- iOS app: login screen + per-capture user_id (coordinate with iOS team — non-breaking by adding optional `user_id` field)
- Web auth: child PIN login, parent password login, signed cookies
- `/me` home, `/parent/:child_id`
- Admin: user CRUD

**Exit criteria:**
- Two child accounts have isolated views
- Parent sees their child's progress

### v1.1 — Query operation: ask the wiki (≈ 2 days)

**Goal:** "ask me anything about this exhibit" actually walks the *child's
wiki* — exhibit pages, concept pages, place pages — and answers with citations.
Notable answers get filed back as new pages so explorations compound.

- `worker/src/wiki/query.ts` implements §4.4
- `/api/wiki/<user>/ask` — POST `{question, context_path?}` → `{answer_md, citations[], filed_path?}`
- Index-first retrieval (read `index.md`, shortlist, drill in) — no embeddings
  needed at this scale
- v1.1.1 embedding fallback for wikis > 200 pages: BGE via Workers AI,
  cached forever by `body_hash`
- Personalized phrasing — citations always link to *the child's own* pages
  ("You also captured [a Roman coin](/wiki/default/exhibits/abc) last week…")
- Comparisons & themed walkthroughs auto-file as
  `wiki/<user>/comparisons/<slug>.md` or update existing theme page

**Exit criteria:**
- Q&A cites which of the child's own wiki pages it's referencing
- Latency p50 < 3s for shortlist of ≤ 15 pages
- Comparison answers persist as new wiki pages

### v1.2 — My Exhibition (≈ 3 days)

- `/me/exhibition/new` — pick 5–10 exhibits, AI proposes theme + intro
- `/me/exhibition/:id` — gallery view, optional public share link
- Embed/share

### v1.3 — Compare (≈ 1 day)

- `GET /api/compare?a=…&b=…` — AI generates similarities/differences table
- `/exhibit/:id` "compare to..." picker

### v2.0 — Teacher mode (≈ 5 days)

- Class accounts, class-shared wiki, student roster, assigned quests
- `/teacher` dashboard

### v2.1 — Quizzes & worksheets (≈ 4 days)

- AI-generated quiz per exhibit (MCQ + free-response)
- Printable worksheet per visit (PDF via headless)

### v2.2 — Cross-museum themes & public KB (≈ 5 days)

- Curated public exhibitions across users (moderated)
- "Themes" hub: explore Bronze Age across users' collections
- Recommendations: based on gap analysis, suggest specific museum + room

---

## 8. Cross-cutting concerns

### 8.1 Auth

| Surface | v0.x | v1.0+ |
|---|---|---|
| iOS POST ingest | open | per-user API key (issued at signup) |
| Admin | password (now) | unchanged |
| Child web | open | PIN (4 digits, rate-limited) |
| Parent web | open | password + email |
| Teacher web | n/a | password + invite code |

All sessions: HMAC-signed cookie, HttpOnly, Secure, SameSite=Strict.

### 8.2 Cost & quotas

- Daily LLM call budget per env var; soft warning at 80%, hard block at 100%
- Per-user quota (v1.0+): 50 captures/day, 200 Q&A/day
- Cache analysis: never re-run unless admin requests
- Cache embeddings: forever, keyed by `analysis_json` hash

### 8.3 Content safety / age adaptation

- Age-graded summaries (3 bands) at generation time, not runtime
- Profanity word list pre-filter (English + Chinese)
- Provider moderation hook
- Sensitive topics (violence, death, religion, nudity in art) → gentle phrasing
  rule baked into the system prompt; explicit content → flag for adult review

### 8.4 Observability

- `console.log` (Workers tail) for v0.x
- Structured JSON logs from v1.0
- AI call counter in KV (visible at `/admin/health`)
- Sentry / similar — not yet, evaluate at v2.0

### 8.5 Testing

- v0.5+: snapshot tests on prompt → JSON output (using fixed sample images)
- v0.7+: graph extraction unit tests
- v1.0+: end-to-end via Playwright on a preview deploy
- iOS contract test: byte-compare a known POST to ensure compatibility

---

## 9. Risks & open questions

| Risk | Mitigation |
|---|---|
| AI hallucinates artist names / dates | Hard refusal rule in prompts; confidence threshold; cite-or-skip |
| DeepSeek availability/regional issues | Provider abstraction; Workers AI fallback |
| Cost runaway during backfill | Day cap + batching + retry budget |
| iOS app contract breakage | All new fields optional; existing field shapes preserved |
| Public repo leaking secrets | All keys via `wrangler secret`; pre-commit hook to grep for `sk-` |
| Mixed-language UX (EN/ZH) | i18n key/value table introduced at v1.0; strings extracted from templates |
| Data ownership / privacy of children's photos | v1.0 onwards: per-user auth, soft-delete, parent-controlled visibility |

**Open questions to resolve before v1.0:**
- iOS app version coordination (who ships first?)
- Child PIN recovery flow (parent-mediated)
- Public sharing default (assume **off**)

---

## 10. Configuration

### Cloudflare secrets (`wrangler secret put`)
- `ADMIN_PASSWORD` ✅ (set)
- `ADMIN_SESSION_SECRET` ✅ (set)
- `DEEPSEEK_API_KEY` ✅ (set in v0.5 prep)
- `OPENAI_API_KEY` (future, optional)
- `ANTHROPIC_API_KEY` (future, optional)

### Bindings (`wrangler.toml`)
- `DB` (D1) ✅
- `MEDIA` (R2) ✅
- `AI` (Workers AI) — add in v0.6
- `CACHE` (KV) — add in v0.7

### Environment variables (`[vars]`)
- `PAGE_SIZE = "12"` ✅
- `AI_PROVIDER = "deepseek"` (v0.5)
- `AI_MODEL_CHAT = "deepseek-chat"` (v0.5)
- `AI_MODEL_VISION = "deepseek-vl"` (v0.6)
- `AI_DAILY_CALL_CAP = "5000"` (v0.5)
- `ANALYSIS_VERSION = "1"` (bump on prompt schema change → triggers re-ingest eligibility)
- `DEFAULT_USER_ID = "default"` (single-tenant tag until v1.0)

### In-repo files (read by the LLM at runtime)
- `worker/src/wiki/SCHEMA.md` — the schema doc the LLM reads on every
  Ingest/Query/Lint call. Defines page kinds, frontmatter contracts, link
  syntax, refusal rules, ingest/query/lint workflows. Co-evolved with the
  team. Versioned in git.
- `worker/src/wiki/EXAMPLES/` — a handful of canonical example pages
  (exhibit-history, exhibit-art, concept, place, period). Used as few-shot
  prompts to keep style consistent.

---

## Appendix A — example end-to-end flow (reference)

A child photographs a bronze ritual vessel at the Penn Museum.

1. **iOS** POSTs `{id, response:"It looks like a king's cup", image:"data:image/jpeg;base64,…"}` to `/api/interactions/list`.
2. **Worker** writes R2 + D1 `interactions` row, `analysis_status='pending'`. Returns 201 immediately.
3. **`ctx.waitUntil(ingest(id))`** runs the §4.3 Ingest:
   1. **classify** → `{primary_domain:"history", object_type:"Ritual Vessel", confidence:0.86}`
   2. **compose-page** (LLM, `exhibit-page-history` prompt + SCHEMA.md) → markdown body for `wiki/default/exhibits/<id>.md` with frontmatter declaring period `shang-dynasty`, place `china-yellow-river`, materials `[bronze]`, themes `[ancestor-worship, ritual-authority]`, concepts `[bronze-age, ritual]`
   3. write_page persists it. body_hash recorded.
   4. for each linked entity not yet in the wiki, the LLM composes a fresh entity page (`concepts/bronze-age.md`, `places/china-yellow-river.md`, `periods/shang-dynasty.md`, `materials/bronze.md`, `themes/ancestor-worship.md`). For entities that exist (e.g. `concepts/ritual.md` from a previous Greek artifact), the LLM is shown the existing body and **augments** it with this new evidence.
   5. **indexer** parses frontmatter of all changed pages, writes `wiki_links` rows, mirrors denorm fields (`primary_domain`, `approx_year=-1000`, `origin_lat/lon`) into the legacy `interactions` row, upserts the reference tables.
   6. **index.md** is regenerated (deterministic, one-line catalog entry per page, grouped by kind).
   7. **log.md** gets one line: `## [2026-04-26] ingest | Bronze Ritual Vessel — touched 6 pages`
   8. `interactions.analysis_status='done'`, `analysis_version=1`.

4. **Child opens `/wiki/default/exhibits/<id>`** on the web:
   - Photo + frontmatter chip strip (🏺 history · 🎨 art · ⚙️ tech · Shang Dynasty · China)
   - Markdown body rendered server-side
   - Inbound-links sidebar (initially empty for a brand-new page)
   - Click `[Bronze Age](/wiki/default/concepts/bronze-age)` → that page now exists
   - "Ask the wiki" button (v1.1) opens chat with this page as context

5. **Child clicks `Bronze Age`** → concept page renders. Sidebar shows
   "1 exhibit links here". Tomorrow they capture a Greek bronze and the
   sidebar auto-grows to "2 exhibits link here" without anyone editing
   the page.

6. **Quest engine** notices: child has now captured 1 bronze object →
   2 more to unlock "Bronze Hunter" badge. Quest progress page links to
   the exhibit and the concept.

7. **Sunday lint runs** → produces `_lint-report-2026-05-03.md` flagging
   that `concepts/ritual.md` mentions "Roman household altars" but no Roman
   exhibit page exists → suggested as a "next outing" for the child.

8. **Parent opens `/parent/<child_id>`** → sees the child's wiki at a
   glance: 12 exhibits, 23 concepts, 4 civilizations, 6 places, latest
   activity, and a one-paragraph summary the LLM composed from the wiki
   index.

This is the loop. Everything else in the roadmap is enrichment of this loop.

The crucial property: **knowledge compounds**. The 50th exhibit ingest is
better than the first because the LLM is updating an existing wiki, not
starting blank. The wiki itself becomes the artifact the family keeps —
exportable, printable, version-controlled, and growing.
