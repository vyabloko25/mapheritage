import { json, readJson, needDb } from '../../../lib/util.js';
import { requireUser } from '../../../lib/auth.js';

// POST /api/maps/claim { maps: [{id, token}] } — attach maps made before sign-up to the account.
export async function onRequestPost({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const { user, res } = await requireUser(request, env); if (res) return res;
  const { maps } = await readJson(request);
  let n = 0;
  for (const m of (Array.isArray(maps) ? maps : []).slice(0, 50)) {
    if (!m || typeof m.id !== 'string' || typeof m.token !== 'string') continue;
    const r = await env.DB.prepare('UPDATE maps SET owner_id = ? WHERE id = ? AND token = ? AND owner_id IS NULL').bind(user.id, m.id, m.token).run();
    n += (r.meta && r.meta.changes) || 0;
  }
  return json({ claimed: n });
}
