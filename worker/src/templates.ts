import type { InteractionRow, Stats } from "./db";
import { escapeHtml, formatDate } from "./util";
import type { WikiPageRow, WikiSearchHit, InboundExhibit, CoOccurrence } from "./wiki/db";
import type { DashboardData } from "./wiki/dashboard";
import type { EncyclopediaData } from "./wiki/encyclopedia";
import { kindLabel, kindRank } from "./wiki/encyclopedia";
import type { GraphData } from "./wiki/graph";
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
      // Always default to light. Only honor an explicit user-toggled choice.
      try {
        var t = localStorage.getItem('museiq-theme') || 'light';
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
        ${navLink("/wiki/default/index", "My Wiki", "wiki")}
        ${navLink("/me/timeline", "Timeline", "timeline")}
        ${navLink("/me/map", "Map", "map")}
        ${navLink("/me/graph", "Graph", "graph")}
        ${navLink("/me/quests", "Quests", "quests")}
        ${navLink("/interactions/view", "Captures", "list")}
      </nav>
      <a class="nav-icon" href="/wiki/default/_search" title="Search the wiki" aria-label="Search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </a>
      <button class="theme-toggle" type="button" aria-label="Toggle color theme" data-theme-toggle>
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/></svg>
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
    </div>
  </header>
  <main id="main">${opts.body}</main>
  <div class="lightbox" data-lightbox hidden aria-hidden="true" role="dialog" aria-modal="true" aria-label="Image viewer">
    <button class="lightbox-close" type="button" aria-label="Close" data-lightbox-close>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <figure class="lightbox-figure">
      <img data-lightbox-img alt="" />
      <figcaption>
        <span data-lightbox-caption></span>
        <a class="lightbox-open" data-lightbox-link hidden>Open wiki page →</a>
      </figcaption>
    </figure>
  </div>
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

export function renderStudentHome(opts: { user: string; data: DashboardData }): string {
  const { user, data } = opts;
  const { totals, recent, inProgress, earnedRecent, nextAdventure } = data;

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Still up?" : hour < 12 ? "Good morning" : hour < 18 ? "Welcome back" : "Good evening";

  const recentCard = (r: typeof recent[number]) => {
    const src = "/media/" + r.image.split("/").map(encodeURIComponent).join("/");
    const href = `/wiki/${encodeURIComponent(user)}/exhibits/${encodeURIComponent(r.id)}`;
    const dom = r.primary_domain ?? "";
    const emoji = DOMAIN_EMOJI[dom] ?? "✨";
    return `<a class="dash-recent-card domain-${escapeHtml(dom)}" href="${href}">
      <div class="dash-recent-img"><img src="${src}" alt="${escapeHtml(r.title ?? "")}" loading="lazy" /></div>
      <div class="dash-recent-body">
        <span class="domain-chip">${emoji} ${escapeHtml(dom || "exhibit")}</span>
        <h3>${escapeHtml(r.title)}</h3>
        ${r.child_summary ? `<p>${escapeHtml(r.child_summary)}</p>` : ""}
      </div>
    </a>`;
  };

  const questBar = (q: typeof inProgress[number]) => {
    const pct = Math.min(100, Math.round((q.current / Math.max(1, q.target)) * 100));
    return `<a href="/me/quests" class="dash-quest">
      <div class="dash-quest-emoji">${q.emoji}</div>
      <div class="dash-quest-body">
        <div class="dash-quest-row">
          <strong>${escapeHtml(q.title)}</strong>
          <span class="muted">${q.current} / ${q.target}</span>
        </div>
        <div class="quest-bar"><div class="quest-bar-fill" style="width:${pct}%;"></div></div>
      </div>
    </a>`;
  };

  const body = `
  <section class="dash-hero">
    <div class="container dash-hero-inner">
      <div>
        <p class="eyebrow">${escapeHtml(greeting)}, Junior Curator</p>
        <h1>My Museum Wiki</h1>
        <p class="lede">Turn every museum visit into a personal learning wiki.</p>
      </div>
      <div class="dash-stats" aria-label="Collection at a glance">
        <div class="dash-stat"><dt>Exhibits</dt><dd>${totals.exhibits.toLocaleString()}</dd></div>
        <div class="dash-stat"><dt>Concepts</dt><dd>${totals.concepts.toLocaleString()}</dd></div>
        <div class="dash-stat"><dt>Places</dt><dd>${totals.places.toLocaleString()}</dd></div>
        <div class="dash-stat"><dt>Periods</dt><dd>${totals.periods.toLocaleString()}</dd></div>
        ${totals.pending > 0 ? `<div class="dash-stat dash-stat-pending"><dt>Pending AI</dt><dd>${totals.pending.toLocaleString()}</dd></div>` : ""}
      </div>
    </div>
  </section>

  <section class="dash-block">
    <div class="container">
      <a href="${nextAdventure.href}" class="dash-next">
        <div class="dash-next-emoji" aria-hidden="true">${nextAdventure.emoji}</div>
        <div class="dash-next-body">
          <p class="eyebrow">Next adventure</p>
          <h2>${escapeHtml(nextAdventure.title)}</h2>
          <p>${escapeHtml(nextAdventure.hint)}</p>
        </div>
        <span class="dash-next-arrow" aria-hidden="true">→</span>
      </a>
    </div>
  </section>

  ${recent.length ? `
  <section class="dash-block">
    <div class="container">
      <header class="dash-block-head">
        <h2>Recently captured</h2>
        <a href="/interactions/view" class="muted">all captures →</a>
      </header>
      <div class="dash-recent-grid">
        ${recent.slice(0, 4).map(recentCard).join("")}
      </div>
    </div>
  </section>` : ""}

  ${inProgress.length ? `
  <section class="dash-block">
    <div class="container">
      <header class="dash-block-head">
        <h2>Quests in progress</h2>
        <a href="/me/quests" class="muted">all quests →</a>
      </header>
      <div class="dash-quest-list">
        ${inProgress.map(questBar).join("")}
      </div>
    </div>
  </section>` : ""}

  ${earnedRecent.length ? `
  <section class="dash-block">
    <div class="container">
      <header class="dash-block-head">
        <h2>Badges earned</h2>
        <a href="/me/quests" class="muted">all badges →</a>
      </header>
      <div class="dash-badges">
        ${earnedRecent.map((q) => `<a class="dash-badge" href="/me/quests" title="${escapeHtml(q.description)}">
          <div class="dash-badge-emoji">${q.emoji}</div>
          <div>
            <strong>${escapeHtml(q.title)}</strong>
            <small class="muted">${q.earnedAt ? "earned " + escapeHtml(q.earnedAt.slice(0, 10)) : ""}</small>
          </div>
        </a>`).join("")}
      </div>
    </div>
  </section>` : ""}

  <section class="dash-block">
    <div class="container">
      <header class="dash-block-head"><h2>Explore your wiki</h2></header>
      <div class="dash-explore-grid">
        <a class="dash-explore" href="/wiki/${encodeURIComponent(user)}/index">
          <span class="dash-explore-emoji">📚</span>
          <strong>All pages</strong>
          <small>Browse every exhibit, concept, place, period, person, and theme.</small>
        </a>
        <a class="dash-explore" href="/me/timeline">
          <span class="dash-explore-emoji">⏳</span>
          <strong>Timeline</strong>
          <small>See your captures along an axis from prehistory to today.</small>
        </a>
        <a class="dash-explore" href="/me/map">
          <span class="dash-explore-emoji">🗺️</span>
          <strong>Map</strong>
          <small>Where in the world your exhibits come from.</small>
        </a>
        <a class="dash-explore" href="/wiki/${encodeURIComponent(user)}/_search">
          <span class="dash-explore-emoji">🔍</span>
          <strong>Search</strong>
          <small>Find any page in your wiki by keyword.</small>
        </a>
        <a class="dash-explore" href="/wiki/${encodeURIComponent(user)}/_ask">
          <span class="dash-explore-emoji">💬</span>
          <strong>Ask the wiki</strong>
          <small>Curious about something? The wiki answers with citations.</small>
        </a>
        <a class="dash-explore" href="/me/quests">
          <span class="dash-explore-emoji">🏅</span>
          <strong>Quests</strong>
          <small>Missions and badges to guide your next museum visit.</small>
        </a>
      </div>
    </div>
  </section>

  <style>
    .dash-hero { background: var(--bg-hero); padding: 3rem 0 2.5rem; border-bottom: 1px solid var(--border); }
    .dash-hero-inner { display: grid; grid-template-columns: 1.6fr 1fr; gap: 3rem; align-items: end; }
    .dash-hero h1 { font-size: clamp(1.8rem, 3.6vw, 2.6rem); margin: .35rem 0 .75rem; max-width: 22ch; }
    .dash-hero .lede { color: var(--ink-soft); font-size: 1.05rem; max-width: 50ch; }
    .dash-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: .75rem; }
    .dash-stat { background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); padding: .85rem 1rem; box-shadow: var(--shadow-sm); }
    .dash-stat dt { font-size: .72rem; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-muted); margin: 0; }
    .dash-stat dd { font-family: 'Fraunces', serif; font-size: 1.6rem; margin: .15rem 0 0; color: var(--primary); }
    .dash-stat-pending dd { color: var(--accent-ink); }
    @media (max-width: 800px) { .dash-hero-inner { grid-template-columns: 1fr; gap: 1.5rem; } }

    .dash-block { padding: 2rem 0; }
    .dash-block-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 1rem; }
    .dash-block-head h2 { font-size: 1.4rem; }

    .dash-next { display: grid; grid-template-columns: 64px 1fr 32px; align-items: center; gap: 1.25rem; padding: 1.25rem 1.5rem; background: var(--bg-elev); border: 1px solid var(--border); border-left: 5px solid var(--accent); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); color: inherit; }
    .dash-next:hover { transform: translateY(-1px); box-shadow: var(--shadow-lg); }
    .dash-next-emoji { font-size: 2.6rem; line-height: 1; }
    .dash-next-body h2 { font-size: 1.25rem; margin: .15rem 0 .25rem; color: var(--ink); }
    .dash-next-body p { color: var(--ink-soft); }
    .dash-next-arrow { font-size: 1.5rem; color: var(--accent); }

    .dash-recent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
    .dash-recent-card { display: flex; flex-direction: column; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); color: inherit; transition: transform .15s ease, box-shadow .15s ease; }
    .dash-recent-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
    .dash-recent-img { aspect-ratio: 4/3; overflow: hidden; background: var(--bg-soft); }
    .dash-recent-img img { width: 100%; height: 100%; object-fit: cover; }
    .dash-recent-body { padding: .85rem 1rem 1rem; }
    .dash-recent-body h3 { font-family: 'Fraunces', serif; font-size: 1.05rem; margin: .35rem 0 .35rem; color: var(--ink); }
    .dash-recent-body p { font-size: .88rem; color: var(--ink-soft); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

    .dash-quest-list { display: grid; gap: .65rem; }
    .dash-quest { display: grid; grid-template-columns: 48px 1fr; gap: 1rem; align-items: center; padding: .85rem 1rem; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); color: inherit; }
    .dash-quest:hover { border-color: var(--primary); }
    .dash-quest-emoji { font-size: 1.8rem; line-height: 1; }
    .dash-quest-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: .35rem; }
    .quest-bar { height: 6px; background: rgba(30, 58, 95, 0.08); border-radius: 999px; overflow: hidden; }
    .quest-bar-fill { height: 100%; background: linear-gradient(90deg, var(--primary), var(--accent)); }

    .dash-badges { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: .65rem; }
    .dash-badge { display: flex; gap: .85rem; align-items: center; padding: .85rem 1rem; background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); border-radius: var(--radius); color: var(--accent-ink); }
    .dash-badge:hover { color: var(--accent-ink); }
    .dash-badge-emoji { font-size: 1.8rem; line-height: 1; }
    .dash-badge small { display: block; font-size: .72rem; color: color-mix(in srgb, var(--accent-ink) 70%, transparent); }

    .dash-explore-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: .65rem; }
    .dash-explore { display: flex; flex-direction: column; gap: .25rem; padding: 1rem 1.15rem; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); color: inherit; transition: transform .15s ease, border-color .15s ease; }
    .dash-explore:hover { transform: translateY(-1px); border-color: var(--primary); color: var(--primary); }
    .dash-explore-emoji { font-size: 1.5rem; line-height: 1; margin-bottom: .35rem; }
    .dash-explore strong { font-size: 1rem; }
    .dash-explore small { font-size: .82rem; color: var(--ink-muted); line-height: 1.4; }
  </style>`;
  return layout({ title: "My Museum Wiki — MuseIQ", active: "home", body });
}

const DOMAIN_EMOJI: Record<string, string> = {
  history: "🏺",
  art: "🎨",
  science: "🦖",
  tech: "⚙️",
  technology: "⚙️",
  culture: "🌍",
};

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
          const summary = it.child_summary ? escapeHtml(it.child_summary) : "";
          const domain = it.primary_domain ?? null;
          const domainEmoji = domain
            ? ({ history: "🏺", art: "🎨", science: "🦖", tech: "⚙️", technology: "⚙️", culture: "🌍" }[domain] ?? "")
            : "";
          const wikiHref = it.analysis_status === "done"
            ? `/wiki/default/exhibits/${encodeURIComponent(it.id)}`
            : null;
          // When the wiki page exists, the whole card becomes a link to it.
          // Otherwise the lightbox-trigger keeps its zoom-on-click behavior.
          const domainCls = domain ? `domain-${escapeHtml(domain)}` : "";
          const cardOpen = wikiHref
            ? `<a class="card card-link ${domainCls}" href="${wikiHref}">`
            : `<article class="card ${domainCls}" data-lightbox-trigger data-src="${src}" data-caption="${escapeHtml(it.response ?? "")}">`;
          const cardClose = wikiHref ? `</a>` : `</article>`;
          return `
      ${cardOpen}
        <div class="card-media">
          <img src="${src}" alt="Exhibit response" loading="lazy" decoding="async" />
        </div>
        <div class="card-body">
          ${domain ? `<span class="domain-chip">${domainEmoji} ${escapeHtml(domain)}</span>` : ""}
          ${summary ? `<p class="card-summary">${summary}</p>` : ""}
          <p class="card-response">${full || '<span class="muted">(no description)</span>'}</p>
          <p class="card-meta"><time datetime="${date}">${escapeHtml(formatDate(it.date))}</time>${wikiHref ? ` · <span class="card-go">open wiki →</span>` : ""}</p>
        </div>
      ${cardClose}`;
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

  <style>
    .card-link { color: inherit; text-decoration: none; display: flex; flex-direction: column; transition: transform .15s ease, box-shadow .15s ease; }
    .card-link:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
    .card.card-link:hover { color: inherit; }
    .card-summary { font-size:.92rem; color: var(--ink-soft); margin: .5rem 0 .35rem; line-height:1.45; font-weight: 500; }
    .card-response { font-size:.85rem; color: var(--ink-muted); margin: 0 0 .35rem; line-height: 1.4; font-style: italic; }
    .card-go { color: var(--accent-ink); font-weight: 500; }
    .card-meta { font-size: .78rem; color: var(--ink-muted); }
    .card .domain-chip { margin-bottom: .35rem; }
  </style>
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
          <a class="btn btn-ghost btn-sm" href="/admin/lint/default" title="Wiki health check">Lint</a>
          <a class="btn btn-ghost btn-sm" href="/wiki/default/index" title="Browse the wiki">Wiki</a>
          <a class="btn btn-ghost btn-sm" href="/wiki/default/_search" title="Search the wiki">Search</a>
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

function stripFrontmatter(body: string): string {
  const m = body.match(/^---\s*\n[\s\S]*?\n---\s*\n?([\s\S]*)$/);
  return m ? m[1] : body;
}

export function renderWikiPage(opts: {
  user: string;
  page: WikiPageRow;
  imageSrc: string | null;
  inbound?: Array<{ path: string; title: string; kind: string; relation: string | null }>;
  photos?: InboundExhibit[];
  related?: CoOccurrence[];
}): string {
  const { user, page, imageSrc } = opts;
  const inbound = opts.inbound ?? [];
  const photos = opts.photos ?? [];
  const related = opts.related ?? [];
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

  // Age-graded summaries — fall through to whatever exists.
  const sum_5_7   = typeof fm.summary_5_7   === "string" ? fm.summary_5_7   : null;
  const sum_8_10  = typeof fm.summary_8_10  === "string" ? fm.summary_8_10  : null;
  const sum_11_13 = typeof fm.summary_11_13 === "string" ? fm.summary_11_13 : null;
  const hasAgeSummaries = !!(sum_5_7 || sum_8_10 || sum_11_13);

  const isExhibit = page.kind === "exhibit" || page.kind === "exhibit_unknown";
  const domainClass = domain ? `domain-${escapeHtml(domain)}` : "";

  // Strip the body's leading H1 + opening blockquote — we hoist them into
  // the hero so the body reads cleanly. Also strip frontmatter.
  const md = stripFrontmatter(page.body);
  const { quote: heroQuote, body: trimmedBody } = extractLeadingQuote(md);
  const html = renderMarkdown(stripLeadingHeading(trimmedBody, page.title));

  // Hero chips — strict diet: only the primary domain, plus a single
  // place/period summary line. No secondary-domain rainbow.
  const chips: string[] = [];
  if (domain) chips.push(`<span class="domain-chip">${DOMAIN_EMOJI[domain] ?? ""} ${escapeHtml(domain)}</span>`);
  // Combine period + year + place into a single human-readable subtitle
  const subtitleParts: string[] = [];
  if (approxYear !== null) subtitleParts.push(formatYear(approxYear));
  else if (period) subtitleParts.push(period.replace(/-/g, " "));
  if (place) subtitleParts.push(place.replace(/-/g, " "));
  const subtitle = subtitleParts.length
    ? `<p class="wiki-subtitle">${escapeHtml(subtitleParts.join(" · "))}</p>`
    : "";
  if (confidence !== null && confidence < 0.5) {
    chips.push(`<span class="domain-chip" style="background:#FEF3C7;border-color:#FCD34D;color:#854D0E;">low confidence ${confidence.toFixed(2)}</span>`);
  }

  // Reading-level switcher: single thin row, no card. The selected band's
  // summary becomes the hero blockquote.
  const bands: Array<{ key: "5_7" | "8_10" | "11_13"; label: string; text: string | null }> = [
    { key: "5_7",   label: "5–7",   text: sum_5_7 },
    { key: "8_10",  label: "8–10",  text: sum_8_10 },
    { key: "11_13", label: "11–13", text: sum_11_13 },
  ];
  const available = bands.filter((b) => b.text);
  const defaultBand = available.find((b) => b.key === "8_10")?.key ?? available[0]?.key;
  const ageBlock = hasAgeSummaries ? `
    <p class="wiki-summary" data-summary-host>${escapeHtml(available.find((b) => b.key === defaultBand)?.text ?? "")}</p>
    <div class="wiki-age-row" data-age-toggle>
      <span class="wiki-age-label">Reading level</span>
      ${available.map((b) => `<button type="button" data-band="${b.key}" class="wiki-age-tab${b.key === defaultBand ? " is-active" : ""}" aria-selected="${b.key === defaultBand}">${b.label}</button>`).join("")}
      ${available.map((b) => `<template data-band-text="${b.key}">${escapeHtml(b.text ?? "")}</template>`).join("")}
    </div>` : (heroQuote ? `<p class="wiki-summary">${escapeHtml(heroQuote)}</p>` : "");

  const actions = isExhibit ? `
    <div class="wiki-actions" role="toolbar" aria-label="Page actions">
      <a href="/wiki/${encodeURIComponent(user)}/_ask?about=${encodeURIComponent(page.path)}" class="btn btn-primary">💬 Ask the wiki</a>
      <a href="/wiki/${encodeURIComponent(user)}/_quiz?p=${encodeURIComponent(page.path)}" class="btn btn-ghost btn-sm">📝 Quiz</a>
      <a href="/wiki/${encodeURIComponent(user)}/_compare?a=${encodeURIComponent(page.path)}" class="btn btn-ghost btn-sm">🔀 Compare</a>
    </div>` : `
    <div class="wiki-actions" role="toolbar" aria-label="Page actions">
      <a href="/wiki/${encodeURIComponent(user)}/_ask?about=${encodeURIComponent(page.path)}" class="btn btn-ghost btn-sm">💬 Ask the wiki</a>
    </div>`;

  // Place pages get an inline mini-map. Pulls lat/lon from frontmatter if
  // present; falls back to nothing if missing.
  let placeMapHtml = "";
  if (page.kind === "place" || page.kind === "civilization") {
    let fmLat: number | null = null;
    let fmLon: number | null = null;
    try {
      const f = page.frontmatter_json ? JSON.parse(page.frontmatter_json) : {};
      if (typeof f.lat === "number") fmLat = f.lat;
      if (typeof f.lon === "number") fmLon = f.lon;
    } catch { /* ignore */ }
    if (fmLat !== null && fmLon !== null) {
      placeMapHtml = `
      <section class="wiki-map" aria-label="Where this is on the map">
        <h3>📍 On the map</h3>
        <div id="wiki-place-map" data-lat="${fmLat}" data-lon="${fmLon}" data-title="${escapeHtml(page.title)}"></div>
      </section>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="anonymous" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="anonymous"></script>
      <script>
        (function () {
          var el = document.getElementById('wiki-place-map');
          if (!el || typeof L === 'undefined') return;
          var lat = parseFloat(el.dataset.lat);
          var lon = parseFloat(el.dataset.lon);
          if (!isFinite(lat) || !isFinite(lon)) return;
          var m = L.map(el, { scrollWheelZoom: false }).setView([lat, lon], 5);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18,
          }).addTo(m);
          L.marker([lat, lon]).addTo(m).bindPopup(el.dataset.title || '').openPopup();
        })();
      </script>`;
    }
  }

  // 2-hop co-occurrence strip — entities that share exhibits with this one
  // even if the LLM didn't link them directly.
  const relatedHtml = related.length
    ? `
    <aside class="wiki-related" aria-label="Often appears with">
      <h3>Often appears with <span class="muted">— in your captures</span></h3>
      <div class="wiki-related-row">
        ${related.map((r) => {
          const href = `/wiki/${encodeURIComponent(user)}/${r.path.split("/").map(encodeURIComponent).join("/")}`;
          return `<a class="wiki-related-chip" href="${href}">
            <span class="wiki-related-kind">${escapeHtml(r.kind)}</span>
            <strong>${escapeHtml(r.title)}</strong>
            <span class="wiki-related-w" title="${r.weight} shared exhibit${r.weight === 1 ? "" : "s"}">×${r.weight}</span>
          </a>`;
        }).join("")}
      </div>
    </aside>`
    : "";

  const inboundHtml = inbound.length
    ? `
    <aside class="wiki-inbound" aria-label="Pages that link here">
      <h3>Where you've seen it <span class="muted">(${inbound.length})</span></h3>
      <ul>
        ${inbound.map((l) => {
          const href = `/wiki/${encodeURIComponent(user)}/${l.path.split("/").map(encodeURIComponent).join("/")}`;
          const rel = l.relation ? `<span class="rel-tag">${escapeHtml(l.relation)}</span>` : "";
          return `<li><a href="${href}">${escapeHtml(l.title)}</a> <span class="muted">· ${escapeHtml(l.kind)}</span>${rel}</li>`;
        }).join("")}
      </ul>
    </aside>`
    : "";

  // Photo gallery — only meaningful on entity pages with inbound exhibits.
  // Capped at 12 visible by default; "Show all" expands inline.
  const GALLERY_INITIAL = 12;
  const galleryHtml = photos.length
    ? `
    <section class="wiki-gallery" aria-label="Photos from your captures">
      <header class="wiki-gallery-head">
        <h3>📸 Photos from your captures <span class="muted">(${photos.length})</span></h3>
        ${photos.length > GALLERY_INITIAL
          ? `<button type="button" class="btn btn-ghost btn-sm" data-gallery-toggle>Show all ${photos.length}</button>`
          : ""}
      </header>
      <div class="wiki-gallery-grid" data-gallery-grid>
        ${photos.map((p, i) => {
          const src = "/media/" + p.image.split("/").map(encodeURIComponent).join("/");
          const href = `/wiki/${encodeURIComponent(user)}/exhibits/${encodeURIComponent(p.exhibit_id)}`;
          const dom = p.primary_domain ?? "";
          const tip = (p.title || "").trim();
          return `<a class="wiki-thumb${i >= GALLERY_INITIAL ? " is-extra" : ""} domain-${escapeHtml(dom)}"
                     href="${href}"
                     data-lightbox-trigger
                     data-src="${src}"
                     data-caption="${escapeHtml(tip)}"
                     data-href="${href}"
                     title="${escapeHtml(tip)}"${i >= GALLERY_INITIAL ? ' hidden' : ''}>
            <img src="${src}" alt="${escapeHtml(tip)}" loading="lazy" decoding="async" />
            <span class="wiki-thumb-cap">${escapeHtml(tip)}</span>
          </a>`;
        }).join("")}
      </div>
    </section>`
    : "";

  const imageHtml = imageSrc
    ? `<figure class="wiki-hero-img">
        <a href="${imageSrc}" data-lightbox-trigger data-src="${imageSrc}" data-caption="${escapeHtml(page.title)}" aria-label="Enlarge photo">
          <img src="${imageSrc}" alt="${escapeHtml(page.title)}" />
        </a>
      </figure>`
    : "";

  const body = `
  <section class="wiki ${domainClass}">
    <div class="wiki-hero">
      <div class="container wiki-container">
        <nav class="wiki-breadcrumb" aria-label="Breadcrumb">
          <a href="/wiki/${encodeURIComponent(user)}/index">${escapeHtml(user)}'s wiki</a>
          <span aria-hidden="true">›</span>
          <span>${escapeHtml(page.kind.replace("_", " "))}</span>
        </nav>
        <div class="wiki-hero-grid">
          ${imageHtml}
          <div class="wiki-hero-text">
            ${chips.length ? `<div class="chips">${chips.join("")}</div>` : ""}
            <h1>${escapeHtml(page.title)}</h1>
            ${subtitle}
            ${ageBlock}
            ${actions}
          </div>
        </div>
      </div>
    </div>
    <div class="container wiki-container">
      <article class="wiki-body">
        ${html}
      </article>
      ${placeMapHtml}
      ${galleryHtml}
      ${relatedHtml}
      ${inboundHtml}
      <details class="wiki-meta">
        <summary>Page info <span class="muted">(for grown-ups)</span></summary>
        <p class="muted">Last updated by AI · ${escapeHtml(formatDate(page.updated_at))} · ${page.outbound_links} outbound link${page.outbound_links === 1 ? "" : "s"} · ${page.inbound_links} inbound link${page.inbound_links === 1 ? "" : "s"} · path <code>${escapeHtml(page.path)}</code></p>
      </details>
    </div>
  </section>
  <style>
    .wiki-container { max-width: 880px; padding-top: 1.5rem; padding-bottom: 3rem; }
    .wiki-hero {
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--d-active, var(--primary)) 8%, var(--bg)) 0%, var(--bg) 100%);
      padding: 1.25rem 0 2rem;
      border-bottom: 1px solid var(--border);
    }
    .wiki-hero .wiki-container { padding-top: .25rem; padding-bottom: .25rem; }
    .wiki-breadcrumb { font-size:.82rem; color: var(--ink-muted); display:flex; gap:.4rem; flex-wrap:wrap; margin-bottom: 1rem; }
    .wiki-breadcrumb a { color: inherit; }
    .wiki-hero-grid {
      display: grid;
      grid-template-columns: minmax(0, 360px) 1fr;
      gap: 2rem;
      align-items: start;
    }
    .wiki-hero-img { margin: 0; }
    .wiki-hero-img a {
      display: block;
      cursor: zoom-in;
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-md);
      transition: transform .15s ease;
    }
    .wiki-hero-img a:hover { transform: scale(1.01); }
    .wiki-hero-img img {
      width: 100%;
      aspect-ratio: 4/3;
      object-fit: cover;
      display: block;
    }
    .wiki-hero-text h1 {
      font-family: 'Fraunces', serif;
      font-size: clamp(1.6rem, 3vw, 2.1rem);
      margin: .25rem 0 .35rem;
      color: var(--ink);
      letter-spacing: -.01em;
    }
    .wiki-subtitle {
      font-size: .92rem;
      color: var(--ink-muted);
      margin: 0 0 1rem;
      letter-spacing: 0.02em;
      text-transform: capitalize;
    }
    .chips { display:flex; flex-wrap:wrap; gap:.4rem; margin: 0 0 .35rem; }
    .wiki-summary {
      font-size: 1.05rem;
      line-height: 1.6;
      color: var(--ink);
      margin: 0 0 1rem;
      max-width: 60ch;
      font-weight: 450;
    }
    .wiki-age-row {
      display: inline-flex;
      align-items: center;
      gap: .35rem;
      flex-wrap: wrap;
      margin: 0 0 1.25rem;
      padding: .25rem .35rem .25rem .65rem;
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: .78rem;
    }
    .wiki-age-label { color: var(--ink-muted); font-weight: 500; padding-right: .15rem; }
    .wiki-age-tab {
      padding: .2rem .6rem;
      border-radius: 999px;
      border: none;
      background: transparent;
      color: var(--ink-muted);
      font-size: .8rem;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
      transition: background .15s, color .15s;
    }
    .wiki-age-tab:hover { color: var(--ink); }
    .wiki-age-tab.is-active {
      background: var(--primary);
      color: #FFFDF8;
    }
    .wiki-actions { display:flex; gap:.5rem; flex-wrap:wrap; margin-top: .25rem; }
    .wiki-actions .btn-primary {
      padding: .65rem 1.15rem;
      font-size: .95rem;
    }

    .wiki-body { font-size: 1.02rem; line-height: 1.7; color: var(--ink); }
    .wiki-body h1 { display: none; } /* already in hero */
    .wiki-body h2 {
      margin: 2.25rem 0 .75rem;
      font-family: 'Fraunces', serif;
      font-size: 1.3rem;
      color: var(--primary);
      letter-spacing: -.005em;
    }
    .wiki-body h2::before {
      content: "";
      display: inline-block;
      width: 1.4rem;
      height: 2px;
      background: var(--d-active, var(--accent));
      margin-right: .65rem;
      vertical-align: middle;
      border-radius: 2px;
    }
    .wiki-body h3 { margin-top: 1.5rem; font-size: 1.05rem; color: var(--ink); }
    .wiki-body p { margin: 0 0 1rem; color: var(--ink); max-width: 70ch; }
    .wiki-body blockquote {
      border-left: 3px solid var(--d-active, var(--accent));
      margin: 1.25rem 0;
      padding: .35rem 1rem;
      color: var(--ink);
      font-style: italic;
      background: color-mix(in srgb, var(--d-active, var(--accent)) 7%, var(--bg-elev));
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    }
    .wiki-body ul, .wiki-body ol { padding-left: 1.25rem; margin: .25rem 0 1rem; max-width: 70ch; }
    .wiki-body li { margin: .35rem 0; color: var(--ink); }
    .wiki-body ul li.task { list-style: none; margin-left: -1.25rem; }
    .wiki-body a {
      color: var(--primary-ink);
      text-decoration: underline;
      text-decoration-thickness: 1px;
      text-underline-offset: 3px;
      text-decoration-color: color-mix(in srgb, var(--primary) 40%, transparent);
    }
    .wiki-body a:hover { color: var(--primary); text-decoration-color: var(--primary); }

    .wiki-map {
      margin: 2rem 0 0;
      padding: 1rem 1.25rem 1.25rem;
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
    }
    .wiki-map h3 {
      margin: 0 0 .75rem;
      font-size: 1.05rem;
      font-family: 'Fraunces', serif;
      color: var(--primary);
    }
    .wiki-map > div {
      height: 320px;
      border-radius: var(--radius);
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .wiki-gallery {
      margin: 2.5rem 0 1rem;
      padding: 1.25rem 1.25rem 1rem;
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
    }
    .wiki-gallery-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .wiki-gallery-head h3 {
      margin: 0;
      font-size: 1.05rem;
      font-family: 'Fraunces', serif;
      color: var(--primary);
    }
    .wiki-gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: .65rem;
    }
    .wiki-thumb {
      position: relative;
      aspect-ratio: 1 / 1;
      display: block;
      border-radius: var(--radius);
      overflow: hidden;
      background: var(--bg-soft);
      box-shadow: var(--shadow-sm);
      transition: transform .18s var(--ease), box-shadow .18s var(--ease);
      text-decoration: none;
      color: inherit;
      isolation: isolate;
      cursor: zoom-in;
    }
    .wiki-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform .35s var(--ease);
    }
    .wiki-thumb:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); color: inherit; }
    .wiki-thumb:hover img { transform: scale(1.04); }
    .wiki-thumb::after {
      /* domain-tinted top edge so a wall of photos still has subtle category cues */
      content: "";
      position: absolute;
      inset: 0 0 auto 0;
      height: 4px;
      background: var(--d-active, var(--primary));
      opacity: .65;
      z-index: 1;
    }
    .wiki-thumb-cap {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      padding: .55rem .65rem .5rem;
      font-size: .78rem;
      line-height: 1.25;
      color: #FFFDF8;
      background: linear-gradient(180deg, rgba(15, 22, 32, 0) 0%, rgba(15, 22, 32, 0.78) 80%);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      opacity: 0;
      transition: opacity .18s ease;
      pointer-events: none;
    }
    .wiki-thumb:hover .wiki-thumb-cap,
    .wiki-thumb:focus-visible .wiki-thumb-cap { opacity: 1; }
    @media (max-width: 600px) {
      .wiki-gallery-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: .5rem; }
      .wiki-thumb-cap { opacity: 1; }
    }

    .wiki-related {
      margin-top: 2rem;
      padding: 1rem 1.25rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-elev);
    }
    .wiki-related h3 {
      margin: 0 0 .85rem;
      font-size: 1rem;
      font-family: 'Fraunces', serif;
      color: var(--primary);
    }
    .wiki-related-row { display: flex; flex-wrap: wrap; gap: .5rem; }
    .wiki-related-chip {
      display: inline-flex;
      align-items: center;
      gap: .4rem;
      padding: .4rem .7rem .4rem .55rem;
      border-radius: 999px;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      color: var(--ink);
      font-size: .88rem;
      transition: background .15s, border-color .15s, transform .15s;
    }
    .wiki-related-chip:hover {
      background: var(--primary-soft);
      border-color: color-mix(in srgb, var(--primary) 35%, transparent);
      transform: translateY(-1px);
      color: var(--primary-ink);
    }
    .wiki-related-kind {
      font-size: .65rem;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: var(--ink-muted);
      padding: 0 .35rem;
      border-radius: 4px;
      background: var(--bg-elev);
      border: 1px solid var(--border);
    }
    .wiki-related-w {
      font-size: .72rem;
      color: var(--accent-ink);
      font-variant-numeric: tabular-nums;
      padding-left: .15rem;
    }

    .wiki-inbound {
      margin-top: 2rem;
      padding: 1rem 1.25rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-elev);
    }
    .wiki-inbound h3 { margin: 0 0 .75rem; font-size: 1rem; color: var(--primary); }
    .wiki-inbound ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .35rem; }
    .wiki-inbound li { font-size: .92rem; }
    .wiki-inbound .rel-tag { display: inline-block; margin-left: .35rem; padding: 0 .4rem; border-radius: 4px; background: var(--accent-soft); font-size: .7rem; color: var(--accent-ink); }
    .wiki-meta { margin-top: 2.5rem; }
    .wiki-meta summary { cursor: pointer; color: var(--ink-muted); font-size: .85rem; }
    .wiki-meta summary:hover { color: var(--ink-soft); }
    .wiki-meta p { margin-top: .5rem; font-size: .82rem; }

    @media (max-width: 760px) {
      .wiki-hero-grid { grid-template-columns: 1fr; gap: 1rem; }
      .wiki-hero-img img { aspect-ratio: 16/10; }
      .wiki-hero-text h1 { font-size: 1.55rem; }
    }
  </style>
  <script>
  (function () {
    var box = document.querySelector('[data-age-toggle]');
    if (!box) return;
    var host = document.querySelector('[data-summary-host]');
    var tabs = box.querySelectorAll('.wiki-age-tab');
    var texts = {};
    box.querySelectorAll('template[data-band-text]').forEach(function (t) {
      texts[t.dataset.bandText] = t.textContent || "";
    });
    var stored = null;
    try { stored = localStorage.getItem('museiq-age-band'); } catch (e) {}
    function setBand(band) {
      if (!texts[band]) return;
      tabs.forEach(function (t) {
        var on = t.dataset.band === band;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (host) host.textContent = texts[band];
      try { localStorage.setItem('museiq-age-band', band); } catch (e) {}
    }
    if (stored && texts[stored]) setBand(stored);
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { setBand(t.dataset.band); });
    });
  })();

  // Photo gallery — Show all toggle.
  (function () {
    var btn = document.querySelector('[data-gallery-toggle]');
    var grid = document.querySelector('[data-gallery-grid]');
    if (!btn || !grid) return;
    var expanded = false;
    btn.addEventListener('click', function () {
      expanded = !expanded;
      grid.querySelectorAll('.wiki-thumb.is-extra').forEach(function (el) {
        el.hidden = !expanded;
      });
      btn.textContent = expanded ? 'Show fewer' : 'Show all ' + grid.querySelectorAll('.wiki-thumb').length;
    });
  })();
  </script>`;
  return layout({ title: `${page.title} — MuseIQ Wiki`, body });
}

// Pull a leading "> ..." block from the body so we can hoist it into the hero.
function extractLeadingQuote(md: string): { quote: string | null; body: string } {
  // skip an optional H1 first
  const lines = md.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length && /^# /.test(lines[i])) i++;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || !/^>\s?/.test(lines[i])) {
    return { quote: null, body: md };
  }
  const buf: string[] = [];
  const start = i;
  while (i < lines.length && /^>\s?/.test(lines[i])) {
    buf.push(lines[i].replace(/^>\s?/, ""));
    i++;
  }
  const rest = lines.slice(0, start).concat(lines.slice(i)).join("\n");
  return { quote: buf.join(" ").trim(), body: rest };
}

