import { Hono } from "hono";
import {
  deleteInteraction,
  getInteractionById,
  getInteractions,
  getStats,
  saveInteractionRow,
} from "./db";
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
} from "./templates";
import {
  decodeDataUrl,
  normalizeId,
  nowISO,
  parseCookie,
  signSession,
  timingSafeEqual,
  verifySession,
} from "./util";
import { getAiProvider } from "./ai";
import { ingestExhibit } from "./wiki/ingest";
import { getWikiPage, getInboundLinks, wikiStats, searchWiki } from "./wiki/db";
import { buildIndexPage, buildLogPage } from "./wiki/index_render";
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
  PAGE_SIZE?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
  AI_PROVIDER?: string;
  AI_MODEL_CHAT?: string;
  DEEPSEEK_API_KEY?: string;
  DEFAULT_USER_ID?: string;
};

const ADMIN_COOKIE = "museiq_admin";
const ADMIN_TTL_SECONDS = 8 * 3600;

type InteractionRequest = {
  id?: string;
  response?: string;
  image?: string;
  date?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// ───────────────────────────── Pages ─────────────────────────────

app.get("/", async (c) => {
  try {
    const user = defaultUserId(c.env);
    const data = await buildDashboard(c.env.DB, user);
    return c.html(renderStudentHome({ user, data }));
  } catch (err) {
    console.error("home error", err);
    return c.html(renderError(errMsg(err)), 500);
  }
});

app.get("/about", async (c) => {
  try {
    const stats = await getStats(c.env.DB);
    return c.html(renderHome({ stats }));
  } catch (err) {
    console.error("about error", err);
    return c.html(renderError(errMsg(err)), 500);
  }
});

// /me alias to the student home
app.get("/me", (c) => c.redirect("/", 302));

app.get("/interactions/view", async (c) => {
  try {
    const pageSize = parsePositiveInt(c.env.PAGE_SIZE, 12);
    const page = Math.max(1, parsePositiveInt(c.req.query("page"), 1));
    const q = (c.req.query("q") ?? "").trim();
    const { rows, count } = await getInteractions(c.env.DB, {
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
      }),
    );
  } catch (err) {
    console.error("list error", err);
    return c.html(renderError(errMsg(err)), 500);
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

app.get("/api/health", async (c) => {
  try {
    const userId = defaultUserId(c.env);
    const wiki = await wikiStats(c.env.DB, userId);
    return c.json({ status: "ok", wiki });
  } catch (e) {
    return c.json({ status: "ok" });
  }
});

app.get("/api/stats", async (c) => {
  try {
    return c.json(await getStats(c.env.DB));
  } catch (err) {
    return c.json({ error: errMsg(err) }, 500);
  }
});

app.get("/api/interactions/list", async (c) => {
  const pageSize = 10;
  const page = Math.max(1, parsePositiveInt(c.req.query("page"), 1));
  const q = (c.req.query("q") ?? "").trim();
  const { rows, count } = await getInteractions(c.env.DB, {
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
        });
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
    const { rows, count } = await getInteractions(c.env.DB, {
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
    return c.html(renderError(errMsg(err)), 500);
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
    return c.html(renderError(errMsg(err)), 500);
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
  return c.html(renderCompare({ user, pathA: a, pathB: b, result, error }));
});

// Wiki quiz — register before the catch-all.
app.get("/wiki/:user/_quiz", async (c) => {
  const user = c.req.param("user");
  const path = c.req.query("p");
  if (!path) return c.html(renderError("missing ?p=<wiki path>"), 400);
  if (!c.env.DEEPSEEK_API_KEY) return c.html(renderError("AI provider not configured"), 500);
  try {
    const ai = getAiProvider(c.env);
    const quiz = await generateQuiz(ai, c.env.DB, { userId: user, path });
    return c.html(renderQuiz({ user, path, quiz }));
  } catch (err) {
    console.error("quiz error", err);
    return c.html(renderError(errMsg(err)), 500);
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
  return c.html(renderWikiAsk({ user, question, contextPath, answer, error }));
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
  return c.html(renderWikiSearch({ user, query: q, hits }));
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
      const built = await buildIndexPage(c.env.DB, user);
      return c.html(renderWikiSyntheticPage({ user, path, kind: "index", title: built.title, body: built.body }));
    }
    if (path === "log") {
      const built = await buildLogPage(c.env.DB, user);
      return c.html(renderWikiSyntheticPage({ user, path, kind: "log", title: built.title, body: built.body }));
    }
    const page = await getWikiPage(c.env.DB, user, path);
    if (!page) {
      return c.html(renderWikiNotFound({ user, path }), 404);
    }
    // For exhibit pages, look up the captured image so we can render it.
    let imageSrc: string | null = null;
    if (page.kind === "exhibit" || page.kind === "exhibit_unknown") {
      const exhibitId = path.replace(/^exhibits\//, "");
      const row = await getInteractionById(c.env.DB, exhibitId);
      if (row) imageSrc = "/media/" + row.image.split("/").map(encodeURIComponent).join("/");
    }
    // Inbound links — only useful on entity pages where many exhibits cite back.
    const inbound = page.kind !== "exhibit" && page.kind !== "exhibit_unknown"
      ? await getInboundLinks(c.env.DB, user, path, 30)
      : [];
    return c.html(renderWikiPage({ user, page, imageSrc, inbound }));
  } catch (err) {
    console.error("wiki render error", err);
    return c.html(renderError(errMsg(err)), 500);
  }
});

// ───────────────────────────── /me views (timeline, map) ───────────────

app.get("/me/timeline", async (c) => {
  const user = defaultUserId(c.env);
  try {
    const points = await getTimelinePoints(c.env.DB, user);
    return c.html(renderTimeline({ user, points }));
  } catch (err) {
    console.error("timeline error", err);
    return c.html(renderError(errMsg(err)), 500);
  }
});

app.get("/me/quests", async (c) => {
  const user = defaultUserId(c.env);
  try {
    const quests = await evaluateQuests(c.env.DB, user);
    return c.html(renderQuests({ user, quests }));
  } catch (err) {
    console.error("quests error", err);
    return c.html(renderError(errMsg(err)), 500);
  }
});

app.get("/me/map", async (c) => {
  const user = defaultUserId(c.env);
  try {
    const points = await getMapPoints(c.env.DB, user);
    return c.html(renderMap({ user, points }));
  } catch (err) {
    console.error("map error", err);
    return c.html(renderError(errMsg(err)), 500);
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
    return c.redirect(`/wiki/${encodeURIComponent(defaultUserId(c.env))}/exhibits/${encodeURIComponent(id)}`, 302);
  } catch (err) {
    console.error("admin ingest error", err);
    // Make sure the row never gets stuck at 'running' on an unhandled throw.
    try {
      await c.env.DB
        .prepare("UPDATE interactions SET analysis_status = 'failed', analysis_error = ?2, analyzed_at = ?3 WHERE id = ?1 AND analysis_status = 'running'")
        .bind(id, errMsg(err).slice(0, 800), new Date().toISOString())
        .run();
    } catch { /* swallow */ }
    return c.html(renderError(errMsg(err)), 500);
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
    return c.html(renderError(errMsg(err)), 500);
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
    return c.html(renderError(errMsg(err)), 500);
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
    return c.html(renderError(errMsg(err)), 500);
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
    const res = await env.DB
      .prepare(
        "SELECT id FROM interactions WHERE analysis_status IN ('pending','failed') ORDER BY date DESC LIMIT ?1",
      )
      .bind(CRON_BATCH_SIZE)
      .all<{ id: string }>();
    const ids = (res.results ?? []).map((r) => r.id);
    if (!ids.length) {
      console.log("cron: nothing to ingest");
      return;
    }
    console.log("cron: draining", ids.length, "items");
    ctx.waitUntil(ingestBatch(env, ids));
  } catch (e) {
    console.error("cron error", errMsg(e));
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
