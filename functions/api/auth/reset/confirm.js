import { json, readJson, needDb } from '../../../../lib/util.js';
import { sha256, randomHex, hashPassword, startSession, sessionCookie } from '../../../../lib/auth.js';
import { limit } from '../../../../lib/rate.js';

// POST { token, password } — sets the new password, signs out every other session, signs this browser in.
export async function onRequestPost({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const rl = await limit(env, request, 'reset'); if (rl) return rl;
  const { token, password } = await readJson(request);
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) return json({ error: 'weak_password' }, 400);
  if (typeof token !== 'string' || token.length < 20) return json({ error: 'reset_invalid' }, 400);
  const th = await sha256(token);
  const r = await env.DB.prepare('SELECT user_id, expires FROM password_resets WHERE token_hash = ?').bind(th).first();
  if (!r || r.expires < Date.now()) return json({ error: 'reset_invalid' }, 400);
  const salt = randomHex(16);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').bind(await hashPassword(password, salt), salt, r.user_id),
    env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(r.user_id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(r.user_id),
  ]);
  const tok = await startSession(env, r.user_id);
  return new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie(tok) } });
}