function stripLeadingHeading(md: string, title: string): string {
  const re = new RegExp(`^\\s*#\\s+${title.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\n`, "i");
  return md.replace(re, "");
}

export function renderEncyclopediaIndex(opts: {
  user: string;
  data: EncyclopediaData;
}): string {
  const { user, data } = opts;
  const wikiPath = (p: string) => `/wiki/${encodeURIComponent(user)}/${p.split("/").map(encodeURIComponent).join("/")}`;

  const navLinks = data.sections.map((s) =>
    `<a href="#sec-${s.domain}" class="enc-jump domain-${s.domain}">
      <span class="enc-jump-emoji">${s.emoji}</span>
      <span class="enc-jump-label">${escapeHtml(s.label)}</span>
      <span class="enc-jump-count">${s.total}</span>
    </a>`
  ).join("");

  const sectionHtml = data.sections.map((s) => {
    const kindKeys = Object.keys(s.byKind).sort((a, b) => kindRank(a) - kindRank(b));
    const kindBlocks = kindKeys.map((k) => {
      const entries = s.byKind[k];
      const items = entries.map((e) => {
        const inb = e.inbound_links > 0
          ? `<span class="enc-meta">${e.inbound_links} link${e.inbound_links === 1 ? "" : "s"} in</span>`
          : "";
        const summary = e.summary ? `<span class="enc-summary">${escapeHtml(e.summary)}</span>` : "";
        return `<li class="enc-entry">
          <a href="${wikiPath(e.path)}" class="enc-entry-link">
            <strong>${escapeHtml(e.title)}</strong>
            ${summary}
          </a>
          ${inb}
        </li>`;
      }).join("");
      return `<div class="enc-kind">
        <h3 class="enc-kind-head">
          <span class="enc-kind-label">${escapeHtml(kindLabel(k))}</span>
          <span class="enc-kind-count">${entries.length}</span>
        </h3>
        <ul class="enc-list">${items}</ul>
      </div>`;
    }).join("");

    return `<section class="enc-section domain-${s.domain}" id="sec-${s.domain}">
      <header class="enc-section-head">
        <span class="enc-section-emoji">${s.emoji}</span>
        <h2>${escapeHtml(s.label)}</h2>
        <span class="enc-section-count">${s.total} page${s.total === 1 ? "" : "s"}</span>
      </header>
      <div class="enc-kinds">${kindBlocks}</div>
    </section>`;
  }).join("");

  const exhibitsCard = `
    <a class="enc-exhibits" href="/interactions/view">
      <div class="enc-exhibits-emoji">📸</div>
      <div class="enc-exhibits-text">
        <strong>${data.exhibitCount.toLocaleString()} captured exhibit${data.exhibitCount === 1 ? "" : "s"}</strong>
        <span class="muted">Browse the photos you took at the museum</span>
      </div>
      <span class="enc-exhibits-arrow" aria-hidden="true">→</span>
    </a>`;

  const body = `
  <section class="enc">
    <div class="container enc-container">
      <header class="enc-head">
        <p class="eyebrow">${escapeHtml(user === "default" ? "Your" : user + "'s")} encyclopedia</p>
        <h1>Wiki index</h1>
        <p class="muted">${data.totalPages.toLocaleString()} entry page${data.totalPages === 1 ? "" : "s"}, organized by subject. Click a subject to jump to it.</p>
      </header>

      ${exhibitsCard}

      ${data.sections.length ? `<nav class="enc-nav" aria-label="Subjects">${navLinks}</nav>` : ""}

      <div class="enc-sections">${sectionHtml || `<p class="muted">No entry pages yet — capture more exhibits and the encyclopedia will grow here.</p>`}</div>

      <p class="muted enc-foot">Last updated ${data.lastUpdated ? escapeHtml(data.lastUpdated.slice(0, 10)) : "—"} · <a href="/wiki/${encodeURIComponent(user)}/log">activity log</a></p>
    </div>
  </section>
  <style>
    .enc-container { max-width: 1080px; padding: 1.5rem 1.5rem 4rem; margin: 0 auto; }
    .enc-head { margin-bottom: 1.5rem; }
    .enc-head h1 { font-family: 'Fraunces', serif; font-size: clamp(2rem, 4vw, 2.8rem); margin: .25rem 0 .5rem; color: var(--ink); }
    .enc-head p { font-size: 1rem; }

    .enc-exhibits {
      display: grid;
      grid-template-columns: 56px 1fr 32px;
      gap: 1rem;
      align-items: center;
      padding: 1rem 1.25rem;
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-left: 5px solid var(--primary);
      border-radius: var(--radius-lg);
      margin-bottom: 1.5rem;
      color: inherit;
      box-shadow: var(--shadow-sm);
      transition: transform .15s ease, box-shadow .15s ease;
    }
    .enc-exhibits:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); color: inherit; }
    .enc-exhibits-emoji { font-size: 2.2rem; line-height: 1; }
    .enc-exhibits-text strong { font-family: 'Fraunces', serif; font-size: 1.15rem; color: var(--ink); display: block; }
    .enc-exhibits-text .muted { font-size: .9rem; }
    .enc-exhibits-arrow { font-size: 1.5rem; color: var(--primary); }

    .enc-nav {
      display: flex;
      gap: .5rem;
      flex-wrap: wrap;
      padding: .75rem;
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 2rem;
      position: sticky;
      top: 64px;
      z-index: 5;
      backdrop-filter: blur(8px);
    }
    .enc-jump {
      display: inline-flex;
      align-items: center;
      gap: .4rem;
      padding: .35rem .85rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--d-active, var(--primary)) 8%, var(--bg));
      color: var(--d-active-ink, var(--primary));
      font-size: .9rem;
      font-weight: 500;
      border: 1px solid color-mix(in srgb, var(--d-active, var(--primary)) 22%, transparent);
      transition: background .15s, transform .15s;
    }
    .enc-jump:hover { color: var(--d-active-ink, var(--primary)); transform: translateY(-1px); }
    .enc-jump-emoji { font-size: 1.05rem; line-height: 1; }
    .enc-jump-count { font-size: .78rem; color: var(--ink-muted); padding: 0 .35rem; border-radius: 999px; background: var(--bg-elev); border: 1px solid var(--border); }

    .enc-sections { display: grid; gap: 2.5rem; }
    .enc-section { scroll-margin-top: 100px; }
    .enc-section-head {
      display: flex;
      align-items: baseline;
      gap: .75rem;
      padding: .5rem 0 .75rem;
      border-bottom: 2px solid color-mix(in srgb, var(--d-active, var(--primary)) 35%, transparent);
      margin-bottom: 1.25rem;
    }
    .enc-section-emoji { font-size: 1.8rem; }
    .enc-section-head h2 { font-family: 'Fraunces', serif; font-size: 1.7rem; margin: 0; color: var(--d-active-ink, var(--primary)); }
    .enc-section-count { margin-left: auto; font-size: .82rem; color: var(--ink-muted); }

    .enc-kinds { display: grid; gap: 1.5rem; grid-template-columns: 1fr; }
    .enc-kind-head {
      display: flex;
      align-items: baseline;
      gap: .5rem;
      margin: 0 0 .5rem;
      font-size: 1rem;
    }
    .enc-kind-label { font-family: 'Fraunces', serif; font-weight: 600; color: var(--ink); text-transform: capitalize; letter-spacing: -0.005em; }
    .enc-kind-count { font-size: .78rem; color: var(--ink-muted); padding: 0 .45rem; border-radius: 999px; background: var(--bg-soft); border: 1px solid var(--border); }

    .enc-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: .25rem .75rem;
    }
    .enc-entry {
      padding: .5rem .25rem .5rem 0;
      border-bottom: 1px dotted var(--border);
      font-size: .92rem;
    }
    .enc-entry-link {
      display: flex;
      flex-direction: column;
      gap: .15rem;
      color: inherit;
      text-decoration: none;
    }
    .enc-entry-link:hover strong { color: var(--d-active-ink, var(--primary)); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
    .enc-entry-link strong { font-weight: 600; color: var(--ink); }
    .enc-summary { color: var(--ink-soft); font-size: .85rem; line-height: 1.4; }
    .enc-meta { font-size: .72rem; color: var(--ink-muted); margin-left: .35rem; }

    .enc-foot { font-size: .85rem; margin-top: 3rem; text-align: center; }

    @media (min-width: 760px) {
      .enc-kinds { grid-template-columns: repeat(2, 1fr); gap: 1.5rem 2rem; }
    }
    @media (min-width: 1000px) {
      .enc-kinds { grid-template-columns: repeat(3, 1fr); }
    }
  </style>`;
  return layout({ title: "Wiki index — MuseIQ", active: "wiki", body });
}

