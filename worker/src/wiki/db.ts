// D1 access for the wiki layer (pages, links, log).

export type WikiPageRow = {
  user_id: string;
  path: string;
  kind: string;
  title: string;
  body: string;
  frontmatter_json: string | null;
  body_hash: string;
  source_count: number;
  inbound_links: number;
  outbound_links: number;
  last_ingest_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WikiLogRow = {
  id: number;
  user_id: string;
  ts: string;
  kind: string;
  ref_path: string | null;
  message: string;
  meta_json: string | null;
};

export async function getWikiPage(
  db: D1Database,
  userId: string,
  path: string,
): Promise<WikiPageRow | null> {
  const row = await db
    .prepare("SELECT * FROM wiki_pages WHERE user_id = ?1 AND path = ?2")
    .bind(userId, path)
    .first<WikiPageRow>();
  return row ?? null;
}

export async function listWikiPages(
  db: D1Database,
  userId: string,
  kind?: string,
): Promise<WikiPageRow[]> {
  if (kind) {
    const res = await db
      .prepare(
        "SELECT * FROM wiki_pages WHERE user_id = ?1 AND kind = ?2 ORDER BY title",
      )
      .bind(userId, kind)
      .all<WikiPageRow>();
    return res.results ?? [];
  }
  const res = await db
    .prepare("SELECT * FROM wiki_pages WHERE user_id = ?1 ORDER BY kind, title")
    .bind(userId)
    .all<WikiPageRow>();
  return res.results ?? [];
}

export async function upsertWikiPage(
  db: D1Database,
  row: Omit<WikiPageRow, "created_at" | "updated_at" | "inbound_links"> & {
    created_at?: string;
    updated_at?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO wiki_pages
        (user_id, path, kind, title, body, frontmatter_json, body_hash,
         source_count, inbound_links, outbound_links, last_ingest_at,
         created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10, ?11, ?12)
       ON CONFLICT(user_id, path) DO UPDATE SET
         kind = excluded.kind,
         title = excluded.title,
         body = excluded.body,
         frontmatter_json = excluded.frontmatter_json,
         body_hash = excluded.body_hash,
         source_count = excluded.source_count,
         outbound_links = excluded.outbound_links,
         last_ingest_at = excluded.last_ingest_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      row.user_id,
      row.path,
      row.kind,
      row.title,
      row.body,
      row.frontmatter_json,
      row.body_hash,
      row.source_count,
      row.outbound_links,
      row.last_ingest_at,
      row.created_at ?? now,
      row.updated_at ?? now,
    )
    .run();
}

export async function replaceWikiLinks(
  db: D1Database,
  userId: string,
  srcPath: string,
  links: Array<{ dst_path: string; relation: string | null }>,
): Promise<void> {
  await db
    .prepare("DELETE FROM wiki_links WHERE user_id = ?1 AND src_path = ?2")
    .bind(userId, srcPath)
    .run();
  for (const l of links) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO wiki_links (user_id, src_path, dst_path, relation) VALUES (?1, ?2, ?3, ?4)",
      )
      .bind(userId, srcPath, l.dst_path, l.relation)
      .run();
  }
  // Refresh inbound counts for any page whose inbound count might have moved.
  // Cheap to recompute the touched set: dst pages of removed + added links.
  // Simpler, equally correct: recompute all inbound counts for this user.
  await db
    .prepare(
      `UPDATE wiki_pages SET inbound_links = (
         SELECT COUNT(*) FROM wiki_links wl
         WHERE wl.user_id = wiki_pages.user_id AND wl.dst_path = wiki_pages.path
       ) WHERE user_id = ?1`,
    )
    .bind(userId)
    .run();
}

// Pages that link TO `dst_path`. Joined to wiki_pages so we can render a
// preview list with title + summary chip on entity pages.
export async function getInboundLinks(
  db: D1Database,
  userId: string,
  dstPath: string,
  limit = 50,
): Promise<Array<{ path: string; title: string; kind: string; relation: string | null }>> {
  const res = await db
    .prepare(
      `SELECT wp.path, wp.title, wp.kind, wl.relation
         FROM wiki_links wl
         JOIN wiki_pages wp
           ON wp.user_id = wl.user_id AND wp.path = wl.src_path
        WHERE wl.user_id = ?1 AND wl.dst_path = ?2
        ORDER BY wp.updated_at DESC
        LIMIT ?3`,
    )
    .bind(userId, dstPath, limit)
    .all<{ path: string; title: string; kind: string; relation: string | null }>();
  return res.results ?? [];
}

