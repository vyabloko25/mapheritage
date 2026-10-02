import { json } from '../../../../../lib/util.js';
import { limit } from '../../../../../lib/rate.js';

// GET /api/tiles/:z/:x/:y — OpenStreetMap vector tiles (OpenMapTiles schema) for the town insets.
// Fetched by our server from OpenFreeMap (or TILES_URL, any TileJSON with OpenMapTiles layers), so viewers' IP addresses never leave us.
// Tiles are cached at Cloudflare for 30 days; the function only passes bytes through.
const DEFAULT_TILEJSON = 'https://tiles.openfreemap.org/planet';

async function template(env, cache, origin) {
  const key = new Request(origin + '/api/tiles/_tilejson/v1');
  if (cache) { const hit = await cache.match(key); if (hit) return (await hit.json()).tile; }
  const r = await fetch(env.TILES_URL || DEFAULT_TILEJSON, { headers: { 'user-agent': 'MapHeritage/1.0 (family history maps)' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('tilejson ' + r.status);
  const j = await r.json(), tile = j.tiles && j.tiles[0];
  if (!tile) throw new Error('tilejson without tiles');
  if (cache) await cache.put(key, new Response(JSON.stringify({ tile, maxzoom: j.maxzoom }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } }));
  return tile;
}

export async function onRequestGet({ request, env, params, waitUntil }) {
  const z = +params.z, x = +params.x, y = +String(params.y).replace(/\.pbf$/, '');
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 14 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return json({ error: 'bad_request' }, 400);
  const u = new URL(request.url), cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(`${u.origin}/api/tiles/_cache/v1/${z}/${x}/${y}`);
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  const rl = await limit(env, request, 'tiles'); if (rl) return rl;
  try {
    const src = (await template(env, cache, u.origin)).replace('{z}', z).replace('{x}', x).replace('{y}', y);
    const r = await fetch(src, { headers: { 'user-agent': 'MapHeritage/1.0 (family history maps)' }, signal: AbortSignal.timeout(10000) });
    if (r.status === 204 || r.status === 404) return new Response(null, { status: 204, headers: { 'cache-control': 'public, max-age=2592000' } });
    if (!r.ok) return json({ error: 'tiles_failed', status: r.status }, 502);
    const res = new Response(await r.arrayBuffer(), { headers: { 'content-type': 'application/x-protobuf', 'cache-control': 'public, max-age=2592000' } });
    if (cache) { const put = cache.put(key, res.clone()); if (waitUntil) waitUntil(put); else await put; }
    return res;
  } catch (e) { console.log('tiles', e.message); return json({ error: 'tiles_failed' }, 502); }
}
