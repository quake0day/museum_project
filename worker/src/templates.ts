import type { InteractionRow, Stats } from "./db";
import { escapeHtml, formatDate } from "./util";
import type { WikiPageRow } from "./wiki/db";
import { renderMarkdown } from "./wiki/render";

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

export function renderAdminLogin(opts: { error?: string } = {}): string {
  const err = opts.error ? `<p class="form-error" role="alert">${escapeHtml(opts.error)}</p>` : "";
  const body = `
  <section class="error-screen">
    <div class="container error-inner" style="max-width:420px;">
      <p class="eyebrow">Admin</p>
      <h1>Sign in</h1>
      <p class="muted">Enter the admin password to manage the archive.</p>
      ${err}
      <form method="POST" action="/admin/login" class="search" style="display:flex;gap:.5rem;margin-top:1rem;">
        <input type="password" name="password" placeholder="Password" autocomplete="current-password" required autofocus aria-label="Admin password" style="flex:1;" />
        <button type="submit" class="btn btn-primary">Sign in</button>
      </form>
    </div>
  </section>`;
  return layout({ title: "Admin — MuseIQ", body });
}

export function renderAdminList(data: {
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
          const id = escapeHtml(it.id);
          const domain = it.primary_domain ?? null;
          const status = it.analysis_status ?? "pending";
          const childSummary = it.child_summary ?? "";
          const domainEmoji = domain
            ? ({ history: "🏺", art: "🎨", science: "🦖", tech: "⚙️", technology: "⚙️", culture: "🌍" }[domain] ?? "")
            : "";
          const statusBadge = (() => {
            const map: Record<string, string> = {
              done: "background:#dcfce7;color:#166534;border-color:#86efac;",
              running: "background:#fef3c7;color:#854d0e;border-color:#fcd34d;",
              pending: "background:#e2e8f0;color:#475569;border-color:#cbd5e1;",
              failed: "background:#fee2e2;color:#991b1b;border-color:#fca5a5;",
              skipped: "background:#f1f5f9;color:#64748b;border-color:#cbd5e1;",
            };
            const css = map[status] ?? map.pending;
            return `<span class="status-chip" style="${css}">${escapeHtml(status)}</span>`;
          })();
          const wikiLink = `/wiki/default/exhibits/${encodeURIComponent(it.id)}`;
          return `
      <label class="card admin-card" data-admin-card>
        <div class="card-media">
          <input type="checkbox" name="ids" value="${id}" class="admin-check" data-admin-check aria-label="Select for deletion or re-ingest" />
          <img src="${src}" alt="Exhibit response" loading="lazy" decoding="async" />
        </div>
        <div class="card-body">
          <div class="card-chips">
            ${domain ? `<span class="domain-chip">${domainEmoji} ${escapeHtml(domain)}</span>` : ""}
            ${statusBadge}
          </div>
          ${childSummary ? `<p class="card-summary">${escapeHtml(childSummary)}</p>` : ""}
          <p class="card-response">${full || '<span class="muted">(no description)</span>'}</p>
          <p class="card-meta">
            <time datetime="${date}">${escapeHtml(formatDate(it.date))}</time>
            ${status === "done" ? ` · <a href="${wikiLink}" onclick="event.stopPropagation();">open wiki →</a>` : ""}
          </p>
        </div>
      </label>`;
        })
        .join("")
    : `<div class="empty">
        <h3>${query ? "No matching interactions" : "No interactions yet"}</h3>
        <p>${
          query
            ? `Nothing matches "${escapeHtml(query)}".`
            : "Once the iOS app submits interactions, they will appear here."
        }</p>
      </div>`;

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
        ${hasPrev ? `<a href="${qp(page - 1)}" class="page-link" rel="prev">← Prev</a>` : `<span class="page-link disabled">← Prev</span>`}
        ${start > 1 ? `<a href="${qp(1)}" class="page-link">1</a>${start > 2 ? '<span class="gap" aria-hidden="true">…</span>' : ""}` : ""}
        ${windowPages.map((i) => i === page ? `<span class="page-link active" aria-current="page">${i}</span>` : `<a href="${qp(i)}" class="page-link">${i}</a>`).join("")}
        ${end < totalPages ? `${end < totalPages - 1 ? '<span class="gap" aria-hidden="true">…</span>' : ""}<a href="${qp(totalPages)}" class="page-link">${totalPages}</a>` : ""}
        ${hasNext ? `<a href="${qp(page + 1)}" class="page-link" rel="next">Next →</a>` : `<span class="page-link disabled">Next →</span>`}
      </nav>`
      : "";

  const body = `
  <section class="list">
    <div class="container">
      <header class="list-header">
        <div class="list-title">
          <p class="eyebrow">Admin</p>
          <h1>Manage interactions</h1>
          <p class="muted">${count.toLocaleString()} ${count === 1 ? "entry" : "entries"}${query ? ` matching "${escapeHtml(query)}"` : ""}. Deleting removes the row from D1 and the file from R2.</p>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
          <form class="search" method="get" action="/admin/photos" role="search">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" name="q" value="${escapeHtml(query)}" placeholder="Search responses…" aria-label="Search responses" autocomplete="off" />
            ${query ? `<a class="search-clear" href="/admin/photos" aria-label="Clear search">×</a>` : ""}
            <button type="submit" class="btn btn-primary btn-sm">Search</button>
          </form>
          <form method="POST" action="/admin/ingest-all-pending" onsubmit="return confirm('Run AI ingest on all pending/failed interactions? Uses DeepSeek quota.');">
            <button type="submit" class="btn btn-ghost btn-sm" title="Drain pending+failed into the ingest queue">Ingest all pending</button>
          </form>
          <form method="POST" action="/admin/logout">
            <button type="submit" class="btn btn-ghost btn-sm">Sign out</button>
          </form>
        </div>
      </header>

      <form method="POST" action="/admin/delete" id="bulk-delete-form" data-bulk-form>
        <input type="hidden" name="page" value="${page}" />
        <input type="hidden" name="q" value="${escapeHtml(query)}" />

        <div class="bulk-bar" style="position:sticky;top:0;z-index:10;display:flex;gap:1rem;align-items:center;flex-wrap:wrap;padding:.75rem 1rem;margin:0 0 1rem;background:var(--bg-elev,#fff);border:1px solid var(--border,#e5e7eb);border-radius:.75rem;box-shadow:0 1px 2px rgba(0,0,0,.04);">
          <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">
            <input type="checkbox" data-bulk-all />
            <span>Select all on this page</span>
          </label>
          <span class="muted" data-bulk-count>0 selected</span>
          <span style="flex:1;"></span>
          <button type="submit" formaction="/admin/ingest-batch" class="btn btn-sm" data-bulk-ingest disabled style="background:#0ea5e9;color:#fff;border-color:#0ea5e9;opacity:.55;" title="Run AI ingest for selected">Re-ingest</button>
          <button type="submit" class="btn btn-sm" data-bulk-submit disabled style="background:#c0392b;color:#fff;border-color:#c0392b;opacity:.55;">Delete selected</button>
        </div>

        <style>
          .admin-card { position: relative; cursor: pointer; }
          .admin-card .admin-check {
            position: absolute; top: .5rem; left: .5rem; z-index: 2;
            width: 1.4rem; height: 1.4rem;
            accent-color: #c0392b;
            background: rgba(255,255,255,.92);
            border-radius: .25rem;
            box-shadow: 0 1px 3px rgba(0,0,0,.25);
            cursor: pointer;
          }
          .admin-card.is-selected { outline: 3px solid #c0392b; outline-offset: 2px; }
          .card-chips { display:flex; gap:.4rem; flex-wrap:wrap; margin-bottom:.4rem; }
          .domain-chip, .status-chip { display:inline-block; padding:.1rem .5rem; border-radius:999px; font-size:.7rem; border:1px solid; background:#f1f5f9; color:#334155; border-color:#cbd5e1; }
          .domain-chip { background:#ecfeff; border-color:#a5f3fc; color:#155e75; }
          .card-summary { font-size:.85rem; color:#475569; margin:.25rem 0 .5rem; line-height:1.4; }
        </style>

        <div class="grid">${cards}</div>
      </form>

      ${pagination}
    </div>
  </section>

  <script>
  (function () {
    var form = document.getElementById('bulk-delete-form');
    if (!form) return;
    var all = form.querySelector('[data-bulk-all]');
    var countEl = form.querySelector('[data-bulk-count]');
    var submitBtn = form.querySelector('[data-bulk-submit]');
    var ingestBtn = form.querySelector('[data-bulk-ingest]');
    var checks = form.querySelectorAll('[data-admin-check]');
    var pendingAction = null;

    function refresh() {
      var n = 0;
      checks.forEach(function (c) {
        if (c.checked) n++;
        var card = c.closest('[data-admin-card]');
        if (card) card.classList.toggle('is-selected', c.checked);
      });
      countEl.textContent = n + ' selected';
      [submitBtn, ingestBtn].forEach(function (b) {
        if (!b) return;
        b.disabled = n === 0;
        b.style.opacity = n === 0 ? '.55' : '1';
      });
      if (all) all.checked = n > 0 && n === checks.length;
    }

    if (all) {
      all.addEventListener('change', function () {
        checks.forEach(function (c) { c.checked = all.checked; });
        refresh();
      });
    }
    checks.forEach(function (c) {
      c.addEventListener('change', refresh);
      c.addEventListener('click', function (e) { e.stopPropagation(); });
    });

    // remember which button kicked off the submit so we can show the right confirm
    [submitBtn, ingestBtn].forEach(function (b) {
      if (!b) return;
      b.addEventListener('click', function () {
        pendingAction = b === ingestBtn ? 'ingest' : 'delete';
      });
    });

    form.addEventListener('submit', function (e) {
      var n = form.querySelectorAll('[data-admin-check]:checked').length;
      if (n === 0) { e.preventDefault(); return false; }
      var msg;
      if (pendingAction === 'ingest') {
        msg = 'Re-run AI ingest on ' + n + ' photo' + (n === 1 ? '' : 's') + '? (uses DeepSeek API quota)';
      } else {
        msg = 'Delete ' + n + ' photo' + (n === 1 ? '' : 's') + ' permanently? This cannot be undone.';
      }
      if (!confirm(msg)) { e.preventDefault(); return false; }
    });
    refresh();
  })();
  </script>
  `;
  return layout({
    title: query ? `"${query}" — Admin` : "Admin — MuseIQ",
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

// ───────────────────────────── Wiki render ─────────────────────────────

const DOMAIN_EMOJI: Record<string, string> = {
  history: "🏺",
  art: "🎨",
  science: "🦖",
  tech: "⚙️",
  technology: "⚙️",
  culture: "🌍",
};

function stripFrontmatter(body: string): string {
  const m = body.match(/^---\s*\n[\s\S]*?\n---\s*\n?([\s\S]*)$/);
  return m ? m[1] : body;
}

export function renderWikiPage(opts: {
  user: string;
  page: WikiPageRow;
  imageSrc: string | null;
}): string {
  const { user, page, imageSrc } = opts;
  let fm: Record<string, unknown> = {};
  try {
    fm = page.frontmatter_json ? JSON.parse(page.frontmatter_json) : {};
  } catch { /* ignore */ }

  const domain = typeof fm.domain === "string" ? fm.domain : null;
  const secondary = Array.isArray(fm.secondary_domains)
    ? (fm.secondary_domains as string[])
    : [];
  const period = typeof fm.period === "string" ? fm.period : null;
  const place = typeof fm.place === "string" ? fm.place : null;
  const approxYear = typeof fm.approx_year === "number" ? fm.approx_year : null;
  const confidence = typeof fm.confidence === "number" ? fm.confidence : null;

  const chips: string[] = [];
  if (domain) chips.push(`<span class="chip chip-domain">${DOMAIN_EMOJI[domain] ?? ""} ${escapeHtml(domain)}</span>`);
  for (const d of secondary) {
    chips.push(`<span class="chip">${DOMAIN_EMOJI[d] ?? ""} ${escapeHtml(d)}</span>`);
  }
  if (period) chips.push(`<span class="chip"><a href="/wiki/${encodeURIComponent(user)}/periods/${encodeURIComponent(period)}">${escapeHtml(period)}</a></span>`);
  if (place) chips.push(`<span class="chip"><a href="/wiki/${encodeURIComponent(user)}/places/${encodeURIComponent(place)}">${escapeHtml(place)}</a></span>`);
  if (approxYear !== null) chips.push(`<span class="chip">${formatYear(approxYear)}</span>`);
  if (confidence !== null && confidence < 0.5) chips.push(`<span class="chip" style="background:#fef3c7;border-color:#fcd34d;">low confidence (${confidence.toFixed(2)})</span>`);

  const md = stripFrontmatter(page.body);
  const html = renderMarkdown(md);

  const meta = `<p class="muted" style="margin-top:2rem;font-size:.85rem;">Last updated by AI · ${escapeHtml(formatDate(page.updated_at))} · ${page.outbound_links} outbound · ${page.inbound_links} inbound</p>`;

  const imageHtml = imageSrc
    ? `<figure class="wiki-figure"><img src="${imageSrc}" alt="${escapeHtml(page.title)}" /></figure>`
    : "";

  const body = `
  <section class="wiki">
    <div class="container wiki-container">
      <nav class="wiki-breadcrumb" aria-label="Breadcrumb">
        <a href="/wiki/${encodeURIComponent(user)}/index">${escapeHtml(user)}'s wiki</a>
        <span aria-hidden="true">›</span>
        <span>${escapeHtml(page.kind)}</span>
        <span aria-hidden="true">›</span>
        <span>${escapeHtml(page.title)}</span>
      </nav>
      ${imageHtml}
      ${chips.length ? `<div class="chips">${chips.join("")}</div>` : ""}
      <article class="wiki-body">
        ${html}
      </article>
      ${meta}
    </div>
  </section>
  <style>
    .wiki-container { max-width: 760px; }
    .wiki-figure { margin: 0 0 1.5rem; }
    .wiki-figure img { width:100%; max-height: 480px; object-fit: cover; border-radius: 1rem; }
    .chips { display:flex; flex-wrap:wrap; gap:.4rem; margin: 0 0 1.25rem; }
    .chip { display:inline-flex; align-items:center; gap:.25rem; padding:.18rem .55rem; border:1px solid var(--border,#e5e7eb); border-radius:999px; font-size:.8rem; background:var(--bg-elev,#fff); }
    .chip a { color: inherit; text-decoration: none; }
    .chip-domain { background: #ecfeff; border-color:#a5f3fc; }
    .wiki-breadcrumb { font-size:.85rem; color:#64748b; margin: 0 0 1rem; display:flex; gap:.4rem; flex-wrap:wrap; }
    .wiki-breadcrumb a { color: inherit; }
    .wiki-body h1 { font-family: 'Fraunces', serif; font-size: 2.4rem; margin: .25rem 0 1rem; }
    .wiki-body h2 { margin-top: 2rem; }
    .wiki-body blockquote { border-left: 3px solid var(--accent,#0ea5e9); margin: 1.25rem 0; padding: .25rem 1rem; color: #334155; font-style: italic; background: rgba(14,165,233,.05); border-radius: 0 .5rem .5rem 0; }
    .wiki-body ul li.task { list-style: none; margin-left: -1.25rem; }
    .wiki-body a { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
  </style>`;
  return layout({ title: `${page.title} — MuseIQ Wiki`, body });
}

export function renderWikiNotFound(opts: { user: string; path: string }): string {
  const { user, path } = opts;
  const body = `
  <section class="error-screen">
    <div class="container error-inner">
      <p class="eyebrow">Wiki</p>
      <h1>This page hasn't been written yet.</h1>
      <p class="muted">No page at <code>${escapeHtml(path)}</code> for user <code>${escapeHtml(user)}</code>.</p>
      <p>Try the <a href="/wiki/${encodeURIComponent(user)}/index">wiki index</a>, or capture more exhibits to grow this section.</p>
    </div>
  </section>`;
  return layout({ title: "Wiki page not found — MuseIQ", body });
}

function formatYear(y: number): string {
  if (y < 0) return `${Math.abs(y).toLocaleString()} BCE`;
  return `${y} CE`;
}
