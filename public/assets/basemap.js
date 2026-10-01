/* MapHeritage vector base map.
   Data: Natural Earth (public domain), relief from ETOPO5 (NOAA, public domain), built by tools/build_geo.py.
   Coordinates are normalised Web Mercator (0..1). One renderer draws both the screen and the export,
   so what you see is what you download. All widths are in poster units and multiplied by V.f. */
(function () {
  const ROOT = '/geo/';
  const store = { l0: null, l1: null, index: null, tiles: {}, loading: {}, relief: null, depth: null, depthCol: {} };
  const subs = new Set();
  const notify = () => subs.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });

  // ---------- decoding ----------
  function bbox(list) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const r of list) for (let i = 0; i < r.length; i += 2) { const x = r[i], y = r[i + 1]; if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
    return [a, b, c, d];
  }
  function decode(j) {
    const k = 2 ** j.q;
    const line = (a) => { const o = new Float64Array(a.length); let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; o[i] = x / k; o[i + 1] = y / k; } return o; };
    const poly = (p) => { const rings = p.map(line); return { rings, bb: bbox(rings) }; };
    const out = {
      land: (j.land || []).map(poly),
      coast: (j.coast || []).map((l) => { const c = line(l); return { c, bb: bbox([c]) }; }),
      lakes: (j.lakes || []).map(([mz, p]) => ({ mz, ...poly(p) })),
      lakeEdge: (j.lakeEdge || []).map(([mz, l]) => { const c = line(l); return { mz, c, bb: bbox([c]) }; }),
      rivers: (j.rivers || []).map(([mz, l]) => { const c = line(l); return { mz, c, bb: bbox([c]) }; }),
      borders: (j.borders || []).map(([d, l]) => { const c = line(l); return { d, c, bb: bbox([c]) }; }),
    };
    if (!out.lakeEdge.length) for (const L of out.lakes) for (const r of L.rings) out.lakeEdge.push({ mz: L.mz, c: r, bb: L.bb });
    return out;
  }
  async function getJSON(name) { const r = await fetch(ROOT + name); if (!r.ok) throw new Error(name + ' ' + r.status); return r.json(); }
  function load(key, name, into) {
    if (store.loading[key]) return store.loading[key];
    store.loading[key] = getJSON(name).then((j) => { into(decode(j)); notify(); }).catch((e) => { console.warn('geo', e.message); delete store.loading[key]; });
    return store.loading[key];
  }
  const loadL0 = () => load('l0', 'l0.json', (d) => (store.l0 = d));
  const loadL1 = () => load('l1', 'l1.json', (d) => (store.l1 = d));
  function loadIndex() {
    if (store.loading.index) return store.loading.index;
    store.loading.index = getJSON('t/index.json').then((j) => { store.index = { n: j.n, set: new Set(j.tiles) }; notify(); }).catch(() => { store.index = { n: 8, set: new Set() }; });
    return store.loading.index;
  }
  const loadTile = (key) => load('t:' + key, 't/' + key + '.json', (d) => (store.tiles[key] = d));
  function img(key, src) {
    if (store.loading[key]) return store.loading[key];
    store.loading[key] = new Promise((res) => { const im = new Image(); im.onload = () => { store[key] = im; notify(); res(im); }; im.onerror = () => res(null); im.src = ROOT + src; });
    return store.loading[key];
  }
  loadL0();

  // ---------- which data covers a view ----------
  // V: { w, h, x0, y0, s } — s = world size in px, (x0, y0) = world pixel at the top-left of the canvas.
  const zoomOf = (V) => Math.log2(V.s / 256);
  function range(V) { return { xa: V.x0 / V.s, xb: (V.x0 + V.w) / V.s, ya: Math.max(0, V.y0 / V.s), yb: Math.min(1, (V.y0 + V.h) / V.s) }; }
  function items(V, wantLevel) {
    const z = zoomOf(V), R = range(V), out = [], missing = [];
    const level = wantLevel || (z < 2.6 ? 'l0' : z < 5 ? 'l1' : 't');
    const world = (d) => { for (let k = Math.floor(R.xa); k <= Math.floor(R.xb); k++) out.push({ d, off: k }); };
    if (level === 'l0') { if (store.l0) world(store.l0); else missing.push(loadL0()); return { list: out, missing, level }; }
    if (level === 'l1') { if (store.l1) world(store.l1); else { missing.push(loadL1()); if (store.l0) world(store.l0); } return { list: out, missing, level }; }
    if (!store.index) { missing.push(loadIndex()); if (store.l1) world(store.l1); else missing.push(loadL1()); return { list: out, missing, level }; }
    const n = store.index.n, fallback = [];
    for (let tx = Math.floor(R.xa * n); tx <= Math.floor((R.xb - 1e-9) * n); tx++) {
      for (let ty = Math.max(0, Math.floor(R.ya * n)); ty <= Math.min(n - 1, Math.floor((R.yb - 1e-9) * n)); ty++) {
        const kx = ((tx % n) + n) % n, key = kx + '-' + ty, off = Math.floor(tx / n);
        if (!store.index.set.has(key)) continue;
        if (store.tiles[key]) out.push({ d: store.tiles[key], off });
        else { missing.push(loadTile(key)); fallback.push(off); }
      }
    }
    if (fallback.length) { if (store.l1) [...new Set(fallback)].forEach((off) => out.unshift({ d: store.l1, off, fb: true })); else missing.push(loadL1()); }
    return { list: out, missing, level };
  }
  async function ensure(V, S) {
    for (let i = 0; i < 4; i++) { const { missing } = items(V); const m2 = S && S.maskLevel ? items(V, S.maskLevel).missing : []; if (!missing.length && !m2.length) break; await Promise.all([...missing, ...m2]); }
    if (S && S.relief && S.relief.on) { await img('relief', 'relief.jpg'); if (S.relief.style && S.relief.style !== 'shade') await img('elev', 'elev.png'); }
    if (S && S.depth && S.depth.on) await img('depth', 'depth.jpg');
  }

  // ---------- path building ----------
  function vis(bb, off, R, m) { return bb[2] + off >= R.xa - m && bb[0] + off <= R.xb + m && bb[3] >= R.ya - m && bb[1] <= R.yb + m; }
  function addRing(p, c, V, off, close, tol) {
    const s = V.s, ox = off * s - V.x0, oy = -V.y0, n = c.length;
    let lx = c[0] * s + ox, ly = c[1] * s + oy; p.moveTo(lx, ly);
    for (let i = 2; i < n; i += 2) {
      const x = c[i] * s + ox, y = c[i + 1] * s + oy;
      if (i < n - 2 && Math.abs(x - lx) + Math.abs(y - ly) < tol) continue;
      p.lineTo(x, y); lx = x; ly = y;
    }
    if (close) p.closePath();
  }
  function paths(V, list, z) {
    const R = range(V), m = 8 / V.s, tol = 0.45;
    const P = { land: new Path2D(), coast: new Path2D(), lakes: new Path2D(), lakeEdge: new Path2D(), rivers: new Path2D(), riversBig: new Path2D(), borders: new Path2D(), disputed: new Path2D() };
    for (const { d, off } of list) {
      for (const f of d.land) if (vis(f.bb, off, R, m)) for (const r of f.rings) addRing(P.land, r, V, off, true, tol);
      for (const f of d.coast) if (vis(f.bb, off, R, m)) addRing(P.coast, f.c, V, off, false, tol);
      for (const f of d.lakes) if (f.mz <= z + 1 && vis(f.bb, off, R, m)) for (const r of f.rings) addRing(P.lakes, r, V, off, true, tol);
      for (const f of d.lakeEdge) if (f.mz <= z + 1 && vis(f.bb, off, R, m)) addRing(P.lakeEdge, f.c, V, off, false, tol);
      for (const f of d.rivers) if (f.mz <= z + 1.2 && vis(f.bb, off, R, m)) addRing(f.mz <= z - 1.5 ? P.riversBig : P.rivers, f.c, V, off, false, tol);
      for (const f of d.borders) if (vis(f.bb, off, R, m)) addRing(f.d ? P.disputed : P.borders, f.c, V, off, false, tol);
    }
    return P;
  }
  function landPath(V, list) {
    const R = range(V), m = 8 / V.s, p = new Path2D();
    for (const { d, off } of list) for (const f of d.land) if (vis(f.bb, off, R, m)) for (const r of f.rings) addRing(p, r, V, off, true, 0.8);
    return p;
  }

  // ---------- helpers ----------
  function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(x, y, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  const patCache = new Map();
  function pattern(ctx, type, color, f) {
    const q = Math.max(0.5, Math.round(f * 4) / 4), key = type + color + q;
    if (!patCache.has(key)) {
      const size = Math.round(96 * q), c = canvas(size, size), g = c.getContext('2d'), r = rng(type === 'hatch' ? 7 : 11);
      g.fillStyle = color; g.strokeStyle = color;
      if (type === 'hatch') { g.lineWidth = 0.55 * q; const st = 4.8 * q; for (let x = -size; x < size * 2; x += st) { g.beginPath(); g.moveTo(x, size); g.lineTo(x + size, 0); g.stroke(); } }
      else { const n = type === 'dense' ? 520 : 170; for (let i = 0; i < n; i++) { g.beginPath(); g.arc(r() * size, r() * size, (0.35 + r() * 0.45) * q, 0, 7); g.fill(); } }
      patCache.set(key, c);
    }
    return ctx.createPattern(patCache.get(key), 'repeat');
  }
  function depthCanvas(color) {
    if (!store.depth) return null;
    if (!store.depthAlpha) {
      const im = store.depth, c = canvas(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
      for (let i = 0; i < a.length; i += 4) { a[i + 3] = a[i]; a[i] = a[i + 1] = a[i + 2] = 255; }
      g.putImageData(d, 0, 0); store.depthAlpha = c;
    }
    if (!store.depthCol[color]) {
      const src = store.depthAlpha, c = canvas(src.width, src.height), g = c.getContext('2d');
      g.fillStyle = color; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0);
      store.depthCol[color] = c;
    }
    return store.depthCol[color];
  }
  function worldImage(ctx, im, V) { const R = range(V); for (let k = Math.floor(R.xa); k <= Math.floor(R.xb); k++) ctx.drawImage(im, k * V.s - V.x0, -V.y0, V.s, V.s); }
  const merc = (lat) => { const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  const unmerc = (y) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  // ---------- relief styles: hypsometric tints, contours, hachures, pictorial mountains ----------
  // elev.png: smoothed elevation class (0 sea … 6 over 3000 m) × 40, Web Mercator 4096².
  const EN = 4096;
  function elevData() {
    if (store.elevData) return store.elevData;
    if (!store.elev) { img('elev', 'elev.png'); return null; }
    const c = canvas(EN, EN), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(store.elev, 0, 0);
    const rgba = g.getImageData(0, 0, EN, EN).data, a = new Uint8Array(EN * EN);
    for (let i = 0; i < a.length; i++) a[i] = rgba[i * 4];
    c.width = c.height = 1;
    return (store.elevData = a);
  }
  // Elevation class at a world position (fractions of the world, x wraps), bilinear.
  function elevAt(a, X, Y) {
    const x = (((X % 1) + 1) % 1) * EN - 0.5, y = Math.max(0, Math.min(EN - 1.001, Y * EN - 0.5));
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, i0 = ((i % EN) + EN) % EN, i1 = (i0 + 1) % EN, r0 = j * EN, r1 = Math.min(EN - 1, j + 1) * EN;
    return ((a[r0 + i0] * (1 - fx) + a[r0 + i1] * fx) * (1 - fy) + (a[r1 + i0] * (1 - fx) + a[r1 + i1] * fx) * fy) / 40;
  }
  const hex2 = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return [128, 128, 128]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mixC = (a, b, t) => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t);
  // Seven tints, index = elevation class (0 unused).
  function tints(S) {
    const R = S.relief, land = hex2(S.land), ink = hex2(R.color || S.coast.color);
    if (R.palette === 'classic') return ['#000000', '#B7D1A2', '#D3DFA6', '#EBE2AE', '#E1C392', '#C79B70', '#F2EDE7'].map(hex2);
    if (R.palette === 'mono') return [0, 0, 0.07, 0.13, 0.21, 0.31, 0.42].map((t) => mixC(land, ink, t));
    const brown = [138, 90, 43], cream = [244, 236, 216];
    return [land, land, mixC(land, brown, 0.09), mixC(land, brown, 0.18), mixC(land, brown, 0.3), mixC(land, brown, 0.44), mixC(land, cream, 0.55)];
  }
  function hypso(ctx, V, S, a, alpha) {
    const k = Math.max(1, Math.round(1.6 * V.f)), w = Math.ceil(V.w / k), h = Math.ceil(V.h / k), T = tints(S);
    const c = canvas(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data;
    for (let y = 0; y < h; y++) {
      const Y = (V.y0 + (y + 0.5) * k) / V.s; if (Y < 0 || Y > 1) continue;
      for (let x = 0; x < w; x++) {
        const e = elevAt(a, (V.x0 + (x + 0.5) * k) / V.s, Y); if (e < 0.5) continue;
        const b = Math.min(6, Math.max(1, Math.floor(e + 0.5))), fr = e + 0.5 - b; // soft edge at band borders
        let col = T[b];
        if (fr > 0.88 && b < 6) col = mixC(T[b], T[b + 1], (fr - 0.88) / 0.24); else if (fr < 0.12 && b > 1) col = mixC(T[b], T[b - 1], (0.12 - fr) / 0.24);
        const o = (y * w + x) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true; ctx.drawImage(c, 0, 0, w * k, h * k); ctx.restore();
  }
  // Contour lines at the class borders (150, 300, 600, 1500, 3000 m) by marching squares.
  function contours(ctx, V, S, a, alpha) {
    const R = range(V), cell = Math.max(1, Math.round((EN / V.s) * 2.6 * V.f)), f = V.f;
    const i0 = Math.floor((R.xa * EN) / cell), i1 = Math.ceil((R.xb * EN) / cell), j0 = Math.max(0, Math.floor((R.ya * EN) / cell)), j1 = Math.min(Math.floor((EN - 1) / cell), Math.ceil((R.yb * EN) / cell));
    const nx = i1 - i0 + 1, ny = j1 - j0 + 1; if (nx < 2 || ny < 2 || nx * ny > 4e6) return;
    const G = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const ii = ((((i0 + i) * cell) % EN) + EN) % EN; G[j * nx + i] = a[(j0 + j) * cell * EN + ii] / 40; }
    const P = (i, j) => [((i0 + i) * cell / EN) * V.s - V.x0, ((j0 + j) * cell / EN) * V.s - V.y0];
    ctx.save(); ctx.strokeStyle = S.relief.color || S.coast.color; ctx.lineJoin = ctx.lineCap = 'round';
    for (const lv of [1.5, 2.5, 3.5, 4.5, 5.5]) {
      const p = new Path2D();
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a0 = G[j * nx + i], b0 = G[j * nx + i + 1], c0 = G[(j + 1) * nx + i + 1], d0 = G[(j + 1) * nx + i];
        const code = (a0 > lv ? 8 : 0) | (b0 > lv ? 4 : 0) | (c0 > lv ? 2 : 0) | (d0 > lv ? 1 : 0); if (code === 0 || code === 15) continue;
        const [x, y] = P(i, j), [x2, y2] = P(i + 1, j + 1), dx = x2 - x, dy = y2 - y;
        const top = [x + dx * ((lv - a0) / (b0 - a0)), y], right = [x2, y + dy * ((lv - b0) / (c0 - b0))], bot = [x + dx * ((lv - d0) / (c0 - d0)), y2], left = [x, y + dy * ((lv - a0) / (d0 - a0))];
        const seg = (u, v) => { p.moveTo(u[0], u[1]); p.lineTo(v[0], v[1]); };
        switch (code) {
          case 1: case 14: seg(left, bot); break; case 2: case 13: seg(bot, right); break; case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(top, right); break; case 6: case 9: seg(top, bot); break; case 7: case 8: seg(left, top); break;
          case 5: seg(left, top); seg(bot, right); break; case 10: seg(top, right); seg(left, bot); break;
        }
      }
      ctx.globalAlpha = alpha * (lv === 4.5 ? 1 : 0.75); ctx.lineWidth = (lv === 4.5 ? 0.9 : 0.5) * f; ctx.stroke(p);
    }
    ctx.restore();
  }
  // World-anchored grid so marks stay put while panning: cell size in world fractions, a power of two near `px`.
  function grid(V, px, fn) {
    const R = range(V), cm = 2 ** Math.round(Math.log2(px / V.s)), cs = cm * V.s;
    for (let i = Math.floor(R.xa / cm) - 1; i <= Math.ceil(R.xb / cm) + 1; i++) for (let j = Math.floor(R.ya / cm) - 1; j <= Math.ceil(R.yb / cm) + 1; j++) fn(i, j, cm, cs);
  }
  function hachures(ctx, V, S, a, alpha) {
    const f = V.f, dens = S.relief.density || 1, sp = (4.2 / dens) * f;
    const p1 = new Path2D(), p2 = new Path2D();
    grid(V, sp, (i, j, cm) => {
      const X = (i + 0.4 + hash(i, j, 7) * 0.2) * cm, Y = (j + 0.4 + hash(i, j, 8) * 0.2) * cm; if (Y < 0 || Y > 1) return;
      const e = elevAt(a, X, Y); if (e < 2.3) return; // hills and mountains only, the plains stay clean
      const dd = Math.max(cm, 3 / EN), gx = (elevAt(a, X + dd, Y) - elevAt(a, X - dd, Y)) / 2, gy = (elevAt(a, X, Y + dd) - elevAt(a, X, Y - dd)) / 2;
      const g = Math.hypot(gx, gy), m = g / (dd * EN), t = Math.min(1, Math.max(0, (m - 0.05) / 0.3) * Math.min(1, (e - 2.3) / 1.5)); if (t <= 0.05) return;
      const px = X * V.s - V.x0, py = Y * V.s - V.y0, L = sp * (0.8 + 1.1 * t), ux = -gx / g, uy = -gy / g;
      const p = t > 0.5 ? p2 : p1; p.moveTo(px - ux * L * 0.5, py - uy * L * 0.5); p.lineTo(px + ux * L * 0.5, py + uy * L * 0.5);
    });
    ctx.save(); ctx.strokeStyle = S.relief.color || S.coast.color; ctx.lineCap = 'round';
    ctx.globalAlpha = alpha * 0.6; ctx.lineWidth = 0.5 * f; ctx.stroke(p1);
    ctx.globalAlpha = alpha; ctx.lineWidth = 0.85 * f; ctx.stroke(p2);
    ctx.restore();
  }
  // Pictorial mountains ("molehills") in the old style: drawn back to front, shaded on the east side.
  function mountains(ctx, V, S, a, alpha) {
    const f = V.f, dens = S.relief.density || 1, sp = (24 / dens) * f, list = [];
    grid(V, sp, (i, j, cm) => {
      const X = (i + 0.15 + hash(i, j, 11) * 0.7) * cm, Y = (j + 0.25 + hash(i, j, 12) * 0.6) * cm; if (Y < 0 || Y > 1) return;
      const e = elevAt(a, X, Y), r = hash(i, j, 13);
      if (e >= 3.3) list.push({ x: X * V.s - V.x0, y: Y * V.s - V.y0, h: (9 + Math.min(3, e - 3.3) * 6.5) * f * (0.85 + r * 0.3), big: true, r });
      else if (e >= 2.4 && r < 0.45) list.push({ x: X * V.s - V.x0, y: Y * V.s - V.y0, h: 5 * f, big: false, r });
    });
    list.sort((p, q) => p.y - q.y);
    const ink = S.relief.color || S.coast.color;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const m of list) {
      if (m.x < -40 * f || m.y < -10 * f || m.x > V.w + 40 * f || m.y > V.h + 40 * f) continue;
      const w = m.h * (m.big ? 1.45 : 2.2), lean = (m.r - 0.5) * 0.25 * w, p = new Path2D();
      p.moveTo(m.x - w / 2, m.y);
      p.quadraticCurveTo(m.x - w * 0.22 + lean * 0.5, m.y - m.h * 0.55, m.x + lean, m.y - m.h);
      p.quadraticCurveTo(m.x + w * 0.2 + lean * 0.5, m.y - m.h * 0.5, m.x + w / 2, m.y);
      ctx.globalAlpha = 1;
      if (m.big) { ctx.fillStyle = S.land; ctx.fill(p); }
      ctx.globalAlpha = alpha;
      if (m.big) {
        ctx.save(); ctx.clip(p); ctx.strokeStyle = ink; ctx.lineWidth = 0.55 * f; ctx.beginPath();
        for (let k = 0; k < 5; k++) { const sx = m.x + lean + w * (0.04 + k * 0.09); ctx.moveTo(sx, m.y - m.h * (0.9 - k * 0.12)); ctx.lineTo(sx + w * 0.16, m.y); }
        ctx.stroke(); ctx.restore();
      }
      ctx.strokeStyle = ink; ctx.lineWidth = (m.big ? 0.95 : 0.7) * f; ctx.stroke(p);
      if (m.big) { ctx.globalAlpha = alpha * 0.6; ctx.beginPath(); ctx.moveTo(m.x - w * 0.62, m.y + 0.6 * f); ctx.lineTo(m.x + w * 0.62, m.y + 0.6 * f); ctx.lineWidth = 0.6 * f; ctx.stroke(); }
    }
    ctx.restore();
  }

  // ---------- land mask for waves and ships (fixed resolution in poster units) ----------
  function makeMask(V, S) {
    const k = 1 / (2 * V.f), mw = Math.ceil(V.w * k), mh = Math.ceil(V.h * k), c = canvas(mw, mh), g = c.getContext('2d');
    const { list } = items(V, S.maskLevel);
    const p = landPath(V, list);
    g.setTransform(k, 0, 0, k, 0, 0); g.fillStyle = '#000'; g.fill(p);
    g.lineWidth = 16 * V.f; g.lineJoin = 'round'; g.strokeStyle = '#000'; g.stroke(p);
    const a = g.getImageData(0, 0, mw, mh).data;
    return { k, w: mw, h: mh, land(x, y) { const i = Math.floor(x * k), j = Math.floor(y * k); if (i < 0 || j < 0 || i >= mw || j >= mh) return true; return a[(j * mw + i) * 4 + 3] > 40; } };
  }

  // ---------- the renderer ----------
  // V: { w, h, x0, y0, s, f, lz, rhumbs: [{x, y}], dpr }   S: resolved style (see Poster.baseStyle)
  function render(ctx, V, S) {
    const f = V.f, z = zoomOf(V);
    const { list, missing } = items(V);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, V.w, V.h); ctx.clip();
    ctx.fillStyle = S.sea; ctx.fillRect(0, 0, V.w, V.h);
    const P = paths(V, list, z);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // Water lines: rings around the coast. Each ring is stroked, then its inside is painted back with the sea colour.
    if (S.water.on && S.water.n > 0) {
      const lw = S.water.w * f, gap = S.water.gap * f;
      for (let i = S.water.n; i >= 1; i--) {
        ctx.globalAlpha = S.water.alpha * (1 - ((i - 1) / S.water.n) * 0.65); ctx.strokeStyle = S.water.color; ctx.lineWidth = 2 * i * gap; ctx.stroke(P.coast);
        ctx.globalAlpha = 1; ctx.strokeStyle = S.sea; ctx.lineWidth = Math.max(0.1, 2 * i * gap - lw); ctx.stroke(P.coast);
      }
    }
    if (S.depth.on) { const dc = depthCanvas(S.depth.color); if (dc) { ctx.globalAlpha = S.depth.alpha; worldImage(ctx, dc, V); ctx.globalAlpha = 1; } else img('depth', 'depth.jpg'); }

    ctx.save();
    if (S.shadow.on) { ctx.shadowColor = S.shadow.color; ctx.shadowBlur = S.shadow.blur * f * (V.dpr || 1); ctx.shadowOffsetX = S.shadow.dx * f * (V.dpr || 1); ctx.shadowOffsetY = S.shadow.dy * f * (V.dpr || 1); }
    ctx.fillStyle = S.land; ctx.fill(P.land);
    ctx.restore();

    ctx.save(); ctx.clip(P.land);
    const RS = S.relief.on ? S.relief.style || 'shade' : 'none', ea = RS !== 'none' && RS !== 'shade' ? elevData() : null;
    const lineFade = Math.max(0, Math.min(1, (9.5 - z) / 2.5));
    if (ea && RS === 'hypso') hypso(ctx, V, S, ea, (S.relief.alpha ?? 0.85) * Math.max(0, Math.min(1, (11.5 - z) / 2)));
    if (S.relief.on && S.relief.amt > 0 && (RS === 'shade' || S.relief.shade !== false)) {
      const fade = Math.max(0, Math.min(1, (10 - z) / 3));
      if (store.relief && fade > 0) { ctx.globalCompositeOperation = S.relief.mode || 'soft-light'; ctx.globalAlpha = S.relief.amt * fade; worldImage(ctx, store.relief, V); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      else if (!store.relief) img('relief', 'relief.jpg');
    }
    if (ea && lineFade > 0 && RS === 'contour') contours(ctx, V, S, ea, (S.relief.alpha ?? 0.6) * lineFade);
    if (ea && lineFade > 0 && RS === 'hachure') hachures(ctx, V, S, ea, (S.relief.alpha ?? 0.7) * lineFade);
    if (S.tex.type && S.tex.type !== 'none') {
      ctx.globalAlpha = S.tex.alpha;
      if (S.tex.type === 'coast') {
        ctx.strokeStyle = pattern(ctx, 'dense', S.tex.color, f); ctx.lineWidth = 7 * f; ctx.stroke(P.coast);
        ctx.strokeStyle = pattern(ctx, 'stipple', S.tex.color, f); ctx.lineWidth = 22 * f; ctx.stroke(P.coast);
      } else { ctx.fillStyle = pattern(ctx, S.tex.type === 'hatch' ? 'hatch' : 'stipple', S.tex.color, f); ctx.fillRect(0, 0, V.w, V.h); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (ea && lineFade > 0 && RS === 'pictorial') mountains(ctx, V, S, ea, (S.relief.alpha ?? 0.85) * lineFade);

    ctx.fillStyle = S.lake || S.sea; ctx.fill(P.lakes);
    if (S.rivers.on) {
      ctx.strokeStyle = S.rivers.color; ctx.lineWidth = S.rivers.w * f * 0.7; ctx.stroke(P.rivers);
      ctx.lineWidth = S.rivers.w * f * 1.15; ctx.stroke(P.riversBig);
    }
    if (S.borders.on) {
      const b = S.borders;
      if (b.ribbon) { ctx.save(); ctx.globalAlpha = b.ribbonAlpha || 0.28; ctx.strokeStyle = b.ribbon; ctx.lineWidth = 6 * f; ctx.stroke(P.borders); ctx.restore(); }
      ctx.strokeStyle = b.color; ctx.lineWidth = b.w * f;
      ctx.setLineDash(b.style === 'dotted' ? [0.1, 3 * f] : b.style === 'dashed' ? [5 * f, 3 * f] : b.style === 'dashdot' ? [6 * f, 2.5 * f, 0.1, 2.5 * f] : []);
      ctx.stroke(P.borders); ctx.setLineDash([2 * f, 3 * f]); ctx.stroke(P.disputed); ctx.setLineDash([]);
    }
    ctx.strokeStyle = S.coast.color; ctx.lineWidth = S.coast.w * f; ctx.stroke(P.coast);
    ctx.lineWidth = S.coast.w * f * 0.7; ctx.stroke(P.lakeEdge);

    if (S.grat.on) {
      const step = S.grat.step, ext = { lngA: (V.x0 / V.s) * 360 - 180, lngB: ((V.x0 + V.w) / V.s) * 360 - 180, latA: unmerc(Math.min(1, (V.y0 + V.h) / V.s)), latB: unmerc(Math.max(0, V.y0 / V.s)) };
      ctx.strokeStyle = S.grat.color; ctx.globalAlpha = S.grat.alpha; ctx.lineWidth = S.grat.w * f; ctx.setLineDash(S.grat.dash ? [2 * f, 4 * f] : []);
      ctx.beginPath();
      for (let x = Math.ceil(ext.lngA / step) * step; x <= ext.lngB; x += step) { const px = ((x + 180) / 360) * V.s - V.x0; ctx.moveTo(px, 0); ctx.lineTo(px, V.h); }
      for (let y = Math.ceil(ext.latA / step) * step; y <= ext.latB; y += step) { if (Math.abs(y) > 85) continue; const py = merc(y) * V.s - V.y0; ctx.moveTo(0, py); ctx.lineTo(V.w, py); }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    if (S.rhumbs.on && V.rhumbs && V.rhumbs.length) {
      const L = Math.hypot(V.w, V.h) * 1.2, cols = S.rhumbs.colors;
      const centers = [];
      for (const c of V.rhumbs) {
        centers.push(c);
        if (S.rhumbs.network) { const R = Math.min(V.w, V.h) * 0.46; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; centers.push({ x: c.x + Math.sin(a) * R, y: c.y - Math.cos(a) * R, aux: true }); } }
      }
      ctx.lineWidth = S.rhumbs.w * f;
      for (const tier of [2, 1, 0]) {
        ctx.strokeStyle = cols[tier] || cols[0]; ctx.globalAlpha = S.rhumbs.alpha * (tier === 0 ? 1 : 0.85);
        ctx.beginPath();
        for (const c of centers) for (let i = 0; i < 32; i++) {
          const t2 = i % 4 === 0 ? 0 : i % 2 === 0 ? 1 : 2; if (t2 !== tier) continue;
          const a = (i / 32) * Math.PI * 2; ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.sin(a) * L, c.y - Math.cos(a) * L);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    let mask = null;
    if ((S.waves.on || V.wantMask) && V.lz !== undefined) {
      mask = makeMask(V, S);
      if (S.waves.on) {
        const cellM = 2 ** Math.round(Math.log2((S.waves.cell * f) / V.s)), R = range(V), cs = cellM * V.s, sd = S.waves.seed || 3;
        ctx.strokeStyle = S.waves.color; ctx.globalAlpha = S.waves.alpha; ctx.lineWidth = 0.9 * f;
        ctx.beginPath();
        for (let i = Math.floor(R.xa / cellM); i <= Math.ceil(R.xb / cellM); i++) for (let j = Math.floor(R.ya / cellM); j <= Math.ceil(R.yb / cellM); j++) {
          if (hash(i, j, sd) > S.waves.density) continue;
          const px = (i + 0.15 + hash(i, j, sd + 1) * 0.7) * cs - V.x0, py = (j + 0.15 + hash(i, j, sd + 2) * 0.7) * cs - V.y0;
          if (px < 0 || py < 0 || px > V.w || py > V.h || mask.land(px, py) || mask.land(px + 18 * f, py) || mask.land(px - 18 * f, py)) continue;
          const u = 3.6 * f, n = 2 + Math.floor(hash(i, j, sd + 3) * 2);
          for (let q = 0; q < n; q++) { const x = px + q * u * 2 - n * u, y = py + (q % 2) * 0.6 * f; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + u, y - u * 1.1, x + u * 2, y); }
        }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    return { mask, complete: !missing.length, level: items(V).level };
  }

  // ---------- paper aging (drawn over the whole poster, multiply) ----------
  function aging(ctx, W, H, f, A) {
    const amt = Math.max(0, Math.min(1, A.amount ?? 0.6)), r = rng(A.seed || 5);
    if (!amt) return;
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    const brown = (a) => `rgba(120,78,30,${a})`;
    if (A.edges !== false) {
      const e = Math.min(W, H) * 0.16, g = (x0, y0, x1, y1) => { const gr = ctx.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, brown(0.42 * amt)); gr.addColorStop(0.35, brown(0.12 * amt)); gr.addColorStop(1, brown(0)); return gr; };
      ctx.fillStyle = g(0, 0, e, 0); ctx.fillRect(0, 0, e, H); ctx.fillStyle = g(W, 0, W - e, 0); ctx.fillRect(W - e, 0, e, H);
      ctx.fillStyle = g(0, 0, 0, e); ctx.fillRect(0, 0, W, e); ctx.fillStyle = g(0, H, 0, H - e); ctx.fillRect(0, H - e, W, e);
    }
    if (A.stains !== false) {
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const cx = r() * W, cy = r() * H, R = (60 + r() * 160) * f;
        for (let k = 0; k < 4; k++) {
          const x = cx + (r() - 0.5) * R, y = cy + (r() - 0.5) * R, rr = R * (0.35 + r() * 0.55);
          const gr = ctx.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, brown(0.06 * amt)); gr.addColorStop(0.75, brown(0.045 * amt)); gr.addColorStop(0.92, brown(0.07 * amt)); gr.addColorStop(1, brown(0));
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
        }
      }
    }
    if (A.foxing !== false) {
      const n = Math.round(160 * amt * (W * H) / (1600 * 1131 * f * f));
      for (let i = 0; i < n; i++) {
        const x = r() * W, y = r() * H, rr = (0.6 + r() * r() * 4) * f;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, brown(0.5 * amt)); gr.addColorStop(1, brown(0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
      }
    }
    if (A.folds !== false) {
      const fold = (x0, y0, x1, y1, vertical) => {
        const w = 7 * f, gr = vertical ? ctx.createLinearGradient(x0 - w, 0, x0 + w, 0) : ctx.createLinearGradient(0, y0 - w, 0, y0 + w);
        gr.addColorStop(0, brown(0)); gr.addColorStop(0.45, brown(0.16 * amt)); gr.addColorStop(0.5, brown(0.3 * amt)); gr.addColorStop(0.56, brown(0.05 * amt)); gr.addColorStop(1, brown(0));
        ctx.fillStyle = gr; if (vertical) ctx.fillRect(x0 - w, 0, 2 * w, H); else ctx.fillRect(0, y0 - w, W, 2 * w);
      };
      fold(W / 2, 0, W / 2, H, true); fold(0, H / 2, W, H / 2, false);
    }
    ctx.restore();
  }

  window.Basemap = { render, ensure, aging, subscribe: (fn) => (subs.add(fn), () => subs.delete(fn)), preload: () => { loadL0(); loadL1(); loadIndex(); }, merc, unmerc, store, zoomOf };
})();
