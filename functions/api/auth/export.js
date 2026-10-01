import { json, needDb } from '../../../lib/util.js';
import { getUser } from '../../../lib/auth.js';
import { limit } from '../../../lib/rate.js';

// GET /api/auth/export — everything we store about the signed-in person, as one JSON file (Art. 15 and 20 GDPR).
export async function onRequestGet({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const u = await getUser(request, env); if (!u) return json({ error: 'auth_required' }, 401);
  const rl = await limit(env, request, 'dataExport', u.id); if (rl) return rl;
  const user = await env.DB.prepare('SELECT id, email, name, plan, pro_requested, google_sub IS NOT NULL AS google, created_at, terms_accepted_at, terms_version, age_confirmed FROM users WHERE id = ?').bind(u.id).first();
  const maps = (await env.DB.prepare('SELECT id, title, state, messages, shared, created_at, updated_at FROM maps WHERE owner_id = ? ORDER BY created_at').bind(u.id).all()).results || [];
  const exports = (await env.DB.prepare('SELECT month, count FROM exports WHERE user_id = ?').bind(u.id).all()).results || [];
  let orders = [];
  try { orders = (await env.DB.prepare('SELECT id, map_id, format, paper, frame, name, street, zip, city, country, email, phone, note, items, shipping, total, currency, status, created_at FROM print_orders WHERE user_id = ?').bind(u.id).all()).results || []; } catch {}
  const iso = (t) => (t ? new Date(t).toISOString() : null);
  const data = {
    exported_at: new Date().toISOString(), service: 'MapHeritage',
    account: { ...user, google: !!user.google, created_at: iso(user.created_at), terms_accepted_at: iso(user.terms_accepted_at) },
    maps: maps.map((m) => ({ id: m.id, title: m.title, shared: m.shared === 1, created_at: iso(m.created_at), updated_at: iso(m.updated_at), content: JSON.parse(m.state), conversation: JSON.parse(m.messages) })),
    image_downloads_per_month: exports, print_orders: orders.map((o) => ({ ...o, created_at: iso(o.created_at) })),
  };
  return new Response(JSON.stringify(data, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'content-disposition': `attachment; filename="mapheritage-data-${new Date().toISOString().slice(0, 10)}.json"` } });
}
