import { json, needDb } from '../../../lib/util.js';
import { requireUser } from '../../../lib/auth.js';

// DELETE /api/styles/:id
export async function onRequestDelete({ request, env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const { user, res } = await requireUser(request, env); if (res) return res;
  await env.DB.prepare('DELETE FROM styles WHERE id = ? AND user_id = ?').bind(params.id, user.id).run();
  return json({ ok: true });
}
