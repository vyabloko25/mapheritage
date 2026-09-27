import { json, newId, needDb, GREETING } from '../../../lib/util.js';

// POST /api/maps — создать новую карту. Возвращает id и секретный токен для редактирования.
export async function onRequestPost({ env }) {
  const bad = needDb(env); if (bad) return bad;
  const id = newId(8), token = newId(28), now = Date.now();
  const state = { title: '', people: [], events: [] };
  const messages = [{ role: 'assistant', content: GREETING }];
  await env.DB.prepare(
    'INSERT INTO maps (id, token, title, state, messages, turns, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
  ).bind(id, token, '', JSON.stringify(state), JSON.stringify(messages), now, now).run();
  return json({ id, token, messages, map: { id, title: '', people: [], events: [] } });
}
