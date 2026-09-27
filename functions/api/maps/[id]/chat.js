import { json, readJson, needDb, loadMap, saveMap, publicMap, tokenOk, MAX_TURNS } from '../../../../lib/util.js';
import { buildSystem, conversation, callModel, parseModel } from '../../../../lib/ai.js';
import { attachGeo } from '../../../../lib/geo.js';

// POST /api/maps/:id/chat — { token, message } → { reply, map }
export async function onRequestPost({ request, env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const body = await readJson(request);
  const m = await loadMap(env, params.id);
  if (!m) return json({ error: 'not_found' }, 404);
  if (!tokenOk(m, body.token)) return json({ error: 'forbidden' }, 403);
  const text = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
  if (!text) return json({ error: 'empty' }, 400);
  if ((m.turns || 0) >= MAX_TURNS) {
    return json({ error: 'too_long' }, 429);
  }

  const history = [...m.messages, { role: 'user', content: text }];
  let raw;
  try {
    raw = await callModel(env, buildSystem(m.state), conversation(history));
  } catch (e) {
    if (e.message === 'NO_MODEL') {
      return json({ error: 'no_model' }, 500);
    }
    console.log('model error', e.message);
    return json({ error: 'model_failed' }, 502);
  }

  const { reply, state } = parseModel(raw, m.state);
  state.lang = m.state.lang;
  if (m.state.titleManual) { state.title = m.state.title; state.titleManual = true; }
  keepLost(state, m.state);
  await attachGeo(env, state, m.state);
  history.push({ role: 'assistant', content: reply });
  m.state = state;
  m.messages = history;
  m.turns = (m.turns || 0) + 1;
  await saveMap(env, m);
  return json({ reply, map: publicMap(m) });
}

// Models sometimes drop items when rewriting the full list. Hand-made points always survive,
// and if more than half the map vanished at once, treat it as a glitch and keep the old points.
function keepLost(next, prev) {
  const have = new Set(next.events.map((e) => e.id));
  const lost = (prev.events || []).filter((e) => !have.has(e.id));
  const glitch = prev.events.length >= 4 && next.events.length < prev.events.length / 2;
  const keep = lost.filter((e) => glitch || e.geo === 'manual' || e.id.startsWith('m'));
  if (!keep.length) return;
  next.events.push(...keep);
  const pids = new Set(next.people.map((p) => p.id));
  for (const e of keep) {
    if (pids.has(e.personId)) continue;
    const p = (prev.people || []).find((x) => x.id === e.personId);
    if (p) { next.people.push(p); pids.add(p.id); }
  }
}
