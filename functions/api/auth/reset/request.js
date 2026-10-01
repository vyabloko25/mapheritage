import { json, readJson, needDb } from '../../../../lib/util.js';
import { randomHex, sha256, validEmail } from '../../../../lib/auth.js';
import { limit } from '../../../../lib/rate.js';
import { sendMail } from '../../../../lib/mail.js';

const TEXT = {
  en: (link) => ({ subject: 'Reset your MapHeritage password', text: `Someone (hopefully you) asked to reset the password of your MapHeritage account.\n\nChoose a new password here (the link works for one hour):\n${link}\n\nIf it wasn't you, ignore this e-mail; your password stays as it is.` }),
  ru: (link) => ({ subject: 'Сброс пароля MapHeritage', text: `Кто-то (надеемся, вы) попросил сбросить пароль аккаунта MapHeritage.\n\nЗадайте новый пароль по ссылке (она действует один час):\n${link}\n\nЕсли это были не вы, просто не обращайте внимания на письмо; пароль останется прежним.` }),
  de: (link) => ({ subject: 'MapHeritage: Passwort zurücksetzen', text: `Jemand (hoffentlich Sie) möchte das Passwort Ihres MapHeritage-Kontos zurücksetzen.\n\nHier können Sie ein neues Passwort wählen (der Link gilt eine Stunde):\n${link}\n\nWenn Sie das nicht waren, ignorieren Sie diese E-Mail; Ihr Passwort bleibt unverändert.` }),
};

// POST { email, lang } — always answers ok, so nobody can find out which addresses have accounts.
export async function onRequestPost({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const { email, lang } = await readJson(request);
  const e = String(email || '').trim().toLowerCase();
  const rl = (await limit(env, request, 'reset')) || (await limit(env, request, 'reset', 'email:' + e)); if (rl) return rl;
  if (!validEmail(e)) return json({ error: 'bad_email' }, 400);
  const u = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(e).first();
  const out = { ok: true };
  if (u) {
    const token = randomHex(24);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM password_resets WHERE user_id = ? OR expires < ?').bind(u.id, Date.now()),
      env.DB.prepare('INSERT INTO password_resets (token_hash, user_id, expires) VALUES (?, ?, ?)').bind(await sha256(token), u.id, Date.now() + 3600e3),
    ]);
    const link = `${new URL(request.url).origin}/reset?token=${token}`;
    const r = await sendMail(env, { to: e, ...(TEXT[lang] || TEXT.en)(link) });
    if (r.dev && env.MOCK === '1') out.devLink = link; // local testing only
  }
  return json(out);
}
