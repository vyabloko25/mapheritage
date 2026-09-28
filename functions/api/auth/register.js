import { json, readJson, needDb } from '../../../lib/util.js';
import { createUser, startSession, sessionCookie, validEmail } from '../../../lib/auth.js';

export async function onRequestPost({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const { email, password, name } = await readJson(request);
  const e = String(email || '').trim().toLowerCase();
  if (!validEmail(e)) return json({ error: 'bad_email' }, 400);
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) return json({ error: 'weak_password' }, 400);
  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(e).first();
  if (exists) return json({ error: 'email_taken' }, 409);
  const id = await createUser(env, { email: e, name: String(name || '').trim().slice(0, 80), pass: password });
  const tok = await startSession(env, id);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie(tok) } });
}
