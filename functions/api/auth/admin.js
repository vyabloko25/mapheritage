import { json, readJson, needDb } from '../../../lib/util.js';
import { getUser } from '../../../lib/auth.js';

// POST { plan: 'lite' | 'pro' } — lets an admin switch their own plan to test both versions of the site.
export async function onRequestPost({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const u = await getUser(request, env);
  if (!u || !u.admin) return json({ error: 'forbidden' }, 403);
  const { plan } = await readJson(request);
  if (!['lite', 'pro'].includes(plan)) return json({ error: 'bad_request' }, 400);
  await env.DB.prepare('UPDATE users SET plan = ? WHERE id = ?').bind(plan, u.id).run();
  return json({ ok: true, plan });
}
