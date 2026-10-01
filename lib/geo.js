// Geocoding via OpenStreetMap Nominatim, cached in D1.
// Returns { point, net }: point = {lat,lng,kind} | null (not found) | undefined (network error).
// kind: 'country' | 'region' | 'settlement' — city insets are only drawn for settlements.
const kindOf = (t) => (t === 'country' || t === 'continent' ? 'country' : ['state', 'region', 'province', 'state_district', 'county', 'territory', 'archipelago', 'island'].includes(t) ? 'region' : 'settlement');
export async function geocode(env, query) {
  const key = (query || '').trim().toLowerCase();
  if (!key) return { point: null, net: false };
  try {
    const row = await env.DB.prepare('SELECT lat, lng, kind FROM geocache WHERE q = ?').bind(key).first();
    if (row) return { point: row.lat == null ? null : { lat: row.lat, lng: row.lng, kind: row.kind || 'settlement' }, net: false };
  } catch {}
  let point = null;
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ru,en&q=' +
      encodeURIComponent(query);
    const r = await fetch(url, { headers: { 'User-Agent': 'MapHeritage/1.0 (family history maps)', Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { point: undefined, net: true };
    const j = await r.json();
    if (j && j[0]) point = { lat: +j[0].lat, lng: +j[0].lon, kind: kindOf(j[0].addresstype || j[0].type) };
  } catch {
    return { point: undefined, net: true };
  }
  try {
    await env.DB.prepare('INSERT OR REPLACE INTO geocache (q, lat, lng, kind, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(key, point ? point.lat : null, point ? point.lng : null, point ? point.kind : null, Date.now()).run();
  } catch {}
  return { point, net: true };
}

// Refine event coordinates: reuse known ones, look up new ones (at most `budget` per call).
export async function attachGeo(env, state, prev, budget = 4) {
  const old = new Map((prev.events || []).map((e) => [e.id, e]));
  for (const e of state.events) {
    // Coordinates that arrive already confirmed (picked by hand or found in the editor) win.
    if (['manual', 'osm', 'gedcom'].includes(e.geo) && Number.isFinite(e.lat) && Number.isFinite(e.lng)) continue;
    const p = old.get(e.id);
    if (p && p.query === e.query && ['osm', 'manual', 'gedcom'].includes(p.geo)) {
      e.lat = p.lat; e.lng = p.lng; e.geo = p.geo; if (p.kind) e.kind = p.kind;
      continue;
    }
    if (budget <= 0 || !e.query) continue;
    budget--;
    const { point, net } = await geocode(env, e.query);
    if (point) { e.lat = point.lat; e.lng = point.lng; e.geo = 'osm'; e.kind = point.kind; }
    if (net) await new Promise((r) => setTimeout(r, 1100)); // Nominatim policy: max 1 request per second
  }
}
