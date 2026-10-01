// E-mail through Resend (https://resend.com). Needs RESEND_API_KEY and MAIL_FROM ("MapHeritage <hello@your-domain>").
// Without a key the message is written to the log, which is enough for local testing.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export async function sendMail(env, { to, subject, text, html, replyTo }) {
  if (!to) return { ok: false, error: 'no_recipient' };
  if (!env.RESEND_API_KEY) { console.log(`[mail:dev] to=${to} subject=${subject}\n${text}`); return { ok: true, dev: true }; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'MapHeritage <onboarding@resend.dev>', to: [to], subject, text, html: html || `<pre style="font:15px/1.5 Georgia,serif;white-space:pre-wrap">${esc(text)}</pre>`, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!r.ok) { console.log('resend error', r.status, (await r.text()).slice(0, 300)); return { ok: false, error: 'mail_failed' }; }
  return { ok: true };
}
