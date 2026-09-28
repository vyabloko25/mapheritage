import { json, needDb, loadMap, canEdit, canView } from '../../../../lib/util.js';
import { getUser } from '../../../../lib/auth.js';
import { planOf, month, exportsUsed } from '../../../../lib/plans.js';

// POST /api/maps/:id/export — counts a PNG export against the monthly allowance.
export async function onRequestPost({ request, env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const user = await getUser(request, env); if (!user) return json({ error: 'auth_required' }, 401);
  const m = await loadMap(env, params.id);
  if (!m) return json({ error: 'not_found' }, 404);
  if (!canEdit(m, user) && !canView(m, user)) return json({ error: 'forbidden' }, 403);
  const p = planOf(user), used = await exportsUsed(env, user.id);
  if (used >= p.exports) return json({ error: 'export_limit', left: 0 }, 402);
  await env.DB.prepare('INSERT INTO exports (user_id, month, count) VALUES (?, ?, 1) ON CONFLICT (user_id, month) DO UPDATE SET count = count + 1').bind(user.id, month()).run();
  return json({ ok: true, left: p.exports === Infinity ? null : p.exports - used - 1 });
}
