// Single mutation point for wiki pages. Handles:
//   - {user} substitution
//   - body_hash computation
//   - frontmatter parsing
//   - link extraction → wiki_links replace
//   - inbound_links recount
//   - row upsert
// Idempotent: same (user,path,body) produces identical row.

import { upsertWikiPage, replaceWikiLinks, getWikiPage } from "./db";
import {
  extractWikiLinks,
  parseFrontmatter,
  sha256Hex,
  substituteUser,
} from "./util";

export type WritePageInput = {
  userId: string;
  path: string;
  kind: string;
  title: string;
  body: string;                 // full markdown including --- frontmatter ---
  sourceCount?: number;         // default 1 for new exhibit pages
  lastIngestAt?: string;        // ISO; defaults to now
};

export type WritePageResult = {
  bodyHash: string;
  outboundLinks: number;
  changed: boolean;             // false if existing page already matched body_hash
};

export async function writePage(
  db: D1Database,
  input: WritePageInput,
): Promise<WritePageResult> {
  const now = new Date().toISOString();
  const bodyResolved = substituteUser(input.body, input.userId);
  const body_hash = await sha256Hex(bodyResolved);

  const existing = await getWikiPage(db, input.userId, input.path);
  if (existing && existing.body_hash === body_hash) {
    return { bodyHash: body_hash, outboundLinks: existing.outbound_links, changed: false };
  }

  const { frontmatter } = parseFrontmatter(bodyResolved);
  const links = extractWikiLinks(bodyResolved, input.userId);

  await upsertWikiPage(db, {
    user_id: input.userId,
    path: input.path,
    kind: input.kind,
    title: input.title,
    body: bodyResolved,
    frontmatter_json: JSON.stringify(frontmatter),
    body_hash,
    source_count: input.sourceCount ?? (existing?.source_count ?? 1),
    outbound_links: links.length,
    last_ingest_at: input.lastIngestAt ?? now,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });

  await replaceWikiLinks(db, input.userId, input.path, links);

  return { bodyHash: body_hash, outboundLinks: links.length, changed: true };
}
