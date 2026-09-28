import { json, readJson, needDb, loadMap, saveMap, publicMap, canEdit, canView } from '../../../lib/util.js';
import { getUser } from '../../../lib/auth.js';
import { limitDesign } from '../../../lib/plans.js';
import { normalize, sanitizeDesign } from '../../../lib/ai.js';
import { attachGeo } from '../../../lib/geo.js';

// GET /api/maps/:id — visible to the owner, or to anyone once the owner opened link access.
export async function onRequestGet({ request, env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const m = await loadMap(env, params.id);
  if (!m) return json({ error: 'not_found' }, 404);
  const user = await getUser(request, env);
  if (!canView(m, user, new URL(request.url).searchParams.get('t'))) return json({ error: 'private' }, 403);
  return json({ ...publicMap(m), mine: canEdit(m, user) });
}

// PATCH /api/maps/:id — { token?, title?, design?, shared?, state?: {people, events, rootId, mode, options, title} }
export async function onRequestPatch({ request, env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const body = await readJson(request), user = await getUser(request, env);
  const m = await loadMap(env, params.id);
  if (!m) return json({ error: 'not_found' }, 404);
  if (!canEdit(m, user, body.token)) return json({ error: 'forbidden' }, 403);
  if (body.state && typeof body.state === 'object') {
    const next = normalize({ ...m.state, ...body.state, design: m.state.design }, m.state);
    next.titleManual = m.state.titleManual || (next.title !== (m.state.title || ''));
    await attachGeo(env, next, m.state, 3);
    m.state = next;
  }
  if (body.design !== undefined) m.state.design = limitDesign(sanitizeDesign(body.design), user);
  if (typeof body.title === 'string') { m.state.title = body.title.trim().slice(0, 90); m.state.titleManual = true; }
  if (typeof body.shared === 'boolean') {
    if (!user) return json({ error: 'auth_required' }, 401);
    await env.DB.prepare('UPDATE maps SET shared = ? WHERE id = ?').bind(body.shared ? 1 : 0, m.id).run();
    m.shared = body.shared ? 1 : 0;
  }
  await saveMap(env, m);
  return json(publicMap(m));
}

// DELETE /api/maps/:id — remove the map, its history and snapshots.
export async function onRequestDelete({ request, env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const user = await getUser(request, env), m = await loadMap(env, params.id);
  if (!m) return json({ error: 'not_found' }, 404);
  if (!canEdit(m, user, (await readJson(request)).token)) return json({ error: 'forbidden' }, 403);
  await env.DB.batch([env.DB.prepare('DELETE FROM snapshots WHERE map_id = ?').bind(m.id), env.DB.prepare('DELETE FROM maps WHERE id = ?').bind(m.id)]);
  return json({ ok: true });
}