export function renderWikiSyntheticPage(opts: {
  user: string;
  path: string;
  kind: "index" | "log";
  title: string;
  body: string;
}): string {
  const { user, kind, title, body } = opts;
  const html = renderMarkdown(body);
  const pageBody = `
  <section class="wiki">
    <div class="container wiki-container">
      <nav class="wiki-breadcrumb" aria-label="Breadcrumb">
        <a href="/wiki/${encodeURIComponent(user)}/index">${escapeHtml(user)}'s wiki</a>
        <span aria-hidden="true">›</span>
        <span>${escapeHtml(kind)}</span>
      </nav>
      <article class="wiki-body">${html}</article>
      <p class="muted" style="margin-top:2rem;font-size:.85rem;">
        ${kind === "index" ? "Auto-generated index" : "Auto-generated log"} · live view
      </p>
    </div>
  </section>
  <style>
    .wiki-container { max-width: 760px; }
    .wiki-breadcrumb { font-size:.85rem; color:#64748b; margin: 0 0 1rem; display:flex; gap:.4rem; }
    .wiki-body h1 { font-family: 'Fraunces', serif; font-size: 2.4rem; margin: .25rem 0 1rem; }
    .wiki-body h2 { margin-top: 2rem; }
    .wiki-body blockquote { border-left: 3px solid var(--accent,#0ea5e9); margin: 1.25rem 0; padding: .25rem 1rem; color: #334155; font-style: italic; background: rgba(14,165,233,.05); border-radius: 0 .5rem .5rem 0; }
    .wiki-body ul li { margin: 0; }
    .wiki-body a { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
  </style>`;
  return layout({ title: `${title} — MuseIQ`, body: pageBody });
}

