(() => {
  'use strict';

  // ───────────── Theme toggle ─────────────
  const root = document.documentElement;
  const storageKey = 'museiq-theme';

  const applyTheme = (t) => {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem(storageKey, t); } catch (_) {}
  };

  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cur = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
  });

  // Follow system changes if user hasn't explicitly picked one
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', (e) => {
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch (_) {}
    applyTheme(e.matches ? 'dark' : 'light');
  });

  // ───────────── Language toggle ─────────────
  // Cycles EN → 简 (zh-CN) → 繁 (zh-TW) → EN. Navigates to the same page
  // under the new language prefix (/cn or /tw, or no prefix for en) so the
  // URL itself reflects the choice. Cookie is set server-side as a side
  // effect of visiting the prefixed URL, so anonymous bookmarks still
  // persist the lang.
  const LANG_CYCLE = { 'en': 'zh-CN', 'zh-CN': 'zh-TW', 'zh-TW': 'en' };
  const LANG_PREFIX = { 'en': '', 'zh-CN': '/cn', 'zh-TW': '/tw' };
  const PREFIX_RE = /^\/(cn|tw|en)(?=\/|$)/;
  const langBtn = document.querySelector('[data-lang-toggle]');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('lang') || 'en';
      const next = LANG_CYCLE[cur] || 'zh-CN';
      // Compute the prefixed version of the current URL
      const path = location.pathname.replace(PREFIX_RE, '') || '/';
      const newPath = (LANG_PREFIX[next] || '') + (path === '/' ? '/' : path);
      location.assign(newPath + location.search + location.hash);
    });
  }

  // ───────────── User pill ─────────────
  // Layout renders the pill server-side when the route already knows the
  // user; otherwise it leaves a slot for us to fill on page load.
  const userPillSlot = document.querySelector('.user-pill-slot[data-user-pill]');
  if (userPillSlot) {
    fetch('/api/me', { credentials: 'same-origin' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        if (d.signedIn && d.user) {
          userPillSlot.outerHTML = `
            <form method="POST" action="/logout" class="user-pill" data-user-pill>
              <span class="user-pill-name">@${escapeText(d.user)}</span>
              <button type="submit" class="user-pill-out" aria-label="Sign out">↩</button>
            </form>`;
        } else {
          userPillSlot.outerHTML =
            `<a class="user-pill user-pill-anon" href="/login" data-user-pill>` +
              `<span data-lang="en">Sign in</span>` +
              `<span data-lang="zh-CN">登录</span>` +
              `<span data-lang="zh-TW">登入</span>` +
            `</a>`;
        }
      })
      .catch(() => {});
  }
  function escapeText(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  // ───────────── Lightbox ─────────────
  // Triggers: any element with [data-lightbox-trigger]. Required attrs:
  //   data-src       — image URL
  //   data-caption   — optional caption text
  //   data-href      — optional link to "open the related page" inside the lightbox
  const lightbox = document.querySelector('[data-lightbox]');
  if (lightbox) {
    const img = lightbox.querySelector('[data-lightbox-img]');
    const caption = lightbox.querySelector('[data-lightbox-caption]');
    const link = lightbox.querySelector('[data-lightbox-link]');
    const closeBtn = lightbox.querySelector('[data-lightbox-close]');

    const open = (src, cap, href) => {
      img.src = src;
      img.alt = cap || '';
      if (caption) caption.textContent = cap || '';
      if (link) {
        if (href) {
          link.setAttribute('href', href);
          link.hidden = false;
        } else {
          link.removeAttribute('href');
          link.hidden = true;
        }
      }
      lightbox.hidden = false;
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      closeBtn?.focus();
    };

    const close = () => {
      lightbox.hidden = true;
      lightbox.setAttribute('aria-hidden', 'true');
      img.src = '';
      document.body.style.overflow = '';
    };

    document.querySelectorAll('[data-lightbox-trigger]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const src = el.getAttribute('data-src');
        const cap = el.getAttribute('data-caption') || '';
        const href = el.getAttribute('data-href') || '';
        if (src) open(src, cap, href);
      });
    });

    closeBtn?.addEventListener('click', close);
    lightbox.addEventListener('click', (e) => {
      // Don't close when the user clicks the figcaption's wiki-page link.
      if (e.target.closest && e.target.closest('[data-lightbox-link]')) return;
      if (e.target === lightbox || e.target === img.parentElement) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !lightbox.hidden) close();
    });
  }

  // ───────────── Search auto-submit (debounced) ─────────────
  const searchForm = document.querySelector('.search');
  if (searchForm) {
    const input = searchForm.querySelector('input[name="q"]');
    let timer;
    input?.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const v = (input.value || '').trim();
        const current = new URL(window.location.href);
        if (v === (current.searchParams.get('q') || '').trim()) return;
        searchForm.submit();
      }, 450);
    });
  }
})();
