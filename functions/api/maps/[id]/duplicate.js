import { json, readJson, newId, needDb, loadMap, canEdit, lang } from '../../../../lib/util.js';
import { requireUser } from '../../../../lib/auth.js';
import { SCENARIOS } from '../../../../lib/scenarios.js';
import { limit } from '../../../../lib/rate.js';

// POST /api/maps/:id/duplicate { title? } — a private copy of a project (people, places and design; not the conversation).
export async function onRequestPost({ request, env, params }) {
  const bad = needDb(env); if (bad) return bad;
  const { user, res } = await requireUser(request, env); if (res) return res;
  const rl = await limit(env, request, 'create', user.id); if (rl) return rl;
  const m = await loadMap(env, params.id);
  if (!m || !canEdit(m, user)) return json({ error: 'forbidden' }, 403);
  const body = await readJson(request), l = lang(body.lang), id = newId(8), token = newId(28), now = Date.now();
  const state = { ...m.state, title: String(body.title || m.state.title || '').slice(0, 90), titleManual: true };
  const sc = SCENARIOS[state.mode] || SCENARIOS.family;
  const messages = [{ role: 'assistant', content: sc.greeting[l] }];
  await env.DB.prepare('INSERT INTO maps (id, token, title, state, messages, turns, created_at, updated_at, owner_id, shared) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 0)')
    .bind(id, token, state.title || '', JSON.stringify(state), JSON.stringify(messages), now, now, user.id).run();
  return json({ id, token, title: state.title });
}
