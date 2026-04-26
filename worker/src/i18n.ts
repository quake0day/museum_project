// Minimal i18n: a key → {en, zh} dictionary plus a `t(key)` helper that
// emits BOTH languages wrapped in <span data-lang="..."> spans. The CSS
// rule keyed off `<html lang>` hides the inactive language so we don't
// have to thread the lang choice through every render function.
//
// For places where dual-render isn't appropriate (page <title>, etc.),
// use `tx(key, lang)` which picks one language.

export type Lang = "en" | "zh";
export const SUPPORTED: Lang[] = ["en", "zh"];
export const DEFAULT_LANG: Lang = "en";

const TABLE: Record<string, { en: string; zh: string }> = {
  // ── nav ──
  "nav.home":         { en: "Home",        zh: "首页" },
  "nav.wiki":         { en: "My Wiki",     zh: "我的百科" },
  "nav.timeline":     { en: "Timeline",    zh: "时间线" },
  "nav.map":          { en: "Map",         zh: "地图" },
  "nav.graph":        { en: "Graph",       zh: "知识图谱" },
  "nav.quests":       { en: "Quests",      zh: "任务" },
  "nav.captures":     { en: "Captures",    zh: "我的拍摄" },
  "nav.about":        { en: "About",       zh: "关于" },
  "nav.signin":       { en: "Sign in",     zh: "登录" },
  "nav.signout":      { en: "Sign out",    zh: "退出" },
  "nav.search":       { en: "Search",      zh: "搜索" },

  // ── home ──
  "home.greeting.morning":   { en: "Good morning",   zh: "早上好" },
  "home.greeting.afternoon": { en: "Welcome back",   zh: "欢迎回来" },
  "home.greeting.evening":   { en: "Good evening",   zh: "晚上好" },
  "home.greeting.night":     { en: "Still up?",      zh: "还没睡呀?" },
  "home.subtitle":           { en: "Junior Curator", zh: "小小策展人" },
  "home.title":              { en: "My Museum Wiki", zh: "我的博物馆百科" },
  "home.tagline":            { en: "Turn every museum visit into a personal learning wiki.", zh: "把每一次博物馆参观变成你自己的学习百科。" },
  "home.stat.exhibits":      { en: "Exhibits",       zh: "展品" },
  "home.stat.concepts":      { en: "Concepts",       zh: "概念" },
  "home.stat.places":        { en: "Places",         zh: "地点" },
  "home.stat.periods":       { en: "Periods",        zh: "时代" },
  "home.stat.pending":       { en: "Pending AI",     zh: "AI 待处理" },
  "home.next":               { en: "Next adventure", zh: "下一段探索" },
  "home.recent":             { en: "Recently captured", zh: "最近拍摄" },
  "home.allcaptures":        { en: "all captures →", zh: "全部 →" },
  "home.questsActive":       { en: "Quests in progress", zh: "进行中的任务" },
  "home.allquests":          { en: "all quests →",   zh: "全部任务 →" },
  "home.badges":             { en: "Badges earned",  zh: "已获徽章" },
  "home.allbadges":          { en: "all badges →",   zh: "全部徽章 →" },
  "home.explore":            { en: "Explore your wiki", zh: "探索你的百科" },
  "home.explore.all":        { en: "All pages",      zh: "所有页面" },
  "home.explore.allDesc":    { en: "Browse every exhibit, concept, place, period, person, and theme.", zh: "浏览所有展品、概念、地点、时代、人物和主题。" },
  "home.explore.timelineDesc":{ en: "See your captures along an axis from prehistory to today.", zh: "在从史前到今日的时间轴上查看你的拍摄。" },
  "home.explore.mapDesc":    { en: "Where in the world your exhibits come from.", zh: "你的展品来自世界的哪里。" },
  "home.explore.searchDesc": { en: "Find any page in your wiki by keyword.", zh: "用关键词搜索百科里的任何页面。" },
  "home.explore.askDesc":    { en: "Curious about something? The wiki answers with citations.", zh: "对什么好奇?百科会带引用回答你。" },
  "home.explore.questsDesc": { en: "Missions and badges to guide your next museum visit.", zh: "为下次参观博物馆指引方向的任务和徽章。" },
  "home.explore.ask":        { en: "Ask the wiki",   zh: "问问百科" },
  "home.explore.search":     { en: "Search",         zh: "搜索" },
  "home.explore.timeline":   { en: "Timeline",       zh: "时间线" },
  "home.explore.map":        { en: "Map",            zh: "地图" },
  "home.explore.quests":     { en: "Quests",         zh: "任务" },

  // ── captures ──
  "captures.title":          { en: "Interactions",   zh: "拍摄记录" },
  "captures.entries":        { en: "entries",        zh: "条" },
  "captures.entry":          { en: "entry",          zh: "条" },
  "captures.searchPlaceholder": { en: "Search responses…", zh: "搜索描述…" },
  "captures.search":         { en: "Search",         zh: "搜索" },
  "captures.noDescription":  { en: "(no description)", zh: "(无描述)" },
  "captures.openWiki":       { en: "open wiki →",    zh: "查看百科 →" },

  // ── wiki page ──
  "wiki.askButton":          { en: "Ask the wiki",   zh: "问问百科" },
  "wiki.quizButton":         { en: "Quiz",           zh: "测验" },
  "wiki.compareButton":      { en: "Compare",        zh: "对比" },
  "wiki.readingLevel":       { en: "Reading level",  zh: "阅读级别" },
  "wiki.photos":             { en: "Photos from your captures", zh: "你拍过的照片" },
  "wiki.showAll":            { en: "Show all",       zh: "显示全部" },
  "wiki.showFewer":          { en: "Show fewer",     zh: "收起" },
  "wiki.oftenWith":          { en: "Often appears with", zh: "经常一起出现" },
  "wiki.inYourCaptures":     { en: "in your captures", zh: "在你的拍摄里" },
  "wiki.whereSeen":          { en: "Where you've seen it", zh: "你在哪里见过它" },
  "wiki.onMap":              { en: "On the map",     zh: "在地图上" },
  "wiki.pageInfo":           { en: "Page info",      zh: "页面信息" },
  "wiki.forGrownups":        { en: "(for grown-ups)", zh: "(给家长看的)" },

  // ── lang toggle ──
  "lang.toggle":             { en: "中文",            zh: "EN" },
  "lang.tooltip.en":         { en: "Switch to Chinese", zh: "切换到中文" },
  "lang.tooltip.zh":         { en: "Switch to English", zh: "切换到英文" },
};

// Render a key as bilingual spans. The CSS rule defined alongside the
// design tokens hides whichever doesn't match `<html lang>`.
export function t(key: string): string {
  const e = TABLE[key];
  if (!e) return key;
  return `<span data-lang="en">${esc(e.en)}</span><span data-lang="zh">${esc(e.zh)}</span>`;
}

// Pick a single language for a key. Used in attributes (title, aria-label,
// page <title>) where dual-render won't display sensibly.
export function tx(key: string, lang: Lang): string {
  const e = TABLE[key];
  if (!e) return key;
  return e[lang];
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === '"' ? "&quot;" : "&#39;"
  );
}
