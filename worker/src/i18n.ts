// Tri-lingual i18n: English / Simplified Chinese / Traditional Chinese.
//
// `t(key)` emits paired <span data-lang="..."> spans for all three languages
// at once. The CSS rule keyed off `<html lang>` hides whichever doesn't
// match. `tx(key, lang)` picks one (used for attributes, page titles).
//
// Content rendered server-side from user/AI text is tagged with the simpler
// `data-lang="en"|"zh"`; ZH content is shown under both Chinese variants
// because the language detector can't reliably distinguish CN vs TW.

export type Lang = "en" | "zh-CN" | "zh-TW";
export const SUPPORTED: Lang[] = ["en", "zh-CN", "zh-TW"];
export const DEFAULT_LANG: Lang = "en";

// Cycle order for the header toggle: EN → 简 → 繁 → EN.
export const NEXT_LANG: Record<Lang, Lang> = {
  "en": "zh-CN",
  "zh-CN": "zh-TW",
  "zh-TW": "en",
};

// URL prefix for each lang. EN has no prefix (/), CN uses /cn, TW uses /tw.
// Used both for routing (middleware strips the prefix and sets lang) and
// for emitting internal links so they preserve the active language.
export function langPrefix(lang: Lang): string {
  if (lang === "zh-CN") return "/cn";
  if (lang === "zh-TW") return "/tw";
  return "";
}

// Build an internal link path that carries the active language. `path` must
// start with "/". Examples:
//   linkPath("en",    "/wiki/chen/index") → "/wiki/chen/index"
//   linkPath("zh-CN", "/wiki/chen/index") → "/cn/wiki/chen/index"
export function linkPath(lang: Lang, path: string): string {
  if (!path.startsWith("/")) path = "/" + path;
  // Don't double-prefix if path already starts with /cn/tw/en
  if (/^\/(cn|tw|en)(\/|$)/.test(path)) return path;
  return langPrefix(lang) + path;
}

type Entry = { en: string; "zh-CN": string; "zh-TW": string };

