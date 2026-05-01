import { Hono } from "hono";
import {
  deleteInteraction,
  deleteInteractionCascade,
  getInteractionById,
  getInteractions,
  getStats,
  saveInteractionRow,
  ensureUserRow,
  getUserRow,
  getUserByEmail,
  setPendingPin,
  activatePendingPin,
  clearPendingPin,
  clearActivePin,
  recordFailedAttempt,
  resetFailedAttempts,
  setRecoveryToken,
  clearRecoveryToken,
  replaceActivePin,
} from "./db";
import type { UserRow } from "./db";
import {
  renderAdminList,
  renderAdminLogin,
  renderError,
  renderHome,
  renderList,
  renderWikiPage,
  renderWikiSyntheticPage,
  renderWikiNotFound,
  renderWikiSearch,
  renderLintReport,
  renderTimeline,
  renderMap,
  renderQuests,
  renderWikiAsk,
  renderCompare,
  renderQuiz,
  renderStudentHome,
  renderEncyclopediaIndex,
  renderKnowledgeGraph,
  renderLogin,
  renderSecurity,
  renderForgotPin,
  renderResetPin,
} from "./templates";
import type { SecurityState } from "./templates";
import {
  decodeDataUrl,
  normalizeId,
  nowISO,
  parseCookie,
  signSession,
  signUserToken,
  slugifyUserName,
  timingSafeEqual,
  verifySession,
  verifyUserToken,
} from "./util";
import type { Lang } from "./i18n";
import { SUPPORTED as LANGS, DEFAULT_LANG, tx } from "./i18n";
import {
  hashPin,
  verifyPin,
  isValidPin,
  generateToken,
  hashToken,
  verifyToken,
} from "./auth";
import { sendEmail, pinVerifyTemplate, pinRecoveryTemplate } from "./email";
import { analyseImage, availableModels } from "./ai/vision";
import { getAiProvider } from "./ai";
import { ingestExhibit } from "./wiki/ingest";
import { getWikiPage, getInboundLinks, getInboundExhibits, getCoOccurringEntities, wikiStats, searchWiki } from "./wiki/db";
import type { WikiPageRow } from "./wiki/db";
import { translateEntityPage, findStaleEntityPages } from "./wiki/translate";
import { buildIndexPage, buildLogPage } from "./wiki/index_render";
import { buildEncyclopedia } from "./wiki/encyclopedia";
import { buildKnowledgeGraph } from "./wiki/graph";
import { runLint } from "./wiki/lint";
import { getMapPoints, getTimelinePoints } from "./wiki/views";
import { evaluateQuests } from "./wiki/quests";
import { buildDashboard } from "./wiki/dashboard";
import { askWiki } from "./wiki/query";
import { comparePages } from "./wiki/compare";
import { generateQuiz } from "./wiki/quiz";

export type Bindings = {
  DB: D1Database;
  MEDIA: R2Bucket;
  AI?: any;                      // Cloudflare Workers AI binding
  PAGE_SIZE?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
  AI_PROVIDER?: string;
  AI_MODEL_CHAT?: string;
  DEEPSEEK_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  DEFAULT_USER_ID?: string;
  RESEND_API_KEY?: string;
  MUSEIQ_FROM_EMAIL?: string;
};

const ADMIN_COOKIE = "museiq_admin";
const ADMIN_TTL_SECONDS = 8 * 3600;
const USER_COOKIE = "museiq_user";
const USER_TTL_SECONDS = 30 * 24 * 3600;

const LANG_COOKIE = "museiq_lang";
const LANG_TTL_SECONDS = 365 * 24 * 3600;

// Hono context vars for the user identity, set by the auth middleware below.
type Variables = {
  currentUser: string;     // resolved per request — cookie if signed-in, else default
  isSignedIn: boolean;     // distinguishes "viewer = default" from "actually logged in"
  lang: Lang;              // user's preferred UI language (en | zh)
};

type InteractionRequest = {
  id?: string;
  response?: string;
  image?: string;
  date?: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// URL-based language routing. Paths starting with /cn, /tw, /en set the
// language and re-dispatch with the prefix stripped, so all downstream
// routes (and link helpers) only ever see the canonical (unprefixed) path
// plus c.var.lang.
//
// The trick to passing lang through the re-dispatch: we splice an extra
// `museiq_lang=<lang>` entry into the outgoing request's Cookie header,
// which the cookie middleware below picks up the same way it would for a
// real browser cookie. The user's actual cookie is also set on the OUTGOING
// response so the next non-prefixed visit remembers the choice.
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const m = url.pathname.match(/^\/(cn|tw|en)(\/|$)/);
  if (m) {
    const langMap: Record<string, Lang> = { cn: "zh-CN", tw: "zh-TW", en: "en" };
    const newLang = langMap[m[1]];
    // Strip the prefix
    const stripped = url.pathname.slice(m[0].endsWith("/") ? m[0].length - 1 : m[0].length) || "/";
    url.pathname = stripped;
    // Build a new request whose Cookie header reflects the URL-chosen lang
    const incomingCookie = c.req.raw.headers.get("cookie") || "";
    const cookieParts = incomingCookie
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith(`${LANG_COOKIE}=`));
    cookieParts.push(`${LANG_COOKIE}=${encodeURIComponent(newLang)}`);
    const newHeaders = new Headers(c.req.raw.headers);
    newHeaders.set("cookie", cookieParts.join("; "));
    const newReq = new Request(url.toString(), {
      method: c.req.raw.method,
      headers: newHeaders,
      body: ["GET", "HEAD"].includes(c.req.raw.method) ? undefined : c.req.raw.body,
      redirect: "manual",
    });
    const child = await app.fetch(newReq, c.env, c.executionCtx);
    // Persist the choice on the outgoing response so next no-prefix visit
    // remembers it.
    const headers = new Headers(child.headers);
    headers.append(
      "Set-Cookie",
      `${LANG_COOKIE}=${encodeURIComponent(newLang)}; Secure; SameSite=Lax; Path=/; Max-Age=${LANG_TTL_SECONDS}`,
    );
    return new Response(child.body, { status: child.status, headers });
  }
  await next();
});

// Resolve the current user once per request from the museiq_user cookie.
// Falls back to DEFAULT_USER_ID so anonymous browsing still sees content.
app.use("*", async (c, next) => {
  const secret = c.env.ADMIN_SESSION_SECRET || c.env.ADMIN_PASSWORD || "";
  let user = defaultUserId(c.env);
  let signedIn = false;
  if (secret) {
    const token = parseCookie(c.req.raw.headers.get("cookie"), USER_COOKIE);
    const verified = await verifyUserToken(secret, token);
    if (verified) {
      user = verified;
      signedIn = true;
    }
  }
  c.set("currentUser", user);
  c.set("isSignedIn", signedIn);

  // Language preference: cookie → fallback to default. The cookie is plain
  // (not signed) since lang choice isn't security-sensitive.
  const langRaw = parseCookie(c.req.raw.headers.get("cookie"), LANG_COOKIE);
  const lang: Lang = (langRaw && (LANGS as readonly string[]).includes(langRaw))
    ? (langRaw as Lang)
    : DEFAULT_LANG;
  c.set("lang", lang);
  await next();
});

