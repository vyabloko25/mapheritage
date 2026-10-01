import { json } from '../../lib/util.js';
import { limit } from '../../lib/rate.js';
import { osmBox, overpassQuery, OSM_MIN_Z } from '../../lib/osm.js';

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

// GET /api/osm?lat=&lng=&z= — streets, water, built-up areas and coastline around a place, for the city insets.
// Only the area is sent to Overpass (never anything about the person). Answers are cached at Cloudflare for 30 days.
// The body is passed through untouched, so the function costs almost no CPU; the browser simplifies the data.
export async function onRequestGet({ request, env, waitUntil }) {
  const u = new URL(request.url), lat = +u.searchParams.get('lat'), lng = +u.searchParams.get('lng'), z = +u.searchParams.get('z');
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180 || !(z >= OSM_MIN_Z && z <= 17)) return json({ error: 'bad_request' }, 400);
  const b = osmBox(lat, lng, z);
  const key = new Request(`${u.origin}/api/osm/cache/v1/${b.level}/${b.zb}/${b.s}/${b.w}/${b.n}/${b.e}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  const rl = await limit(env, request, 'osm'); if (rl) return rl;
  const query = overpassQuery(b);
  for (const ep of env.OVERPASS_URL ? [env.OVERPASS_URL, ...ENDPOINTS] : ENDPOINTS) {
    try {
      const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(28000),
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'MapHeritage/1.0 (family history maps; city insets)', accept: 'application/json' } });
      if (!r.ok) continue;
      const buf = await r.arrayBuffer();
      // Overpass reports timeouts inside a 200 answer ("remark" near the end); such answers are not cached.
      const tail = new TextDecoder().decode(new Uint8Array(buf, Math.max(0, buf.byteLength - 400)));
      if (/"remark"\s*:\s*"[^"]*(error|timeout|Timeout)/.test(tail)) continue;
      const res = new Response(buf, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=2592000',
        'x-mh-bbox': [b.s, b.w, b.n, b.e].join(','), 'x-mh-level': String(b.level), 'access-control-expose-headers': 'x-mh-bbox, x-mh-level' } });
      if (cache) { const put = cache.put(key, res.clone()); if (waitUntil) waitUntil(put); else await put; }
      return res;
    } catch (e) { console.log('overpass', ep, e.message); }
  }
  return json({ error: 'osm_failed' }, 502);
}