export function renderWikiSearch(opts: {
  user: string;
  query: string;
  hits: WikiSearchHit[];
}): string {
  const { user, query, hits } = opts;
  const results = hits.length
    ? `<ul class="search-results">${hits
        .map((h) => {
          const href = `/wiki/${encodeURIComponent(user)}/${h.path.split("/").map(encodeURIComponent).join("/")}`;
          // snippet contains <mark>…</mark> from FTS5; we trust those tags only.
          return `<li>
            <a href="${href}"><strong>${escapeHtml(h.title)}</strong></a>
            <span class="muted">· ${escapeHtml(h.kind)} · ${escapeHtml(h.path)}</span>
            <p class="snippet">${sanitizeSnippet(h.snippet)}</p>
          </li>`;
        })
        .join("")}</ul>`
    : `<p class="muted">${query ? `No matches for "${escapeHtml(query)}".` : "Type a query above to search the wiki."}</p>`;

  const body = `
  <section class="wiki">
    <div class="container wiki-container">
      <nav class="wiki-breadcrumb">
        <a href="/wiki/${encodeURIComponent(user)}/index">${escapeHtml(user)}'s wiki</a>
        <span aria-hidden="true">›</span>
        <span>search</span>
      </nav>
      <h1>Search the wiki</h1>
      <form method="get" action="/wiki/${encodeURIComponent(user)}/_search" role="search" class="search-form">
        <input type="search" name="q" value="${escapeHtml(query)}" placeholder="bronze, ritual, perspective…" autofocus />
        <button class="btn btn-primary btn-sm" type="submit">Search</button>
      </form>
      <p class="muted" style="font-size:.85rem;">${hits.length} result${hits.length === 1 ? "" : "s"}.</p>
      ${results}
    </div>
  </section>
  <style>
    .wiki-container { max-width: 760px; }
    .search-form { display:flex; gap:.5rem; margin: 1rem 0; }
    .search-form input { flex:1; padding: .5rem .75rem; border:1px solid var(--border,#e5e7eb); border-radius:.5rem; font-size:1rem; }
    .search-results { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: .75rem; }
    .search-results li { padding: .85rem 1rem; border:1px solid var(--border,#e5e7eb); border-radius:.6rem; background:var(--bg-elev,#fff); }
    .search-results .snippet { margin: .35rem 0 0; font-size: .9rem; color:#475569; line-height:1.4; }
    .search-results mark { background: #fef08a; color:inherit; padding: 0 1px; }
  </style>`;
  return layout({ title: query ? `"${query}" — Wiki search` : "Wiki search — MuseIQ", body });
}

