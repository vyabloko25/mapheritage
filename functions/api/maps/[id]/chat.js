import { json, readJson, needDb, loadMap, saveMap, publicMap, tokenOk, MAX_TURNS } from '../../../../lib/util.js';
import { buildSystem } from '../../../../lib/scenarios.js';
import { conversation, callModel, parseModel } from '../../../../lib/ai.js';
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
  if ((m.turns || 0) >= MAX_TURNS) return json({ error: 'too_long' }, 429);

  const history = [...m.messages, { role: 'user', content: text }];
  let raw;
  try {
    raw = await callModel(env, buildSystem(m.state), conversation(history));
  } catch (e) {
    if (e.message === 'NO_MODEL') return json({ error: 'no_model' }, 500);
    console.log('model error', e.message);
    return json({ error: 'model_failed' }, 502);
  }
  const { reply, state } = parseModel(raw, m.state);
  state.titleManual = !!m.state.titleManual;
  await attachGeo(env, state, m.state);
  history.push({ role: 'assistant', content: reply });
  m.state = state; m.messages = history; m.turns = (m.turns || 0) + 1;
  await saveMap(env, m);
  return json({ reply, map: publicMap(m) });
}
