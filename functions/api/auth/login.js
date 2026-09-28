import { json, readJson, needDb } from '../../../lib/util.js';
import { hashPassword, startSession, sessionCookie } from '../../../lib/auth.js';

export async function onRequestPost({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const { email, password } = await readJson(request);
  const u = await env.DB.prepare('SELECT id, pass_hash, salt FROM users WHERE email = ?').bind(String(email || '').trim().toLowerCase()).first();
  if (!u || !u.pass_hash || typeof password !== 'string' || (await hashPassword(password, u.salt)) !== u.pass_hash) return json({ error: 'bad_login' }, 401);
  const tok = await startSession(env, u.id);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie(tok) } });
}
