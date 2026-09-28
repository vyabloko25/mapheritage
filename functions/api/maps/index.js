import { json, readJson, newId, needDb, lang } from '../../../lib/util.js';
import { requireUser } from '../../../lib/auth.js';
import { limitDesign } from '../../../lib/plans.js';
import { SCENARIOS } from '../../../lib/scenarios.js';
import { normalize } from '../../../lib/ai.js';

// GET /api/maps — the signed-in user's maps.
export async function onRequestGet({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const { user, res } = await requireUser(request, env); if (res) return res;
  const r = await env.DB.prepare('SELECT id, title, updated_at, shared FROM maps WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 200').bind(user.id).all();
  return json({ maps: (r.results || []).map((m) => ({ ...m, shared: m.shared === 1 })) });
}

// POST /api/maps { lang, mode, options, state? } — create a private map owned by the user.
export async function onRequestPost({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const { user, res } = await requireUser(request, env); if (res) return res;
  const body = await readJson(request);
  const l = lang(body.lang), mode = SCENARIOS[body.mode] ? body.mode : 'family';
  const id = newId(8), token = newId(28), now = Date.now();
  const seed = body.state && typeof body.state === 'object' ? body.state : {};
  const state = normalize({ ...seed, mode, options: body.options || {} }, { lang: l, mode });
  state.design = limitDesign(state.design, user);
  if (seed.title) state.titleManual = true;
  const messages = [{ role: 'assistant', content: SCENARIOS[mode].greeting[l] }];
  await env.DB.prepare('INSERT INTO maps (id, token, title, state, messages, turns, created_at, updated_at, owner_id, shared) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 0)')
    .bind(id, token, state.title || '', JSON.stringify(state), JSON.stringify(messages), now, now, user.id).run();
  return json({ id, token, messages, map: { id, title: state.title, mode: state.mode, options: state.options, rootId: state.rootId, design: state.design, people: state.people, events: state.events, shared: false } });
}
