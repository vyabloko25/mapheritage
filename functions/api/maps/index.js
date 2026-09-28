import { json, readJson, newId, needDb, lang } from '../../../lib/util.js';
import { SCENARIOS } from '../../../lib/scenarios.js';
import { normalize } from '../../../lib/ai.js';

// POST /api/maps { lang, mode, options, state? } — create a map (optionally pre-filled, e.g. from GEDCOM).
export async function onRequestPost({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const body = await readJson(request);
  const l = lang(body.lang);
  const mode = SCENARIOS[body.mode] ? body.mode : 'family';
  const id = newId(8), token = newId(28), now = Date.now();
  const seed = body.state && typeof body.state === 'object' ? body.state : {};
  const state = normalize({ ...seed, mode, options: body.options || {} }, { lang: l, mode });
  if (seed.title) state.titleManual = true;
  const greeting = SCENARIOS[mode].greeting[l];
  const messages = [{ role: 'assistant', content: greeting }];
  await env.DB.prepare(
    'INSERT INTO maps (id, token, title, state, messages, turns, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
  ).bind(id, token, state.title || '', JSON.stringify(state), JSON.stringify(messages), now, now).run();
  return json({ id, token, messages, map: { id, ...pub(state) } });
}
const pub = (s) => ({ title: s.title, mode: s.mode, options: s.options, rootId: s.rootId, design: s.design, people: s.people, events: s.events });
