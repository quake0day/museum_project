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

  // ───────────── Lightbox ─────────────
  const lightbox = document.querySelector('[data-lightbox]');
  if (lightbox) {
    const img = lightbox.querySelector('[data-lightbox-img]');
    const caption = lightbox.querySelector('[data-lightbox-caption]');
    const closeBtn = lightbox.querySelector('[data-lightbox-close]');

    const open = (src, cap) => {
      img.src = src;
      img.alt = cap || '';
      if (caption) caption.textContent = cap || '';
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
        if (src) open(src, cap);
      });
    });

    closeBtn?.addEventListener('click', close);
    lightbox.addEventListener('click', (e) => {
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
