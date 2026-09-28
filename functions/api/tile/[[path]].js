// /api/tile/{style}/{z}/{x}/{y}.png — same-origin cached proxy for label-free base maps.
// Same origin lets the browser read tile pixels for PNG export.
// Sources are tried in order; the first that answers wins. Open /api/tile/voyager/3/4/2.png to check.
const SOURCES = {
  light: [
    (z, x, y) => `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/light_nolabels/${z}/${x}/${y}@2x.png`,
    (z, x, y) => `https://cartodb-basemaps-${'abcd'[(x + y) % 4]}.global.ssl.fastly.net/light_nolabels/${z}/${x}/${y}.png`,
    (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
  ],
  dark: [
    (z, x, y) => `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/dark_nolabels/${z}/${x}/${y}@2x.png`,
    (z, x, y) => `https://cartodb-basemaps-${'abcd'[(x + y) % 4]}.global.ssl.fastly.net/dark_nolabels/${z}/${x}/${y}.png`,
    (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
  ],
  voyager: [
    (z, x, y) => `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/${z}/${x}/${y}@2x.png`,
    (z, x, y) => `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/voyager_nolabels/${z}/${x}/${y}@2x.png`,
    (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/${Math.min(z, 13)}/${z > 13 ? y >> (z - 13) : y}/${z > 13 ? x >> (z - 13) : x}`,
  ],
};

export async function onRequestGet({ request, params, waitUntil }) {
  const [style, zs, xs, ys] = params.path || [];
  const z = +zs, x = +xs, y = +String(ys || '').replace(/\.png$/, ''), n = 2 ** z;
  if (!SOURCES[style] || !Number.isInteger(z) || z < 0 || z > 18 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
    return new Response('bad tile', { status: 400 });
  }
  const cache = caches.default;
  const key = new Request(new URL(`/api/tile/${style}/${z}/${x}/${y}.png`, request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const errors = [];
  for (const [i, src] of SOURCES[style].entries()) {
    const url = src(z, x, y);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MapHeritage/1.0; +https://mapheritage)', Accept: 'image/png,image/*', Referer: new URL(request.url).origin + '/' },
        signal: AbortSignal.timeout(6000), cf: { cacheTtl: 2592000, cacheEverything: true },
      });
      const type = r.headers.get('content-type') || '';
      if (!r.ok || !type.startsWith('image/')) { errors.push(`${i}:${r.status}`); continue; }
      const res = new Response(r.body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=2592000', 'x-tile-source': String(i), 'access-control-allow-origin': '*' } });
      waitUntil(cache.put(key, res.clone()));
      return res;
    } catch (e) { errors.push(`${i}:${e.name}`); }
  }
  return new Response('all tile sources failed: ' + errors.join(', '), { status: 502, headers: { 'cache-control': 'no-store' } });
}