function sanitizeSnippet(s: string): string {
  // FTS5 snippet emits text with <mark>…</mark>. Escape everything else.
  const parts = s.split(/(<\/?mark>)/g);
  return parts.map((p) => (p === "<mark>" || p === "</mark>") ? p : escapeHtml(p)).join("");
}

export function renderCompare(opts: {
  user: string;
  pathA: string;
  pathB: string;
  result: { titleA: string; titleB: string; answerMd: string } | null;
  error: string | null;
}): string {
  const { user, pathA, pathB, result, error } = opts;
  const linkA = pathA ? `/wiki/${encodeURIComponent(user)}/${pathA.split("/").map(encodeURIComponent).join("/")}` : "";
  const linkB = pathB ? `/wiki/${encodeURIComponent(user)}/${pathB.split("/").map(encodeURIComponent).join("/")}` : "";
  const body = `
  <section class="wiki">
    <div class="container wiki-container">
      <nav class="wiki-breadcrumb">
        <a href="/wiki/${encodeURIComponent(user)}/index">${escapeHtml(user)}'s wiki</a>
        <span aria-hidden="true">›</span>
        <span>compare</span>
      </nav>
      <h1>Compare two pages</h1>
      <form method="get" action="/wiki/${encodeURIComponent(user)}/_compare" class="ask-form" style="flex-direction:column;">
        <label>Page A path<input type="text" name="a" value="${escapeHtml(pathA)}" placeholder="exhibits/abc-123" /></label>
        <label>Page B path<input type="text" name="b" value="${escapeHtml(pathB)}" placeholder="exhibits/def-456" /></label>
        <button class="btn btn-primary" type="submit" style="align-self:flex-start;">Compare</button>
      </form>
      ${error ? `<div class="ask-error">${escapeHtml(error)}</div>` : ""}
      ${result ? `
        <div class="cmp-heads">
          <div><strong>A:</strong> <a href="${linkA}">${escapeHtml(result.titleA)}</a></div>
          <div><strong>B:</strong> <a href="${linkB}">${escapeHtml(result.titleB)}</a></div>
        </div>
        <article class="ask-answer">${renderMarkdown(result.answerMd)}</article>
      ` : ""}
    </div>
  </section>
  <style>
    .wiki-container { max-width: 760px; }
    .ask-form label { display:flex; flex-direction:column; gap:.25rem; font-size:.85rem; color:#475569; }
    .ask-form input { padding: .55rem .75rem; border:1px solid var(--border,#e5e7eb); border-radius:.5rem; font-family: ui-monospace, monospace; }
    .ask-form { gap: .75rem; margin: 1rem 0; display:flex; flex-direction: column; }
    .cmp-heads { display:flex; gap: 2rem; flex-wrap: wrap; padding: .75rem 1rem; background: rgba(0,0,0,.03); border-radius: .5rem; margin: 1rem 0; }
    .ask-answer { padding: 1rem 1.25rem; border:1px solid var(--border,#e5e7eb); border-radius: .8rem; background: var(--bg-elev,#fff); }
  </style>`;
  return layout({ title: "Compare — MuseIQ", body });
}

export function renderQuiz(opts: {
  user: string;
  path: string;
  quiz: { pageTitle: string; pagePath: string; questions: Array<{ prompt: string; type: "mcq" | "free"; choices?: string[]; correct_index?: number; hint?: string; explanation: string }> };
}): string {
  const { user, path, quiz } = opts;
  const pageHref = `/wiki/${encodeURIComponent(user)}/${quiz.pagePath.split("/").map(encodeURIComponent).join("/")}`;
  const items = quiz.questions.map((q, i) => {
    if (q.type === "mcq" && q.choices) {
      const opts = q.choices.map((c, j) => `<label class="quiz-opt">
        <input type="radio" name="q${i}" value="${j}" data-correct="${q.correct_index === j ? 1 : 0}" />
        <span>${escapeHtml(c)}</span>
      </label>`).join("");
      return `<li class="quiz-q" data-q="${i}" data-type="mcq" data-explanation="${escapeHtml(q.explanation)}">
        <h3>${i + 1}. ${escapeHtml(q.prompt)}</h3>
        ${q.hint ? `<p class="quiz-hint">💡 ${escapeHtml(q.hint)}</p>` : ""}
        <div class="quiz-opts">${opts}</div>
        <p class="quiz-feedback" hidden></p>
      </li>`;
    }
    return `<li class="quiz-q" data-q="${i}" data-type="free" data-explanation="${escapeHtml(q.explanation)}">
      <h3>${i + 1}. ${escapeHtml(q.prompt)}</h3>
      ${q.hint ? `<p class="quiz-hint">💡 ${escapeHtml(q.hint)}</p>` : ""}
      <textarea name="q${i}" rows="3" placeholder="Type your thought…"></textarea>
      <p class="quiz-feedback" hidden></p>
    </li>`;
  }).join("");

  const body = `
  <section class="wiki">
    <div class="container wiki-container">
      <nav class="wiki-breadcrumb">
        <a href="/wiki/${encodeURIComponent(user)}/index">${escapeHtml(user)}'s wiki</a>
        <span aria-hidden="true">›</span>
        <a href="${pageHref}">${escapeHtml(quiz.pageTitle)}</a>
        <span aria-hidden="true">›</span>
        <span>quiz</span>
      </nav>
      <p class="eyebrow">Quick quiz</p>
      <h1>${escapeHtml(quiz.pageTitle)}</h1>
      <p class="muted">${quiz.questions.length} questions · click an answer to see how you did.</p>
      <ol class="quiz-list">${items}</ol>
      <button id="quiz-grade" class="btn btn-primary" type="button">Grade my quiz</button>
      <p id="quiz-score" class="muted" style="margin-top:.75rem;"></p>
      <p style="margin-top:1rem;"><a href="${pageHref}">← Back to page</a></p>
    </div>
  </section>
  <style>
    .wiki-container { max-width: 760px; }
    .quiz-list { list-style: none; padding: 0; margin: 1rem 0 1.5rem; display: grid; gap: .75rem; }
    .quiz-q { padding: 1rem 1.25rem; border:1px solid var(--border,#e5e7eb); border-radius: .8rem; background: var(--bg-elev,#fff); }
    .quiz-q h3 { margin: 0 0 .35rem; font-size: 1.05rem; }
    .quiz-hint { font-size:.85rem; color:#475569; margin: 0 0 .5rem; }
    .quiz-opts { display: grid; gap: .35rem; }
    .quiz-opt { display:flex; gap:.5rem; padding: .4rem .6rem; border:1px solid var(--border,#e5e7eb); border-radius:.5rem; cursor:pointer; }
    .quiz-opt input { margin-top: .2rem; }
    .quiz-opt.right { background:#dcfce7; border-color:#86efac; }
    .quiz-opt.wrong { background:#fee2e2; border-color:#fca5a5; }
    .quiz-q textarea { width: 100%; padding: .5rem .65rem; border:1px solid var(--border,#e5e7eb); border-radius: .4rem; font-family: inherit; }
    .quiz-feedback { font-size:.9rem; padding:.5rem .65rem; border-radius:.4rem; background: rgba(14,165,233,.08); color: #0c4a6e; margin: .5rem 0 0; }
  </style>
  <script>
  (function () {
    var grade = document.getElementById('quiz-grade');
    var scoreEl = document.getElementById('quiz-score');
    if (!grade) return;
    grade.addEventListener('click', function () {
      var qs = document.querySelectorAll('.quiz-q');
      var right = 0, total = 0;
      qs.forEach(function (q) {
        var type = q.getAttribute('data-type');
        var fb = q.querySelector('.quiz-feedback');
        var explanation = q.getAttribute('data-explanation') || '';
        if (type === 'mcq') {
          total++;
          var opts = q.querySelectorAll('.quiz-opt input');
          var correctIdx = -1;
          var pickedIdx = -1;
          opts.forEach(function (input, i) {
            if (input.getAttribute('data-correct') === '1') correctIdx = i;
            if (input.checked) pickedIdx = i;
          });
          opts.forEach(function (input, i) {
            var label = input.parentElement;
            if (i === correctIdx) label.classList.add('right');
            else if (i === pickedIdx) label.classList.add('wrong');
            input.disabled = true;
          });
          if (pickedIdx === correctIdx) right++;
          fb.hidden = false;
          fb.textContent = (pickedIdx === correctIdx ? '✅ ' : '✏️ ') + explanation;
        } else {
          fb.hidden = false;
          fb.textContent = '✏️ ' + explanation;
        }
      });
      grade.disabled = true;
      grade.style.opacity = '.55';
      scoreEl.textContent = 'You got ' + right + ' of ' + total + ' multiple-choice questions right.';
    });
  })();
  </script>`;
  return layout({ title: `Quiz: ${quiz.pageTitle} — MuseIQ`, body });
}

