import { json } from './util.js';
import { sha256 } from './auth.js';

// Fixed-window rate limits kept in D1. The client IP is stored only as a salted hash.
export const LIMITS = {
  login: [10, 900], register: [5, 3600], reset: [5, 3600], chat: [60, 3600], geocode: [400, 3600],
  export: [60, 3600], print: [5, 3600], create: [30, 3600], dataExport: [10, 3600], google: [20, 900], osm: [300, 3600],
};
export const ip = (request) => request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';

// Returns null when allowed, or a 429 response.
export async function limit(env, request, name, who) {
  if (!env.DB || env.RATE_LIMITS === 'off') return null;
  const [max, win] = LIMITS[name] || [60, 3600];
  const now = Math.floor(Date.now() / 1000);
  const k = name + ':' + (await sha256((env.RATE_SALT || 'mh-rate') + '|' + (who || ip(request)))).slice(0, 32);
  try {
    const r = await env.DB.prepare(`INSERT INTO rate_limits (k, n, reset) VALUES (?1, 1, ?2)
      ON CONFLICT (k) DO UPDATE SET n = CASE WHEN reset <= ?3 THEN 1 ELSE n + 1 END, reset = CASE WHEN reset <= ?3 THEN ?2 ELSE reset END
      RETURNING n, reset`).bind(k, now + win, now).first();
    if (r && r.n > max) {
      const res = json({ error: 'rate_limited', retryAfter: r.reset - now }, 429);
      res.headers.set('retry-after', String(Math.max(1, r.reset - now)));
      return res;
    }
    if (Math.random() < 0.01) await env.DB.prepare('DELETE FROM rate_limits WHERE reset < ?').bind(now).run();
  } catch (e) { console.log('rate limit table missing?', e.message); }
  return null;
}