// Inbound exhibits with their captured photos. Used to render the photo
// gallery on entity pages (concepts/places/periods/etc). Joins through
// wiki_links → wiki_pages → interactions to get the image R2 key.
export type InboundExhibit = {
  exhibit_id: string;
  exhibit_path: string;
  title: string;
  image: string;
  primary_domain: string | null;
  child_summary: string | null;
};

export async function getInboundExhibits(
  db: D1Database,
  userId: string,
  dstPath: string,
  limit = 60,
): Promise<InboundExhibit[]> {
  const res = await db
    .prepare(
      `SELECT i.id AS exhibit_id, wp.path AS exhibit_path, wp.title AS title,
              i.image AS image, i.primary_domain, i.child_summary
         FROM wiki_links wl
         JOIN wiki_pages wp
           ON wp.user_id = wl.user_id AND wp.path = wl.src_path
         JOIN interactions i
           ON i.user_id = wp.user_id AND wp.path = 'exhibits/' || i.id
        WHERE wl.user_id = ?1 AND wl.dst_path = ?2
          AND wp.kind IN ('exhibit','exhibit_unknown')
          AND i.image IS NOT NULL
        ORDER BY i.date DESC
        LIMIT ?3`,
    )
    .bind(userId, dstPath, limit)
    .all<InboundExhibit>();
  return res.results ?? [];
}

export async function appendWikiLog(
  db: D1Database,
  userId: string,
  kind: string,
  refPath: string | null,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO wiki_log (user_id, ts, kind, ref_path, message, meta_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(
      userId,
      new Date().toISOString(),
      kind,
      refPath,
      message,
      meta ? JSON.stringify(meta) : null,
    )
    .run();
}

export async function recentWikiLog(
  db: D1Database,
  userId: string,
  limit = 100,
): Promise<WikiLogRow[]> {
  const res = await db
    .prepare(
      "SELECT * FROM wiki_log WHERE user_id = ?1 ORDER BY ts DESC LIMIT ?2",
    )
    .bind(userId, limit)
    .all<WikiLogRow>();
  return res.results ?? [];
}

export type WikiSearchHit = {
  path: string;
  title: string;
  kind: string;
  snippet: string;
  rank: number;
};

export async function searchWiki(
  db: D1Database,
  userId: string,
  query: string,
  limit = 30,
): Promise<WikiSearchHit[]> {
  // Sanitize query for FTS5 — strip everything that isn't a word, hyphen, or space.
  const cleaned = query
    .replace(/[^\p{L}\p{N}\s\-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  // Use prefix matching on each token: "bronze age" → "bronze* age*"
  const ftsQuery = cleaned
    .split(" ")
    .filter((t) => t.length >= 2)
    .map((t) => `${t}*`)
    .join(" ");
  if (!ftsQuery) return [];
  const res = await db
    .prepare(
      `SELECT
         wiki_pages.path AS path,
         wiki_pages.title AS title,
         wiki_pages.kind AS kind,
         snippet(wiki_pages_fts, 1, '<mark>', '</mark>', '…', 12) AS snippet,
         bm25(wiki_pages_fts) AS rank
       FROM wiki_pages_fts
       JOIN wiki_pages
         ON wiki_pages_fts.rowid = wiki_pages.rowid
       WHERE wiki_pages_fts MATCH ?2
         AND wiki_pages.user_id = ?1
       ORDER BY rank
       LIMIT ?3`,
    )
    .bind(userId, ftsQuery, limit)
    .all<WikiSearchHit>();
  return res.results ?? [];
}

export type WikiStats = {
  pages: number;
  by_kind: Record<string, number>;
  last_ingest_at: string | null;
};

export async function wikiStats(
  db: D1Database,
  userId: string,
): Promise<WikiStats> {
  const [{ results: kinds = [] } = { results: [] }, last] = await Promise.all([
    db
      .prepare("SELECT kind, COUNT(*) AS n FROM wiki_pages WHERE user_id = ?1 GROUP BY kind")
      .bind(userId)
      .all<{ kind: string; n: number }>(),
    db
      .prepare("SELECT MAX(updated_at) AS ts FROM wiki_pages WHERE user_id = ?1")
      .bind(userId)
      .first<{ ts: string | null }>(),
  ]);
  const by_kind: Record<string, number> = {};
  let total = 0;
  for (const r of kinds) {
    by_kind[r.kind] = r.n;
    total += r.n;
  }
  return { pages: total, by_kind, last_ingest_at: last?.ts ?? null };
}
