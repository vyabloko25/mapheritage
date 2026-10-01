import { json, newId } from './util.js';
import { TERMS_VERSION } from './legal.js';

const enc = (s) => new TextEncoder().encode(s);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc(s)));
export async function hashPassword(pw, salt) {
  const key = await crypto.subtle.importKey('raw', enc(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc(salt), iterations: 100000 }, key, 256));
}
export function randomHex(n = 32) { return hex(crypto.getRandomValues(new Uint8Array(n))); }

export function cookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
const SESSION_DAYS = 30;
export function sessionCookie(token, maxAge = SESSION_DAYS * 86400) {
  return `mh_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export async function startSession(env, userId) {
  const token = randomHex(32);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)').bind(await sha256(token), userId, Date.now() + SESSION_DAYS * 86400e3).run();
  return token;
}
export async function getUser(request, env) {
  const tok = cookies(request).mh_session; if (!tok || !env.DB) return null;
  try {
    return await env.DB.prepare('SELECT u.id, u.email, u.name, u.plan, u.pro_requested, u.google_sub, u.pass_hash IS NOT NULL AS has_password FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?')
      .bind(await sha256(tok), Date.now()).first();
  } catch { return null; }
}
export async function requireUser(request, env) {
  const u = await getUser(request, env);
  return u ? { user: u } : { res: json({ error: 'auth_required' }, 401) };
}
// New accounts always record the accepted terms version and the 16+ confirmation.
export async function createUser(env, { email, name, pass, googleSub, consent }) {
  if (!consent) throw new Error('consent required');
  const id = newId(12), salt = pass ? randomHex(16) : null, now = Date.now();
  await env.DB.prepare('INSERT INTO users (id, email, name, pass_hash, salt, google_sub, plan, created_at, terms_accepted_at, terms_version, age_confirmed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
    .bind(id, email, name || '', pass ? await hashPassword(pass, salt) : null, salt, googleSub || null, env.DEFAULT_PLAN === 'pro' ? 'pro' : 'lite', now, now, TERMS_VERSION).run();
  return id;
}
export const validEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 200;
