import { json, readJson, needDb, loadMap, saveMap, publicMap, tokenOk } from '../../../lib/util.js';

// GET /api/maps/:id — публичные данные карты (без переписки).
export async function onRequestGet({ env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const m = await loadMap(env, params.id);
  if (!m) return json({ error: 'Карта не найдена' }, 404);
  return json(publicMap(m));
}

// PATCH /api/maps/:id — ручные правки: { token, title?, removeEvent? }
export async function onRequestPatch({ request, env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const body = await readJson(request);
  const m = await loadMap(env, params.id);
  if (!m) return json({ error: 'Карта не найдена' }, 404);
  if (!tokenOk(m, body.token)) return json({ error: 'Нет доступа к редактированию' }, 403);
  if (typeof body.title === 'string') m.state.title = body.title.trim().slice(0, 80);
  if (typeof body.removeEvent === 'string') {
    const gone = m.state.events.find((e) => e.id === body.removeEvent);
    m.state.events = m.state.events.filter((e) => e.id !== body.removeEvent);
    if (gone) m.messages.push({ role: 'user', content: `(Я убрал с карты: ${gone.place}${gone.when ? ', ' + gone.when : ''}.)` });
  }
  await saveMap(env, m);
  return json(publicMap(m));
}
