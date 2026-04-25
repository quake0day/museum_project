import type { InteractionRow, Stats } from "./db";
import { escapeHtml, formatDate } from "./util";

function layout(opts: { title: string; active?: string; body: string }): string {
  const active = opts.active ?? "";
  const navLink = (href: string, label: string, key: string) =>
    `<a href="${href}"${active === key ? ' class="active"' : ""}>${label}</a>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="light dark" />
  <title>${escapeHtml(opts.title)}</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&display=swap" />
  <link rel="stylesheet" href="/static/css/style.css" />
  <script>
    (function () {
      try {
        var t = localStorage.getItem('museiq-theme');
        if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', t);
      } catch (_) {}
    })();
  </script>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="container header-inner">
      <a href="/" class="brand" aria-label="MuseIQ home">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 26L16 6l12 20H4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <circle cx="16" cy="19" r="3" stroke="currentColor" stroke-width="2"/>
          </svg>
        </span>
        <span class="brand-text">
          <strong>MuseIQ</strong>
          <small>Museum Interaction Platform</small>
        </span>
      </a>
      <nav class="nav" aria-label="Primary">
        ${navLink("/", "Home", "home")}
        ${navLink("/interactions/view", "Interactions", "list")}
        <a href="https://github.com/quake0day/museum_project" target="_blank" rel="noreferrer">GitHub</a>
      </nav>
      <button class="theme-toggle" type="button" aria-label="Toggle color theme" data-theme-toggle>
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/></svg>
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
    </div>
  </header>
  <main id="main">${opts.body}</main>
  <footer class="site-footer">
    <div class="container footer-inner">
      <span>© ${new Date().getFullYear()} MuseIQ</span>
      <span class="dot" aria-hidden="true">·</span>
      <span>Edge-rendered on Cloudflare Workers</span>
    </div>
  </footer>
  <script src="/static/js/main.js" defer></script>
</body>
</html>`;
}

export function renderHome(data: { stats: Stats }): string {
  const s = data.stats;
  const latest = s.latest_at ? formatDate(s.latest_at) : "—";
  const body = `
  <section class="hero">
    <div class="container hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">A living archive</p>
        <h1>Curate how visitors <em>feel</em> the exhibits.</h1>
        <p class="lede">MuseIQ collects reflections, sketches, and photos from inside the gallery — synced from iOS, stored at the edge, ready to browse anywhere.</p>
        <div class="hero-ctas">
          <a href="/interactions/view" class="btn btn-primary">Browse interactions <span aria-hidden="true">→</span></a>
          <a href="#api" class="btn btn-ghost">API reference</a>
        </div>
        <dl class="hero-stats" aria-label="Archive statistics">
          <div>
            <dt>Total captured</dt>
            <dd>${s.total.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Today</dt>
            <dd>${s.today.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Past 7 days</dt>
            <dd>${s.week.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Most recent</dt>
            <dd class="dd-sm">${escapeHtml(latest)}</dd>
          </div>
        </dl>
      </div>
      <aside class="hero-art" aria-hidden="true">
        <div class="hc hc1"></div>
        <div class="hc hc2"></div>
        <div class="hc hc3"></div>
        <div class="hc-glow"></div>
      </aside>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <header class="section-head">
        <p class="eyebrow">How it works</p>
        <h2>From iOS to the edge — in one roundtrip.</h2>
      </header>
      <div class="feature-grid">
        <article class="feature">
          <div class="feature-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
          </div>
          <h3>iOS sync</h3>
          <p>Visitors capture a response + photo in the companion app. Batched JSON lands at a single endpoint.</p>
        </article>
        <article class="feature">
          <div class="feature-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m3 17 5-5 4 4 3-3 6 6"/></svg>
          </div>
          <h3>Base64 → R2</h3>
          <p>Incoming <code>data:image/*;base64</code> payloads are decoded and streamed into Cloudflare R2 with immutable cache.</p>
        </article>
        <article class="feature">
          <div class="feature-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <h3>Searchable archive</h3>
          <p>Filter by response text, paginate, open full-resolution photos in an elegant lightbox.</p>
        </article>
        <article class="feature">
          <div class="feature-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <h3>Edge-native</h3>
          <p>Powered by Workers, D1, and R2. Global, serverless, zero patching — cold start under 50ms.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="api" id="api">
    <div class="container">
      <header class="section-head">
        <p class="eyebrow">Reference</p>
        <h2>API endpoints</h2>
      </header>
      <ul class="endpoints">
        <li>
          <span class="method method-post">POST</span>
          <div>
            <code class="endpoint-path">/api/interactions/list</code>
            <p>Submit a JSON array of interactions. Each entry: <code>id</code>, <code>response</code>, <code>image</code> (base64 data URL), <code>date</code>.</p>
          </div>
        </li>
        <li>
          <span class="method method-get">GET</span>
          <div>
            <code class="endpoint-path">/api/interactions/list?page=1&amp;q=search</code>
            <p>Paginated list with optional text search over responses.</p>
          </div>
        </li>
        <li>
          <span class="method method-get">GET</span>
          <div>
            <code class="endpoint-path">/api/stats</code>
            <p>Totals, today's count, last 7 days, most recent timestamp.</p>
          </div>
        </li>
        <li>
          <span class="method method-get">GET</span>
          <div>
            <code class="endpoint-path">/api/health</code>
            <p>Liveness probe.</p>
          </div>
        </li>
      </ul>
    </div>
  </section>`;
  return layout({
    title: "MuseIQ — Museum Interaction Platform",
    active: "home",
    body,
  });
}

