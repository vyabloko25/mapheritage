export const MAX_TURNS = 120;
export const lang = (l) => (l === 'ru' ? 'ru' : 'en');

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

export function newId(n = 10) {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...crypto.getRandomValues(new Uint8Array(n))].map((x) => abc[x % abc.length]).join('');
}

export function needDb(env) {
  if (!env.DB) return json({ error: 'no_db' }, 500);
  return null;
}

export async function loadMap(env, id) {
  if (!/^[a-z0-9]{4,20}$/.test(id || '')) return null;
  const row = await env.DB.prepare('SELECT * FROM maps WHERE id = ?').bind(id).first();
  if (!row) return null;
  return { ...row, state: JSON.parse(row.state), messages: JSON.parse(row.messages) };
}

export async function saveMap(env, m) {
  await env.DB.prepare(
    'UPDATE maps SET title = ?, state = ?, messages = ?, turns = ?, updated_at = ? WHERE id = ?'
  ).bind(m.state.title || '', JSON.stringify(m.state), JSON.stringify(m.messages.slice(-240)),
    m.turns || 0, Date.now(), m.id).run();
}

export function publicMap(m) {
  const s = m.state;
  return {
    id: m.id, title: s.title || '', mode: s.mode || 'family', options: s.options || {}, rootId: s.rootId || null,
    design: s.design || null, people: s.people || [], events: s.events || [], updated_at: m.updated_at,
  };
}

export function tokenOk(m, token) {
  return typeof token === 'string' && token.length > 10 && token === m.token;
}
