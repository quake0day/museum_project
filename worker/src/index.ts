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

export type Bindings = {
  DB: D1Database;
  MEDIA: R2Bucket;
  PAGE_SIZE?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
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
    const stats = await getStats(c.env.DB);
    return c.html(renderHome({ stats }));
  } catch (err) {
    console.error("home error", err);
    return c.html(renderError(errMsg(err)), 500);
  }
});

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

app.get("/api/health", (c) => c.json({ status: "ok" }));

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

        await saveInteractionRow(c.env.DB, {
          id,
          response: req.response ?? "",
          image: key,
          date: nowISO(),
        });
        saved++;
      } catch (err) {
        const msg = errMsg(err);
        console.error("save interaction failed", msg);
        errors.push(msg);
      }
    }),
  );

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

// ───────────────────────────── 404 ─────────────────────────────

app.notFound((c) =>
  c.html(renderError("Page not found."), 404),
);

app.onError((err, c) => {
  console.error("unhandled", err);
  return c.html(renderError(errMsg(err)), 500);
});

export default app;

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
