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
  userId: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT OR REPLACE INTO interactions (id, response, image, date, user_id) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(row.id, row.response, row.image, row.date, userId)
    .run();
}

export async function getInteractionById(
  db: D1Database,
  id: string,
): Promise<(InteractionRow & { user_id: string }) | null> {
  const row = await db
    .prepare("SELECT id, response, image, date, user_id FROM interactions WHERE id = ?1")
    .bind(id)
    .first<InteractionRow & { user_id: string }>();
  return row ?? null;
}

export async function deleteInteraction(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM interactions WHERE id = ?1").bind(id).run();
}

/** Delete the interaction plus its wiki artefacts (exhibit page + edges).
 *  Caller is responsible for the R2 image. Returns the row that was
 *  deleted so the caller can decide what to do with it. */
export async function deleteInteractionCascade(
  db: D1Database,
  userId: string,
  id: string,
): Promise<(InteractionRow & { user_id: string }) | null> {
  const row = await db
    .prepare("SELECT id, response, image, date, user_id FROM interactions WHERE id = ?1 AND user_id = ?2")
    .bind(id, userId)
    .first<InteractionRow & { user_id: string }>();
  if (!row) return null;
  const exhibitPath = `exhibits/${id}`;
  // Order matters: links first (FTS triggers fire on wiki_pages delete).
  await db.batch([
    db.prepare("DELETE FROM wiki_links WHERE user_id = ?1 AND (src_path = ?2 OR dst_path = ?2)")
      .bind(userId, exhibitPath),
    db.prepare("DELETE FROM wiki_pages WHERE user_id = ?1 AND path = ?2")
      .bind(userId, exhibitPath),
    db.prepare("DELETE FROM interactions WHERE id = ?1 AND user_id = ?2")
      .bind(id, userId),
  ]);
  return row;
}

// ─── User repository (auth metadata) ───

export type UserRow = {
  user_id: string;
  email: string | null;
  email_verified_at: string | null;
  pending_email: string | null;
  pending_pin_hash: string | null;
  pending_token_hash: string | null;
  pending_expires_at: string | null;
  pin_hash: string | null;
  pin_salt: string | null;
  pin_iterations: number | null;
  pin_set_at: string | null;
  failed_attempts: number;
  locked_until: string | null;
  recovery_token_hash: string | null;
  recovery_expires_at: string | null;
};

/** Get the user row, creating an empty stub if missing. Stubs let
 *  /me/security render uniformly for fresh accounts. */
export async function ensureUserRow(db: D1Database, userId: string): Promise<UserRow> {
  await db
    .prepare("INSERT OR IGNORE INTO users (user_id) VALUES (?1)")
    .bind(userId)
    .run();
  const row = await db
    .prepare("SELECT * FROM users WHERE user_id = ?1")
    .bind(userId)
    .first<UserRow>();
  if (!row) throw new Error("user row missing after insert"); // shouldn't happen
  return row;
}

export async function getUserRow(db: D1Database, userId: string): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT * FROM users WHERE user_id = ?1")
    .bind(userId)
    .first<UserRow>();
  return row ?? null;
}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT * FROM users WHERE email = ?1")
    .bind(email)
    .first<UserRow>();
  return row ?? null;
}

/** Stage an email + pending PIN hash + verification token. Replaces any
 *  prior pending verification. */
export async function setPendingPin(
  db: D1Database,
  userId: string,
  args: {
    pendingEmail: string;
    pendingPinHash: string;       // base64url
    pendingPinSalt: string;       // base64url
    pendingPinIterations: number;
    pendingTokenHash: string;     // SHA-256 of raw token
    pendingExpiresAt: string;     // ISO8601
  },
): Promise<void> {
  // We're squeezing extra columns into pending_pin_hash by encoding salt &
  // iterations alongside the hash. Simpler than 3 new columns since this
  // staging area is short-lived (~30 min).
  const pinPayload = JSON.stringify({
    h: args.pendingPinHash,
    s: args.pendingPinSalt,
    i: args.pendingPinIterations,
  });
  await db.prepare(
    `UPDATE users
        SET pending_email = ?2,
            pending_pin_hash = ?3,
            pending_token_hash = ?4,
            pending_expires_at = ?5,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE user_id = ?1`,
  ).bind(userId, args.pendingEmail, pinPayload, args.pendingTokenHash, args.pendingExpiresAt).run();
}

