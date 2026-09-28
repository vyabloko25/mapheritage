import { json, readJson, needDb, loadMap, publicMap, tokenOk } from '../../../../lib/util.js';

// POST /api/maps/:id/history — { token } → переписка и карта (для продолжения разговора).
export async function onRequestPost({ request, env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const body = await readJson(request);
  const m = await loadMap(env, params.id);
  if (!m) return json({ error: 'not_found' }, 404);
  if (!tokenOk(m, body.token)) return json({ error: 'forbidden' }, 403);
  return json({ messages: m.messages, map: publicMap(m) });
}
