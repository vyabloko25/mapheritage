import { cookies, startSession, sessionCookie, createUser } from '../../../../lib/auth.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url), fail = (why) => Response.redirect(url.origin + '/create?auth_error=' + why, 302);
  const [state, nextEnc, consent] = (cookies(request).mh_oauth || '').split('|');
  if (!state || state !== url.searchParams.get('state')) return fail('state');
  const code = url.searchParams.get('code'); if (!code) return fail('denied');
  const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: url.origin + '/api/auth/google/callback', grant_type: 'authorization_code' }) });
  if (!tr.ok) return fail('token');
  const { access_token } = await tr.json();
  const ur = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: 'Bearer ' + access_token } });
  if (!ur.ok) return fail('profile');
  const g = await ur.json();
  if (!g.sub || !g.email) return fail('profile');
  const email = g.email.toLowerCase();
  let u = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(g.sub).first();
  if (!u && g.email_verified) {
    u = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (u) await env.DB.prepare('UPDATE users SET google_sub = ? WHERE id = ?').bind(g.sub, u.id).run();
  }
  let id = u && u.id;
  if (!id) {
    if (consent !== '1') return fail('terms');
    try { id = await createUser(env, { email, name: g.name || '', googleSub: g.sub, consent: true }); } catch { return fail('email'); }
  }
  const tok = await startSession(env, id);
  const next = decodeURIComponent(nextEnc || '/create');
  return new Response(null, { status: 302, headers: [['location', url.origin + (next.startsWith('/') ? next : '/create')], ['set-cookie', sessionCookie(tok)], ['set-cookie', 'mh_oauth=; Path=/api/auth/google; Max-Age=0']] });
}
