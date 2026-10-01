// City detail for the inset maps, from OpenStreetMap through the Overpass API.
// Generalised by scale: the closer the inset, the smaller the area and the more road classes.
export const OSM_MIN_Z = 11;
export const ROAD_CLASSES = [
  [11, 'motorway|trunk|primary'],
  [12.4, 'motorway|trunk|primary|secondary'],
  [13.8, 'motorway|trunk|primary|secondary|tertiary'],
  [14.8, 'motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian'],
];
export const roadLevel = (z) => { let k = 0; ROAD_CLASSES.forEach(([zz], i) => { if (z >= zz) k = i; }); return k; };

// The area an inset shows: 170 poster units at zoom z, plus a margin for dragging. Snapped so nearby requests share a cache entry.
export function osmBox(lat, lng, z) {
  const zb = Math.round(z * 2) / 2, mpp = (156543.034 * Math.cos((lat * Math.PI) / 180)) / 2 ** zb;
  const half = 85 * mpp * 1.45, dLat = half / 111320, dLng = half / (111320 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  const qa = dLat / 4, qo = dLng / 4, cy = Math.round(lat / qa) * qa, cx = Math.round(lng / qo) * qo;
  const r = (v) => +v.toFixed(5);
  return { zb, level: roadLevel(zb), s: r(cy - dLat), w: r(cx - dLng), n: r(cy + dLat), e: r(cx + dLng) };
}
export function overpassQuery(b) {
  const bb = `${b.s},${b.w},${b.n},${b.e}`, roads = ROAD_CLASSES[b.level][1];
  return `[out:json][timeout:25][maxsize:200000000][bbox:${bb}];
(
  way["highway"~"^(${roads})(_link)?$"];
  way["railway"="rail"]["service"!~"."];
  way["waterway"~"^(river|canal)$"];
  way["natural"="water"]; relation["natural"="water"];
  way["waterway"="riverbank"];
  way["landuse"~"^(residential|commercial|retail|industrial)$"]; relation["landuse"~"^(residential|commercial|retail|industrial)$"];
  way["leisure"="park"]; way["landuse"="forest"]; way["natural"="wood"];
  way["natural"="coastline"];
);
out geom qt;`;
}