export function renderList(data: {
  interactions: InteractionRow[];
  page: number;
  totalPages: number;
  count: number;
  query: string;
  hasPrev: boolean;
  hasNext: boolean;
}): string {
  const { interactions, page, totalPages, count, query, hasPrev, hasNext } = data;

  const cards = interactions.length
    ? interactions
        .map((it) => {
          const src = "/media/" + it.image.split("/").map(encodeURIComponent).join("/");
          const full = escapeHtml(it.response ?? "");
          const date = escapeHtml(it.date ?? "");
          return `
      <article class="card" data-lightbox-trigger data-src="${src}" data-caption="${escapeHtml(it.response ?? "")}">
        <div class="card-media">
          <img src="${src}" alt="Exhibit response" loading="lazy" decoding="async" />
        </div>
        <div class="card-body">
          <p class="card-response">${full || '<span class="muted">(no description)</span>'}</p>
          <p class="card-meta"><time datetime="${date}">${escapeHtml(formatDate(it.date))}</time></p>
        </div>
      </article>`;
        })
        .join("")
    : `<div class="empty">
        <div class="empty-illo" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="8" y="14" width="48" height="40" rx="4"/>
            <path d="M8 22h48"/>
            <path d="M22 14V8h20v6"/>
          </svg>
        </div>
        <h3>${query ? "No matching interactions" : "No interactions yet"}</h3>
        <p>${
          query
            ? `Nothing matches "${escapeHtml(query)}". Try a different keyword.`
            : "Once the iOS app submits interactions, they will appear here."
        }</p>
      </div>`;

  // windowed pagination
  const win = 2;
  const start = Math.max(1, page - win);
  const end = Math.min(totalPages, page + win);
  const windowPages: number[] = [];
  for (let i = start; i <= end; i++) windowPages.push(i);

  const qp = (p: number) =>
    `?page=${p}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  const pagination =
    totalPages > 1
      ? `
      <nav class="pagination" aria-label="Pagination">
        ${
          hasPrev
            ? `<a href="${qp(page - 1)}" class="page-link" rel="prev">← Prev</a>`
            : `<span class="page-link disabled">← Prev</span>`
        }
        ${
          start > 1
            ? `<a href="${qp(1)}" class="page-link">1</a>${start > 2 ? '<span class="gap" aria-hidden="true">…</span>' : ""}`
            : ""
        }
        ${windowPages
          .map((i) =>
            i === page
              ? `<span class="page-link active" aria-current="page">${i}</span>`
              : `<a href="${qp(i)}" class="page-link">${i}</a>`,
          )
          .join("")}
        ${
          end < totalPages
            ? `${end < totalPages - 1 ? '<span class="gap" aria-hidden="true">…</span>' : ""}<a href="${qp(totalPages)}" class="page-link">${totalPages}</a>`
            : ""
        }
        ${
          hasNext
            ? `<a href="${qp(page + 1)}" class="page-link" rel="next">Next →</a>`
            : `<span class="page-link disabled">Next →</span>`
        }
      </nav>`
      : "";

  const body = `
  <section class="list">
    <div class="container">
      <header class="list-header">
        <div class="list-title">
          <p class="eyebrow">Archive</p>
          <h1>Interactions</h1>
          <p class="muted">${count.toLocaleString()} ${count === 1 ? "entry" : "entries"}${
            query ? ` matching "${escapeHtml(query)}"` : ""
          }.</p>
        </div>
        <form class="search" method="get" action="/interactions/view" role="search">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="search" name="q" value="${escapeHtml(query)}" placeholder="Search responses…" aria-label="Search responses" autocomplete="off" />
          ${
            query
              ? `<a class="search-clear" href="/interactions/view" aria-label="Clear search">×</a>`
              : ""
          }
          <button type="submit" class="btn btn-primary btn-sm">Search</button>
        </form>
      </header>

      <div class="grid">${cards}</div>

      ${pagination}
    </div>
  </section>

  <div class="lightbox" data-lightbox hidden aria-hidden="true" role="dialog" aria-modal="true" aria-label="Image viewer">
    <button class="lightbox-close" type="button" aria-label="Close" data-lightbox-close>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <figure class="lightbox-figure">
      <img data-lightbox-img alt="" />
      <figcaption data-lightbox-caption></figcaption>
    </figure>
  </div>
  `;
  return layout({
    title: query ? `"${query}" — Interactions` : "Interactions — MuseIQ",
    active: "list",
    body,
  });
}

export function renderError(message: string): string {
  const body = `
  <section class="error-screen">
    <div class="container error-inner">
      <p class="eyebrow">Error</p>
      <h1>Something didn't go right.</h1>
      <pre class="error-detail">${escapeHtml(message)}</pre>
      <a class="btn btn-primary" href="/">← Back home</a>
    </div>
  </section>`;
  return layout({ title: "Error — MuseIQ", body });
}
