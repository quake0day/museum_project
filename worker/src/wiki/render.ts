// Lightweight CSP-safe markdown → HTML renderer for wiki pages.
// We deliberately avoid pulling marked/markdown-it (ESM bundle bloat in
// Workers) and roll our own coverage for the subset our SCHEMA produces:
//   - YAML frontmatter (already stripped before we render)
//   - # / ## / ### headings
//   - paragraphs
//   - bullet lists, including `- [ ]` task items
//   - blockquote
//   - bold / italic / inline code
//   - [text](href) links
//   - --- horizontal rules
//   - HTML comments are stripped
// Anything else is escaped as text.

import { escapeHtml } from "../util";

export function renderMarkdown(md: string): string {
  // strip HTML comments (we use them for rel hints; not for rendering)
  md = md.replace(/<!--[\s\S]*?-->/g, "");

  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    let line = lines[i];

    // skip blanks
    if (!line.trim()) { i++; continue; }

    // pass-through wrappers: <div data-lang="..."> and </div> become themselves.
    // The bilingual renderer wraps each language block in such a div so the
    // CSS rule keyed off <html lang> can show/hide the right one.
    var divOpen = line.match(/^<div\s+data-lang="(en|zh|zh-CN|zh-TW)"\s*>\s*$/);
    if (divOpen) {
      out.push(`<div data-lang="${divOpen[1]}">`);
      i++;
      continue;
    }
    if (/^<\/div>\s*$/.test(line)) {
      out.push("</div>");
      i++;
      continue;
    }

    // horizontal rule
    if (/^---+$/.test(line.trim())) { out.push("<hr/>"); i++; continue; }

    // headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // blockquote (consecutive `>` lines)
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }

    // unordered list (consecutive `- ` lines, possibly task `- [ ]` / `- [x]`)
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        const raw = lines[i].replace(/^[-*]\s+/, "");
        const t = raw.match(/^\[( |x|X)\]\s+(.*)$/);
        if (t) {
          const checked = t[1].toLowerCase() === "x";
          items.push(
            `<li class="task"><input type="checkbox" disabled${checked ? " checked" : ""}/> ${inline(t[2])}</li>`,
          );
        } else {
          items.push(`<li>${inline(raw)}</li>`);
        }
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // paragraph: gather until blank line
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^([-*]\s+|>|#{1,6}\s+|---+$)/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}

function inline(s: string): string {
  // escape first, then re-allow our limited inline markers
  let html = escapeHtml(s);
  // links — written as &lt;text&gt;(&href;) once escaped, so re-match the escaped form
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, text, href) => {
      const safe = sanitizeHref(href);
      if (!safe) return escapeHtml(`[${text}](${href})`);
      return `<a href="${safe}">${text}</a>`;
    },
  );
  // bold **x**
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // italic *x* (must come after bold)
  html = html.replace(/(^|\W)\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  // inline code `x`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  return html;
}

function sanitizeHref(href: string): string | null {
  // Allow only relative paths and explicit http(s)/mailto. Block javascript:
  // and data: schemes outright.
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("/") ||
    /^https?:\/\//i.test(trimmed) ||
    /^mailto:/i.test(trimmed) ||
    trimmed.startsWith("#")
  ) {
    return escapeHtml(trimmed);
  }
  return null;
}
