// Геокодинг через OpenStreetMap Nominatim с кэшем в D1.
// Возвращает { point, net }: point = {lat,lng} | null (не найдено) | undefined (ошибка сети).
export async function geocode(env, query) {
  const key = (query || '').trim().toLowerCase();
  if (!key) return { point: null, net: false };
  try {
    const row = await env.DB.prepare('SELECT lat, lng FROM geocache WHERE q = ?').bind(key).first();
    if (row) return { point: row.lat == null ? null : { lat: row.lat, lng: row.lng }, net: false };
  } catch {}
  let point = null;
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ru&q=' +
      encodeURIComponent(query);
    const r = await fetch(url, { headers: { 'User-Agent': 'MapHeritage/1.0 (family history maps)', Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { point: undefined, net: true };
    const j = await r.json();
    if (j && j[0]) point = { lat: +j[0].lat, lng: +j[0].lon };
  } catch {
    return { point: undefined, net: true };
  }
  try {
    await env.DB.prepare('INSERT OR REPLACE INTO geocache (q, lat, lng, created_at) VALUES (?, ?, ?, ?)')
      .bind(key, point ? point.lat : null, point ? point.lng : null, Date.now()).run();
  } catch {}
  return { point, net: true };
}

// Уточняет координаты событий: переиспользует уже найденные, ищет новые (не больше budget за раз).
export async function attachGeo(env, state, prev, budget = 4) {
  const old = new Map((prev.events || []).map((e) => [e.id, e]));
  for (const e of state.events) {
    const p = old.get(e.id);
    if (p && p.query === e.query && p.geo === 'osm') {
      e.lat = p.lat; e.lng = p.lng; e.geo = 'osm';
      continue;
    }
    if (budget <= 0 || !e.query) continue;
    budget--;
    const { point, net } = await geocode(env, e.query);
    if (point) { e.lat = point.lat; e.lng = point.lng; e.geo = 'osm'; }
    if (net) await new Promise((r) => setTimeout(r, 1100)); // правило Nominatim: не чаще 1 запроса в секунду
  }
}
