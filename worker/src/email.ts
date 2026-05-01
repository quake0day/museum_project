// email.ts
// Outbound email via Resend's HTTP API.
//
// Sender: noreply@chenaisolutions.us — DKIM/SPF for chenaisolutions.us is
// already configured in Resend, so this address is delivery-ready. If we
// later add darlingtree.com to Resend, swap MUSEIQ_FROM_EMAIL via vars.

const DEFAULT_FROM = "MuseIQ <noreply@chenaisolutions.us>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Sends an email. Throws on non-2xx so callers can decide whether to fail
 * the request or just log (e.g. PIN verification: fail; capture-deleted
 * notification: log-and-continue).
 */
export async function sendEmail(
  env: { RESEND_API_KEY?: string; MUSEIQ_FROM_EMAIL?: string },
  args: SendArgs,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured");
  }

  const from = env.MUSEIQ_FROM_EMAIL || DEFAULT_FROM;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
}

// ─── canned templates ───
//
// All emails are tri-lingual: English then Simplified Chinese. We don't
// know the recipient's language preference at send time (they may set up
// PIN in one language, click the link from a phone in another). Showing
// both is friendlier than guessing.

export function pinVerifyTemplate(opts: {
  link: string;
  user: string;
  ttlMinutes: number;
}): { subject: string; html: string; text: string } {
  const { link, user, ttlMinutes } = opts;
  const subject = "MuseIQ · Verify your email to enable your PIN / 验证邮箱以启用密码";

  const html = `
<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #222; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #213553;">MuseIQ · Verify your email</h2>
  <p>Hi <strong>${escape(user)}</strong>, you're enabling a 6-digit PIN on your MuseIQ account.</p>
  <p>Click the button to verify this email — link expires in <strong>${ttlMinutes} minutes</strong>.</p>
  <p style="text-align: center; margin: 28px 0;">
    <a href="${link}" style="display: inline-block; background: #d98c2e; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">Verify email</a>
  </p>
  <p style="color: #666; font-size: 13px;">If you didn't ask for this, just ignore this email — your account stays unchanged.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0;" />
  <h3 style="color: #213553;">验证邮箱</h3>
  <p>你好 <strong>${escape(user)}</strong>，你正在为 MuseIQ 账户启用 6 位数登录密码。</p>
  <p>点击下方按钮验证邮箱，链接在 <strong>${ttlMinutes} 分钟</strong>后失效。</p>
  <p style="text-align: center; margin: 28px 0;">
    <a href="${link}" style="display: inline-block; background: #d98c2e; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">验证邮箱</a>
  </p>
  <p style="color: #666; font-size: 13px;">如果这次操作不是你发起的，忽略本邮件即可，账户状态不变。</p>
</body></html>
`.trim();

  const text = `MuseIQ · Verify your email

Hi ${user}, you're enabling a 6-digit PIN on your MuseIQ account.
Verify within ${ttlMinutes} minutes by visiting:
${link}

If you didn't ask for this, ignore this email.

———

你好 ${user}，你正在为 MuseIQ 账户启用 6 位数登录密码。
请在 ${ttlMinutes} 分钟内访问以下链接验证：
${link}

如果不是你发起的，忽略即可。`;

  return { subject, html, text };
}

export function pinRecoveryTemplate(opts: {
  link: string;
  user: string;
  ttlMinutes: number;
}): { subject: string; html: string; text: string } {
  const { link, user, ttlMinutes } = opts;
  const subject = "MuseIQ · Reset your PIN / 重置登录密码";

  const html = `
<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #222; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #213553;">MuseIQ · Reset your PIN</h2>
  <p>Hi <strong>${escape(user)}</strong>, you (or someone using your name) requested a PIN reset.</p>
  <p>Click below to set a new 6-digit PIN — link expires in <strong>${ttlMinutes} minutes</strong>.</p>
  <p style="text-align: center; margin: 28px 0;">
    <a href="${link}" style="display: inline-block; background: #d98c2e; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">Reset PIN</a>
  </p>
  <p style="color: #666; font-size: 13px;">If you didn't request this, ignore the email — your PIN remains unchanged.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0;" />
  <h3 style="color: #213553;">重置登录密码</h3>
  <p>你好 <strong>${escape(user)}</strong>，你（或冒用你名字的人）申请重置 PIN。</p>
  <p>点击下方按钮设置新的 6 位密码，链接在 <strong>${ttlMinutes} 分钟</strong>后失效。</p>
  <p style="text-align: center; margin: 28px 0;">
    <a href="${link}" style="display: inline-block; background: #d98c2e; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">重置 PIN</a>
  </p>
  <p style="color: #666; font-size: 13px;">如果不是你发起的，忽略即可，密码不会被更改。</p>
</body></html>
`.trim();

  const text = `MuseIQ · Reset your PIN

Hi ${user}, you (or someone using your name) requested a PIN reset.
Set a new 6-digit PIN within ${ttlMinutes} minutes:
${link}

If you didn't request this, ignore this email.

———

你好 ${user}，有人申请重置你的 PIN。
请在 ${ttlMinutes} 分钟内访问以下链接设置新密码：
${link}

如果不是你发起的，忽略即可。`;

  return { subject, html, text };
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" :
    ch === "<" ? "&lt;" :
    ch === ">" ? "&gt;" :
    ch === '"' ? "&quot;" : "&#39;"
  );
}
