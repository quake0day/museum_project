export function nowISO(): string {
  return new Date().toISOString();
}

export function decodeDataUrl(dataUrl: string): {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
} {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("invalid base64 image format");
  const contentType = match[1];
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const subtype = contentType.split("/")[1].split("+")[0].toLowerCase();
  const ext = subtype === "jpeg" ? "jpg" : subtype;
  return { bytes, contentType, ext };
}

export function normalizeId(id: string): string {
  if (!id) return crypto.randomUUID();
  const s = id.replace(/-/g, "").toLowerCase();
  if (s.length === 32 && /^[0-9a-f]{32}$/.test(s)) {
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }
  return id;
}

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" :
    ch === "<" ? "&lt;" :
    ch === ">" ? "&gt;" :
    ch === '"' ? "&quot;" : "&#39;"
  );
}

export function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ─── crypto / cookie helpers (admin session) ───

const enc = new TextEncoder();

function bytesToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bytesToBase64Url(sig);
}

// Constant-time string compare to mitigate timing attacks on token / password checks.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(secret: string, ttlSeconds = 8 * 3600): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `admin:${exp}`;
  const sig = await hmacSign(secret, payload);
  return `${exp}.${sig}`;
}

export async function verifySession(secret: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = await hmacSign(secret, `admin:${exp}`);
  return timingSafeEqual(expected, sig);
}

// ─── user identity (name-only login) ───
//
// Slugify a free-text name into a stable user_id. Lowercase ASCII letters,
// digits, and hyphens; max 32 chars. "Si Chen" → "si-chen", "Chen" → "chen".
export function slugifyUserName(s: string): string | null {
  if (typeof s !== "string") return null;
  const slug = s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug.length >= 1 && slug.length <= 32 ? slug : null;
}

// Sign/verify a user cookie. Format: `<user_id>.<exp>.<sig>` with the
// signature over `user:<user_id>:<exp>` so swapping the user_id invalidates
// the token.
async function hmacForUser(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bytesToBase64Url(sig);
}

export async function signUserToken(
  secret: string,
  userId: string,
  ttlSeconds = 30 * 24 * 3600,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await hmacForUser(secret, `user:${userId}:${exp}`);
  return `${userId}.${exp}.${sig}`;
}

export async function verifyUserToken(
  secret: string,
  token: string | undefined,
): Promise<string | null> {
  if (!token) return null;
  const dot1 = token.indexOf(".");
  if (dot1 <= 0) return null;
  const dot2 = token.indexOf(".", dot1 + 1);
  if (dot2 <= dot1) return null;
  const user = token.slice(0, dot1);
  const expStr = token.slice(dot1 + 1, dot2);
  const sig = token.slice(dot2 + 1);
  if (!/^[a-z0-9-]+$/.test(user)) return null;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const expected = await hmacForUser(secret, `user:${user}:${exp}`);
  return timingSafeEqual(expected, sig) ? user : null;
}

export function parseCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(/;\s*/);
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    if (p.slice(0, eq) === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return undefined;
}
