import { json, readJson, needDb, loadMap, saveMap, publicMap, canEdit, MAX_TURNS } from '../../../../lib/util.js';
import { getUser } from '../../../../lib/auth.js';
import { limitDesign, planOf } from '../../../../lib/plans.js';
import { buildSystem } from '../../../../lib/scenarios.js';
import { conversation, callModel, parseModel, mergeDesign } from '../../../../lib/ai.js';
import { attachGeo } from '../../../../lib/geo.js';
import { limit } from '../../../../lib/rate.js';

const KEEP_SNAPSHOTS = 30;

// POST /api/maps/:id/chat — { token?, message, editIndex? }
// editIndex = position of an earlier user message: the map goes back to how it was before that message,
// the conversation is cut there, and the edited text is sent instead.
export async function onRequestPost({ request, env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const body = await readJson(request), user = await getUser(request, env);
  const m = await loadMap(env, params.id);
  if (!m) return json({ error: 'not_found' }, 404);
  if (!canEdit(m, user, body.token)) return json({ error: 'forbidden' }, 403);
  // The AI assistant is part of Pro; Lite builds the map by hand.
  if (!user || !planOf(user).ai) return json({ error: 'pro_ai' }, 402);
  { const rl = await limit(env, request, 'chat', user ? user.id : null); if (rl) return rl; }
  const text = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
  if (!text) return json({ error: 'empty' }, 400);

  let edited = false;
  if (Number.isInteger(body.editIndex)) {
    const i = body.editIndex;
    if (!m.messages[i] || m.messages[i].role !== 'user') return json({ error: 'cant_edit' }, 409);
    const snap = await env.DB.prepare('SELECT state FROM snapshots WHERE map_id = ? AND idx = ?').bind(m.id, i).first();
    if (!snap) return json({ error: 'cant_edit' }, 409);
    const design = m.state.design;
    m.state = JSON.parse(snap.state); m.state.design = design; // appearance is not rolled back
    m.messages = m.messages.slice(0, i);
    m.turns = m.messages.filter((x) => x.role === 'user').length;
    await env.DB.prepare('DELETE FROM snapshots WHERE map_id = ? AND idx > ?').bind(m.id, i).run();
    edited = true;
  }
  if ((m.turns || 0) >= MAX_TURNS) return json({ error: 'too_long' }, 429);

  const idx = m.messages.length;
  const history = [...m.messages, { role: 'user', content: text }];
  let raw;
  try { raw = await callModel(env, buildSystem(m.state, planOf(user)), conversation(history)); }
  catch (e) {
    if (e.message === 'NO_MODEL') return json({ error: 'no_model' }, 500);
    console.log('model error', e.message);
    return json({ error: 'model_failed' }, 502);
  }
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO snapshots (map_id, idx, state) VALUES (?, ?, ?)').bind(m.id, idx, JSON.stringify(m.state)),
    env.DB.prepare('DELETE FROM snapshots WHERE map_id = ? AND idx < ?').bind(m.id, idx - KEEP_SNAPSHOTS * 2),
  ]);
  const { reply, state, suggestions, design } = parseModel(raw, m.state);
  state.titleManual = !!m.state.titleManual;
  if (design) state.design = limitDesign(mergeDesign(m.state.design, design), user);
  await attachGeo(env, state, m.state);
  history.push({ role: 'assistant', content: reply, ...(suggestions.length ? { suggestions } : {}) });
  m.state = state; m.messages = history; m.turns = (m.turns || 0) + 1;
  await saveMap(env, m);
  const out = { reply, suggestions, designChanged: !!design, map: publicMap(m) };
  if (edited) out.messages = m.messages.map(({ role, content, suggestions: s }) => ({ role, content, suggestions: s }));
  return json(out);
}
