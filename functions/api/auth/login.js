import { json, readJson, needDb } from '../../../lib/util.js';
import { hashPassword, startSession, sessionCookie, isAdminEmail, createUser, randomHex } from '../../../lib/auth.js';
import { limit } from '../../../lib/rate.js';

export async function onRequestPost({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const { email, password } = await readJson(request);
  const e = String(email || '').trim().toLowerCase();
  const rl = (await limit(env, request, 'login')) || (await limit(env, request, 'login', 'email:' + e)); if (rl) return rl;
  let u = await env.DB.prepare('SELECT id, pass_hash, salt FROM users WHERE email = ?').bind(e).first();
  // Admin sign-in: the ADMIN_PASSWORD secret is the source of truth, so the account is created or its password reset on the fly.
  if (isAdminEmail(env, e) && env.ADMIN_PASSWORD && typeof password === 'string' && password === env.ADMIN_PASSWORD) {
    const salt = randomHex(16), hash = await hashPassword(password, salt);
    if (!u) { const id = await createUser(env, { email: e, name: '', pass: password, consent: true }); await env.DB.prepare("UPDATE users SET plan = 'pro' WHERE id = ?").bind(id).run(); u = { id }; }
    else if (u.pass_hash !== (u.salt ? await hashPassword(password, u.salt) : '')) await env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').bind(hash, salt, u.id).run();
    const tok = await startSession(env, u.id);
    return new Response(JSON.stringify({ ok: true, admin: true }), { headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie(tok) } });
  }
  if (!u || !u.pass_hash || typeof password !== 'string' || (await hashPassword(password, u.salt)) !== u.pass_hash) return json({ error: 'bad_login' }, 401);
  const tok = await startSession(env, u.id);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie(tok) } });
}
