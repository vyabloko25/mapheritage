import { json, readJson, needDb } from '../../../lib/util.js';
import { getUser, sessionCookie } from '../../../lib/auth.js';
import { PLANS, planOf, exportsUsed } from '../../../lib/plans.js';

// GET — who am I, which plan, what is left this month.
export async function onRequestGet({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const u = await getUser(request, env);
  const plans = Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { ...v, exports: v.exports === Infinity ? null : v.exports }]));
  if (!u) return json({ user: null, google: !!env.GOOGLE_CLIENT_ID, plans, print: !!env.PRINTS });
  const p = planOf(u), used = await exportsUsed(env, u.id);
  return json({ user: { email: u.email, name: u.name, plan: u.plan === 'pro' ? 'pro' : 'lite', proRequested: !!u.pro_requested, google: !!u.google_sub, admin: !!u.admin },
    exportsLeft: p.exports === Infinity ? null : Math.max(0, p.exports - used), google: !!env.GOOGLE_CLIENT_ID, plans, print: !!env.PRINTS });
}

// DELETE — delete the account and everything in it. Body: { confirm: "DELETE" }
export async function onRequestDelete({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const u = await getUser(request, env); if (!u) return json({ error: 'auth_required' }, 401);
  const { confirm } = await readJson(request); if (confirm !== 'DELETE') return json({ error: 'confirm' }, 400);
  const maps = await env.DB.prepare('SELECT id FROM maps WHERE owner_id = ?').bind(u.id).all();
  const stmts = (maps.results || []).map((m) => env.DB.prepare('DELETE FROM snapshots WHERE map_id = ?').bind(m.id));
  stmts.push(env.DB.prepare('DELETE FROM maps WHERE owner_id = ?').bind(u.id), env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
    env.DB.prepare('DELETE FROM exports WHERE user_id = ?').bind(u.id), env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(u.id),
    // Print orders are business records with a legal retention period: they stay, but are no longer linked to the account.
    env.DB.prepare('UPDATE print_orders SET user_id = NULL WHERE user_id = ?').bind(u.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id));
  await env.DB.batch(stmts);
  return new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie('', 0) } });
}