/** Promote staged pending → active after the user clicks the email link. */
export async function activatePendingPin(
  db: D1Database,
  userId: string,
): Promise<{ ok: true; email: string } | { ok: false; reason: string }> {
  const row = await getUserRow(db, userId);
  if (!row || !row.pending_email || !row.pending_pin_hash) {
    return { ok: false, reason: "no_pending" };
  }
  let payload: { h: string; s: string; i: number };
  try {
    payload = JSON.parse(row.pending_pin_hash);
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
  await db.prepare(
    `UPDATE users
        SET email = ?2,
            email_verified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            pin_hash = ?3,
            pin_salt = ?4,
            pin_iterations = ?5,
            pin_set_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            pending_email = NULL,
            pending_pin_hash = NULL,
            pending_token_hash = NULL,
            pending_expires_at = NULL,
            failed_attempts = 0,
            locked_until = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE user_id = ?1`,
  ).bind(userId, row.pending_email, payload.h, payload.s, payload.i).run();
  return { ok: true, email: row.pending_email };
}

/** Clear pending verification (cancel set-PIN, or expired). */
export async function clearPendingPin(db: D1Database, userId: string): Promise<void> {
  await db.prepare(
    `UPDATE users
        SET pending_email = NULL,
            pending_pin_hash = NULL,
            pending_token_hash = NULL,
            pending_expires_at = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE user_id = ?1`,
  ).bind(userId).run();
}

/** Remove an active PIN (disabling it). Email stays bound for recovery. */
export async function clearActivePin(db: D1Database, userId: string): Promise<void> {
  await db.prepare(
    `UPDATE users
        SET pin_hash = NULL,
            pin_salt = NULL,
            pin_iterations = NULL,
            pin_set_at = NULL,
            failed_attempts = 0,
            locked_until = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE user_id = ?1`,
  ).bind(userId).run();
}

export async function recordFailedAttempt(
  db: D1Database,
  userId: string,
  lockUntilIso: string | null,
): Promise<void> {
  await db.prepare(
    `UPDATE users
        SET failed_attempts = failed_attempts + 1,
            locked_until = COALESCE(?2, locked_until),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE user_id = ?1`,
  ).bind(userId, lockUntilIso).run();
}

export async function resetFailedAttempts(db: D1Database, userId: string): Promise<void> {
  await db.prepare(
    `UPDATE users
        SET failed_attempts = 0,
            locked_until = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE user_id = ?1`,
  ).bind(userId).run();
}

export async function setRecoveryToken(
  db: D1Database,
  userId: string,
  tokenHash: string,
  expiresAtIso: string,
): Promise<void> {
  await db.prepare(
    `UPDATE users
        SET recovery_token_hash = ?2,
            recovery_expires_at = ?3,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE user_id = ?1`,
  ).bind(userId, tokenHash, expiresAtIso).run();
}

export async function clearRecoveryToken(db: D1Database, userId: string): Promise<void> {
  await db.prepare(
    `UPDATE users
        SET recovery_token_hash = NULL,
            recovery_expires_at = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE user_id = ?1`,
  ).bind(userId).run();
}

/** Replace the active PIN (after recovery, or change). */
export async function replaceActivePin(
  db: D1Database,
  userId: string,
  hash: { hash: string; salt: string; iterations: number },
): Promise<void> {
  await db.prepare(
    `UPDATE users
        SET pin_hash = ?2,
            pin_salt = ?3,
            pin_iterations = ?4,
            pin_set_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            failed_attempts = 0,
            locked_until = NULL,
            recovery_token_hash = NULL,
            recovery_expires_at = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE user_id = ?1`,
  ).bind(userId, hash.hash, hash.salt, hash.iterations).run();
}
