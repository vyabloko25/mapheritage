import { json, readJson, newId, needDb } from '../../../lib/util.js';
import { requireUser } from '../../../lib/auth.js';
import { planOf } from '../../../lib/plans.js';
import { sanitizeDesign } from '../../../lib/ai.js';

// Content and layout are not part of a style.
const NOT_STYLE = ['format', 'subtitle', 'view', 'panel', 'panelSize', 'pos', 'insetCfg', 'legendTitle', 'panelTitle', 'texts', 'ships'];
export const styleOnly = (d) => { const o = { ...(d || {}) }; NOT_STYLE.forEach((k) => delete o[k]); if (o.insets) o.insets = { ...o.insets, pick: undefined }; return o; };

// GET /api/styles — the person's own styles.
export async function onRequestGet({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const { user, res } = await requireUser(request, env); if (res) return res;
  const r = await env.DB.prepare('SELECT id, name, design, updated_at FROM styles WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100').bind(user.id).all();
  return json({ styles: (r.results || []).map((x) => ({ id: x.id, name: x.name, design: JSON.parse(x.design), updated_at: x.updated_at })) });
}
// POST /api/styles { id?, name, design } — save (or overwrite) a style. Pro only.
export async function onRequestPost({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const { user, res } = await requireUser(request, env); if (res) return res;
  if (!planOf(user).custom) return json({ error: 'pro_only' }, 402);
  const b = await readJson(request), name = String(b.name || '').trim().slice(0, 60);
  if (!name) return json({ error: 'bad_request' }, 400);
  const design = styleOnly(sanitizeDesign(b.design || {})), now = Date.now();
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM styles WHERE user_id = ?').bind(user.id).first();
  if (b.id) {
    const r = await env.DB.prepare('UPDATE styles SET name = ?, design = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(name, JSON.stringify(design), now, b.id, user.id).run();
    if (r.meta && r.meta.changes === 0) return json({ error: 'not_found' }, 404);
    return json({ id: b.id, name, design });
  }
  if (n && n.n >= 100) return json({ error: 'too_many' }, 400);
  const id = newId(10);
  await env.DB.prepare('INSERT INTO styles (id, user_id, name, design, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, user.id, name, JSON.stringify(design), now, now).run();
  return json({ id, name, design });
}
