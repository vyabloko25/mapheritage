// /api/tile/{style}/{z}/{x}/{y}.png — same-origin, cached proxy for CARTO no-label basemaps.
// Same origin lets the browser read tile pixels, which the PNG export needs.
const STYLES = { light: 'light_nolabels', dark: 'dark_nolabels', voyager: 'voyager_nolabels' };

export async function onRequestGet({ request, params, waitUntil }) {
  const [style, zs, xs, ys] = params.path || [];
  const z = +zs, x = +xs, y = +String(ys || '').replace(/\.png$/, '');
  const n = 2 ** z;
  if (!STYLES[style] || !Number.isInteger(z) || z < 0 || z > 18 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
    return new Response('bad tile', { status: 400 });
  }
  const cache = caches.default;
  const key = new Request(new URL(`/api/tile/${style}/${z}/${x}/${y}.png`, request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const sub = 'abcd'[(x + y) % 4];
  const r = await fetch(`https://${sub}.basemaps.cartocdn.com/${STYLES[style]}/${z}/${x}/${y}@2x.png`, {
    headers: { 'User-Agent': 'MapHeritage/1.0' }, signal: AbortSignal.timeout(8000), cf: { cacheTtl: 2592000, cacheEverything: true },
  });
  if (!r.ok) return new Response('tile error', { status: 502 });
  const res = new Response(r.body, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=2592000, immutable' } });
  waitUntil(cache.put(key, res.clone()));
  return res;
}