export function renderWikiAsk(opts: {
  user: string;
  question: string;
  contextPath?: string;
  answer: { answerMd: string; citations: Array<{ path: string; title: string; kind: string }>; shortlistedPaths: string[] } | null;
  error: string | null;
}): string {
  const { user, question, contextPath, answer, error } = opts;
  const answerHtml = answer ? renderMarkdown(answer.answerMd) : "";
  const citationsHtml = answer && answer.citations.length
    ? `<aside class="ask-cites">
        <h3>Pages I read</h3>
        <ul>
          ${answer.citations.map((c) => {
            const href = `/wiki/${encodeURIComponent(user)}/${c.path.split("/").map(encodeURIComponent).join("/")}`;
            return `<li><a href="${href}">${escapeHtml(c.title)}</a> <span class="muted">· ${escapeHtml(c.kind)}</span></li>`;
          }).join("")}
        </ul>
      </aside>`
    : "";
  const body = `
  <section class="wiki">
    <div class="container wiki-container">
      <nav class="wiki-breadcrumb">
        <a href="/wiki/${encodeURIComponent(user)}/index">${escapeHtml(user)}'s wiki</a>
        <span aria-hidden="true">›</span>
        <span>ask</span>
      </nav>
      <h1>Ask the wiki</h1>
      <p class="muted">Ask anything about the exhibits you've captured. Answers come from your own wiki pages — with citations so you can read more.</p>
      <form method="get" action="/wiki/${encodeURIComponent(user)}/_ask" class="ask-form">
        ${contextPath ? `<input type="hidden" name="about" value="${escapeHtml(contextPath)}" />` : ""}
        <textarea name="q" rows="3" placeholder="e.g. What was bronze used for? Why are these styles different?" autofocus>${escapeHtml(question)}</textarea>
        <button class="btn btn-primary" type="submit">Ask</button>
      </form>
      ${error ? `<div class="ask-error">${escapeHtml(error)}</div>` : ""}
      ${answer ? `<article class="ask-answer">${answerHtml}</article>${citationsHtml}` : ""}
    </div>
  </section>
  <style>
    .wiki-container { max-width: 760px; }
    .ask-form { display:flex; gap:.5rem; margin: 1.25rem 0; align-items:stretch; flex-direction: column; }
    .ask-form textarea { padding: .65rem .8rem; border:1px solid var(--border,#e5e7eb); border-radius:.6rem; font-size: 1rem; resize: vertical; font-family: inherit; }
    .ask-form button { align-self: flex-start; }
    .ask-error { padding: .75rem 1rem; background:#fee2e2; border:1px solid #fca5a5; border-radius: .5rem; color:#991b1b; margin: 1rem 0; }
    .ask-answer { padding: 1rem 1.25rem; border:1px solid var(--border,#e5e7eb); border-radius: .8rem; background: var(--bg-elev,#fff); margin-top: 1.25rem; }
    .ask-answer p { line-height: 1.6; }
    .ask-cites { margin-top: 1rem; padding: .75rem 1rem; background: rgba(0,0,0,.02); border:1px dashed var(--border,#e5e7eb); border-radius: .6rem; font-size: .9rem; }
    .ask-cites h3 { margin: 0 0 .4rem; font-size: .9rem; }
    .ask-cites ul { padding-left: 1.2rem; margin: 0; }
  </style>`;
  return layout({ title: question ? `${question} — Wiki ask` : "Ask the wiki", body });
}

export function renderQuests(opts: {
  user: string;
  quests: Array<{ id: string; title: string; description: string; emoji: string; current: number; target: number; hint?: string; completed: boolean; earnedAt?: string }>;
}): string {
  const { quests } = opts;
  const earned = quests.filter((q) => q.earnedAt).length;
  const inProgress = quests.filter((q) => !q.earnedAt && q.current > 0);
  const locked = quests.filter((q) => !q.earnedAt && q.current === 0);

  const card = (q: typeof quests[number]) => {
    const pct = Math.min(100, Math.round((q.current / Math.max(1, q.target)) * 100));
    const tone = q.completed
      ? "background:#dcfce7;border-color:#86efac;"
      : q.current > 0
      ? "background:#fef9c3;border-color:#fde047;"
      : "background:var(--bg-elev,#fff);";
    return `
    <article class="quest" style="${tone}">
      <div class="quest-emoji">${q.emoji}</div>
      <div class="quest-body">
        <h3>${escapeHtml(q.title)} ${q.earnedAt ? `<span class="earned">earned ${escapeHtml((q.earnedAt || "").slice(0, 10))}</span>` : ""}</h3>
        <p class="quest-desc">${escapeHtml(q.description)}</p>
        <div class="quest-bar"><div class="quest-bar-fill" style="width:${pct}%;"></div></div>
        <p class="quest-progress">${q.current} / ${q.target}${q.hint && !q.completed ? ` <span class="muted">· ${escapeHtml(q.hint)}</span>` : ""}</p>
      </div>
    </article>`;
  };

  const body = `
  <section class="wiki">
    <div class="container" style="max-width: 820px;">
      <header style="margin-bottom: 1.5rem;">
        <p class="eyebrow">Junior Curator</p>
        <h1>Quests &amp; badges</h1>
        <p class="muted">${earned} of ${quests.length} earned · ${inProgress.length} in progress</p>
      </header>
      ${earned ? `<h2 style="font-size:1.1rem;margin-top:1.5rem;">Earned (${earned})</h2><div class="quest-grid">${quests.filter((q) => q.earnedAt).map(card).join("")}</div>` : ""}
      ${inProgress.length ? `<h2 style="font-size:1.1rem;margin-top:1.5rem;">In progress (${inProgress.length})</h2><div class="quest-grid">${inProgress.map(card).join("")}</div>` : ""}
      ${locked.length ? `<h2 style="font-size:1.1rem;margin-top:1.5rem;">Up next (${locked.length})</h2><div class="quest-grid">${locked.map(card).join("")}</div>` : ""}
    </div>
  </section>
  <style>
    .quest-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: .75rem; margin-bottom: 1rem; }
    .quest { display:flex; gap: 1rem; padding: 1rem; border: 1px solid var(--border,#e5e7eb); border-radius: .75rem; }
    .quest-emoji { font-size: 2rem; line-height: 1; }
    .quest-body { flex:1; }
    .quest h3 { margin: 0 0 .25rem; font-size: 1.05rem; display:flex; gap:.5rem; align-items:baseline; flex-wrap:wrap; }
    .quest h3 .earned { font-size:.7rem; padding: .1rem .5rem; border-radius: 999px; background:#16a34a; color:#fff; font-weight:500; }
    .quest-desc { margin: 0 0 .5rem; font-size: .9rem; color:#475569; }
    .quest-bar { height: 6px; background: rgba(0,0,0,.08); border-radius: 999px; overflow: hidden; margin: .35rem 0; }
    .quest-bar-fill { height: 100%; background: linear-gradient(90deg,#0ea5e9,#22d3ee); border-radius: 999px; transition: width .3s ease; }
    .quest-progress { margin: .25rem 0 0; font-size: .82rem; color: #334155; }
  </style>`;
  return layout({ title: "Quests — MuseIQ", body });
}

