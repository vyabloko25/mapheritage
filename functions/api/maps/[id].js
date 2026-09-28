import { json, readJson, needDb, loadMap, saveMap, publicMap, tokenOk } from '../../../lib/util.js';
import { normalize, sanitizeDesign } from '../../../lib/ai.js';
import { attachGeo } from '../../../lib/geo.js';

// GET /api/maps/:id — public map data (no conversation).
export async function onRequestGet({ env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const m = await loadMap(env, params.id);
  if (!m) return json({ error: 'not_found' }, 404);
  return json(publicMap(m));
}

// PATCH /api/maps/:id — { token, title? , design? , state?: {people, events, rootId, mode, options, title} }
export async function onRequestPatch({ request, env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const body = await readJson(request);
  const m = await loadMap(env, params.id);
  if (!m) return json({ error: 'not_found' }, 404);
  if (!tokenOk(m, body.token)) return json({ error: 'forbidden' }, 403);
  if (body.state && typeof body.state === 'object') {
    const next = normalize({ ...m.state, ...body.state }, m.state);
    next.titleManual = m.state.titleManual || (next.title !== (m.state.title || ''));
    await attachGeo(env, next, m.state, 3);
    m.state = next;
  }
  if (body.design !== undefined) m.state.design = sanitizeDesign(body.design);
  if (typeof body.title === 'string') { m.state.title = body.title.trim().slice(0, 90); m.state.titleManual = true; }
  await saveMap(env, m);
  return json(publicMap(m));
}