// POST /api/lang { lang } — set the lang cookie. Used by the header toggle.
app.post("/api/lang", async (c) => {
  let body: { lang?: string } = {};
  try { body = await c.req.json(); } catch { /* allow empty */ }
  const lang = body.lang;
  if (typeof lang !== "string" || !(LANGS as readonly string[]).includes(lang)) {
    return c.json({ error: "lang must be one of " + LANGS.join(",") }, 400);
  }
  c.header(
    "Set-Cookie",
    `${LANG_COOKIE}=${encodeURIComponent(lang)}; Secure; SameSite=Lax; Path=/; Max-Age=${LANG_TTL_SECONDS}`,
  );
  return c.json({ ok: true, lang });
});

// ───────────────────────────── Pages ─────────────────────────────

app.get("/", async (c) => {
  try {
    const user = c.var.currentUser;
    const data = await buildDashboard(c.env.DB, user);
    return c.html(renderStudentHome({
      user, data, isSignedIn: c.var.isSignedIn, lang: c.var.lang,
    }));
  } catch (err) {
    console.error("home error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

app.get("/about", async (c) => {
  try {
    const stats = await getStats(c.env.DB, c.var.currentUser);
    return c.html(renderHome({ stats, ...chrome(c) }));
  } catch (err) {
    console.error("about error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

// /me alias to the student home
app.get("/me", (c) => c.redirect("/", 302));

// ───────────────────────────── Login ─────────────────────────────

app.get("/login", (c) => {
  const next = c.req.query("next") ?? "/";
  return c.html(renderLogin({ next, error: null, currentUser: c.var.currentUser, isSignedIn: c.var.isSignedIn, lang: c.var.lang }));
});

// Two-step login. POST /login with just `name` checks for an active PIN
// and either lets you in or re-renders with a PIN field. POST again with
// `name` + `pin` to verify and sign in. Lockout: 5 wrong PINs → 15 min.
app.post("/login", async (c) => {
  const secret = c.env.ADMIN_SESSION_SECRET || c.env.ADMIN_PASSWORD || "";
  if (!secret) return c.html(renderError("Auth secret not configured", chrome(c)), 500);
  const form = await c.req.formData().catch(() => null);
  const nameRaw = form?.get("name");
  const nextRaw = form?.get("next");
  const pinRaw  = form?.get("pin");
  const name = typeof nameRaw === "string" ? nameRaw : "";
  const next = typeof nextRaw === "string" && nextRaw.startsWith("/") ? nextRaw : "/";
  const slug = slugifyUserName(name);
  if (!slug) {
    return c.html(renderLogin({
      next, error: "Use letters, numbers, or hyphens (1–32 characters).",
      currentUser: c.var.currentUser, isSignedIn: c.var.isSignedIn, lang: c.var.lang,
      nameValue: name,
    }), 400);
  }

  const userRow = await getUserRow(c.env.DB, slug);
  const hasActivePin = !!(userRow?.pin_hash && userRow?.pin_salt && userRow?.pin_iterations);

  // Branch 1: no PIN — sign in immediately.
  if (!hasActivePin) {
    const token = await signUserToken(secret, slug, USER_TTL_SECONDS);
    c.header("Set-Cookie",
      `${USER_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${USER_TTL_SECONDS}`);
    return c.redirect(next, 303);
  }

  // Branch 2: PIN required.
  const lockedUntil = userRow?.locked_until ? Date.parse(userRow.locked_until) : 0;
  const lockedRemaining = lockedUntil > Date.now()
    ? Math.ceil((lockedUntil - Date.now()) / 1000)
    : 0;

  // No PIN provided yet — render the PIN form.
  if (typeof pinRaw !== "string" || pinRaw.length === 0) {
    return c.html(renderLogin({
      next, error: null,
      currentUser: c.var.currentUser, isSignedIn: c.var.isSignedIn, lang: c.var.lang,
      requirePin: true, nameValue: slug, lockedUntilSec: lockedRemaining,
    }));
  }

  // Locked? Re-render and refuse.
  if (lockedRemaining > 0) {
    return c.html(renderLogin({
      next, error: null,
      currentUser: c.var.currentUser, isSignedIn: c.var.isSignedIn, lang: c.var.lang,
      requirePin: true, nameValue: slug, lockedUntilSec: lockedRemaining,
    }), 429);
  }

  // Verify.
  const ok = await verifyPin(pinRaw, {
    hash: userRow!.pin_hash!,
    salt: userRow!.pin_salt!,
    iterations: userRow!.pin_iterations!,
  });
  if (!ok) {
    const newAttempts = (userRow?.failed_attempts ?? 0) + 1;
    const lockNow = newAttempts >= 5;
    const lockIso = lockNow ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    await recordFailedAttempt(c.env.DB, slug, lockIso);
    const remaining = lockNow ? 15 * 60 : 0;
    return c.html(renderLogin({
      next, error: lockNow ? null : tx("login.wrongPin", c.var.lang),
      currentUser: c.var.currentUser, isSignedIn: c.var.isSignedIn, lang: c.var.lang,
      requirePin: true, nameValue: slug, lockedUntilSec: remaining,
    }), 401);
  }

  // Success.
  await resetFailedAttempts(c.env.DB, slug);
  const token = await signUserToken(secret, slug, USER_TTL_SECONDS);
  c.header("Set-Cookie",
    `${USER_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${USER_TTL_SECONDS}`);
  return c.redirect(next, 303);
});

// JSON login for iOS. Same logic as POST /login but returns structured
// JSON instead of HTML/redirect. Cookies still travel via Set-Cookie.
app.post("/api/login", async (c) => {
  const secret = c.env.ADMIN_SESSION_SECRET || c.env.ADMIN_PASSWORD || "";
  if (!secret) return c.json({ error: "Auth secret not configured" }, 500);
  let body: { name?: unknown; pin?: unknown } = {};
  try { body = await c.req.json(); } catch { /* fall through */ }
  const name = typeof body.name === "string" ? body.name : "";
  const pin = typeof body.pin === "string" ? body.pin : "";
  const slug = slugifyUserName(name);
  if (!slug) return c.json({ error: "Use letters, numbers, or hyphens (1–32 characters)." }, 400);

  const userRow = await getUserRow(c.env.DB, slug);
  const hasActivePin = !!(userRow?.pin_hash && userRow?.pin_salt && userRow?.pin_iterations);

  if (!hasActivePin) {
    if (pin) {
      // PIN supplied but account doesn't have one — treat as ok, ignore PIN.
    }
    const token = await signUserToken(secret, slug, USER_TTL_SECONDS);
    c.header("Set-Cookie",
      `${USER_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${USER_TTL_SECONDS}`);
    return c.json({ ok: true, user: slug, requiresPin: false });
  }

  const lockedUntil = userRow?.locked_until ? Date.parse(userRow.locked_until) : 0;
  const lockedRemaining = lockedUntil > Date.now()
    ? Math.ceil((lockedUntil - Date.now()) / 1000)
    : 0;

  if (!pin) {
    return c.json({ ok: false, requiresPin: true, locked: lockedRemaining > 0, retryAfter: lockedRemaining });
  }
  if (lockedRemaining > 0) {
    return c.json({ ok: false, requiresPin: true, locked: true, retryAfter: lockedRemaining }, 429);
  }
  const ok = await verifyPin(pin, {
    hash: userRow!.pin_hash!,
    salt: userRow!.pin_salt!,
    iterations: userRow!.pin_iterations!,
  });
  if (!ok) {
    const newAttempts = (userRow?.failed_attempts ?? 0) + 1;
    const lockNow = newAttempts >= 5;
    const lockIso = lockNow ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    await recordFailedAttempt(c.env.DB, slug, lockIso);
    return c.json({
      ok: false, requiresPin: true,
      locked: lockNow,
      retryAfter: lockNow ? 15 * 60 : 0,
      error: "wrong_pin",
    }, 401);
  }
  await resetFailedAttempts(c.env.DB, slug);
  const token = await signUserToken(secret, slug, USER_TTL_SECONDS);
  c.header("Set-Cookie",
    `${USER_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${USER_TTL_SECONDS}`);
  return c.json({ ok: true, user: slug, requiresPin: false });
});

app.post("/logout", (c) => {
  c.header(
    "Set-Cookie",
    `${USER_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
  );
  return c.redirect("/login", 303);
});

// ───────────────────────────── /me/security ─────────────────────────────

app.get("/me/security", async (c) => {
  if (!c.var.isSignedIn) return c.redirect("/login?next=/me/security", 302);
  const row = await ensureUserRow(c.env.DB, c.var.currentUser);
  const flashKey = c.req.query("flash");
  const flash = flashFromKey(flashKey, c.var.lang);
  return c.html(renderSecurity({
    state: securityStateOf(row),
    flash,
    currentUser: c.var.currentUser,
    isSignedIn: c.var.isSignedIn,
    lang: c.var.lang,
  }));
});

app.post("/me/security/start-pin", async (c) => {
  if (!c.var.isSignedIn) return c.redirect("/login?next=/me/security", 302);
  const userId = c.var.currentUser;
  const form = await c.req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const pin = String(form.get("pin") || "");
  const pinConfirmRaw = form.get("pin_confirm");
  const reuseActive = form.get("reuse_active") === "1";

  if (!isValidEmail(email)) return c.redirect("/me/security?flash=bad_email", 303);

  // Email uniqueness — reject if another user owns this email.
  const taken = await getUserByEmail(c.env.DB, email);
  if (taken && taken.user_id !== userId) {
    return c.redirect("/me/security?flash=email_taken", 303);
  }

  // Two paths: brand-new PIN setup vs change-email-only (reuse current PIN).
  let pinPayload: { hash: string; salt: string; iterations: number };
  if (reuseActive) {
    // Verify the user knows the active PIN, then reuse the existing hash.
    const row = await ensureUserRow(c.env.DB, userId);
    if (!row.pin_hash || !row.pin_salt || !row.pin_iterations) {
      return c.redirect("/me/security?flash=bad_pin", 303);
    }
    const ok = await verifyPin(pin, { hash: row.pin_hash, salt: row.pin_salt, iterations: row.pin_iterations });
    if (!ok) return c.redirect("/me/security?flash=wrong_pin", 303);
    pinPayload = { hash: row.pin_hash, salt: row.pin_salt, iterations: row.pin_iterations };
  } else {
    if (!isValidPin(pin)) return c.redirect("/me/security?flash=bad_pin", 303);
    const pinConfirm = typeof pinConfirmRaw === "string" ? pinConfirmRaw : "";
    if (pin !== pinConfirm) return c.redirect("/me/security?flash=pin_mismatch", 303);
    pinPayload = await hashPin(pin);
  }

  const token = generateToken();
  const tokenHash = await hashToken(token);
  const ttlMin = 30;
  const expires = new Date(Date.now() + ttlMin * 60_000).toISOString();

  await setPendingPin(c.env.DB, userId, {
    pendingEmail: email,
    pendingPinHash: pinPayload.hash,
    pendingPinSalt: pinPayload.salt,
    pendingPinIterations: pinPayload.iterations,
    pendingTokenHash: tokenHash,
    pendingExpiresAt: expires,
  });

  const link = `${baseUrl(c.req.url)}/me/security/verify?u=${encodeURIComponent(userId)}&token=${token}`;
  const tpl = pinVerifyTemplate({ link, user: userId, ttlMinutes: ttlMin });
  try {
    await sendEmail(c.env, { to: email, ...tpl });
  } catch (e) {
    console.error("send pin verify email failed", errMsg(e));
    return c.redirect("/me/security?flash=email_failed", 303);
  }
  return c.redirect("/me/security?flash=pending", 303);
});

app.get("/me/security/verify", async (c) => {
  // Anyone with a valid link can land here — even if not signed in. Once
  // verified we still require the user to be the same as the link's user_id
  // before activating, so a stray click can't alter someone else's account.
  const userId = c.req.query("u") || "";
  const token = c.req.query("token") || "";
  if (!userId || !token) return c.html(renderError("Invalid verification link", chrome(c)), 400);
  const row = await getUserRow(c.env.DB, userId);
  if (!row || !row.pending_token_hash || !row.pending_expires_at) {
    return c.html(renderError("That verification link is invalid or has been used.", chrome(c)), 400);
  }
  if (Date.parse(row.pending_expires_at) < Date.now()) {
    await clearPendingPin(c.env.DB, userId);
    return c.html(renderError("That verification link has expired. Start over from the security page.", chrome(c)), 400);
  }
  const tokenOk = await verifyToken(token, row.pending_token_hash);
  if (!tokenOk) return c.html(renderError("That verification link is invalid or has been used.", chrome(c)), 400);

  const result = await activatePendingPin(c.env.DB, userId);
  if (!result.ok) {
    return c.html(renderError("Could not activate PIN.", chrome(c)), 500);
  }

  // If the user is already signed in as this account, send them back to
  // /me/security with a success flash. Otherwise to /login.
  if (c.var.isSignedIn && c.var.currentUser === userId) {
    return c.redirect("/me/security?flash=activated", 303);
  }
  return c.redirect(`/login?next=/me/security`, 303);
});

app.post("/me/security/cancel-pin", async (c) => {
  if (!c.var.isSignedIn) return c.redirect("/login?next=/me/security", 302);
  await clearPendingPin(c.env.DB, c.var.currentUser);
  return c.redirect("/me/security?flash=cancelled", 303);
});

app.post("/me/security/resend", async (c) => {
  if (!c.var.isSignedIn) return c.redirect("/login?next=/me/security", 302);
  const userId = c.var.currentUser;
  const row = await ensureUserRow(c.env.DB, userId);
  if (!row.pending_email) return c.redirect("/me/security", 303);

  // Reissue token (don't re-hash PIN; reuse existing pending payload).
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const ttlMin = 30;
  const expires = new Date(Date.now() + ttlMin * 60_000).toISOString();

  await c.env.DB.prepare(
    `UPDATE users SET pending_token_hash = ?2, pending_expires_at = ?3,
                       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE user_id = ?1`,
  ).bind(userId, tokenHash, expires).run();

  const link = `${baseUrl(c.req.url)}/me/security/verify?u=${encodeURIComponent(userId)}&token=${token}`;
  const tpl = pinVerifyTemplate({ link, user: userId, ttlMinutes: ttlMin });
  try {
    await sendEmail(c.env, { to: row.pending_email, ...tpl });
  } catch (e) {
    console.error("resend pin verify email failed", errMsg(e));
    return c.redirect("/me/security?flash=email_failed", 303);
  }
  return c.redirect("/me/security?flash=pending", 303);
});

app.post("/me/security/change-pin", async (c) => {
  if (!c.var.isSignedIn) return c.redirect("/login?next=/me/security", 302);
  const userId = c.var.currentUser;
  const form = await c.req.formData();
  const current = String(form.get("current_pin") || "");
  const next = String(form.get("new_pin") || "");
  const confirm = String(form.get("new_pin_confirm") || "");

  if (!isValidPin(next)) return c.redirect("/me/security?flash=bad_pin", 303);
  if (next !== confirm) return c.redirect("/me/security?flash=pin_mismatch", 303);

  const row = await ensureUserRow(c.env.DB, userId);
  if (!row.pin_hash || !row.pin_salt || !row.pin_iterations) {
    return c.redirect("/me/security?flash=bad_pin", 303);
  }
  const ok = await verifyPin(current, { hash: row.pin_hash, salt: row.pin_salt, iterations: row.pin_iterations });
  if (!ok) return c.redirect("/me/security?flash=wrong_pin", 303);

  const newHash = await hashPin(next);
  await replaceActivePin(c.env.DB, userId, newHash);
  return c.redirect("/me/security?flash=changed", 303);
});

app.post("/me/security/disable-pin", async (c) => {
  if (!c.var.isSignedIn) return c.redirect("/login?next=/me/security", 302);
  const userId = c.var.currentUser;
  const form = await c.req.formData();
  const pin = String(form.get("pin") || "");
  const row = await ensureUserRow(c.env.DB, userId);
  if (!row.pin_hash || !row.pin_salt || !row.pin_iterations) {
    return c.redirect("/me/security", 303);
  }
  const ok = await verifyPin(pin, { hash: row.pin_hash, salt: row.pin_salt, iterations: row.pin_iterations });
  if (!ok) return c.redirect("/me/security?flash=wrong_pin", 303);
  await clearActivePin(c.env.DB, userId);
  return c.redirect("/me/security?flash=disabled", 303);
});

// ───────────────────────────── Forgot / Reset PIN ─────────────────────────────

app.get("/login/forgot", (c) => {
  const nameValue = c.req.query("name") || "";
  return c.html(renderForgotPin({
    nameValue, currentUser: c.var.currentUser, isSignedIn: c.var.isSignedIn, lang: c.var.lang,
  }));
});

app.post("/login/forgot", async (c) => {
  const form = await c.req.formData();
  const name = String(form.get("name") || "");
  const slug = slugifyUserName(name);
  // Always render success message so we don't leak which names have email.
  const flash = { kind: "success" as const, message: tx("forgot.flash.sent", c.var.lang) };
  if (!slug) {
    return c.html(renderForgotPin({
      nameValue: name, flash, currentUser: c.var.currentUser, isSignedIn: c.var.isSignedIn, lang: c.var.lang,
    }));
  }
  const row = await getUserRow(c.env.DB, slug);
  if (row && row.email && row.pin_hash) {
    const token = generateToken();
    const tokenHash = await hashToken(token);
    const ttlMin = 60;
    const expires = new Date(Date.now() + ttlMin * 60_000).toISOString();
    await setRecoveryToken(c.env.DB, slug, tokenHash, expires);
    const link = `${baseUrl(c.req.url)}/login/reset?u=${encodeURIComponent(slug)}&token=${token}`;
    const tpl = pinRecoveryTemplate({ link, user: slug, ttlMinutes: ttlMin });
    try {
      await sendEmail(c.env, { to: row.email, ...tpl });
    } catch (e) {
      console.error("recovery email failed", errMsg(e));
      // Still show generic success — better not to leak info.
    }
  }
  return c.html(renderForgotPin({
    nameValue: name, flash, currentUser: c.var.currentUser, isSignedIn: c.var.isSignedIn, lang: c.var.lang,
  }));
});

app.get("/login/reset", async (c) => {
  const userId = c.req.query("u") || "";
  const token = c.req.query("token") || "";
  if (!userId || !token) return c.html(renderError("Invalid reset link", chrome(c)), 400);
  const row = await getUserRow(c.env.DB, userId);
  if (!row || !row.recovery_token_hash || !row.recovery_expires_at) {
    return c.html(renderError("That reset link is invalid or has expired.", chrome(c)), 400);
  }
  if (Date.parse(row.recovery_expires_at) < Date.now()) {
    await clearRecoveryToken(c.env.DB, userId);
    return c.html(renderError("That reset link has expired.", chrome(c)), 400);
  }
  const ok = await verifyToken(token, row.recovery_token_hash);
  if (!ok) return c.html(renderError("That reset link is invalid or has expired.", chrome(c)), 400);
  return c.html(renderResetPin({
    token, userName: userId,
    currentUser: c.var.currentUser, isSignedIn: c.var.isSignedIn, lang: c.var.lang,
  }));
});

app.post("/login/reset", async (c) => {
  const form = await c.req.formData();
  const token = String(form.get("token") || "");
  const pin = String(form.get("pin") || "");
  const confirm = String(form.get("pin_confirm") || "");
  if (!isValidPin(pin) || pin !== confirm) {
    return c.html(renderError("PIN must be 6 digits and match.", chrome(c)), 400);
  }
  // We don't have user_id in the form, only the token. Search users by
  // token hash. (Token is single-use and rare so this is fine.)
  const tokenHash = await hashToken(token);
  const row = await c.env.DB.prepare(
    "SELECT * FROM users WHERE recovery_token_hash = ?1 LIMIT 1",
  ).bind(tokenHash).first<UserRow>();
  if (!row || !row.recovery_expires_at) {
    return c.html(renderError("That reset link is invalid or has expired.", chrome(c)), 400);
  }
  if (Date.parse(row.recovery_expires_at) < Date.now()) {
    await clearRecoveryToken(c.env.DB, row.user_id);
    return c.html(renderError("That reset link has expired.", chrome(c)), 400);
  }
  const newHash = await hashPin(pin);
  await replaceActivePin(c.env.DB, row.user_id, newHash);
  // Sign them in as a courtesy.
  const secret = c.env.ADMIN_SESSION_SECRET || c.env.ADMIN_PASSWORD || "";
  if (secret) {
    const sessionToken = await signUserToken(secret, row.user_id, USER_TTL_SECONDS);
    c.header("Set-Cookie",
      `${USER_COOKIE}=${encodeURIComponent(sessionToken)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${USER_TTL_SECONDS}`);
  }
  return c.redirect("/me/security?flash=changed", 303);
});

// ─── helpers used by the security routes ───

function isValidEmail(s: string): boolean {
  return typeof s === "string" && s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function baseUrl(reqUrl: string): string {
  const u = new URL(reqUrl);
  return `${u.protocol}//${u.host}`;
}

function securityStateOf(row: UserRow): SecurityState {
  if (row.pin_hash && row.email) {
    return { kind: "active", email: row.email, pinSetAt: row.pin_set_at };
  }
  if (row.pending_email && row.pending_expires_at && Date.parse(row.pending_expires_at) > Date.now()) {
    return { kind: "pending", pendingEmail: row.pending_email, expiresAtIso: row.pending_expires_at };
  }
  return { kind: "none" };
}

function flashFromKey(key: string | undefined, lang: Lang): { kind: "success" | "error"; message: string } | null {
  if (!key) return null;
  const map: Record<string, { kind: "success" | "error"; key: string }> = {
    pending:        { kind: "success", key: "security.flash.pending" },
    activated:      { kind: "success", key: "security.flash.activated" },
    cancelled:      { kind: "success", key: "security.flash.cancelled" },
    disabled:       { kind: "success", key: "security.flash.disabled" },
    changed:        { kind: "success", key: "security.flash.changed" },
    bad_email:      { kind: "error",   key: "security.flash.badEmail" },
    bad_pin:        { kind: "error",   key: "security.flash.badPin" },
    pin_mismatch:   { kind: "error",   key: "security.flash.pinMismatch" },
    wrong_pin:      { kind: "error",   key: "security.flash.wrongPin" },
    email_taken:    { kind: "error",   key: "security.flash.emailTaken" },
    token_invalid:  { kind: "error",   key: "security.flash.tokenInvalid" },
    email_failed:   { kind: "error",   key: "security.flash.emailFailed" },
  };
  const entry = map[key];
  if (!entry) return null;
  return { kind: entry.kind, message: tx(entry.key, lang) };
}

app.get("/interactions/view", async (c) => {
  try {
    const pageSize = parsePositiveInt(c.env.PAGE_SIZE, 12);
    const page = Math.max(1, parsePositiveInt(c.req.query("page"), 1));
    const q = (c.req.query("q") ?? "").trim();
    const { rows, count } = await getInteractions(c.env.DB, {
      userId: c.var.currentUser,
      page,
      pageSize,
      query: q,
    });
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    return c.html(
      renderList({
        interactions: rows,
        page,
        totalPages,
        count,
        query: q,
        hasPrev: page > 1,
        hasNext: page < totalPages,
        ...chrome(c),
      }),
    );
  } catch (err) {
    console.error("list error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

// ───────────────────────────── Media (R2) ─────────────────────────────

app.get("/media/*", async (c) => {
  const key = decodeURIComponent(c.req.path.substring("/media/".length));
  if (!key) return c.notFound();

  const obj = await c.env.MEDIA.get(key);
  if (!obj) return c.notFound();

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", guessContentType(key));
  }
  return new Response(obj.body, { headers });
});

// ───────────────────────────── API ─────────────────────────────

app.get("/api/me", (c) =>
  c.json({ user: c.var.currentUser, signedIn: c.var.isSignedIn })
);

app.get("/api/health", async (c) => {
  try {
    const wiki = await wikiStats(c.env.DB, c.var.currentUser);
    return c.json({ status: "ok", wiki, user: c.var.currentUser, signedIn: c.var.isSignedIn });
  } catch (e) {
    return c.json({ status: "ok" });
  }
});

app.get("/api/stats", async (c) => {
  try {
    return c.json(await getStats(c.env.DB, c.var.currentUser));
  } catch (err) {
    return c.json({ error: errMsg(err) }, 500);
  }
});

app.get("/api/interactions/list", async (c) => {
  const pageSize = 10;
  const page = Math.max(1, parsePositiveInt(c.req.query("page"), 1));
  const q = (c.req.query("q") ?? "").trim();
  const { rows, count } = await getInteractions(c.env.DB, {
    userId: c.var.currentUser,
    page,
    pageSize,
    query: q,
  });
  return c.json({
    interactions: rows,
    page,
    totalPages: Math.max(1, Math.ceil(count / pageSize)),
    count,
  });
});

// POST: iOS submits a JSON array of interactions. Contract preserved
// from the original Go backend — every field name and shape is identical.
app.post("/api/interactions/list", async (c) => {
  let body: InteractionRequest[];
  try {
    const raw = await c.req.json();
    if (!Array.isArray(raw)) throw new Error("expected JSON array");
    body = raw as InteractionRequest[];
  } catch (err) {
    console.warn("bad request body", err);
    return c.json({ error: "Invalid request format" }, 400);
  }

  let saved = 0;
  const errors: string[] = [];
  const ingestIds: string[] = [];

  await Promise.all(
    body.map(async (req) => {
      try {
        if (!req.image || !req.image.startsWith("data:image")) {
          throw new Error("invalid base64 image format");
        }
        const { bytes, contentType, ext } = decodeDataUrl(req.image);
        const id = normalizeId(req.id ?? "");
        const key = `images/${id}.${ext}`;

        await c.env.MEDIA.put(key, bytes, {
          httpMetadata: { contentType },
        });

        const date = nowISO();
        await saveInteractionRow(c.env.DB, {
          id,
          response: req.response ?? "",
          image: key,
          date,
        }, c.var.currentUser);
        saved++;
        ingestIds.push(id);
      } catch (err) {
        const msg = errMsg(err);
        console.error("save interaction failed", msg);
        errors.push(msg);
      }
    }),
  );

  // Fire-and-forget AI ingest. Errors land in interactions.analysis_error.
  if (ingestIds.length && c.env.DEEPSEEK_API_KEY) {
    c.executionCtx.waitUntil(
      ingestBatch(c.env, ingestIds).catch((e) =>
        console.error("background ingest failed", errMsg(e)),
      ),
    );
  }

  if (errors.length) {
    return c.json(
      {
        message: "Some interactions could not be saved",
        saved,
        errors,
      },
      206,
    );
  }
  return c.json(
    {
      message: "All interactions synced successfully!",
      saved,
    },
    201,
  );
});

// User-scoped delete: only removes captures owned by the signed-in user.
// Accepts either form-encoded `ids[]` (browser form post) or JSON
// `{ ids: string[] }` (iOS / fetch). On form posts, redirects back to
// the originating page so we land where we came from.
app.post("/api/interactions/delete", async (c) => {
  if (!c.var.isSignedIn) {
    return c.json({ error: "Sign in required" }, 401);
  }
  const userId = c.var.currentUser;

  let ids: string[] = [];
  let isJson = false;
  let returnTo: string | null = null;

  const ct = c.req.header("content-type") || "";
  if (ct.includes("application/json")) {
    isJson = true;
    try {
      const body = await c.req.json<{ ids?: unknown }>();
      if (Array.isArray(body.ids)) {
        ids = body.ids.filter((v): v is string => typeof v === "string" && v.length > 0);
      }
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
  } else {
    const form = await c.req.formData().catch(() => null);
    if (form) {
      ids = form
        .getAll("ids")
        .filter((v): v is string => typeof v === "string" && v.length > 0);
      const rt = form.get("return_to");
      if (typeof rt === "string" && rt.startsWith("/")) returnTo = rt;
    }
  }

  if (ids.length === 0) {
    if (isJson) return c.json({ error: "No ids provided" }, 400);
    return c.redirect(returnTo || "/interactions/view", 303);
  }

  let deleted = 0;
  const errors: string[] = [];
  for (const id of ids) {
    try {
      const row = await deleteInteractionCascade(c.env.DB, userId, id);
      if (!row) continue;            // not owned, or already gone — skip silently
      if (row.image) {
        try { await c.env.MEDIA.delete(row.image); }
        catch (e) { console.warn("r2 delete failed", row.image, errMsg(e)); }
      }
      deleted++;
    } catch (e) {
      errors.push(errMsg(e));
    }
  }

  if (isJson) {
    return c.json({ deleted, errors });
  }
  return c.redirect(returnTo || "/interactions/view", 303);
});

// ───────────────────────────── /api/analyze ─────────────────────────────
//
// Multi-provider vision analyse. iOS picks a model id; this dispatches:
//   "@cf/..."     → Cloudflare Workers AI binding (free-tier eligible)
//   "claude-..."  → Anthropic Messages API (ANTHROPIC_API_KEY)
//   "gemini-..."  → Google Generative Language API (GEMINI_API_KEY)
//
// Auth required so we don't proxy random users' inference traffic on the
// owner's CF/Anthropic/Gemini quota.

app.get("/api/analyze/models", (c) => {
  const list = availableModels(c.env);
  return c.json({ models: list });
});

app.post("/api/analyze", async (c) => {
  if (!c.var.isSignedIn) {
    return c.json({ error: "Sign in required" }, 401);
  }
  let body: { model?: unknown; prompt?: unknown; image?: unknown; mediaType?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const model = typeof body.model === "string" ? body.model : "";
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const imageRaw = typeof body.image === "string" ? body.image : "";
  const mediaType = typeof body.mediaType === "string" ? body.mediaType : undefined;

  if (!model || !prompt || !imageRaw) {
    return c.json({ error: "model, prompt, image are required" }, 400);
  }

  // Strip data URL prefix if present.
  const m = imageRaw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const imageBase64 = m ? m[2] : imageRaw;
  const detectedMediaType = m ? m[1] : (mediaType ?? "image/jpeg");

  try {
    const result = await analyseImage(c.env, {
      model,
      prompt,
      imageBase64,
      mediaType: detectedMediaType,
      maxTokens: 2000,
    });
    return c.json({
      response: result.text,
      model: result.model,
      provider: result.provider,
      latency_ms: result.latencyMs,
    });
  } catch (e) {
    console.error("analyse failed", errMsg(e));
    return c.json({ error: errMsg(e) }, 502);
  }
});

// ───────────────────────────── Admin ─────────────────────────────

app.get("/admin", async (c) => {
  if (await isAdminAuthed(c.env, c.req.raw)) {
    return c.redirect("/admin/photos", 302);
  }
  return c.html(renderAdminLogin());
});

app.post("/admin/login", async (c) => {
  const adminPassword = c.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return c.html(
      renderAdminLogin({
        error: "ADMIN_PASSWORD is not configured. Run: wrangler secret put ADMIN_PASSWORD",
      }),
      500,
    );
  }
  const form = await c.req.formData().catch(() => null);
  const password = form?.get("password");
  if (typeof password !== "string" || !timingSafeEqual(password, adminPassword)) {
    return c.html(renderAdminLogin({ error: "Incorrect password." }), 401);
  }
  const secret = sessionSecret(c.env);
  const token = await signSession(secret, ADMIN_TTL_SECONDS);
  c.header(
    "Set-Cookie",
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=${ADMIN_TTL_SECONDS}`,
  );
  return c.redirect("/admin/photos", 302);
});

app.post("/admin/logout", (c) => {
  c.header(
    "Set-Cookie",
    `${ADMIN_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0`,
  );
  return c.redirect("/admin", 302);
});

app.get("/admin/photos", async (c) => {
  if (!(await isAdminAuthed(c.env, c.req.raw))) return c.redirect("/admin", 302);
  try {
    const pageSize = parsePositiveInt(c.env.PAGE_SIZE, 12);
    const page = Math.max(1, parsePositiveInt(c.req.query("page"), 1));
    const q = (c.req.query("q") ?? "").trim();
    // Admin is scoped to the default tenant (demo). Cross-user admin
    // would need a user-picker; out of scope for now.
    const { rows, count } = await getInteractions(c.env.DB, {
      userId: defaultUserId(c.env),
      page,
      pageSize,
      query: q,
    });
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    return c.html(
      renderAdminList({
        interactions: rows,
        page,
        totalPages,
        count,
        query: q,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      }),
    );
  } catch (err) {
    console.error("admin list error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

app.post("/admin/delete", async (c) => {
  if (!(await isAdminAuthed(c.env, c.req.raw))) return c.redirect("/admin", 302);
  try {
    const form = await c.req.formData();
    const ids = form
      .getAll("ids")
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    const pageRaw = form.get("page");
    const qRaw = form.get("q");
    const requestedPage = Math.max(
      1,
      parsePositiveInt(typeof pageRaw === "string" ? pageRaw : undefined, 1),
    );
    const query = typeof qRaw === "string" ? qRaw.trim() : "";

    for (const id of ids) {
      const row = await getInteractionById(c.env.DB, id);
      if (!row) continue;
      // Best-effort R2 delete; even if it fails we still drop the DB row.
      try {
        if (row.image) await c.env.MEDIA.delete(row.image);
      } catch (e) {
        console.error("r2 delete failed", row.image, errMsg(e));
      }
      await deleteInteraction(c.env.DB, id);
    }

    // Clamp page to last valid page after deletion so the user lands on a
    // page that still has content (or page 1 if the archive is empty).
    const pageSize = parsePositiveInt(c.env.PAGE_SIZE, 12);
    const { count } = await getInteractions(c.env.DB, {
      userId: defaultUserId(c.env),
      page: 1,
      pageSize: 1,
      query,
    });
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    const page = Math.min(requestedPage, totalPages);

    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (query) params.set("q", query);
    const qs = params.toString();
    return c.redirect(`/admin/photos${qs ? `?${qs}` : ""}`, 303);
  } catch (err) {
    console.error("admin delete error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

// ───────────────────────────── Wiki render ─────────────────────────────

// Wiki compare — register before the catch-all.
app.get("/wiki/:user/_compare", async (c) => {
  const user = c.req.param("user");
  const a = (c.req.query("a") ?? "").trim();
  const b = (c.req.query("b") ?? "").trim();
  let result: Awaited<ReturnType<typeof comparePages>> | null = null;
  let error: string | null = null;
  if (a && b) {
    if (!c.env.DEEPSEEK_API_KEY) error = "AI provider not configured.";
    else {
      try {
        const ai = getAiProvider(c.env);
        result = await comparePages(ai, c.env.DB, { userId: user, pathA: a, pathB: b });
      } catch (err) {
        error = errMsg(err);
      }
    }
  }
  return c.html(renderCompare({ user, pathA: a, pathB: b, result, error, ...chrome(c) }));
});

// Wiki quiz — register before the catch-all.
app.get("/wiki/:user/_quiz", async (c) => {
  const user = c.req.param("user");
  const path = c.req.query("p");
  if (!path) return c.html(renderError("missing ?p=<wiki path>", chrome(c)), 400);
  if (!c.env.DEEPSEEK_API_KEY) return c.html(renderError("AI provider not configured", chrome(c)), 500);
  try {
    const ai = getAiProvider(c.env);
    const quiz = await generateQuiz(ai, c.env.DB, { userId: user, path });
    return c.html(renderQuiz({ user, path, quiz, ...chrome(c) }));
  } catch (err) {
    console.error("quiz error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

// Wiki ask — MUST register before the /wiki/:user/* catch-all.
app.get("/wiki/:user/_ask", async (c) => {
  const user = c.req.param("user");
  const question = (c.req.query("q") ?? "").trim();
  const contextPath = c.req.query("about") ?? undefined;
  let answer: Awaited<ReturnType<typeof askWiki>> | null = null;
  let error: string | null = null;
  if (question) {
    if (!c.env.DEEPSEEK_API_KEY) {
      error = "AI provider not configured.";
    } else {
      try {
        const ai = getAiProvider(c.env);
        answer = await askWiki(ai, c.env.DB, { userId: user, question, contextPath });
      } catch (err) {
        console.error("ask error", err);
        error = errMsg(err);
      }
    }
  }
  return c.html(renderWikiAsk({ user, question, contextPath, answer, error, ...chrome(c) }));
});

app.post("/api/wiki/:user/ask", async (c) => {
  const user = c.req.param("user");
  if (!c.env.DEEPSEEK_API_KEY) return c.json({ error: "AI provider not configured" }, 503);
  let body: { question?: string; context_path?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "expected JSON {question, context_path?}" }, 400);
  }
  if (!body.question || typeof body.question !== "string") {
    return c.json({ error: "question required" }, 400);
  }
  try {
    const ai = getAiProvider(c.env);
    const out = await askWiki(ai, c.env.DB, {
      userId: user,
      question: body.question,
      contextPath: body.context_path,
    });
    return c.json({
      answer_md: out.answerMd,
      citations: out.citations,
      shortlisted: out.shortlistedPaths,
    });
  } catch (err) {
    console.error("ask api error", err);
    return c.json({ error: errMsg(err) }, 500);
  }
});

// Wiki search — MUST register before the /wiki/:user/* catch-all.
app.get("/wiki/:user/_search", async (c) => {
  const user = c.req.param("user");
  const q = (c.req.query("q") ?? "").trim();
  let hits: Awaited<ReturnType<typeof searchWiki>> = [];
  if (q) {
    try {
      hits = await searchWiki(c.env.DB, user, q, 30);
    } catch (e) {
      console.error("search error", e);
    }
  }
  return c.html(renderWikiSearch({ user, query: q, hits, ...chrome(c) }));
});

// Convenience: /wiki/:user → index page
app.get("/wiki/:user", async (c) => {
  const user = c.req.param("user");
  return c.redirect(`/wiki/${encodeURIComponent(user)}/index`, 302);
});

app.get("/wiki/:user/*", async (c) => {
  const user = c.req.param("user");
  const rest = c.req.path.replace(/^\/wiki\/[^/]+\//, "").replace(/\/$/, "");
  const path = rest || "index";
  try {
    // Special live-rendered views.
    if (path === "index") {
      const enc = await buildEncyclopedia(c.env.DB, user);
      return c.html(renderEncyclopediaIndex({ user, data: enc, ...chrome(c) }));
    }
    if (path === "log") {
      const built = await buildLogPage(c.env.DB, user);
      return c.html(renderWikiSyntheticPage({ user, path, kind: "log", title: built.title, body: built.body, ...chrome(c) }));
    }
    const page = await getWikiPage(c.env.DB, user, path);
    if (!page) {
      return c.html(renderWikiNotFound({ user, path, ...chrome(c) }), 404);
    }
    // For exhibit pages, look up the captured image so we can render it.
    let imageSrc: string | null = null;
    if (page.kind === "exhibit" || page.kind === "exhibit_unknown") {
      const exhibitId = path.replace(/^exhibits\//, "");
      const row = await getInteractionById(c.env.DB, exhibitId);
      if (row) imageSrc = "/media/" + row.image.split("/").map(encodeURIComponent).join("/");
    }
    // Inbound links + photos + 2-hop co-occurring entities — only useful
    // on entity pages.
    const isEntity = page.kind !== "exhibit" && page.kind !== "exhibit_unknown";
    const [inbound, photos, related] = isEntity
      ? await Promise.all([
          getInboundLinks(c.env.DB, user, path, 30),
          getInboundExhibits(c.env.DB, user, path, 60),
          getCoOccurringEntities(c.env.DB, user, path, 12),
        ])
      : [[], [], []];
    return c.html(renderWikiPage({ user, page, imageSrc, inbound, photos, related, ...chrome(c) }));
  } catch (err) {
    console.error("wiki render error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

// ───────────────────────────── /me views (timeline, map) ───────────────

app.get("/me/timeline", async (c) => {
  const user = c.var.currentUser;
  try {
    const points = await getTimelinePoints(c.env.DB, user);
    return c.html(renderTimeline({ user, points, ...chrome(c) }));
  } catch (err) {
    console.error("timeline error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

app.get("/me/graph", async (c) => {
  const user = c.var.currentUser;
  try {
    const data = await buildKnowledgeGraph(c.env.DB, user, { maxNodes: 500 });
    return c.html(renderKnowledgeGraph({ user, data, ...chrome(c) }));
  } catch (err) {
    console.error("graph error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

app.get("/me/quests", async (c) => {
  const user = c.var.currentUser;
  try {
    const quests = await evaluateQuests(c.env.DB, user);
    return c.html(renderQuests({ user, quests, ...chrome(c) }));
  } catch (err) {
    console.error("quests error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

app.get("/me/map", async (c) => {
  const user = c.var.currentUser;
  try {
    const points = await getMapPoints(c.env.DB, user);
    return c.html(renderMap({ user, points, ...chrome(c) }));
  } catch (err) {
    console.error("map error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

// ───────────────────────────── Admin: ingest ─────────────────────────────

app.post("/admin/ingest/:id", async (c) => {
  if (!(await isAdminAuthed(c.env, c.req.raw))) return c.redirect("/admin", 302);
  const id = c.req.param("id");
  if (!id) return c.redirect("/admin/photos", 302);
  if (!c.env.DEEPSEEK_API_KEY) {
    return c.html(renderError("DEEPSEEK_API_KEY not configured"), 500);
  }
  try {
    await runSingleIngest(c.env, id);
    return c.redirect(`/wiki/${encodeURIComponent(c.var.currentUser)}/exhibits/${encodeURIComponent(id)}`, 302);
  } catch (err) {
    console.error("admin ingest error", err);
    // Make sure the row never gets stuck at 'running' on an unhandled throw.
    try {
      await c.env.DB
        .prepare("UPDATE interactions SET analysis_status = 'failed', analysis_error = ?2, analyzed_at = ?3 WHERE id = ?1 AND analysis_status = 'running'")
        .bind(id, errMsg(err).slice(0, 800), new Date().toISOString())
        .run();
    } catch { /* swallow */ }
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

app.get("/admin/lint/:user", async (c) => {
  if (!(await isAdminAuthed(c.env, c.req.raw))) return c.redirect("/admin", 302);
  const user = c.req.param("user") || defaultUserId(c.env);
  try {
    const findings = await runLint(c.env.DB, user);
    return c.html(renderLintReport({ user, findings }));
  } catch (err) {
    console.error("lint error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

app.post("/admin/ingest-all-pending", async (c) => {
  if (!(await isAdminAuthed(c.env, c.req.raw))) return c.redirect("/admin", 302);
  if (!c.env.DEEPSEEK_API_KEY) {
    return c.html(renderError("DEEPSEEK_API_KEY not configured"), 500);
  }
  try {
    const res = await c.env.DB
      .prepare("SELECT id FROM interactions WHERE analysis_status IN ('pending','failed') ORDER BY date DESC LIMIT 500")
      .all<{ id: string }>();
    const ids = (res.results ?? []).map((r) => r.id);
    if (ids.length === 0) return c.redirect("/admin/photos", 302);
    c.executionCtx.waitUntil(
      ingestBatch(c.env, ids).catch((e) =>
        console.error("backfill ingest failed", errMsg(e)),
      ),
    );
    return c.html(renderError(`Queued ${ids.length} items for AI ingest. Refresh /admin/photos to watch status chips flip from pending → running → done. Estimated ~${Math.ceil(ids.length * 4 / 60)} min.`), 200);
  } catch (err) {
    console.error("ingest-all error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

app.post("/admin/ingest-batch", async (c) => {
  if (!(await isAdminAuthed(c.env, c.req.raw))) return c.redirect("/admin", 302);
  if (!c.env.DEEPSEEK_API_KEY) {
    return c.html(renderError("DEEPSEEK_API_KEY not configured"), 500);
  }
  try {
    const form = await c.req.formData();
    const ids = form
      .getAll("ids")
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    const pageRaw = form.get("page");
    const qRaw = form.get("q");
    const page = Math.max(1, parsePositiveInt(typeof pageRaw === "string" ? pageRaw : undefined, 1));
    const query = typeof qRaw === "string" ? qRaw.trim() : "";

    if (ids.length === 0) return c.redirect("/admin/photos", 302);

    // Mark all as pending up front, then drain in the background.
    for (const id of ids) {
      await c.env.DB
        .prepare("UPDATE interactions SET analysis_status = 'pending' WHERE id = ?1")
        .bind(id)
        .run();
    }
    c.executionCtx.waitUntil(
      ingestBatch(c.env, ids).catch((e) =>
        console.error("admin batch ingest failed", errMsg(e)),
      ),
    );

    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (query) params.set("q", query);
    const qs = params.toString();
    return c.redirect(`/admin/photos${qs ? `?${qs}` : ""}`, 303);
  } catch (err) {
    console.error("admin batch error", err);
    return c.html(renderError(errMsg(err), chrome(c)), 500);
  }
});

// ───────────────────────────── 404 ─────────────────────────────

app.notFound((c) =>
  c.html(renderError("Page not found."), 404),
);

app.onError((err, c) => {
  console.error("unhandled", err);
  return c.html(renderError(errMsg(err)), 500);
});

// ───────────────────────────── Cron handler ─────────────────────────────
// Drains a small batch of pending/failed ingests on each tick. Configured
// in wrangler.toml [triggers]. Each tick runs sequentially; the platform
// gives scheduled handlers their own CPU budget separate from request
// handlers, so the long backfill no longer competes with user traffic.

const CRON_BATCH_SIZE = 8;

async function scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
  if (!env.DEEPSEEK_API_KEY) {
    console.log("cron: DEEPSEEK_API_KEY not set, skipping");
    return;
  }
  try {
    // Pick up pending/failed rows first; once those are exhausted, drain
    // rows whose analysis_version is older than the current — these are
    // the ones that need re-ingest for new bilingual / schema-bumped output.
    const CURRENT = 4; // matches ANALYSIS_VERSION in src/ai/prompts.ts
    let res = await env.DB
      .prepare(
        "SELECT id FROM interactions WHERE analysis_status IN ('pending','failed') ORDER BY date DESC LIMIT ?1",
      )
      .bind(CRON_BATCH_SIZE)
      .all<{ id: string }>();
    if (!res.results?.length) {
      res = await env.DB
        .prepare(
          "SELECT id FROM interactions WHERE analysis_status = 'done' AND COALESCE(analysis_version, 0) < ?1 ORDER BY date DESC LIMIT ?2",
        )
        .bind(CURRENT, CRON_BATCH_SIZE)
        .all<{ id: string }>();
    }
    const ids = (res.results ?? []).map((r) => r.id);
    if (ids.length) {
      console.log("cron: draining", ids.length, "exhibits");
      ctx.waitUntil(ingestBatch(env, ids));
      return;
    }
    // Once all exhibits are at v4, switch to draining stale entity pages
    // (concept/place/period/etc) that survived previous re-ingests without
    // being themselves bilingualized — these don't go through the full
    // exhibit ingest, just one focused translation call each.
    const userId = defaultUserId(env);
    const stale = await findStaleEntityPages(env.DB, userId, CRON_BATCH_SIZE);
    if (!stale.length) {
      console.log("cron: nothing to ingest or translate");
      return;
    }
    console.log("cron: translating", stale.length, "stale entity pages");
    ctx.waitUntil(translateBatch(env, stale));
  } catch (e) {
    console.error("cron error", errMsg(e));
  }
}

async function translateBatch(env: Bindings, pages: WikiPageRow[]): Promise<void> {
  const ai = getAiProvider(env);
  for (const page of pages) {
    try {
      const r = await translateEntityPage(ai, env.DB, page);
      if (!r.ok) console.error("translate failed", page.path, r.error);
    } catch (e) {
      console.error("translate exception", page.path, errMsg(e));
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

export default {
  fetch: app.fetch,
  scheduled,
};

// ───────────────────────────── helpers ─────────────────────────────

function parsePositiveInt(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return String(e);
  } catch {
    return "unknown error";
  }
}

function defaultUserId(env: Bindings): string {
  return env.DEFAULT_USER_ID || "default";
}

// Pull the per-request chrome opts every renderXXX wants so its layout()
// gets the right user / language / signed-in indicator on every page.
function chrome(c: { var: Variables }): { currentUser: string; isSignedIn: boolean; lang: Lang } {
  return { currentUser: c.var.currentUser, isSignedIn: c.var.isSignedIn, lang: c.var.lang };
}

async function runSingleIngest(env: Bindings, id: string): Promise<void> {
  const ai = getAiProvider(env);
  const row = await getInteractionById(env.DB, id);
  if (!row) throw new Error(`interaction not found: ${id}`);
  await ingestExhibit(ai, env.DB, {
    exhibitId: id,
    userId: defaultUserId(env),
    description: row.response ?? "",
    capturedAt: row.date ?? new Date().toISOString(),
    imageHint: row.image ?? undefined,
  });
}

async function ingestBatch(env: Bindings, ids: string[]): Promise<void> {
  // Sequential with small inter-call delay to keep within DeepSeek rate limits.
  for (const id of ids) {
    try {
      await runSingleIngest(env, id);
    } catch (e) {
      console.error("ingest", id, errMsg(e));
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

function sessionSecret(env: Bindings): string {
  // Prefer a dedicated secret; fall back to the password so the cookie is still
  // signed even if only ADMIN_PASSWORD is configured. Set both via:
  //   wrangler secret put ADMIN_PASSWORD
  //   wrangler secret put ADMIN_SESSION_SECRET
  return env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || "";
}

async function isAdminAuthed(env: Bindings, req: Request): Promise<boolean> {
  const secret = sessionSecret(env);
  if (!secret) return false;
  const token = parseCookie(req.headers.get("cookie"), ADMIN_COOKIE);
  return verifySession(secret, token);
}

function guessContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