export function renderKnowledgeGraph(opts: {
  user: string;
  data: GraphData;
}): string {
  const { user, data } = opts;
  const dataJson = JSON.stringify({
    nodes: data.nodes,
    edges: data.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight, via: e.via })),
  });
  const body = `
  <section class="wiki">
    <div class="container kg-container">
      <header style="margin-bottom: 1rem;">
        <p class="eyebrow">Cross-page view</p>
        <h1>Knowledge graph</h1>
        <p class="muted">${data.nodes.length} entity page${data.nodes.length === 1 ? "" : "s"}, ${data.edges.length} connection${data.edges.length === 1 ? "" : "s"}. Two pages connect when an exhibit cites both. Drag a node to rearrange, scroll to zoom, click to open. Filter by subject below.</p>
      </header>

      <div class="kg-toolbar">
        <div class="kg-filters" id="kg-filters">
          <button type="button" class="kg-filter is-active" data-domain="all">All</button>
          <button type="button" class="kg-filter domain-history" data-domain="history">🏺 History</button>
          <button type="button" class="kg-filter domain-art" data-domain="art">🎨 Art</button>
          <button type="button" class="kg-filter domain-science" data-domain="science">🦖 Science</button>
          <button type="button" class="kg-filter domain-tech" data-domain="tech">⚙️ Tech</button>
          <button type="button" class="kg-filter domain-culture" data-domain="culture">🌍 Culture</button>
          <button type="button" class="kg-filter" data-domain="other">✨ Other</button>
        </div>
        <div class="kg-controls">
          <input type="search" id="kg-search" placeholder="Find a page…" />
          <button type="button" id="kg-reset">Reset view</button>
        </div>
      </div>

      <div id="kg-wrap" class="kg-wrap">
        <svg id="kg-svg"></svg>
        <div id="kg-tip" class="kg-tip" hidden></div>
        ${data.nodes.length === 0 ? `<div class="kg-empty"><p class="muted">The graph is empty. Capture more exhibits and the AI will start linking concepts together here.</p></div>` : ""}
      </div>

      <p class="muted" style="font-size:.85rem;margin-top:.75rem;">Tip: hover a node to see its label, click to open the page. Drag the canvas to pan. Drag a node to rearrange.</p>
    </div>
  </section>

  <style>
    .kg-container { max-width: 1280px; padding: 1.5rem 1.5rem 4rem; }
    .kg-toolbar { display: flex; gap: 1rem; flex-wrap: wrap; justify-content: space-between; margin: 0 0 .75rem; align-items: center; }
    .kg-filters { display: flex; gap: .35rem; flex-wrap: wrap; }
    .kg-filter {
      padding: .35rem .75rem;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--bg-elev);
      color: var(--ink-soft);
      font-size: .82rem;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
      transition: background .15s, color .15s, border-color .15s;
    }
    .kg-filter:hover { color: var(--ink); border-color: var(--border-strong); }
    .kg-filter.is-active {
      background: var(--primary);
      color: #FFFDF8;
      border-color: var(--primary);
    }
    .kg-filter.domain-history.is-active  { background: var(--d-history); color:#FFFDF8; border-color: var(--d-history); }
    .kg-filter.domain-art.is-active      { background: var(--d-art);     color:#FFFDF8; border-color: var(--d-art); }
    .kg-filter.domain-science.is-active  { background: var(--d-science); color:#FFFDF8; border-color: var(--d-science); }
    .kg-filter.domain-tech.is-active     { background: var(--d-tech);    color:#FFFDF8; border-color: var(--d-tech); }
    .kg-filter.domain-culture.is-active  { background: var(--d-culture); color:#FFFDF8; border-color: var(--d-culture); }

    .kg-controls { display: flex; gap: .35rem; align-items: center; }
    .kg-controls input {
      padding: .35rem .65rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg-elev);
      color: var(--ink);
      font-size: .85rem;
      font-family: inherit;
      width: 200px;
    }
    .kg-controls button {
      padding: .35rem .8rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg-elev);
      color: var(--ink);
      font-size: .82rem;
      cursor: pointer;
      font-family: inherit;
    }

    .kg-wrap {
      position: relative;
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
      height: 720px;
    }
    .kg-wrap svg { width: 100%; height: 100%; cursor: grab; user-select: none; }
    .kg-wrap svg:active { cursor: grabbing; }

    .kg-edge { stroke-opacity: 0.45; }
    .kg-node circle { cursor: pointer; transition: stroke-width .15s ease; }
    .kg-node circle:hover { stroke: var(--ink); stroke-width: 2.5px; }
    .kg-node text {
      font-family: 'Inter', sans-serif;
      pointer-events: none;
      user-select: none;
    }
    .kg-node.is-dim { opacity: 0.18; }
    .kg-node.is-dim text { display: none; }
    .kg-edge.is-dim { stroke-opacity: 0.06; }

    .kg-empty {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;
      pointer-events: none;
    }

    .kg-tip {
      position: absolute;
      pointer-events: none;
      background: var(--ink);
      color: #FFFDF8;
      padding: .5rem .7rem;
      border-radius: 8px;
      font-size: .82rem;
      max-width: 240px;
      box-shadow: var(--shadow-md);
      z-index: 10;
      transform: translate(-50%, -100%);
      margin-top: -10px;
    }
    .kg-tip strong { display: block; }
    .kg-tip small { color: var(--accent); font-size: .68rem; letter-spacing: .04em; text-transform: uppercase; }
  </style>

  <script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js" crossorigin="anonymous"></script>
  <script>
  (function () {
    var raw = ${dataJson};
    if (!raw.nodes.length || typeof d3 === 'undefined') return;

    var COLOR = {
      history: getCSS('--d-history'),
      art: getCSS('--d-art'),
      science: getCSS('--d-science'),
      tech: getCSS('--d-tech'),
      technology: getCSS('--d-tech'),
      culture: getCSS('--d-culture'),
      other: getCSS('--ink-muted'),
    };
    function getCSS(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#475569';
    }

    var wrap = document.getElementById('kg-wrap');
    var svgEl = document.getElementById('kg-svg');
    var tipEl = document.getElementById('kg-tip');
    var rect = wrap.getBoundingClientRect();
    var W = rect.width, H = rect.height;

    var svg = d3.select(svgEl).attr('viewBox', '0 0 ' + W + ' ' + H);
    var viewport = svg.append('g').attr('class', 'kg-viewport');

    var nodes = raw.nodes.map(function (n) { return Object.assign({}, n); });
    var links = raw.edges.map(function (e) { return Object.assign({}, e); });

    function radius(n) {
      // Sized by inbound count, capped so popular hubs don't dominate
      return 4 + Math.min(14, Math.sqrt(Math.max(1, n.inbound)) * 1.6);
    }

    var linkSel = viewport.append('g').attr('class', 'edges')
      .selectAll('line').data(links).enter().append('line')
        .attr('class', 'kg-edge')
        .attr('stroke', function (d) { return d.via === 'direct' ? '#94a3b8' : '#cbd5e1'; })
        .attr('stroke-dasharray', function (d) { return d.via === 'direct' ? '4 3' : null; })
        .attr('stroke-width', function (d) { return Math.max(0.6, Math.min(3.5, Math.log2(d.weight + 1) * 1.1)); });

    var nodeSel = viewport.append('g').attr('class', 'nodes')
      .selectAll('g').data(nodes).enter().append('g')
        .attr('class', 'kg-node');

    nodeSel.append('circle')
      .attr('r', radius)
      .attr('fill', function (d) { return COLOR[d.domain] || COLOR.other; })
      .attr('stroke', '#FFFDF8')
      .attr('stroke-width', 1.5);

    nodeSel.append('text')
      .attr('y', function (d) { return -(radius(d) + 4); })
      .attr('text-anchor', 'middle')
      .attr('font-size', function (d) { return d.inbound >= 5 ? 11 : 10; })
      .attr('font-weight', function (d) { return d.inbound >= 5 ? 600 : 500; })
      .attr('fill', 'var(--ink)')
      .attr('opacity', function (d) { return d.inbound >= 3 ? 0.92 : 0; })
      .text(function (d) {
        var t = d.title || d.id;
        return t.length > 22 ? t.slice(0, 21) + '…' : t;
      });

    nodeSel.on('mouseenter', function (event, d) {
      var t = d3.select(this).select('text');
      t.attr('opacity', 1);
      var c = this.getBoundingClientRect();
      var w = wrap.getBoundingClientRect();
      tipEl.hidden = false;
      tipEl.innerHTML = '<small>' + esc(d.kind) + ' · ' + esc(d.domain) + '</small><strong>' + esc(d.title) + '</strong>'
        + (d.inbound > 0 ? '<div style="font-size:.7rem;color:#cbd5e1;margin-top:.15rem;">' + d.inbound + ' exhibit' + (d.inbound===1?'':'s') + ' link here</div>' : '');
      tipEl.style.left = (c.left - w.left + c.width / 2) + 'px';
      tipEl.style.top = (c.top - w.top) + 'px';
    });
    nodeSel.on('mouseleave', function (event, d) {
      d3.select(this).select('text').attr('opacity', d.inbound >= 3 ? 0.92 : 0);
      tipEl.hidden = true;
    });
    nodeSel.on('click', function (event, d) {
      window.location.href = '/wiki/${user}/' + d.id.split('/').map(encodeURIComponent).join('/');
    });

    // Soft clamp so nodes never escape the viewport — keeps everything
    // clickable + visible without needing the user to zoom out.
    var pad = 24;
    function clampX(x, r) { return Math.max(pad + r, Math.min(W - pad - r, x)); }
    function clampY(y, r) { return Math.max(pad + r, Math.min(H - pad - r, y)); }

    var sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(function (d) { return d.id; })
        .distance(function (l) { return 36 + 18 / (l.weight + 1); })
        .strength(function (l) { return Math.min(0.85, 0.1 + l.weight * 0.06); }))
      // Weaker repulsion; with 500 nodes the previous -220 was throwing
      // peripheral nodes off-canvas.
      .force('charge', d3.forceManyBody().strength(-90).distanceMax(280))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('x', d3.forceX(W / 2).strength(0.04))
      .force('y', d3.forceY(H / 2).strength(0.04))
      .force('collide', d3.forceCollide().radius(function (d) { return radius(d) + 6; }))
      .alphaDecay(0.045)
      .on('tick', function () {
        nodes.forEach(function (n) {
          var r = radius(n);
          n.x = clampX(n.x, r);
          n.y = clampY(n.y, r);
        });
        linkSel
          .attr('x1', function (d) { return d.source.x; })
          .attr('y1', function (d) { return d.source.y; })
          .attr('x2', function (d) { return d.target.x; })
          .attr('y2', function (d) { return d.target.y; });
        nodeSel.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
      });

    // Drag
    var drag = d3.drag()
      .on('start', function (event, d) {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', function (event, d) {
        d.fx = event.x; d.fy = event.y;
      })
      .on('end', function (event, d) {
        if (!event.active) sim.alphaTarget(0);
        // Release after drag — let layout reflow
        d.fx = null; d.fy = null;
      });
    nodeSel.call(drag);

    // Pan + zoom. Filter out events whose target is inside a node so that
    // mousedown on a node starts a drag (not a pan), and clicks on a node
    // pass through to the click handler.
    var zoom = d3.zoom().scaleExtent([0.2, 4])
      .filter(function (event) {
        if (event.type === 'wheel') return true;
        return !(event.target && event.target.closest && event.target.closest('.kg-node'));
      })
      .on('zoom', function (event) {
        viewport.attr('transform', event.transform.toString());
      });
    svg.call(zoom).on('dblclick.zoom', null);
    document.getElementById('kg-reset').addEventListener('click', function () {
      svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
    });

    // Domain filter
    var activeDomain = 'all';
    document.querySelectorAll('.kg-filter').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.kg-filter').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
        activeDomain = b.getAttribute('data-domain');
        applyFilter();
      });
    });
    function applyFilter() {
      nodeSel.classed('is-dim', function (d) {
        return activeDomain !== 'all' && d.domain !== activeDomain;
      });
      linkSel.classed('is-dim', function (l) {
        if (activeDomain === 'all') return false;
        var s = typeof l.source === 'object' ? l.source : nodes.find(function (n) { return n.id === l.source; });
        var t = typeof l.target === 'object' ? l.target : nodes.find(function (n) { return n.id === l.target; });
        return !(s && t && s.domain === activeDomain && t.domain === activeDomain);
      });
    }

    // Search highlight
    var searchEl = document.getElementById('kg-search');
    searchEl.addEventListener('input', function () {
      var q = (searchEl.value || '').toLowerCase().trim();
      if (!q) { applyFilter(); return; }
      nodeSel.classed('is-dim', function (d) {
        return d.title.toLowerCase().indexOf(q) < 0;
      });
      linkSel.classed('is-dim', function (l) {
        var s = typeof l.source === 'object' ? l.source : nodes.find(function (n) { return n.id === l.source; });
        var t = typeof l.target === 'object' ? l.target : nodes.find(function (n) { return n.id === l.target; });
        return !(s && t && (s.title.toLowerCase().indexOf(q) >= 0 || t.title.toLowerCase().indexOf(q) >= 0));
      });
    });

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
      });
    }
  })();
  </script>`;
  return layout({ title: "Knowledge graph — MuseIQ", active: "graph", body });
}

