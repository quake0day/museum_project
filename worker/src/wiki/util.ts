// Small pure helpers used by the wiki layer. No DB / runtime deps.

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")          // strip combining marks
    .replace(/['"`’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(hash);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

// Parse a markdown body that begins with --- YAML --- frontmatter into
// { frontmatter, body } where body is the markdown after the closing ---.
// Tolerant: if no frontmatter, returns frontmatter = {}.
export function parseFrontmatter(md: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: md };
  return { frontmatter: parseSimpleYaml(m[1]), body: m[2] };
}

// Tiny YAML subset: supports `key: scalar` and `key: [a, b, c]` and
// nested `key:` followed by `  - item` lines. Enough for our schema.
// We avoid pulling a real YAML library (~80KB) because we control the
// shape on both sides.
export function parseSimpleYaml(src: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = src.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }

    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1];
    const rest = m[2].trim();

    if (rest === "" || rest === "|" || rest === ">") {
      // multi-line list block
      const list: string[] = [];
      i++;
      while (i < lines.length) {
        const sub = lines[i];
        const dash = sub.match(/^\s+-\s+(.*)$/);
        if (!dash) break;
        list.push(unquote(dash[1].trim()));
        i++;
      }
      out[key] = list;
      continue;
    }

    if (rest.startsWith("[") && rest.endsWith("]")) {
      const inner = rest.slice(1, -1).trim();
      out[key] = inner ? inner.split(",").map((s) => unquote(s.trim())) : [];
    } else if (/^-?\d+$/.test(rest)) {
      out[key] = parseInt(rest, 10);
    } else if (/^-?\d+\.\d+$/.test(rest)) {
      out[key] = parseFloat(rest);
    } else if (rest === "true" || rest === "false") {
      out[key] = rest === "true";
    } else if (rest === "null" || rest === "~") {
      out[key] = null;
    } else {
      out[key] = unquote(rest);
    }
    i++;
  }
  return out;
}

function unquote(s: string): string {
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'")) {
    const q = s[0];
    if (s[s.length - 1] === q) return s.slice(1, -1);
  }
  return s;
}

// Extract markdown internal links of the form
//   [Text](/wiki/<user>/<path>) <!-- rel:foo -->
// Returns each as { href: '/wiki/.../path', dst_path: 'concepts/bronze-age', relation }.
export function extractWikiLinks(
  body: string,
  userId: string,
): Array<{ dst_path: string; relation: string | null }> {
  const out: Array<{ dst_path: string; relation: string | null }> = [];
  const seen = new Set<string>();
  // Match `[..](/wiki/<user>/<path>)` optionally followed by `<!-- rel:xxx -->` on the same line.
  const re = new RegExp(
    `\\[[^\\]]+\\]\\(\\/wiki\\/${escapeRegex(userId)}\\/([^)\\s]+)\\)([^\\n]*)`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const dst = decodeURIComponent(m[1]).replace(/\.md$/i, "");
    const tail = m[2] || "";
    const relMatch = tail.match(/<!--\s*rel:([a-z_]+)\s*-->/i);
    const key = `${dst}|${relMatch ? relMatch[1] : ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ dst_path: dst, relation: relMatch ? relMatch[1].toLowerCase() : null });
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replace literal {user} placeholder in a markdown body with the actual user id.
export function substituteUser(body: string, userId: string): string {
  return body.replace(/\{user\}/g, userId);
}
