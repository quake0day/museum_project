import { Hono } from "hono";
import { getInteractions, getStats, saveInteractionRow } from "./db";
import { renderHome, renderList, renderError } from "./templates";
import { decodeDataUrl, normalizeId, nowISO } from "./util";

export type Bindings = {
  DB: D1Database;
  MEDIA: R2Bucket;
  PAGE_SIZE?: string;
};

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
