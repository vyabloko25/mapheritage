/* MapHeritage town insets: streets, buildings, water and built-up areas from OpenStreetMap vector tiles
   (OpenMapTiles schema, served through /api/tiles; © OpenMapTiles © OpenStreetMap contributors).
   How many roads are drawn is a setting of its own ("detail"); zooming keeps the same density by
   revealing smaller road classes as the inset gets closer. */
(function () {
  const MIN_Z = 11;
  // Road classes from the most to the least important.
  const RANK = { motorway: 0, trunk: 0, primary: 1, secondary: 2, tertiary: 3, minor: 4, service: 5, track: 6, path: 6 };
  // Highest road rank shown for a detail setting (1–5) at an inset zoom.
  const maxRank = (z, detail) => Math.max(0, Math.min(5, Math.round((detail ?? 3) + (z - 13) * 0.75)));
  const showBuildings = (z, detail) => z + ((detail ?? 3) - 3) * 0.6 >= 14;
  const tileZoom = (z) => Math.max(10, Math.min(14, Math.round(z)));
  const tiles = new Map(), subs = new Set();
  const notify = () => subs.forEach((fn) => { try { fn(); } catch {} });

  // ---------- a small Mapbox Vector Tile decoder ----------
  function decode(buf) {
    const b = new Uint8Array(buf); let pos = 0;
    const varint = () => { let r = 0, s = 0, c; do { c = b[pos++]; r += (c & 0x7f) * 2 ** s; s += 7; } while (c & 0x80); return r; };
    const layers = {};
    function skip(t) { if (t === 0) varint(); else if (t === 1) pos += 8; else if (t === 2) pos += varint(); else if (t === 5) pos += 4; }
    function value(end) {
      let v = null;
      while (pos < end) {
        const k = varint(), f = k >> 3, t = k & 7;
        if (f === 1 && t === 2) { const n = varint(); v = new TextDecoder().decode(b.subarray(pos, pos + n)); pos += n; }
        else if (f === 2 && t === 5) { v = new DataView(b.buffer, b.byteOffset + pos, 4).getFloat32(0, true); pos += 4; }
        else if (f === 3 && t === 1) { v = new DataView(b.buffer, b.byteOffset + pos, 8).getFloat64(0, true); pos += 8; }
        else if ((f === 4 || f === 5) && t === 0) v = varint();
        else if (f === 6 && t === 0) { const n = varint(); v = n % 2 ? -(n + 1) / 2 : n / 2; }
        else if (f === 7 && t === 0) v = !!varint();
        else skip(t);
      }
      return v;
    }
    while (pos < b.length) {
      const k = varint();
      if (k >> 3 !== 3 || (k & 7) !== 2) { skip(k & 7); continue; }
      const len = varint(), end = pos + len, L = { name: '', extent: 4096, keys: [], values: [], raw: [] };
      while (pos < end) {
        const k2 = varint(), f = k2 >> 3, t = k2 & 7;
        if (f === 1) { const n = varint(); L.name = new TextDecoder().decode(b.subarray(pos, pos + n)); pos += n; }
        else if (f === 2) { const n = varint(); L.raw.push([pos, pos + n]); pos += n; }
        else if (f === 3) { const n = varint(); L.keys.push(new TextDecoder().decode(b.subarray(pos, pos + n))); pos += n; }
        else if (f === 4) { const n = varint(); L.values.push(value(pos + n)); }
        else if (f === 5) L.extent = varint();
        else skip(t);
      }
      L.features = L.raw.map(([s, e]) => {
        pos = s; const F = { type: 0, tags: {}, geom: [] }; let tags = [];
        while (pos < e) {
          const k3 = varint(), f = k3 >> 3, t = k3 & 7;
          if (f === 2 && t === 2) { const len = varint(), n = pos + len; while (pos < n) tags.push(varint()); }
          else if (f === 3) F.type = varint();
          else if (f === 4 && t === 2) { const len = varint(), n = pos + len; while (pos < n) F.geom.push(varint()); }
          else skip(t);
        }
        for (let i = 0; i + 1 < tags.length; i += 2) F.tags[L.keys[tags[i]]] = L.values[tags[i + 1]];
        return F;
      });
      pos = end; delete L.raw;
      layers[L.name] = L;
    }
    return layers;
  }
  // Geometry commands → rings/lines in world fractions.
  function geometry(F, extent, tz, tx, ty) {
    const g = F.geom, out = [], n = 2 ** tz; let x = 0, y = 0, cur = null, i = 0;
    while (i < g.length) {
      const c = g[i++], id = c & 7, cnt = c >> 3;
      if (id === 7) { if (cur) cur.closed = true; continue; }
      for (let k = 0; k < cnt; k++) {
        const dx = g[i++], dy = g[i++]; x += dx % 2 ? -(dx + 1) / 2 : dx / 2; y += dy % 2 ? -(dy + 1) / 2 : dy / 2;
        const X = (tx + x / extent) / n, Y = (ty + y / extent) / n;
        if (id === 1) { cur = [X, Y]; out.push(cur); } else cur.push(X, Y);
      }
    }
    return out.map((a) => Float64Array.from(a));
  }
  function digest(layers, tz, tx, ty) {
    const D = { roads: [[], [], [], [], [], [], []], rail: [], water: [], waterway: [], built: [], green: [], buildings: [], ocean: false };
    const each = (name, fn) => { const L = layers[name]; if (L) L.features.forEach((F) => fn(F, geometry(F, L.extent, tz, tx, ty))); };
    each('transportation', (F, g) => {
      const c = F.tags.class; if (F.type !== 2) return;
      if (c === 'rail' || F.tags.subclass === 'rail') { if (!F.tags.service) D.rail.push(...g); return; }
      const r = RANK[c]; if (r === undefined) return;
      if (F.tags.brunnel === 'tunnel' && r > 1) return;
      D.roads[r].push(...g);
    });
    each('water', (F, g) => { if (F.type === 3) { D.water.push(g); if (F.tags.class === 'ocean') D.ocean = true; } });
    each('waterway', (F, g) => { if (F.type === 2 && (F.tags.class === 'river' || F.tags.class === 'canal')) D.waterway.push(...g); });
    each('landuse', (F, g) => { if (F.type === 3 && /^(residential|commercial|retail|industrial|suburb|neighbourhood|quarter)$/.test(F.tags.class || '')) D.built.push(g); });
    each('park', (F, g) => { if (F.type === 3) D.green.push(g); });
    each('landcover', (F, g) => { if (F.type === 3 && /^(wood|forest|grass)$/.test(F.tags.class || '')) D.green.push(g); });
    each('building', (F, g) => { if (F.type === 3) D.buildings.push(g); });
    return D;
  }
  function loadTile(z, x, y) {
    const k = z + '/' + x + '/' + y; let t = tiles.get(k);
    if (t) return t;
    t = { state: 'loading', data: null };
    t.promise = fetch(`/api/tiles/${z}/${x}/${y}`)
      .then(async (r) => {
        if (r.status === 204) { t.data = digest({}, z, x, y); t.state = 'ok'; return; }
        if (!r.ok) throw new Error('tile ' + r.status);
        t.data = digest(decode(await r.arrayBuffer()), z, x, y); t.state = 'ok';
      })
      .catch((e) => { console.warn('town tile', k, e.message); t.state = 'fail'; })
      .then(() => { notify(); return t.data; });
    tiles.set(k, t);
    return t;
  }
  const merc = (lat) => { const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  // Tiles under an inset: 170 poster units at zoom z, with a margin for dragging.
  function cover(lat, lng, z) {
    const tz = tileZoom(z), n = 2 ** tz, half = (85 * 1.25) / (256 * 2 ** z), X = (lng + 180) / 360, Y = merc(lat), out = [];
    for (let x = Math.floor((X - half) * n); x <= Math.floor((X + half) * n); x++) for (let y = Math.max(0, Math.floor((Y - half) * n)); y <= Math.min(n - 1, Math.floor((Y + half) * n)); y++) out.push([tz, ((x % n) + n) % n, y]);
    return out;
  }
  const wants = (z) => Number.isFinite(z) && z >= MIN_Z;
  // Returns the tiles' data once all of them are in, otherwise null (and starts loading).
  function get(lat, lng, z) {
    if (!wants(z)) return null;
    const ts = cover(lat, lng, z).map(([a, b, c]) => loadTile(a, b, c));
    if (ts.some((t) => t.state === 'loading')) return null;
    const ok = ts.filter((t) => t.state === 'ok'); if (!ok.length) return null;
    return { parts: ok.map((t) => t.data), z, cx: (lng + 180) / 360 };
  }
  function ensure(lat, lng, z) { if (!wants(z)) return Promise.resolve(null); return Promise.all(cover(lat, lng, z).map(([a, b, c]) => loadTile(a, b, c).promise)); }

  // ---------- drawing ----------
  const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); if (!A || !B) return a; return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };
  function hatch(ctx, color, f) {
    const s = Math.max(4, Math.round(5 * f)), c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
    g.strokeStyle = color; g.lineWidth = Math.max(0.6, 0.6 * f); g.beginPath(); g.moveTo(-1, s + 1); g.lineTo(s + 1, -1); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(s - 1, s + 1); g.lineTo(s + 1, s - 1); g.stroke();
    return ctx.createPattern(c, 'repeat');
  }
  function look(S, C) {
    const ink = S.coast.color, land = S.land, sea = S.sea, lake = S.lake || S.sea, st = (C && C.style) || 'engraved';
    if (st === 'modern') return { st, land, sea, lake, ink, built: '#ECE7E0', bld: '#D9D1C7', hatch: false, green: '#D5E6C4', casing: '#B5B5B5', fill: ['#F6C85F', '#FBE3A0', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'], rail: '#8A8A8A', edge: mix(lake, '#000000', 0.25) };
    if (st === 'night') return { st, land, sea, lake, ink, built: mix(land, '#FFFFFF', 0.06), bld: mix(land, '#FFFFFF', 0.16), hatch: false, green: mix(land, '#3D6B4F', 0.3), casing: null, fill: [ink, ink, ink, mix(ink, land, 0.25), mix(ink, land, 0.45), mix(ink, land, 0.6)], rail: mix(ink, land, 0.45), edge: mix(ink, land, 0.5) };
    return { st, land, sea, lake, ink, built: mix(land, ink, 0.06), bld: mix(land, ink, 0.32), hatch: C && C.hatch !== false, green: mix(land, '#5E7A3A', 0.16), casing: ink, fill: [land, land, land, land, null, null], rail: ink, edge: ink };
  }
  const W = [3.6, 3, 2.4, 1.8, 0.9, 0.6];
  function draw(ctx, V, S, data, C, detail) {
    if (!data) return false;
    const f = V.f, s = V.s, k = Math.round(V.x0 / s + V.w / s / 2 - data.cx), ox = V.x0 - k * s, oy = V.y0, z = data.z;
    const top = maxRank(z, detail), bld = showBuildings(z, detail), grow = 2 ** Math.max(-0.6, Math.min(0.8, (z - 13) * 0.35));
    const add = (p, a, close) => { p.moveTo(a[0] * s - ox, a[1] * s - oy); for (let i = 2; i < a.length; i += 2) p.lineTo(a[i] * s - ox, a[i + 1] * s - oy); if (close) p.closePath(); };
    const lines = (pick) => { const p = new Path2D(); data.parts.forEach((d) => pick(d).forEach((a) => add(p, a))); return p; };
    const polys = (pick) => { const p = new Path2D(); data.parts.forEach((d) => pick(d).forEach((rings) => rings.forEach((a) => add(p, a, true)))); return p; };
    const L = look(S, C);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, V.w, V.h); ctx.clip(); ctx.lineJoin = ctx.lineCap = 'round';
    ctx.fillStyle = L.land; ctx.fillRect(0, 0, V.w, V.h);
    ctx.fillStyle = L.green; ctx.fill(polys((d) => d.green), 'evenodd');
    const B = polys((d) => d.built);
    ctx.fillStyle = L.built; ctx.fill(B, 'evenodd');
    if (L.hatch && !bld) { ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = hatch(ctx, L.ink, f); ctx.fill(B, 'evenodd'); ctx.restore(); }
    const Wt = polys((d) => d.water);
    ctx.fillStyle = data.parts.some((d) => d.ocean) ? L.sea : L.lake; ctx.fill(Wt, 'evenodd');
    ctx.strokeStyle = L.lake; ctx.lineWidth = 1.6 * f * grow; ctx.stroke(lines((d) => d.waterway));
    ctx.strokeStyle = L.edge; ctx.globalAlpha = 0.75; ctx.lineWidth = 0.6 * f; ctx.stroke(Wt); ctx.globalAlpha = 1;
    if (bld) {
      const P = polys((d) => d.buildings);
      ctx.fillStyle = L.bld; ctx.fill(P, 'nonzero');
      if (L.st === 'engraved') { ctx.strokeStyle = L.ink; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.3 * f; ctx.stroke(P); ctx.globalAlpha = 1; }
    }
    const R = lines((d) => d.rail);
    ctx.strokeStyle = L.rail; ctx.globalAlpha = 0.75; ctx.lineWidth = 0.7 * f; ctx.stroke(R);
    if (L.st === 'engraved') { ctx.setLineDash([0.1, 4 * f]); ctx.lineWidth = 1.8 * f; ctx.globalAlpha = 0.45; ctx.stroke(R); ctx.setLineDash([]); }
    ctx.globalAlpha = 1;
    for (let r = top; r >= 0; r--) {
      const p = lines((d) => d.roads[r]), w = W[r] * f * grow;
      if (L.fill[r] == null) { ctx.strokeStyle = L.ink; ctx.globalAlpha = r >= 5 ? 0.5 : 0.75; ctx.lineWidth = (r >= 5 ? 0.45 : 0.7) * f * grow; ctx.stroke(p); ctx.globalAlpha = 1; continue; }
      if (L.casing) { ctx.strokeStyle = L.casing; ctx.lineWidth = w + 1.1 * f; ctx.stroke(p); }
      ctx.strokeStyle = L.fill[r]; ctx.lineWidth = L.casing ? w : w * 0.5; ctx.globalAlpha = L.st === 'night' ? 0.85 : 1; ctx.stroke(p); ctx.globalAlpha = 1;
    }
    ctx.restore();
    return true;
  }
  window.CityMap = { MIN_Z, get, ensure, draw, maxRank, subscribe: (fn) => (subs.add(fn), () => subs.delete(fn)), _decode: decode, _digest: digest };
})();
