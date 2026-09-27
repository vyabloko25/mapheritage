import { json, readJson, newId, needDb, GREETINGS, lang } from '../../../lib/util.js';

// POST /api/maps { lang } — create a map. Returns id + secret edit token.
export async function onRequestPost({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const body = await readJson(request);
  const l = lang(body.lang);
  const id = newId(8), token = newId(28), now = Date.now();
  const state = { title: '', lang: l, people: [], events: [] };
  const messages = [{ role: 'assistant', content: GREETINGS[l] }];
  await env.DB.prepare(
    'INSERT INTO maps (id, token, title, state, messages, turns, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
  ).bind(id, token, '', JSON.stringify(state), JSON.stringify(messages), now, now).run();
  return json({ id, token, messages, map: { id, title: '', people: [], events: [] } });
}
