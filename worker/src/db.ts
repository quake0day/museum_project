export type InteractionRow = {
  id: string;
  response: string;
  image: string;
  date: string;
  // v0.5+: optional, present after migration 0002
  analysis_status?: string | null;
  primary_domain?: string | null;
  child_summary?: string | null;
  // v0.6+: enriched from wiki page frontmatter when wiki has been built
  title?: string | null;
  title_zh?: string | null;
  child_summary_zh?: string | null;
  tags?: Array<{ path: string; title: string; title_zh: string | null; kind: string }>;
};

export type Stats = {
  total: number;
  today: number;
  week: number;
  latest_at: string | null;
};

const ENRICHED_SELECT = `
  i.id, i.response, i.image, i.date,
  i.analysis_status, i.primary_domain, i.child_summary,
  COALESCE(wp.title, NULL) AS title,
  wp.frontmatter_json AS frontmatter_json
`;

// `userId` filters captures to a single tenant. Without it we'd leak
// every user's captures to anyone visiting /interactions/view.
export async function getInteractions(
  db: D1Database,
  opts: { userId: string; page: number; pageSize: number; query?: string },
): Promise<{ rows: InteractionRow[]; count: number }> {
  const { userId, page, pageSize, query } = opts;
  const offset = Math.max(0, (page - 1) * pageSize);

  type Raw = InteractionRow & { frontmatter_json?: string | null };

  let rawRows: Raw[];
  let count: number;
  if (query && query.length > 0) {
    const like = `%${query}%`;
    const [countRes, listRes] = await Promise.all([
      db
        .prepare("SELECT COUNT(*) AS n FROM interactions WHERE user_id = ?1 AND response LIKE ?2")
        .bind(userId, like)
        .first<{ n: number }>(),
      db
        .prepare(
          `SELECT ${ENRICHED_SELECT}
             FROM interactions i
             LEFT JOIN wiki_pages wp
               ON wp.user_id = i.user_id AND wp.path = 'exhibits/' || i.id
            WHERE i.user_id = ?1 AND i.response LIKE ?2
            ORDER BY i.date DESC LIMIT ?3 OFFSET ?4`,
        )
        .bind(userId, like, pageSize, offset)
        .all<Raw>(),
    ]);
    rawRows = listRes.results ?? [];
    count = countRes?.n ?? 0;
  } else {
    const [countRes, listRes] = await Promise.all([
      db
        .prepare("SELECT COUNT(*) AS n FROM interactions WHERE user_id = ?1")
        .bind(userId)
        .first<{ n: number }>(),
      db
        .prepare(
          `SELECT ${ENRICHED_SELECT}
             FROM interactions i
             LEFT JOIN wiki_pages wp
               ON wp.user_id = i.user_id AND wp.path = 'exhibits/' || i.id
            WHERE i.user_id = ?1
            ORDER BY i.date DESC LIMIT ?2 OFFSET ?3`,
        )
        .bind(userId, pageSize, offset)
        .all<Raw>(),
    ]);
    rawRows = listRes.results ?? [];
    count = countRes?.n ?? 0;
  }

  // Parse frontmatter for bilingual title/summary fields
  const rows: InteractionRow[] = rawRows.map((r) => {
    let titleZh: string | null = null;
    let summaryZh: string | null = null;
    try {
      if (r.frontmatter_json) {
        const fm = JSON.parse(r.frontmatter_json);
        if (typeof fm.title_zh === "string" && fm.title_zh.trim()) titleZh = fm.title_zh.trim();
        for (const k of ["summary_8_10_zh", "summary_5_7_zh", "summary_11_13_zh"]) {
          if (typeof fm[k] === "string" && fm[k].trim()) { summaryZh = fm[k].trim(); break; }
        }
      }
    } catch { /* ignore */ }
    return {
      id: r.id, response: r.response, image: r.image, date: r.date,
      analysis_status: r.analysis_status, primary_domain: r.primary_domain,
      child_summary: r.child_summary,
      title: r.title ?? null,
      title_zh: titleZh,
      child_summary_zh: summaryZh,
    };
  });

  // Hydrate per-card tags in a single query (so we don't N+1)
  if (rows.length) {
    const exhibitPaths = rows.map((r) => `exhibits/${r.id}`);
    const placeholders = exhibitPaths.map((_, i) => `?${i + 2}`).join(",");
    const tagsRes = await db
      .prepare(
        `SELECT wl.src_path AS src_path, wl.dst_path AS dst_path,
                wp_dst.title AS dst_title,
                wp_dst.kind AS dst_kind,
                wp_dst.frontmatter_json AS dst_fm
           FROM wiki_links wl
           JOIN wiki_pages wp_dst
             ON wp_dst.user_id = wl.user_id AND wp_dst.path = wl.dst_path
          WHERE wl.user_id = ?1
            AND wp_dst.kind NOT IN ('exhibit','exhibit_unknown','index','log')
            AND wl.src_path IN (${placeholders})`,
      )
      .bind(userId, ...exhibitPaths)
      .all<{ src_path: string; dst_path: string; dst_title: string; dst_kind: string; dst_fm: string | null }>();

    // group by src_path
    const tagsByExhibit = new Map<string, InteractionRow["tags"]>();
    for (const t of tagsRes.results ?? []) {
      let titleZh: string | null = null;
      try {
        if (t.dst_fm) {
          const fm = JSON.parse(t.dst_fm);
          if (typeof fm.title_zh === "string" && fm.title_zh.trim()) titleZh = fm.title_zh.trim();
        }
      } catch { /* ignore */ }
      const existing = tagsByExhibit.get(t.src_path) ?? [];
      existing.push({ path: t.dst_path, title: t.dst_title, title_zh: titleZh, kind: t.dst_kind });
      tagsByExhibit.set(t.src_path, existing);
    }
    for (const r of rows) {
      r.tags = (tagsByExhibit.get(`exhibits/${r.id}`) ?? []).slice(0, 6);
    }
  }

  return { rows, count };
}

export async function getStats(db: D1Database, userId: string): Promise<Stats> {
  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalRes, todayRes, weekRes, latestRes] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS n FROM interactions WHERE user_id = ?1")
      .bind(userId)
      .first<{ n: number }>(),
    db
      .prepare("SELECT COUNT(*) AS n FROM interactions WHERE user_id = ?1 AND date >= ?2")
      .bind(userId, todayStart.toISOString())
      .first<{ n: number }>(),
    db
      .prepare("SELECT COUNT(*) AS n FROM interactions WHERE user_id = ?1 AND date >= ?2")
      .bind(userId, weekStart.toISOString())
      .first<{ n: number }>(),
    db
      .prepare("SELECT date FROM interactions WHERE user_id = ?1 ORDER BY date DESC LIMIT 1")
      .bind(userId)
      .first<{ date: string }>(),
  ]);

  return {
    total: totalRes?.n ?? 0,
    today: todayRes?.n ?? 0,
    week: weekRes?.n ?? 0,
    latest_at: latestRes?.date ?? null,
  };
}

export async function saveInteractionRow(
  db: D1Database,
  row: InteractionRow,
): Promise<void> {
  await db
    .prepare(
      "INSERT OR REPLACE INTO interactions (id, response, image, date) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(row.id, row.response, row.image, row.date)
    .run();
}

export async function getInteractionById(
  db: D1Database,
  id: string,
): Promise<InteractionRow | null> {
  const row = await db
    .prepare("SELECT id, response, image, date FROM interactions WHERE id = ?1")
    .bind(id)
    .first<InteractionRow>();
  return row ?? null;
}

export async function deleteInteraction(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM interactions WHERE id = ?1").bind(id).run();
}
