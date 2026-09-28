import { json } from '../../../lib/util.js';
import { getUser } from '../../../lib/auth.js';

// Records interest in Pro. Grant it in D1: UPDATE users SET plan = 'pro' WHERE email = '...';
export async function onRequestPost({ request, env }) {
  const u = await getUser(request, env); if (!u) return json({ error: 'auth_required' }, 401);
  await env.DB.prepare('UPDATE users SET pro_requested = 1 WHERE id = ?').bind(u.id).run();
  return json({ ok: true });
}
