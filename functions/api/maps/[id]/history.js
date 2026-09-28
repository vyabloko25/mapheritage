import { json, readJson, needDb, loadMap, publicMap, canEdit } from '../../../../lib/util.js';
import { getUser } from '../../../../lib/auth.js';

// POST /api/maps/:id/history — conversation + map, for the owner.
export async function onRequestPost({ request, env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const body = await readJson(request), user = await getUser(request, env);
  const m = await loadMap(env, params.id);
  if (!m) return json({ error: 'not_found' }, 404);
  if (!canEdit(m, user, body.token)) return json({ error: 'forbidden' }, 403);
  return json({ messages: m.messages.map(({ role, content, suggestions }) => ({ role, content, suggestions })), map: publicMap(m) });
}