const TABLE: Record<string, Entry> = {
  // ── nav ──
  "nav.home":         { en: "Home",        "zh-CN": "首页",     "zh-TW": "首頁" },
  "nav.wiki":         { en: "My Wiki",     "zh-CN": "我的百科", "zh-TW": "我的百科" },
  "nav.timeline":     { en: "Timeline",    "zh-CN": "时间线",   "zh-TW": "時間線" },
  "nav.map":          { en: "Map",         "zh-CN": "地图",     "zh-TW": "地圖" },
  "nav.graph":        { en: "Graph",       "zh-CN": "知识图谱", "zh-TW": "知識圖譜" },
  "nav.quests":       { en: "Quests",      "zh-CN": "任务",     "zh-TW": "任務" },
  "nav.captures":     { en: "Captures",    "zh-CN": "我的拍摄", "zh-TW": "我的拍攝" },
  "nav.about":        { en: "About",       "zh-CN": "关于",     "zh-TW": "關於" },
  "nav.signin":       { en: "Sign in",     "zh-CN": "登录",     "zh-TW": "登入" },
  "nav.signout":      { en: "Sign out",    "zh-CN": "退出",     "zh-TW": "登出" },
  "nav.security":     { en: "Account security", "zh-CN": "账户安全", "zh-TW": "帳戶安全" },
  "nav.search":       { en: "Search",      "zh-CN": "搜索",     "zh-TW": "搜尋" },

  // ── home ──
  "home.greeting.morning":   { en: "Good morning",   "zh-CN": "早上好",     "zh-TW": "早安" },
  "home.greeting.afternoon": { en: "Welcome back",   "zh-CN": "欢迎回来",   "zh-TW": "歡迎回來" },
  "home.greeting.evening":   { en: "Good evening",   "zh-CN": "晚上好",     "zh-TW": "晚安" },
  "home.greeting.night":     { en: "Still up?",      "zh-CN": "还没睡呀?",  "zh-TW": "還沒睡呀?" },
  "home.subtitle":           { en: "Junior Curator", "zh-CN": "小小策展人", "zh-TW": "小小策展人" },
  "home.title":              { en: "My Museum Wiki", "zh-CN": "我的博物馆百科", "zh-TW": "我的博物館百科" },
  "home.tagline":            { en: "Turn every museum visit into a personal learning wiki.",
                               "zh-CN": "把每一次博物馆参观变成你自己的学习百科。",
                               "zh-TW": "把每一次博物館參觀變成你自己的學習百科。" },
  "home.stat.exhibits":      { en: "Exhibits",       "zh-CN": "展品",       "zh-TW": "展品" },
  "home.stat.concepts":      { en: "Concepts",       "zh-CN": "概念",       "zh-TW": "概念" },
  "home.stat.places":        { en: "Places",         "zh-CN": "地点",       "zh-TW": "地點" },
  "home.stat.periods":       { en: "Periods",        "zh-CN": "时代",       "zh-TW": "時代" },
  "home.stat.pending":       { en: "Pending AI",     "zh-CN": "AI 待处理",  "zh-TW": "AI 待處理" },
  "home.next":               { en: "Next adventure", "zh-CN": "下一段探索", "zh-TW": "下一段探索" },
  "home.recent":             { en: "Recently captured", "zh-CN": "最近拍摄", "zh-TW": "最近拍攝" },
  "home.allcaptures":        { en: "all captures →", "zh-CN": "全部 →",     "zh-TW": "全部 →" },
  "home.questsActive":       { en: "Quests in progress", "zh-CN": "进行中的任务", "zh-TW": "進行中的任務" },
  "home.allquests":          { en: "all quests →",   "zh-CN": "全部任务 →", "zh-TW": "全部任務 →" },
  "home.badges":             { en: "Badges earned",  "zh-CN": "已获徽章",   "zh-TW": "已獲徽章" },
  "home.allbadges":          { en: "all badges →",   "zh-CN": "全部徽章 →", "zh-TW": "全部徽章 →" },
  "home.explore":            { en: "Explore your wiki", "zh-CN": "探索你的百科", "zh-TW": "探索你的百科" },
  "home.explore.all":        { en: "All pages",      "zh-CN": "所有页面",   "zh-TW": "所有頁面" },
  "home.explore.allDesc":    { en: "Browse every exhibit, concept, place, period, person, and theme.",
                               "zh-CN": "浏览所有展品、概念、地点、时代、人物和主题。",
                               "zh-TW": "瀏覽所有展品、概念、地點、時代、人物和主題。" },
  "home.explore.timelineDesc": { en: "See your captures along an axis from prehistory to today.",
                                 "zh-CN": "在从史前到今日的时间轴上查看你的拍摄。",
                                 "zh-TW": "在從史前到今日的時間軸上查看你的拍攝。" },
  "home.explore.mapDesc":    { en: "Where in the world your exhibits come from.",
                               "zh-CN": "你的展品来自世界的哪里。",
                               "zh-TW": "你的展品來自世界的哪裡。" },
  "home.explore.searchDesc": { en: "Find any page in your wiki by keyword.",
                               "zh-CN": "用关键词搜索百科里的任何页面。",
                               "zh-TW": "用關鍵字搜尋百科裡的任何頁面。" },
  "home.explore.askDesc":    { en: "Curious about something? The wiki answers with citations.",
                               "zh-CN": "对什么好奇?百科会带引用回答你。",
                               "zh-TW": "對什麼好奇?百科會帶引用回答你。" },
  "home.explore.questsDesc": { en: "Missions and badges to guide your next museum visit.",
                               "zh-CN": "为下次参观博物馆指引方向的任务和徽章。",
                               "zh-TW": "為下次參觀博物館指引方向的任務和徽章。" },
  "home.explore.ask":        { en: "Ask the wiki",   "zh-CN": "问问百科",   "zh-TW": "問問百科" },
  "home.explore.search":     { en: "Search",         "zh-CN": "搜索",       "zh-TW": "搜尋" },
  "home.explore.timeline":   { en: "Timeline",       "zh-CN": "时间线",     "zh-TW": "時間線" },
  "home.explore.map":        { en: "Map",            "zh-CN": "地图",       "zh-TW": "地圖" },
  "home.explore.quests":     { en: "Quests",         "zh-CN": "任务",       "zh-TW": "任務" },

  // ── captures (interactions) ──
  "captures.eyebrow":        { en: "Archive",        "zh-CN": "档案",       "zh-TW": "檔案" },
  "captures.title":          { en: "Interactions",   "zh-CN": "拍摄记录",   "zh-TW": "拍攝記錄" },
  "captures.entries":        { en: "entries",        "zh-CN": "条",         "zh-TW": "條" },
  "captures.entry":          { en: "entry",          "zh-CN": "条",         "zh-TW": "條" },
  "captures.matching":       { en: "matching",       "zh-CN": "匹配",       "zh-TW": "符合" },
  "captures.searchPlaceholder": { en: "Search responses…",
                                  "zh-CN": "搜索描述…",
                                  "zh-TW": "搜尋描述…" },
  "captures.search":         { en: "Search",         "zh-CN": "搜索",       "zh-TW": "搜尋" },
  "captures.noDescription":  { en: "(no description)", "zh-CN": "(无描述)",  "zh-TW": "(無描述)" },
  "captures.openWiki":       { en: "open wiki →",    "zh-CN": "查看百科 →", "zh-TW": "查看百科 →" },
  "captures.empty":          { en: "No interactions yet",
                               "zh-CN": "还没有拍摄记录",
                               "zh-TW": "還沒有拍攝紀錄" },
  "captures.emptyHint":      { en: "Once the iOS app submits interactions, they will appear here.",
                               "zh-CN": "iOS 应用提交后,这里会显示拍摄记录。",
                               "zh-TW": "iOS 應用提交後,這裡會顯示拍攝紀錄。" },
  "captures.delete":         { en: "Delete capture",
                               "zh-CN": "删除这条拍摄",
                               "zh-TW": "刪除這條拍攝" },
  "captures.deleteConfirm":  { en: "Delete this capture? This cannot be undone.",
                               "zh-CN": "确定要删除这条拍摄吗?该操作无法撤销。",
                               "zh-TW": "確定要刪除這條拍攝嗎?該操作無法撤銷。" },
  "captures.deleteFailed":   { en: "Couldn't delete this capture. Try again in a moment.",
                               "zh-CN": "删除失败,请稍后再试。",
                               "zh-TW": "刪除失敗,請稍後再試。" },
  "pagination.prev":         { en: "← Prev",         "zh-CN": "← 上一页",   "zh-TW": "← 上一頁" },
  "pagination.next":         { en: "Next →",         "zh-CN": "下一页 →",   "zh-TW": "下一頁 →" },

  // ── login ──
  "login.eyebrow":           { en: "Welcome to MuseIQ", "zh-CN": "欢迎来到 MuseIQ", "zh-TW": "歡迎來到 MuseIQ" },
  "login.title":             { en: "Who are you?",    "zh-CN": "你是谁?",   "zh-TW": "你是誰?" },
  "login.subtitle":          { en: "Type your name to enter your personal museum wiki. No password needed — your name is your space.",
                               "zh-CN": "输入名字进入你自己的博物馆百科。不用密码 — 名字就是你的空间。",
                               "zh-TW": "輸入名字進入你自己的博物館百科。不用密碼 — 名字就是你的空間。" },
  "login.label":             { en: "Your name",       "zh-CN": "你的名字",   "zh-TW": "你的名字" },
  "login.placeholder":       { en: "e.g. Chen",       "zh-CN": "例如 陈",    "zh-TW": "例如 陳" },
  "login.submit":            { en: "Enter →",         "zh-CN": "进入 →",    "zh-TW": "進入 →" },
  "login.hint":              { en: "Names are case-insensitive and converted to a slug. \"Si Chen\" and \"Chen\" are different spaces; \"Chen\" and \"chen\" are the same.",
                               "zh-CN": "名字不区分大小写,会转成 slug。「Si Chen」和「Chen」是不同的空间;「Chen」和「chen」是同一个。",
                               "zh-TW": "名字不分大小寫,會轉成 slug。「Si Chen」和「Chen」是不同的空間;「Chen」和「chen」是同一個。" },
  "login.error":             { en: "Use letters, numbers, or hyphens (1–32 characters).",
                               "zh-CN": "请使用字母、数字或连字符(1–32 个字符)。",
                               "zh-TW": "請使用字母、數字或連字號(1–32 個字元)。" },

  // ── login: 2-step PIN ──
  "login.pinTitle":          { en: "Enter your PIN",  "zh-CN": "输入登录密码", "zh-TW": "輸入登入密碼" },
  "login.pinSubtitle":       { en: "This account is protected by a 6-digit PIN.",
                               "zh-CN": "这个账户设了 6 位登录密码。",
                               "zh-TW": "這個帳戶設了 6 位登入密碼。" },
  "login.pinLabel":          { en: "6-digit PIN",      "zh-CN": "6 位密码",   "zh-TW": "6 位密碼" },
  "login.signingInAs":       { en: "Signing in as",    "zh-CN": "登录身份",   "zh-TW": "登入身份" },
  "login.switchUser":        { en: "Use a different name", "zh-CN": "换个名字登录", "zh-TW": "換個名字登入" },
  "login.submitPin":         { en: "Sign in →",        "zh-CN": "登录 →",     "zh-TW": "登入 →" },
  "login.forgot":            { en: "Forgot PIN?",      "zh-CN": "忘记密码?",  "zh-TW": "忘記密碼?" },
  "login.locked":            { en: "Too many wrong attempts. Try again in about %s minute(s).",
                               "zh-CN": "错误次数太多,大约 %s 分钟后再试。",
                               "zh-TW": "錯誤次數太多,大約 %s 分鐘後再試。" },
  "login.wrongPin":          { en: "That PIN doesn't match.",
                               "zh-CN": "密码不对。",
                               "zh-TW": "密碼不對。" },

  // ── /me/security ──
  "security.eyebrow":        { en: "Account security", "zh-CN": "账户安全",   "zh-TW": "帳戶安全" },
  "security.title":          { en: "Sign-in protection", "zh-CN": "登录保护", "zh-TW": "登入保護" },
  "security.subtitle":       { en: "Add an optional 6-digit PIN so only you can sign in as %s.",
                               "zh-CN": "为账户 %s 添加 6 位登录密码,这样只有你能登录。",
                               "zh-TW": "為帳戶 %s 添加 6 位登入密碼,這樣只有你能登入。" },
  "security.setup.title":    { en: "Enable PIN protection",
                               "zh-CN": "启用密码保护",
                               "zh-TW": "啟用密碼保護" },
  "security.setup.subtitle": { en: "Bind an email so we can verify it's you, then choose a 6-digit PIN.",
                               "zh-CN": "先验证一下你的邮箱,再设一个 6 位数密码。",
                               "zh-TW": "先驗證一下你的信箱,再設一個 6 位數密碼。" },
  "security.setup.button":   { en: "Send verification email",
                               "zh-CN": "发送验证邮件",
                               "zh-TW": "發送驗證信" },
  "security.email.label":    { en: "Email",            "zh-CN": "邮箱",       "zh-TW": "信箱" },
  "security.pin.label":      { en: "Choose a 6-digit PIN",
                               "zh-CN": "设置 6 位数密码",
                               "zh-TW": "設置 6 位數密碼" },
  "security.pin.confirm":    { en: "Confirm PIN",      "zh-CN": "再输一次",   "zh-TW": "再輸一次" },
  "security.pending.title":  { en: "Check your inbox", "zh-CN": "去收一下邮件", "zh-TW": "去收一下信件" },
  "security.pending.subtitle":{en: "We sent a verification link to %s. Click it within 30 minutes to activate your PIN.",
                               "zh-CN": "我们刚把验证链接发到 %s,在 30 分钟内点开就能启用密码。",
                               "zh-TW": "我們剛把驗證連結發到 %s,在 30 分鐘內點開就能啟用密碼。" },
  "security.pending.checkSpam": { en: "Don't see it? Check the spam folder.",
                               "zh-CN": "没收到的话翻一下垃圾邮件。",
                               "zh-TW": "沒收到的話翻一下垃圾信件。" },
  "security.pending.resend": { en: "Resend email",     "zh-CN": "重新发送",   "zh-TW": "重新發送" },
  "security.pending.cancel": { en: "Cancel setup",     "zh-CN": "取消设置",   "zh-TW": "取消設置" },
  "security.active.title":   { en: "PIN is active",    "zh-CN": "已启用登录密码", "zh-TW": "已啟用登入密碼" },
  "security.active.subtitle":{en: "Sign-ins to this account require your PIN. Recovery email: %s",
                               "zh-CN": "登录这个账户需要先输密码。找回密码的邮箱:%s",
                               "zh-TW": "登入這個帳戶需要先輸密碼。找回密碼的信箱:%s" },
  "security.changePin.title":{en: "Change PIN",        "zh-CN": "修改密码",   "zh-TW": "修改密碼" },
  "security.changePin.current":{en: "Current PIN",     "zh-CN": "当前密码",   "zh-TW": "目前密碼" },
  "security.changePin.new":  { en: "New PIN",          "zh-CN": "新密码",     "zh-TW": "新密碼" },
  "security.changePin.confirm": { en: "Confirm new PIN","zh-CN": "再输一次",  "zh-TW": "再輸一次" },
  "security.changePin.button":  { en: "Update PIN",   "zh-CN": "更新密码",   "zh-TW": "更新密碼" },
  "security.changeEmail.title": { en: "Change email", "zh-CN": "更换邮箱",   "zh-TW": "更換信箱" },
  "security.changeEmail.note":  { en: "We'll send a verification link to the new email. Your old PIN stays active until you click the link.",
                               "zh-CN": "新邮箱会收到一封验证邮件,点击之前旧密码继续有效。",
                               "zh-TW": "新信箱會收到一封驗證信件,點擊之前舊密碼繼續有效。" },
  "security.changeEmail.pinLabel":{en: "Your current PIN", "zh-CN": "当前密码", "zh-TW": "目前密碼" },
  "security.changeEmail.pinPlaceholder":{en: "for verification","zh-CN": "用于身份验证","zh-TW": "用於身份驗證"},
  "security.changeEmail.button":{en: "Send verification email","zh-CN": "发送验证邮件","zh-TW": "發送驗證信"},
  "security.disable.title":  { en: "Disable PIN",      "zh-CN": "关闭登录密码", "zh-TW": "關閉登入密碼" },
  "security.disable.note":   { en: "Removes PIN protection — anyone who knows your name can sign in. Email stays bound for future recovery.",
                               "zh-CN": "关闭密码后,任何知道你名字的人都能登录。邮箱保留用于以后找回。",
                               "zh-TW": "關閉密碼後,任何知道你名字的人都能登入。信箱保留用於以後找回。" },
  "security.disable.button": { en: "Disable PIN",      "zh-CN": "关闭密码",   "zh-TW": "關閉密碼" },
  "security.disable.confirm":{ en: "Are you sure? Anyone who knows your name will be able to sign in.",
                               "zh-CN": "确定要关闭吗?任何知道你名字的人都能登录。",
                               "zh-TW": "確定要關閉嗎?任何知道你名字的人都能登入。" },
  "security.flash.pending":  { en: "Verification email sent.","zh-CN": "验证邮件已发送。","zh-TW": "驗證信件已發送。" },
  "security.flash.activated":{ en: "PIN activated. You're all set.","zh-CN": "密码已启用,设置完成。","zh-TW": "密碼已啟用,設置完成。" },
  "security.flash.cancelled":{ en: "Setup cancelled.","zh-CN": "已取消设置。","zh-TW": "已取消設置。" },
  "security.flash.disabled": { en: "PIN disabled.",   "zh-CN": "已关闭密码。","zh-TW": "已關閉密碼。" },
  "security.flash.changed":  { en: "PIN updated.",     "zh-CN": "密码已更新。","zh-TW": "密碼已更新。" },
  "security.flash.badEmail": { en: "Please enter a valid email address.",
                               "zh-CN": "邮箱格式不正确。",
                               "zh-TW": "信箱格式不正確。" },
  "security.flash.badPin":   { en: "PIN must be exactly 6 digits.",
                               "zh-CN": "密码必须是 6 位数字。",
                               "zh-TW": "密碼必須是 6 位數字。" },
  "security.flash.pinMismatch": { en: "PINs don't match.",
                               "zh-CN": "两次输入的密码不一致。",
                               "zh-TW": "兩次輸入的密碼不一致。" },
  "security.flash.wrongPin": { en: "That PIN doesn't match your current PIN.",
                               "zh-CN": "当前密码不对。",
                               "zh-TW": "目前密碼不對。" },
  "security.flash.emailTaken":{en: "That email is already used by another MuseIQ account.",
                               "zh-CN": "这个邮箱已绑到其它 MuseIQ 账户。",
                               "zh-TW": "這個信箱已綁到其他 MuseIQ 帳戶。" },
  "security.flash.tokenInvalid":{en: "That verification link is invalid or has expired.",
                               "zh-CN": "验证链接无效或已过期。",
                               "zh-TW": "驗證連結無效或已過期。" },
  "security.flash.emailFailed":{en: "Couldn't send the email. Try again in a moment.",
                               "zh-CN": "邮件发送失败,请稍后再试。",
                               "zh-TW": "信件發送失敗,請稍後再試。" },

  // ── forgot / reset ──
  "forgot.eyebrow":          { en: "Account recovery", "zh-CN": "账户找回",   "zh-TW": "帳戶找回" },
  "forgot.title":            { en: "Forgot your PIN?", "zh-CN": "忘记密码了?", "zh-TW": "忘記密碼了?" },
  "forgot.subtitle":         { en: "Enter your name and we'll email a reset link to the address you registered.",
                               "zh-CN": "输入名字,我们把重置链接发到你注册的邮箱。",
                               "zh-TW": "輸入名字,我們把重置連結發到你註冊的信箱。" },
  "forgot.button":           { en: "Email me a reset link",
                               "zh-CN": "发送重置链接",
                               "zh-TW": "發送重置連結" },
  "forgot.backToLogin":      { en: "← Back to sign in", "zh-CN": "← 返回登录", "zh-TW": "← 返回登入" },
  "forgot.flash.sent":       { en: "If we have an email on file for that name, a reset link is on the way.",
                               "zh-CN": "如果这个名字绑定过邮箱,我们已经把重置链接发过去了。",
                               "zh-TW": "如果這個名字綁定過信箱,我們已經把重置連結寄過去了。" },
  "forgot.flash.error":      { en: "Couldn't send the email. Try again in a moment.",
                               "zh-CN": "邮件发送失败,请稍后再试。",
                               "zh-TW": "信件發送失敗,請稍後再試。" },

  "reset.eyebrow":           { en: "Reset PIN",        "zh-CN": "重置密码",   "zh-TW": "重置密碼" },
  "reset.title":             { en: "Choose a new PIN", "zh-CN": "设置新密码", "zh-TW": "設置新密碼" },
  "reset.subtitle":          { en: "You're resetting the PIN for %s.",
                               "zh-CN": "你正在为 %s 重置密码。",
                               "zh-TW": "你正在為 %s 重置密碼。" },
  "reset.newPin":            { en: "New 6-digit PIN",  "zh-CN": "新的 6 位密码", "zh-TW": "新的 6 位密碼" },
  "reset.confirmPin":        { en: "Confirm PIN",      "zh-CN": "再输一次",   "zh-TW": "再輸一次" },
  "reset.button":            { en: "Set new PIN",      "zh-CN": "设置新密码", "zh-TW": "設置新密碼" },

  // ── wiki page chrome ──
  "wiki.askButton":          { en: "Ask the wiki",   "zh-CN": "问问百科",   "zh-TW": "問問百科" },
  "wiki.quizButton":         { en: "Quiz",           "zh-CN": "测验",       "zh-TW": "測驗" },
  "wiki.compareButton":      { en: "Compare",        "zh-CN": "对比",       "zh-TW": "對比" },
  "wiki.readingLevel":       { en: "Reading level",  "zh-CN": "阅读级别",   "zh-TW": "閱讀級別" },
  "wiki.photos":             { en: "Photos from your captures", "zh-CN": "你拍过的照片", "zh-TW": "你拍過的照片" },
  "wiki.showAll":            { en: "Show all",       "zh-CN": "显示全部",   "zh-TW": "顯示全部" },
  "wiki.showFewer":          { en: "Show fewer",     "zh-CN": "收起",       "zh-TW": "收起" },
  "wiki.oftenWith":          { en: "Often appears with", "zh-CN": "经常一起出现", "zh-TW": "經常一起出現" },
  "wiki.inYourCaptures":     { en: "in your captures", "zh-CN": "在你的拍摄里", "zh-TW": "在你的拍攝裡" },
  "wiki.whereSeen":          { en: "Where you've seen it", "zh-CN": "你在哪里见过它", "zh-TW": "你在哪裡見過它" },
  "wiki.onMap":              { en: "On the map",     "zh-CN": "在地图上",   "zh-TW": "在地圖上" },
  "wiki.pageInfo":           { en: "Page info",      "zh-CN": "页面信息",   "zh-TW": "頁面資訊" },
  "wiki.forGrownups":        { en: "(for grown-ups)", "zh-CN": "(给家长看的)", "zh-TW": "(給家長看的)" },
  "wiki.lastUpdated":        { en: "Last updated by AI", "zh-CN": "AI 最后更新", "zh-TW": "AI 最後更新" },
  "wiki.outboundLinks":      { en: "outbound links",  "zh-CN": "外出链接",   "zh-TW": "外出連結" },
  "wiki.inboundLinks":       { en: "inbound links",   "zh-CN": "传入链接",   "zh-TW": "傳入連結" },

  // ── timeline ──
  "timeline.eyebrow":        { en: "Cross-time view", "zh-CN": "跨时间视图", "zh-TW": "跨時間視圖" },
  "timeline.title":          { en: "Timeline",       "zh-CN": "时间线",     "zh-TW": "時間線" },
  "timeline.lede":           { en: "dated exhibits on a symmetric-log axis from prehistory to today. Drag to pan, scroll or pinch to zoom, click a pin to open its wiki page.",
                               "zh-CN": "件已标注日期的展品在对称对数轴上,从史前到今日。拖动平移,滚轮或捏合缩放,点击大头针打开页面。",
                               "zh-TW": "件已標註日期的展品在對稱對數軸上,從史前到今日。拖動平移,滾輪或捏合縮放,點擊大頭針開啟頁面。" },
  "timeline.empty":          { en: "No dated exhibits yet — once the AI assigns approx_year via ingest, pins will appear here.",
                               "zh-CN": "还没有带日期的展品 — AI 分配 approx_year 后,大头针会出现在这里。",
                               "zh-TW": "還沒有帶日期的展品 — AI 分配 approx_year 後,大頭針會出現在這裡。" },
  "timeline.zoomIn":         { en: "Zoom in",        "zh-CN": "放大",       "zh-TW": "放大" },
  "timeline.zoomOut":        { en: "Zoom out",       "zh-CN": "缩小",       "zh-TW": "縮小" },
  "timeline.reset":          { en: "Reset",          "zh-CN": "重置",       "zh-TW": "重置" },
  "domain.history":          { en: "History",        "zh-CN": "历史",       "zh-TW": "歷史" },
  "domain.art":              { en: "Art",            "zh-CN": "艺术",       "zh-TW": "藝術" },
  "domain.science":          { en: "Science",        "zh-CN": "科学",       "zh-TW": "科學" },
  "domain.tech":             { en: "Technology",     "zh-CN": "科技",       "zh-TW": "科技" },
  "domain.culture":          { en: "Culture",        "zh-CN": "文化",       "zh-TW": "文化" },
  "domain.other":            { en: "Other",          "zh-CN": "其他",       "zh-TW": "其他" },
  "domain.naturalScience":   { en: "Natural Science","zh-CN": "自然科学",   "zh-TW": "自然科學" },

  // ── map ──
  "map.title":               { en: "Map",            "zh-CN": "地图",       "zh-TW": "地圖" },
  "map.lede":                { en: "located exhibits from your wiki.",
                               "zh-CN": "件来自百科的已定位展品。",
                               "zh-TW": "件來自百科的已定位展品。" },
  "map.empty":               { en: "No located exhibits yet — once the AI assigns origin_lat/origin_lon via ingest, points will appear here.",
                               "zh-CN": "还没有带位置的展品。AI 分配 origin_lat/origin_lon 后,标记会出现在这里。",
                               "zh-TW": "還沒有帶位置的展品。AI 分配 origin_lat/origin_lon 後,標記會出現在這裡。" },

  // ── quests ──
  "quests.eyebrow":          { en: "Junior Curator", "zh-CN": "小小策展人", "zh-TW": "小小策展人" },
  "quests.title":            { en: "Quests & badges","zh-CN": "任务与徽章", "zh-TW": "任務與徽章" },
  "quests.earned":           { en: "earned",         "zh-CN": "已获得",     "zh-TW": "已獲得" },
  "quests.inProgress":       { en: "in progress",    "zh-CN": "进行中",     "zh-TW": "進行中" },
  "quests.upNext":           { en: "Up next",        "zh-CN": "接下来",     "zh-TW": "接下來" },
  "quests.earnedSection":    { en: "Earned",         "zh-CN": "已获得",     "zh-TW": "已獲得" },
  "quests.inProgressSection":{ en: "In progress",    "zh-CN": "进行中",     "zh-TW": "進行中" },

  // ── encyclopedia / wiki index ──
  "enc.eyebrow":             { en: "encyclopedia",   "zh-CN": "百科全书",   "zh-TW": "百科全書" },
  "enc.title":               { en: "Wiki index",     "zh-CN": "百科索引",   "zh-TW": "百科索引" },
  "enc.lede":                { en: "entry pages, organized by subject. Click a subject to jump to it.",
                               "zh-CN": "个条目,按学科组织。点击学科直接跳转。",
                               "zh-TW": "個條目,按學科組織。點擊學科直接跳轉。" },
  "enc.exhibitsTitle":       { en: "captured exhibits", "zh-CN": "件已拍摄展品", "zh-TW": "件已拍攝展品" },
  "enc.exhibitsHint":        { en: "Browse the photos you took at the museum",
                               "zh-CN": "浏览你在博物馆拍的照片",
                               "zh-TW": "瀏覽你在博物館拍的照片" },
  "enc.empty":               { en: "No entry pages yet — capture more exhibits and the encyclopedia will grow here.",
                               "zh-CN": "还没有条目页面 — 多拍些展品,百科会在这里成长。",
                               "zh-TW": "還沒有條目頁面 — 多拍些展品,百科會在這裡成長。" },
  "enc.lastUpdated":         { en: "Last updated",   "zh-CN": "最后更新",   "zh-TW": "最後更新" },
  "enc.activityLog":         { en: "activity log",   "zh-CN": "活动日志",   "zh-TW": "活動日誌" },
  "kindLabel.concept":       { en: "Concepts",       "zh-CN": "概念",       "zh-TW": "概念" },
  "kindLabel.place":         { en: "Places",         "zh-CN": "地点",       "zh-TW": "地點" },
  "kindLabel.period":        { en: "Periods",        "zh-CN": "时代",       "zh-TW": "時代" },
  "kindLabel.person":        { en: "People",         "zh-CN": "人物",       "zh-TW": "人物" },
  "kindLabel.style":         { en: "Styles",         "zh-CN": "风格",       "zh-TW": "風格" },
  "kindLabel.material":      { en: "Materials",      "zh-CN": "材料",       "zh-TW": "材料" },
  "kindLabel.technique":     { en: "Techniques",     "zh-CN": "技法",       "zh-TW": "技法" },
  "kindLabel.theme":         { en: "Themes",         "zh-CN": "主题",       "zh-TW": "主題" },
  "kindLabel.civilization":  { en: "Civilizations",  "zh-CN": "文明",       "zh-TW": "文明" },

  // ── knowledge graph ──
  "graph.eyebrow":           { en: "Cross-page view","zh-CN": "跨页面视图", "zh-TW": "跨頁面視圖" },
  "graph.title":             { en: "Knowledge graph", "zh-CN": "知识图谱",  "zh-TW": "知識圖譜" },
  "graph.entityPages":       { en: "entity pages",   "zh-CN": "个实体页面", "zh-TW": "個實體頁面" },
  "graph.connections":       { en: "connections",    "zh-CN": "条连接",     "zh-TW": "條連接" },
  "graph.lede":              { en: "Two pages connect when an exhibit cites both. Drag a node to rearrange, scroll to zoom, click to open. Filter by subject below.",
                               "zh-CN": "两个页面被同一件展品引用时就会连接。拖动节点重排、滚轮缩放、点击打开。下方按学科过滤。",
                               "zh-TW": "兩個頁面被同一件展品引用時就會連接。拖動節點重排、滾輪縮放、點擊開啟。下方按學科過濾。" },
  "graph.findPlaceholder":   { en: "Find a page…",   "zh-CN": "查找页面…",  "zh-TW": "尋找頁面…" },
  "graph.resetView":         { en: "Reset view",     "zh-CN": "重置视图",   "zh-TW": "重置視圖" },
  "graph.filterAll":         { en: "All",            "zh-CN": "全部",       "zh-TW": "全部" },
  "graph.empty":             { en: "The graph is empty. Capture more exhibits and the AI will start linking concepts together here.",
                               "zh-CN": "图谱还是空的。多拍些展品,AI 会在这里把概念串起来。",
                               "zh-TW": "圖譜還是空的。多拍些展品,AI 會在這裡把概念串起來。" },

  // ── search / ask / compare / quiz ──
  "search.title":            { en: "Search the wiki", "zh-CN": "搜索百科",  "zh-TW": "搜尋百科" },
  "search.placeholder":      { en: "bronze, ritual, perspective…",
                               "zh-CN": "青铜、仪式、透视法…",
                               "zh-TW": "青銅、儀式、透視法…" },
  "search.results":          { en: "results",        "zh-CN": "条结果",     "zh-TW": "筆結果" },
  "search.result":           { en: "result",         "zh-CN": "条结果",     "zh-TW": "筆結果" },
  "search.empty":            { en: "Type a query above to search the wiki.",
                               "zh-CN": "在上方输入关键词搜索百科。",
                               "zh-TW": "在上方輸入關鍵字搜尋百科。" },
  "search.noMatches":        { en: "No matches for", "zh-CN": "没有匹配", "zh-TW": "沒有符合" },

  "ask.title":               { en: "Ask the wiki",   "zh-CN": "问问百科",   "zh-TW": "問問百科" },
  "ask.lede":                { en: "Ask anything about the exhibits you've captured. Answers come from your own wiki pages — with citations so you can read more.",
                               "zh-CN": "对你拍过的展品问任何问题。答案来自你自己的百科页面 — 带引用,你可以深入阅读。",
                               "zh-TW": "對你拍過的展品問任何問題。答案來自你自己的百科頁面 — 帶引用,你可以深入閱讀。" },
  "ask.placeholder":         { en: "e.g. What was bronze used for? Why are these styles different?",
                               "zh-CN": "例如:青铜是做什么用的?这些风格有什么不同?",
                               "zh-TW": "例如:青銅是做什麼用的?這些風格有什麼不同?" },
  "ask.submit":              { en: "Ask",            "zh-CN": "提问",       "zh-TW": "提問" },
  "ask.pagesRead":           { en: "Pages I read",   "zh-CN": "我读过的页面", "zh-TW": "我讀過的頁面" },

  "compare.title":           { en: "Compare two pages", "zh-CN": "对比两个页面", "zh-TW": "對比兩個頁面" },
  "compare.pathA":           { en: "Page A path",    "zh-CN": "页面 A 路径", "zh-TW": "頁面 A 路徑" },
  "compare.pathB":           { en: "Page B path",    "zh-CN": "页面 B 路径", "zh-TW": "頁面 B 路徑" },
  "compare.submit":          { en: "Compare",        "zh-CN": "对比",       "zh-TW": "對比" },

  "quiz.eyebrow":            { en: "Quick quiz",     "zh-CN": "小测验",     "zh-TW": "小測驗" },
  "quiz.questions":          { en: "questions",      "zh-CN": "道题",       "zh-TW": "道題" },
  "quiz.lede":               { en: "click an answer to see how you did.",
                               "zh-CN": "点击答案查看结果。",
                               "zh-TW": "點擊答案查看結果。" },
  "quiz.grade":              { en: "Grade my quiz",  "zh-CN": "提交答案",   "zh-TW": "提交答案" },
  "quiz.back":               { en: "← Back to page", "zh-CN": "← 返回页面", "zh-TW": "← 返回頁面" },
  "quiz.score":              { en: "You got",        "zh-CN": "你答对了",   "zh-TW": "你答對了" },
  "quiz.scoreOf":            { en: "of",             "zh-CN": "/",          "zh-TW": "/" },
  "quiz.scoreSuffix":        { en: "multiple-choice questions right.",
                               "zh-CN": "道选择题。",
                               "zh-TW": "道選擇題。" },

  // ── lang toggle button label (shows the NEXT lang to switch into) ──
  "lang.toggleNext":         { en: "简",              "zh-CN": "繁",         "zh-TW": "EN" },
  "lang.toggleAria":         { en: "Switch language","zh-CN": "切换语言",   "zh-TW": "切換語言" },

  // ── chrome ──
  "a11y.skipToContent":      { en: "Skip to content","zh-CN": "跳到内容",   "zh-TW": "跳到內容" },
  "brand.subtitle":          { en: "Museum Interaction Platform", "zh-CN": "博物馆互动平台", "zh-TW": "博物館互動平台" },
  "footer.edgeRendered":     { en: "Edge-rendered on Cloudflare Workers",
                               "zh-CN": "由 Cloudflare Workers 在边缘渲染",
                               "zh-TW": "由 Cloudflare Workers 在邊緣渲染" },
  "wiki.userWikiSuffix":     { en: "'s wiki",         "zh-CN": " 的百科",   "zh-TW": " 的百科" },
  "wiki.path":               { en: "path",            "zh-CN": "路径",      "zh-TW": "路徑" },

  // ── next adventure (data templates filled in by dashboard.ts) ──
  "next.firstCaptureTitle":  { en: "Capture your first exhibit", "zh-CN": "拍下你的第一件展品", "zh-TW": "拍下你的第一件展品" },
  "next.firstCaptureHint":   { en: "Open the MuseIQ app at the museum, take a photo of anything you find interesting, and write a quick reflection. The AI will turn it into your first wiki page.",
                               "zh-CN": "在博物馆打开 MuseIQ 应用,拍下你感兴趣的展品,写下你的想法。AI 会把它变成你的第一个百科页面。",
                               "zh-TW": "在博物館打開 MuseIQ 應用,拍下你感興趣的展品,寫下你的想法。AI 會把它變成你的第一個百科頁面。" },
  "next.almostTherePrefix":  { en: "Almost there:",   "zh-CN": "差一点就完成了:", "zh-TW": "差一點就完成了:" },
  "next.diveDeeperPrefix":   { en: "Dive deeper into","zh-CN": "深入了解",   "zh-TW": "深入瞭解" },
  "next.diveDeeperHint":     { en: "exhibits that touch this concept — its page is one of the busiest hubs in your wiki.",
                               "zh-CN": "件展品涉及这个概念 — 它的页面是你百科里连接最多的中心之一。",
                               "zh-TW": "件展品涉及這個概念 — 它的頁面是你百科裡連接最多的中心之一。" },
  "next.youCaptured":        { en: "You've captured", "zh-CN": "你已经拍下了","zh-TW": "你已經拍下了" },
  "next.exploreNew":         { en: "Explore something new", "zh-CN": "探索新的领域", "zh-TW": "探索新的領域" },
  "next.hint.history":       { en: "Try a history exhibit — an artifact from a past civilization.",
                               "zh-CN": "试试一件历史展品 — 来自过去文明的文物。",
                               "zh-TW": "試試一件歷史展品 — 來自過去文明的文物。" },
  "next.hint.art":           { en: "Try an art exhibit — a painting, sculpture, or photograph.",
                               "zh-CN": "试试一件艺术展品 — 绘画、雕塑或摄影。",
                               "zh-TW": "試試一件藝術展品 — 繪畫、雕塑或攝影。" },
  "next.hint.science":       { en: "Try a natural science exhibit — fossils, animals, or minerals.",
                               "zh-CN": "试试一件自然科学展品 — 化石、动物或矿物。",
                               "zh-TW": "試試一件自然科學展品 — 化石、動物或礦物。" },
  "next.hint.tech":          { en: "Try a technology exhibit — machines, instruments, or inventions.",
                               "zh-CN": "试试一件科技展品 — 机器、仪器或发明。",
                               "zh-TW": "試試一件科技展品 — 機器、儀器或發明。" },
  "next.hint.culture":       { en: "Try a culture exhibit — clothing, music, festivals, or food.",
                               "zh-CN": "试试一件文化展品 — 服饰、音乐、节日或食物。",
                               "zh-TW": "試試一件文化展品 — 服飾、音樂、節日或食物。" },

  // ── badge label ──
  "badge.earnedPrefix":      { en: "earned",         "zh-CN": "获得于",     "zh-TW": "獲得於" },

  // ── quests (titles + descriptions) ──
  "quest.first-capture.title":         { en: "First Capture", "zh-CN": "首次拍摄", "zh-TW": "首次拍攝" },
  "quest.first-capture.desc":          { en: "Capture your first exhibit and let the AI write its wiki page.",
                                          "zh-CN": "拍下你的第一件展品,让 AI 帮你写成百科页面。",
                                          "zh-TW": "拍下你的第一件展品,讓 AI 幫你寫成百科頁面。" },
  "quest.junior-curator.title":        { en: "Junior Curator", "zh-CN": "小小策展人", "zh-TW": "小小策展人" },
  "quest.junior-curator.desc":         { en: "Capture 10 exhibits across any domain.",
                                          "zh-CN": "在任何领域拍下 10 件展品。",
                                          "zh-TW": "在任何領域拍下 10 件展品。" },
  "quest.bronze-hunter.title":         { en: "Bronze Hunter", "zh-CN": "青铜猎手", "zh-TW": "青銅獵手" },
  "quest.bronze-hunter.desc":          { en: "Find 3 exhibits made of bronze.",
                                          "zh-CN": "找到 3 件由青铜制成的展品。",
                                          "zh-TW": "找到 3 件由青銅製成的展品。" },
  "quest.color-detective.title":       { en: "Color Detective", "zh-CN": "色彩侦探", "zh-TW": "色彩偵探" },
  "quest.color-detective.desc":        { en: "Capture 5 art exhibits and look closely at their colors.",
                                          "zh-CN": "拍下 5 件艺术展品,仔细观察它们的颜色。",
                                          "zh-TW": "拍下 5 件藝術展品,仔細觀察它們的顏色。" },
  "quest.time-traveler.title":         { en: "Time Traveler", "zh-CN": "时空旅行者", "zh-TW": "時空旅行者" },
  "quest.time-traveler.desc":          { en: "Capture exhibits from 3 different time periods.",
                                          "zh-CN": "拍下 3 个不同时代的展品。",
                                          "zh-TW": "拍下 3 個不同時代的展品。" },
  "quest.ancient-civilizations.title": { en: "Ancient Civilizations Explorer", "zh-CN": "古文明探索者", "zh-TW": "古文明探索者" },
  "quest.ancient-civilizations.desc":  { en: "Visit 3 ancient civilizations through their artifacts (anything before 500 CE).",
                                          "zh-CN": "通过文物探访 3 个古代文明(公元 500 年之前)。",
                                          "zh-TW": "透過文物探訪 3 個古代文明(西元 500 年之前)。" },
  "quest.ancient-civilizations.hint":  { en: "Tip: ancient Egypt, Greece, Rome, China, India, the Maya…",
                                          "zh-CN": "提示:古埃及、希腊、罗马、中国、印度、玛雅……",
                                          "zh-TW": "提示:古埃及、希臘、羅馬、中國、印度、馬雅……" },
  "quest.around-the-world.title":      { en: "Around the World", "zh-CN": "环游世界", "zh-TW": "環遊世界" },
  "quest.around-the-world.desc":       { en: "Capture exhibits from 5 different places.",
                                          "zh-CN": "拍下来自 5 个不同地点的展品。",
                                          "zh-TW": "拍下來自 5 個不同地點的展品。" },
  "quest.fossil-finder.title":         { en: "Fossil Finder", "zh-CN": "化石发现者", "zh-TW": "化石發現者" },
  "quest.fossil-finder.desc":          { en: "Capture 3 natural-science exhibits (fossils, dinosaurs, minerals…).",
                                          "zh-CN": "拍下 3 件自然科学展品(化石、恐龙、矿物……)。",
                                          "zh-TW": "拍下 3 件自然科學展品(化石、恐龍、礦物……)。" },
  "quest.inventor.title":              { en: "Inventor's Apprentice", "zh-CN": "发明家学徒", "zh-TW": "發明家學徒" },
  "quest.inventor.desc":               { en: "Capture 3 technology or invention exhibits.",
                                          "zh-CN": "拍下 3 件科技或发明展品。",
                                          "zh-TW": "拍下 3 件科技或發明展品。" },
  "quest.world-traditions.title":      { en: "World Traditions", "zh-CN": "世界传统", "zh-TW": "世界傳統" },
  "quest.world-traditions.desc":       { en: "Capture 3 culture exhibits — clothing, food, festivals, music.",
                                          "zh-CN": "拍下 3 件文化展品 — 服饰、食物、节日、音乐。",
                                          "zh-TW": "拍下 3 件文化展品 — 服飾、食物、節日、音樂。" },
  "quest.concept-collector.title":     { en: "Concept Collector", "zh-CN": "概念收集者", "zh-TW": "概念收集者" },
  "quest.concept-collector.desc":      { en: "Have 10 different concept pages in your wiki.",
                                          "zh-CN": "在你的百科里收集 10 个不同的概念页面。",
                                          "zh-TW": "在你的百科裡收集 10 個不同的概念頁面。" },
};

// Render a key as bilingual spans. The CSS rule defined alongside the
// design tokens hides whichever doesn't match `<html lang>`.
export function t(key: string): string {
  const e = TABLE[key];
  if (!e) return esc(key);
  return `<span data-lang="en">${esc(e.en)}</span>` +
         `<span data-lang="zh-CN">${esc(e["zh-CN"])}</span>` +
         `<span data-lang="zh-TW">${esc(e["zh-TW"])}</span>`;
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
