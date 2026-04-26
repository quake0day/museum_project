export type InteractionRow = {
  id: string;
  response: string;
  image: string;
  date: string;
};

export type Stats = {
  total: number;
  today: number;
  week: number;
  latest_at: string | null;
};

export async function getInteractions(
  db: D1Database,
  opts: { page: number; pageSize: number; query?: string },
): Promise<{ rows: InteractionRow[]; count: number }> {
  const { page, pageSize, query } = opts;
  const offset = Math.max(0, (page - 1) * pageSize);

  if (query && query.length > 0) {
    const like = `%${query}%`;
    const [countRes, listRes] = await Promise.all([
      db
        .prepare("SELECT COUNT(*) AS n FROM interactions WHERE response LIKE ?1")
        .bind(like)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT id, response, image, date FROM interactions WHERE response LIKE ?1 ORDER BY date DESC LIMIT ?2 OFFSET ?3",
        )
        .bind(like, pageSize, offset)
        .all<InteractionRow>(),
    ]);
    return { rows: listRes.results ?? [], count: countRes?.n ?? 0 };
  }

  const [countRes, listRes] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM interactions").first<{ n: number }>(),
    db
      .prepare(
        "SELECT id, response, image, date FROM interactions ORDER BY date DESC LIMIT ?1 OFFSET ?2",
      )
      .bind(pageSize, offset)
      .all<InteractionRow>(),
  ]);
  return { rows: listRes.results ?? [], count: countRes?.n ?? 0 };
}

export async function getStats(db: D1Database): Promise<Stats> {
  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalRes, todayRes, weekRes, latestRes] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM interactions").first<{ n: number }>(),
    db
      .prepare("SELECT COUNT(*) AS n FROM interactions WHERE date >= ?1")
      .bind(todayStart.toISOString())
      .first<{ n: number }>(),
    db
      .prepare("SELECT COUNT(*) AS n FROM interactions WHERE date >= ?1")
      .bind(weekStart.toISOString())
      .first<{ n: number }>(),
    db
      .prepare("SELECT date FROM interactions ORDER BY date DESC LIMIT 1")
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
