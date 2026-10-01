/* MapHeritage city insets: streets, water, built-up areas and coastline from OpenStreetMap (© OpenStreetMap contributors, ODbL).
   Data comes through /api/osm (Overpass, cached at Cloudflare) and is generalised here by scale:
   the closer the inset, the smaller the area and the more road classes (primary → + secondary → + tertiary → + residential). */
(function () {
  const MIN_Z = 11;
  const LEVELS = [11, 12.4, 13.8, 14.8];
  const level = (z) => { let k = 0; LEVELS.forEach((zz, i) => { if (z >= zz) k = i; }); return k; };
  const store = new Map(), subs = new Set();
  const notify = () => subs.forEach((fn) => { try { fn(); } catch {} });
  const merc = (lat) => { const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };

  // Same snapping as lib/osm.js, so nearby views share one request.
  function box(lat, lng, z) {
    const zb = Math.round(z * 2) / 2, mpp = (156543.034 * Math.cos((lat * Math.PI) / 180)) / 2 ** zb;
    const half = 85 * mpp * 1.45, dLat = half / 111320, dLng = half / (111320 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
    const qa = dLat / 4, qo = dLng / 4, cy = Math.round(lat / qa) * qa, cx = Math.round(lng / qo) * qo;
    return { key: [level(zb), zb, (cy).toFixed(4), (cx).toFixed(4)].join(':'), zb };
  }

  // ---------- geometry helpers ----------
  const P = (g) => g.map((p) => [p.lon, p.lat]);
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  const ptKey = (p) => p[0].toFixed(7) + ',' + p[1].toFixed(7);
  function area(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return s / 2; } // > 0: counter-clockwise (y up)
  function simplify(pts, tol) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); let md = 0, mi = -1;
      const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
      for (let i = a + 1; i < b; i++) {
        const [x, y] = pts[i]; let d;
        if (L === 0) d = (x - x1) ** 2 + (y - y1) ** 2;
        else { const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L)); d = (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2; }
        if (d > md) { md = d; mi = i; }
      }
      if (mi > 0 && md > tol * tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  // Join open ways into rings (multipolygon members, coastline pieces).
  function joinWays(ways) {
    const left = ways.map((w) => w.slice()), out = [];
    while (left.length) {
      let cur = left.pop(), grew = true;
      while (grew && !same(cur[0], cur[cur.length - 1])) {
        grew = false;
        for (let i = 0; i < left.length; i++) {
          const w = left[i], e = cur[cur.length - 1];
          if (same(w[0], e)) cur = cur.concat(w.slice(1));
          else if (same(w[w.length - 1], e)) cur = cur.concat(w.slice(0, -1).reverse());
          else if (same(w[w.length - 1], cur[0])) cur = w.slice(0, -1).concat(cur);
          else if (same(w[0], cur[0])) cur = w.slice(1).reverse().concat(cur);
          else continue;
          left.splice(i, 1); grew = true; break;
        }
      }
      out.push(cur);
    }
    return out;
  }
  // Coastline ways keep their direction (land on the left), so they are joined head to tail only.
  function joinDirected(ways) {
    const byStart = new Map(); ways.forEach((w, i) => byStart.set(ptKey(w[0]), i));
    const used = new Uint8Array(ways.length), out = [];
    const hasPrev = new Set(ways.map((w) => ptKey(w[w.length - 1])));
    const order = ways.map((_, i) => i).sort((a, b) => (hasPrev.has(ptKey(ways[a][0])) ? 1 : 0) - (hasPrev.has(ptKey(ways[b][0])) ? 1 : 0));
    for (const i of order) {
      if (used[i]) continue; used[i] = 1; let cur = ways[i].slice();
      for (;;) { const n = byStart.get(ptKey(cur[cur.length - 1])); if (n === undefined || used[n]) break; used[n] = 1; cur = cur.concat(ways[n].slice(1)); }
      out.push(cur);
    }
    return out;
  }
  // Land polygons inside the box from coastline chains (land on the left of the line).
  function coastToLand(chains, b) {
    const [s, w, n, e] = b, inside = (p) => p[0] > w && p[0] < e && p[1] > s && p[1] < n;
    const tOf = (p) => {
      const dB = Math.abs(p[1] - s), dR = Math.abs(p[0] - e), dT = Math.abs(p[1] - n), dL = Math.abs(p[0] - w), m = Math.min(dB, dR, dT, dL);
      if (m === dB) return (p[0] - w) / (e - w); if (m === dR) return 1 + (p[1] - s) / (n - s); if (m === dT) return 2 + (e - p[0]) / (e - w); return 3 + (n - p[1]) / (n - s);
    };
    const corner = [[e, s], [e, n], [w, n], [w, s]]; // at t = 1, 2, 3, 4
    function clipSeg(a, c) { // Liang–Barsky, returns [t0, t1] of the part inside, or null
      let t0 = 0, t1 = 1; const dx = c[0] - a[0], dy = c[1] - a[1];
      for (const [p, q] of [[-dx, a[0] - w], [dx, e - a[0]], [-dy, a[1] - s], [dy, n - a[1]]]) {
        if (p === 0) { if (q < 0) return null; continue; }
        const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
      }
      return [t0, t1];
    }
    const pieces = [], rings = [], lines = [];
    for (let ch of chains) {
      const closed = ch.length > 3 && same(ch[0], ch[ch.length - 1]);
      if (closed && ch.every(inside)) { rings.push(ch); lines.push(ch); continue; }
      if (closed) { const k = ch.findIndex((p) => !inside(p)); if (k < 0) continue; ch = ch.slice(k, -1).concat(ch.slice(0, k + 1)); }
      let cur = null;
      for (let i = 0; i < ch.length - 1; i++) {
        const a = ch[i], c = ch[i + 1], r = clipSeg(a, c);
        if (!r) { if (cur) { cur.open = true; pieces.push(cur); cur = null; } continue; }
        const A = [a[0] + (c[0] - a[0]) * r[0], a[1] + (c[1] - a[1]) * r[0]], C = [a[0] + (c[0] - a[0]) * r[1], a[1] + (c[1] - a[1]) * r[1]];
        if (!cur) cur = { pts: [A], entry: r[0] > 0 || !inside(a) ? tOf(A) : null };
        cur.pts.push(C);
        if (r[1] < 1) { cur.exit = tOf(C); pieces.push(cur); cur = null; }
      }
      if (cur) { cur.exit = null; pieces.push(cur); }
    }
    pieces.forEach((p) => lines.push(p.pts));
    const good = pieces.filter((p) => p.entry != null && p.exit != null && p.pts.length > 1);
    const land = [], water = [];
    for (const r of rings) (area(r) > 0 ? land : water).push(r);
    const used = new Set();
    for (const start of good) {
      if (used.has(start)) continue;
      const ring = []; let cur = start, guard = 0;
      while (guard++ < 500) {
        used.add(cur); ring.push(...cur.pts);
        let best = null, bd = 9;
        for (const q of good) { if (used.has(q) && q !== start) continue; const d = (((q.entry - cur.exit) % 4) + 4) % 4; if (d < bd) { bd = d; best = q; } }
        if (!best) break;
        const cs = [];
        for (let c = 1; c <= 4; c++) { const dc = (((c - cur.exit) % 4) + 4) % 4; if (dc > 1e-12 && dc < bd) cs.push([dc, corner[c - 1]]); }
        cs.sort((u, v) => u[0] - v[0]).forEach((x) => ring.push(x[1]));
        if (best === start) break;
        cur = best;
      }
      if (ring.length > 2) land.push(ring);
    }
    if (!good.length && !rings.length) return null;
    const base = good.length || land.length ? 'sea' : 'land';
    return { base, land, water, lines };
  }

  // ---------- Overpass JSON → compact drawing data in world fractions ----------
  const RANK = { motorway: 0, trunk: 0, primary: 1, secondary: 2, tertiary: 3 };
  function parse(j, bb, lv) {
    const [s, w, n, e] = bb, tol = (e - w) / 1400, minA = (tol * 4) ** 2;
    const roads = [[], [], [], [], []], rail = [], rivers = [], canals = [], water = [], built = [], green = [], coastWays = [];
    const ring = (pts) => simplify(pts, tol);
    const addPoly = (list, outers, inners = []) => { for (const o of outers) { const r = ring(o); if (r.length > 3 && Math.abs(area(r)) > minA) list.push({ o: r, i: inners.map(ring).filter((x) => x.length > 3) }); } };
    for (const el of j.elements || []) {
      const t = el.tags || {};
      if (el.type === 'way' && el.geometry) {
        const g = P(el.geometry), closed = g.length > 3 && same(g[0], g[g.length - 1]);
        if (t.highway) { const base = t.highway.replace('_link', ''), r = RANK[base] ?? 4; if (r <= 4) roads[r].push(simplify(g, tol)); }
        else if (t.railway === 'rail') rail.push(simplify(g, tol));
        else if (t.natural === 'coastline') coastWays.push(g);
        else if (t.waterway === 'river' || t.waterway === 'canal') (t.waterway === 'river' ? rivers : canals).push(simplify(g, tol));
        else if (closed && (t.natural === 'water' || t.waterway === 'riverbank')) addPoly(water, [g]);
        else if (closed && t.landuse && /^(residential|commercial|retail|industrial)$/.test(t.landuse)) addPoly(built, [g]);
        else if (closed && (t.leisure === 'park' || t.landuse === 'forest' || t.natural === 'wood')) addPoly(green, [g]);
      } else if (el.type === 'relation' && el.members) {
        const outer = joinWays(el.members.filter((m) => m.type === 'way' && m.geometry && m.role !== 'inner').map((m) => P(m.geometry))).filter((r) => r.length > 3);
        const inner = joinWays(el.members.filter((m) => m.type === 'way' && m.geometry && m.role === 'inner').map((m) => P(m.geometry))).filter((r) => r.length > 3);
        if (t.natural === 'water') addPoly(water, outer, inner);
        else if (t.landuse) addPoly(built, outer, inner);
      }
    }
    const coast = coastWays.length ? coastToLand(joinDirected(coastWays), bb) : null;
    const X = (p) => (p[0] + 180) / 360, Y = (p) => merc(p[1]);
    const flat = (pts) => { const a = new Float64Array(pts.length * 2); pts.forEach((p, i) => { a[i * 2] = X(p); a[i * 2 + 1] = Y(p); }); return a; };
    const polys = (list) => list.map((p) => ({ o: flat(p.o), i: p.i.map(flat) }));
    return {
      level: lv, bbox: bb, cx: X([(w + e) / 2, 0]),
      roads: roads.map((l) => l.filter((x) => x.length > 1).map(flat)), rail: rail.map(flat), rivers: rivers.map(flat), canals: canals.map(flat),
      water: polys(water), built: polys(built), green: polys(green),
      coast: coast ? { base: coast.base, land: coast.land.map((r) => flat(simplify(r, tol))), water: coast.water.map((r) => flat(simplify(r, tol))), lines: coast.lines.map((l) => flat(simplify(l, tol))) } : null,
    };
  }

  function load(lat, lng, z) {
    const b = box(lat, lng, z); let it = store.get(b.key);
    if (it) return it;
    it = { state: 'loading', data: null };
    it.promise = fetch(`/api/osm?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&z=${z.toFixed(2)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('osm ' + r.status);
        const bb = (r.headers.get('x-mh-bbox') || '').split(',').map(Number), lv = +(r.headers.get('x-mh-level') || 0);
        if (bb.length !== 4 || bb.some((v) => !Number.isFinite(v))) throw new Error('no bbox');
        const j = await r.json();
        it.data = parse(j, bb, lv); it.state = 'ok';
      })
      .catch((e) => { console.warn('city data', e.message); it.state = 'fail'; })
      .then(() => { notify(); return it.data; });
    store.set(b.key, it);
    return it;
  }
  const wants = (z) => Number.isFinite(z) && z >= MIN_Z;
  function get(lat, lng, z) { if (!wants(z)) return null; const it = load(lat, lng, z); return it.state === 'ok' ? it.data : null; }
  function ensure(lat, lng, z) { if (!wants(z)) return Promise.resolve(null); return load(lat, lng, z).promise; }

  // ---------- drawing ----------
  const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); if (!A || !B) return a; return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };
  function hatch(ctx, color, f) {
    const s = Math.max(4, Math.round(5 * f)), c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
    g.strokeStyle = color; g.lineWidth = Math.max(0.6, 0.6 * f); g.beginPath(); g.moveTo(-1, s + 1); g.lineTo(s + 1, -1); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(s - 1, s + 1); g.lineTo(s + 1, s - 1); g.stroke();
    return ctx.createPattern(c, 'repeat');
  }
  // Colours and widths for each look. `C.style` comes from the design (engraved | modern | night).
  function look(S, C) {
    const ink = S.coast.color, land = S.land, sea = S.sea, lake = S.lake || S.sea, st = (C && C.style) || 'engraved';
    if (st === 'modern') return { st, land, sea, lake, ink, built: '#E8E2DA', hatch: false, green: '#D5E6C4', casing: '#B9B9B9', fill: ['#F6C85F', '#FBE3A0', '#FFFFFF', '#FFFFFF', '#FFFFFF'], rail: '#8A8A8A', river: lake, edge: mix(lake, '#000000', 0.25) };
    if (st === 'night') return { st, land, sea, lake, ink, built: mix(land, '#FFFFFF', 0.07), hatch: false, green: mix(land, '#3D6B4F', 0.35), casing: null, fill: [ink, ink, ink, ink, mix(ink, land, 0.45)], rail: mix(ink, land, 0.4), river: lake, edge: mix(ink, land, 0.5) };
    return { st, land, sea, lake, ink, built: mix(land, ink, 0.07), hatch: C && C.hatch !== false, green: mix(land, '#5E7A3A', 0.16), casing: ink, fill: [land, land, land, null, null], rail: ink, river: lake, edge: ink };
  }
  const W = [3.4, 2.8, 2.1, 1.35, 0.8];
  function draw(ctx, V, S, data, C) {
    if (!data) return false;
    const f = V.f, s = V.s, k = Math.round(V.x0 / s + V.w / s / 2 - data.cx), ox = V.x0 - k * s, oy = V.y0;
    const line = (a, p) => { p.moveTo(a[0] * s - ox, a[1] * s - oy); for (let i = 2; i < a.length; i += 2) p.lineTo(a[i] * s - ox, a[i + 1] * s - oy); };
    const lines = (list) => { const p = new Path2D(); list.forEach((a) => line(a, p)); return p; };
    const polys = (list) => { const p = new Path2D(); list.forEach((q) => { line(q.o, p); p.closePath(); q.i.forEach((r) => { line(r, p); p.closePath(); }); }); return p; };
    const rings = (list) => { const p = new Path2D(); list.forEach((a) => { line(a, p); p.closePath(); }); return p; };
    const L = look(S, C);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, V.w, V.h); ctx.clip(); ctx.lineJoin = ctx.lineCap = 'round';
    const cst = data.coast;
    ctx.fillStyle = cst && cst.base === 'sea' ? L.sea : L.land; ctx.fillRect(0, 0, V.w, V.h);
    if (cst) {
      ctx.fillStyle = L.land; ctx.fill(rings(cst.land), 'evenodd');
      ctx.fillStyle = L.sea; ctx.fill(rings(cst.water));
    }
    ctx.fillStyle = L.green; ctx.fill(polys(data.green), 'evenodd');
    const B = polys(data.built);
    ctx.fillStyle = L.built; ctx.fill(B, 'evenodd');
    if (L.hatch) { ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = hatch(ctx, L.ink, f); ctx.fill(B, 'evenodd'); ctx.restore(); }
    const Wt = polys(data.water);
    ctx.fillStyle = L.lake; ctx.fill(Wt, 'evenodd');
    ctx.strokeStyle = L.river; ctx.lineWidth = 2.2 * f; ctx.stroke(lines(data.rivers)); ctx.lineWidth = 1.2 * f; ctx.stroke(lines(data.canals));
    ctx.strokeStyle = L.edge; ctx.globalAlpha = 0.7; ctx.lineWidth = 0.5 * f; ctx.stroke(Wt); ctx.globalAlpha = 1;
    if (cst) { ctx.strokeStyle = S.coast.color; ctx.lineWidth = Math.max(0.6, S.coast.w * 0.8) * f; ctx.stroke(lines(cst.lines)); }
    // Railways: a fine line with cross ticks (engraved) or a grey line.
    const R = lines(data.rail);
    ctx.strokeStyle = L.rail; ctx.globalAlpha = 0.75; ctx.lineWidth = 0.7 * f; ctx.stroke(R);
    if (L.st === 'engraved') { ctx.setLineDash([0.1, 4 * f]); ctx.lineWidth = 1.8 * f; ctx.globalAlpha = 0.45; ctx.stroke(R); ctx.setLineDash([]); }
    ctx.globalAlpha = 1;
    // Roads from the smallest to the largest, each class as casing + fill.
    for (let r = 4; r >= 0; r--) {
      const list = data.roads[r]; if (!list || !list.length) continue;
      const p = lines(list), w = W[r] * f;
      if (L.fill[r] == null) { ctx.strokeStyle = L.ink; ctx.globalAlpha = r === 4 ? 0.65 : 0.9; ctx.lineWidth = (r === 4 ? 0.55 : 0.85) * f; ctx.stroke(p); ctx.globalAlpha = 1; continue; }
      if (L.casing) { ctx.strokeStyle = L.casing; ctx.lineWidth = w + 1.2 * f; ctx.stroke(p); }
      ctx.strokeStyle = L.fill[r]; ctx.lineWidth = L.casing ? w : w * 0.5; ctx.globalAlpha = L.st === 'night' ? (r === 4 ? 0.45 : 0.85) : 1; ctx.stroke(p); ctx.globalAlpha = 1;
    }
    ctx.restore();
    return true;
  }
  window.CityMap = { MIN_Z, get, ensure, draw, box, level, subscribe: (fn) => (subs.add(fn), () => subs.delete(fn)), _parse: parse, _coastToLand: coastToLand };
})();