export function renderTimeline(opts: {
  user: string;
  points: Array<{ id: string; title: string; approx_year: number; primary_domain: string | null; child_summary: string | null }>;
}): string {
  const { user, points } = opts;
  const data = points.map((p) => ({
    id: p.id,
    title: p.title,
    year: p.approx_year,
    domain: p.primary_domain ?? "other",
    summary: p.child_summary ?? "",
  }));
  const dataJson = JSON.stringify(data);

  const body = `
  <section class="wiki">
    <div class="container">
      <header style="margin-bottom: 1rem;">
        <p class="eyebrow">Cross-time view</p>
        <h1>Timeline</h1>
        <p class="muted">${points.length} dated exhibit${points.length === 1 ? "" : "s"} on a symmetric-log axis from prehistory to today. Drag to pan, scroll or pinch to zoom, click a pin to open its wiki page.</p>
      </header>

      <div class="tl-legend" aria-label="Domain legend">
        <span class="tl-leg tl-history">🏺 History</span>
        <span class="tl-leg tl-art">🎨 Art</span>
        <span class="tl-leg tl-science">🦖 Science</span>
        <span class="tl-leg tl-tech">⚙️ Technology</span>
        <span class="tl-leg tl-culture">🌍 Culture</span>
      </div>

      <div class="tl-wrap" id="tl-wrap">
        ${points.length === 0
          ? `<p class="muted" style="padding:2rem 0;">No dated exhibits yet — once the AI assigns approx_year via ingest, pins will appear here.</p>`
          : `<div class="tl-controls">
              <button type="button" data-tl-zoom="-1" aria-label="Zoom out">−</button>
              <button type="button" data-tl-zoom="+1" aria-label="Zoom in">＋</button>
              <button type="button" data-tl-reset aria-label="Reset view">Reset</button>
            </div>
            <svg id="tl-svg" role="img" aria-label="Timeline of captured exhibits"></svg>
            <div id="tl-tip" class="tl-tip" hidden></div>`
        }
      </div>
    </div>
  </section>

  <style>
    .tl-legend { display:flex; gap:.5rem; flex-wrap: wrap; margin: 0 0 .75rem; font-size:.8rem; }
    .tl-leg { padding:.18rem .55rem; border-radius:999px; background: var(--bg-elev); border:1px solid var(--border); }
    .tl-history  { color: var(--d-history-ink);  border-color: color-mix(in srgb, var(--d-history) 30%, transparent); }
    .tl-art      { color: var(--d-art-ink);      border-color: color-mix(in srgb, var(--d-art) 30%, transparent); }
    .tl-science  { color: var(--d-science-ink);  border-color: color-mix(in srgb, var(--d-science) 30%, transparent); }
    .tl-tech     { color: var(--d-tech-ink);     border-color: color-mix(in srgb, var(--d-tech) 30%, transparent); }
    .tl-culture  { color: var(--d-culture-ink);  border-color: color-mix(in srgb, var(--d-culture) 30%, transparent); }

    .tl-wrap {
      position: relative;
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
      height: 520px;
    }
    .tl-wrap svg { width: 100%; height: 100%; cursor: grab; user-select: none; touch-action: none; }
    .tl-wrap svg:active { cursor: grabbing; }
    .tl-controls {
      position: absolute; top: .65rem; right: .65rem; z-index: 5;
      display: flex; gap: .25rem;
    }
    .tl-controls button {
      width: 36px; height: 36px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg-elev);
      color: var(--ink);
      font-size: 1.1rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow: var(--shadow-sm);
      font-family: inherit;
    }
    .tl-controls button:hover { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
    .tl-controls [data-tl-reset] { width: auto; padding: 0 .85rem; font-size: .85rem; font-weight: 500; }

    .tl-axis-line { stroke: var(--border-strong); stroke-width: 1; }
    .tl-tick-line { stroke: var(--border-strong); stroke-width: 1; opacity: .6; }
    .tl-tick-text { fill: var(--ink-muted); font-size: 11px; font-family: 'Inter', sans-serif; }
    .tl-pin { cursor: pointer; transition: r .15s ease, opacity .15s ease; }
    .tl-pin:hover { stroke: var(--ink); stroke-width: 2px; }

    .tl-tip {
      position: absolute;
      pointer-events: none;
      background: var(--ink);
      color: #FFFDF8;
      padding: .5rem .7rem;
      border-radius: 8px;
      font-size: .8rem;
      max-width: 280px;
      box-shadow: var(--shadow-md);
      z-index: 10;
      transform: translate(-50%, -100%);
      margin-top: -8px;
    }
    .tl-tip strong { display:block; font-size: .85rem; margin-bottom: .15rem; }
    .tl-tip .tl-tip-year { color: var(--accent); font-size: .7rem; letter-spacing: .04em; }
  </style>

  <script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js" crossorigin="anonymous"></script>
  <script>
  (function () {
    var data = ${dataJson};
    if (!data.length || typeof d3 === 'undefined') return;

    var COLORS = {
      history: getCSS('--d-history'),
      art: getCSS('--d-art'),
      science: getCSS('--d-science'),
      tech: getCSS('--d-tech'),
      technology: getCSS('--d-tech'),
      culture: getCSS('--d-culture'),
      other: getCSS('--ink-muted'),
    };
    function getCSS(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#475569';
    }

    var wrap = document.getElementById('tl-wrap');
    var svgEl = document.getElementById('tl-svg');
    var tipEl = document.getElementById('tl-tip');
    if (!wrap || !svgEl) return;

    var rect = wrap.getBoundingClientRect();
    var W = rect.width;
    var H = rect.height;
    var margin = { top: 24, right: 24, bottom: 48, left: 24 };

    var svg = d3.select(svgEl).attr('viewBox', '0 0 ' + W + ' ' + H);

    // Symmetric log scale so prehistory and the modern era both fit.
    function slog(y) { return Math.sign(y) * Math.log10(Math.abs(y) + 1); }
    function invSlog(s) { return Math.sign(s) * (Math.pow(10, Math.abs(s)) - 1); }

    var years = data.map(function (d) { return d.year; });
    var minY = d3.min(years);
    var maxY = d3.max(years);
    // Pad domain so extremes don't sit at the edge
    var pad = Math.max(0.4, (slog(maxY) - slog(minY)) * 0.05);
    var domain = [slog(minY) - pad, slog(maxY) + pad];

    var x = d3.scaleLinear()
      .domain(domain)
      .range([margin.left, W - margin.right]);

    // y is jittered so pins from the same era don't stack on top
    var y = d3.scaleLinear()
      .domain([0, 1])
      .range([margin.top + 30, H - margin.bottom - 10]);

    var jitter = data.map(function (_, i) {
      // deterministic pseudo-random per index so pan/zoom stays stable
      var x = Math.sin(i * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    });

    var gAxis = svg.append('g').attr('class', 'tl-axis');
    var gPins = svg.append('g').attr('class', 'tl-pins');

    // Static axis line
    gAxis.append('line')
      .attr('class', 'tl-axis-line')
      .attr('x1', margin.left).attr('x2', W - margin.right)
      .attr('y1', H - margin.bottom).attr('y2', H - margin.bottom);

    // Pins (drawn once; transformed via zoom)
    var pins = gPins.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
        .attr('class', 'tl-pin')
        .attr('r', 6)
        .attr('fill', function (d) { return COLORS[d.domain] || COLORS.other; })
        .attr('opacity', 0.85)
        .attr('stroke', '#FFFDF8')
        .attr('stroke-width', 1.5)
        .attr('cx', function (d) { return x(slog(d.year)); })
        .attr('cy', function (d, i) { return y(jitter[i]); });

    pins.on('mouseenter', function (event, d) {
      var c = this.getBoundingClientRect();
      var w = wrap.getBoundingClientRect();
      tipEl.hidden = false;
      tipEl.innerHTML = '<strong>' + esc(d.title) + '</strong>'
        + '<span class="tl-tip-year">' + formatYear(d.year) + '</span>'
        + (d.summary ? '<div style="margin-top:.3rem;line-height:1.4;">' + esc(d.summary) + '</div>' : '');
      tipEl.style.left = (c.left - w.left + c.width / 2) + 'px';
      tipEl.style.top  = (c.top  - w.top) + 'px';
    });
    pins.on('mouseleave', function () { tipEl.hidden = true; });
    pins.on('click', function (event, d) {
      window.location.href = '/wiki/${user}/exhibits/' + encodeURIComponent(d.id);
    });

    // Curated tick set; the ticks visible at any zoom level are filtered
    // by the current x-domain, and we space them out so labels don't
    // overlap.
    var TICK_YEARS = [
      -200000000, -65000000, -10000000, -1000000, -100000, -10000, -3000,
      -1000, -500, -200, 0, 500, 1000, 1500, 1700, 1800, 1900, 1950, 2000, 2025
    ];

    function drawAxis(scale) {
      var d0 = scale.domain()[0], d1 = scale.domain()[1];
      var visible = TICK_YEARS
        .map(function (y) { return { year: y, sx: slog(y) }; })
        .filter(function (t) { return t.sx >= d0 && t.sx <= d1; });

      // Greedy thinning so labels don't overlap (~80px minimum gap)
      var minGap = 80;
      var kept = [];
      visible.forEach(function (t) {
        var px = scale(t.sx);
        if (!kept.length || px - kept[kept.length - 1].px >= minGap) {
          kept.push({ year: t.year, sx: t.sx, px: px });
        }
      });

      var ticks = gAxis.selectAll('g.tl-tick').data(kept, function (d) { return d.year; });
      ticks.exit().remove();
      var enter = ticks.enter().append('g').attr('class', 'tl-tick');
      enter.append('line').attr('class', 'tl-tick-line')
        .attr('y1', H - margin.bottom - 6).attr('y2', H - margin.bottom + 6);
      enter.append('text').attr('class', 'tl-tick-text')
        .attr('y', H - margin.bottom + 22).attr('text-anchor', 'middle');
      var merged = enter.merge(ticks);
      merged.attr('transform', function (d) { return 'translate(' + d.px + ',0)'; });
      merged.select('text').text(function (d) { return formatYear(d.year); });
    }

    drawAxis(x);

    // Zoom + pan via d3-zoom
    var zoom = d3.zoom()
      .scaleExtent([0.6, 60])
      .translateExtent([[-W * 5, 0], [W * 6, H]])
      .on('zoom', function (event) {
        var t = event.transform;
        var nx = t.rescaleX(x);
        pins.attr('cx', function (d) { return nx(slog(d.year)); });
        drawAxis(nx);
      });

    svg.call(zoom);

    // Buttons
    document.querySelectorAll('[data-tl-zoom]').forEach(function (b) {
      b.addEventListener('click', function () {
        var dir = parseInt(b.getAttribute('data-tl-zoom'), 10);
        svg.transition().duration(220).call(zoom.scaleBy, dir > 0 ? 1.6 : 0.625);
      });
    });
    var resetBtn = document.querySelector('[data-tl-reset]');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
    });

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
      });
    }
    function formatYear(y) {
      if (y === 0) return '0';
      if (y < 0) {
        var a = Math.abs(y);
        if (a >= 1e6) return (a / 1e6).toFixed(0) + 'M BCE';
        if (a >= 1e3) return (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k BCE';
        return a + ' BCE';
      }
      return y + ' CE';
    }
  })();
  </script>`;
  return layout({ title: "Timeline — MuseIQ", active: "timeline", body });
}

export function renderMap(opts: {
  user: string;
  points: Array<{ id: string; title: string; lat: number; lon: number; primary_domain: string | null; child_summary: string | null }>;
}): string {
  const { user, points } = opts;
  const ptJson = JSON.stringify(points.map((p) => ({
    id: p.id, title: p.title, lat: p.lat, lon: p.lon,
    domain: p.primary_domain ?? "",
    summary: p.child_summary ?? "",
  })));
  const body = `
  <section class="wiki">
    <div class="container">
      <h1>Map</h1>
      <p class="muted">${points.length} located exhibit${points.length === 1 ? "" : "s"} from your wiki.</p>
      ${points.length === 0
        ? `<p class="muted">No located exhibits yet — once the AI assigns origin_lat/origin_lon via ingest, points will appear here.</p>`
        : `<div id="map" style="height:540px;border-radius:1rem;overflow:hidden;border:1px solid var(--border,#e5e7eb);"></div>`
      }
    </div>
  </section>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>
  <script>
    (function () {
      var pts = ${ptJson};
      if (!pts.length || typeof L === 'undefined') return;
      var map = L.map('map').setView([20, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);
      var emoji = { history: '🏺', art: '🎨', science: '🦖', tech: '⚙️', technology: '⚙️', culture: '🌍' };
      var bounds = [];
      pts.forEach(function (p) {
        var m = L.marker([p.lat, p.lon]).addTo(map);
        var e = emoji[p.domain] || '📍';
        var summary = p.summary ? '<p style="margin:.4rem 0 0;font-size:.85rem;color:#475569;">' + escapeHtml(p.summary) + '</p>' : '';
        m.bindPopup(
          '<strong>' + e + ' ' + escapeHtml(p.title) + '</strong>' + summary +
          '<p style="margin:.4rem 0 0;"><a href="/wiki/${encodeURIComponent(user)}/exhibits/' + encodeURIComponent(p.id) + '">Open wiki page →</a></p>'
        );
        bounds.push([p.lat, p.lon]);
      });
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
      function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
          return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
        });
      }
    })();
  </script>`;
  return layout({ title: "Map — MuseIQ", body });
}

function formatYear(y: number): string {
  if (y === 0) return "0";
  if (y < 0) {
    const a = Math.abs(y);
    if (a >= 1_000_000) return (a / 1_000_000).toFixed(0) + "M BCE";
    if (a >= 1_000) return (a / 1_000).toFixed(0) + "k BCE";
    return a + " BCE";
  }
  return y + " CE";
}

export function renderLintReport(opts: {
  user: string;
  findings: Array<{ severity: "info" | "warn" | "error"; category: string; path: string | null; message: string }>;
}): string {
  const { user, findings } = opts;
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  const colors: Record<string, string> = {
    error: "background:#fee2e2;color:#991b1b;border-color:#fca5a5;",
    warn: "background:#fef3c7;color:#854d0e;border-color:#fcd34d;",
    info: "background:#dbeafe;color:#1e3a8a;border-color:#93c5fd;",
  };
  const items = findings.length
    ? findings.map((f) => {
        const href = f.path
          ? `/wiki/${encodeURIComponent(user)}/${f.path.split("/").map(encodeURIComponent).join("/")}`
          : null;
        return `<li>
          <span class="lint-sev" style="${colors[f.severity]}">${f.severity}</span>
          <span class="lint-cat">${escapeHtml(f.category)}</span>
          ${href ? `<a href="${href}" class="lint-path">${escapeHtml(f.path ?? "")}</a>` : `<span class="lint-path muted">(no path)</span>`}
          <span class="lint-msg">${escapeHtml(f.message)}</span>
        </li>`;
      }).join("")
    : `<li class="muted">No findings — wiki looks healthy.</li>`;
  const body = `
  <section class="list">
    <div class="container" style="max-width: 900px;">
      <header class="list-header">
        <div class="list-title">
          <p class="eyebrow">Admin · Lint</p>
          <h1>Wiki health for ${escapeHtml(user)}</h1>
          <p class="muted">${findings.length} finding${findings.length === 1 ? "" : "s"}: ${counts.error ?? 0} error · ${counts.warn ?? 0} warn · ${counts.info ?? 0} info</p>
        </div>
        <div><a class="btn btn-ghost btn-sm" href="/admin/photos">← Back to admin</a></div>
      </header>
      <ul class="lint-list">${items}</ul>
    </div>
  </section>
  <style>
    .lint-list { list-style: none; padding: 0; margin: 0; display: grid; gap: .35rem; }
    .lint-list li { display: grid; grid-template-columns: 60px 110px 1fr; gap: .6rem; align-items: baseline; padding: .5rem .75rem; border:1px solid var(--border,#e5e7eb); border-radius:.5rem; background:var(--bg-elev,#fff); font-size:.9rem; }
    .lint-sev { padding: .05rem .4rem; border-radius:999px; font-size:.7rem; font-weight:600; text-align:center; border:1px solid; }
    .lint-cat { font-family: ui-monospace, monospace; color:#475569; font-size:.8rem; }
    .lint-path { font-family: ui-monospace, monospace; font-size:.8rem; }
    .lint-msg { grid-column: 1 / -1; padding-left: 0; color:#334155; }
  </style>`;
  return layout({ title: "Wiki lint — MuseIQ", body });
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
