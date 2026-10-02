/* MapHeritage poster engine: own vector base map (basemap.js) + Leaflet for routes + SVG decoration + PNG export.
   All sizes are in "logical" units of a 1600-wide poster and scaled by f = pxWidth / 1600. */
(function () {
  const W0 = 1600;
  const RATIO = { landscape: 1600 / 1131, portrait: 1131 / 1600, square: 1 };
  const FONTS = {
    alegreya: { title: "'Alegreya SC', Georgia, serif", text: "'Alegreya', Georgia, serif" },
    oldstandard: { title: "'Old Standard TT', Georgia, serif", text: "'Old Standard TT', Georgia, serif" },
    garamond: { title: "'EB Garamond', Georgia, serif", text: "'EB Garamond', Georgia, serif" },
    cormorant: { title: "'Cormorant Garamond', Georgia, serif", text: "'Cormorant Garamond', Georgia, serif" },
    jost: { title: "'Jost', 'Futura', Arial, sans-serif", text: "'Jost', 'Futura', Arial, sans-serif" },
  };
  const SCRIPT = "'Marck Script', 'Cormorant Garamond', cursive";
  const FONT_CSS = '/assets/fonts/fonts.css';
  // Export sizes: [landscape width, portrait width]. A3/A2 at 300 dpi.
  const SIZES = { screen: [1600, 1131], '3200': [3200, 2262], a3: [4961, 3508], a2: [7016, 4961] };
  const exportWidth = (size, format) => { const s = SIZES[size] || SIZES['3200']; return format === 'landscape' ? s[0] : s[1]; };

  const SHOW = { frame: true, cartouche: true, legend: true, compass: true, scale: true, graticule: true, degrees: false, rhumbs: false, relief: true, waterlines: true, depth: false, shadow: true, stipple: true,
    rivers: true, borders: true, ships: true, waves: true, aging: true, texture: true, vignette: true, insets: true, labels: true, numbers: false };
  const BASE = {
    font: 'alegreya', labelSize: 1, format: 'landscape',
    paper: '#E9DCBC', ink: '#3B2A1A', accent: '#9B2F1F', frameColor: '#3B2A1A',
    palette: ['#A8331F', '#1F4A6E', '#4E7A45', '#B98A2E', '#6E2F4F', '#3C4A8C', '#7A5230', '#2F6E6A'],
    sea: '#CBCCAE', land: '#EDE0BD', lake: '',
    water: { n: 6, gap: 3.1, w: 0.7, color: '#4A3521', alpha: 0.42 },
    depth: { color: '#9FB3A6', alpha: 0.5 },
    shadow: { color: 'rgba(70,48,20,.45)', blur: 9, dx: 0, dy: 0 },
    relief: { style: 'shade', amt: 0.9, shade: true, alpha: 0.85, lines: 0.9, density: 1, palette: 'sepia', color: '' },
    tex: { type: 'coast', color: '#6B5030', alpha: 0.55 },
    coast: { color: '#4A3521', w: 1 },
    rivers: { color: '#5F7A7E', w: 1 },
    borders: { style: 'dashed', color: '#6B5030', w: 0.8, ribbon: '#9B2F1F', ribbonAlpha: 0.22 },
    grat: { color: '#3B2A1A', alpha: 0.35, w: 0.8, dash: true },
    rhumbs: { colors: ['#3B2A1A', '#4E7A45', '#9B2F1F'], alpha: 0.3, w: 0.6, network: false },
    waves: { color: '#4A3521', alpha: 0.55, density: 0.32, cell: 64, seed: 3 },
    aging: { amount: 0.55, seed: 5 },
    vignette: 'rgba(60,40,15,.35)',
    routes: { style: 'dashed', width: 2.6, curve: 0.2, arrows: true, casing: '' },
    markers: { style: 'town', size: 1 },
    labels: { style: 'italic', halo: 'halo' },
    frame: { style: 'degrees' },
    cartouche: { style: 'scroll', size: 1 }, compass: { style: 'ornate', size: 1 }, scale: { units: 'km', size: 1, style: 'checker' },
    city: { style: 'engraved', hatch: true },
    show: SHOW,
    ships: null, autoShips: 2, shipTypes: ['galleon', 'caravel'], texts: [],
    panel: 'auto', panelSize: 0.3, insets: { max: 8, shape: 'circle', zoom: 13, detail: 3, pick: null }, subtitle: '', view: null,
    legendTitle: '', panelTitle: '', pos: {}, insetCfg: {},
  };
  const PRESETS = {
    discovery: { show: { rhumbs: true }, rhumbs: { alpha: 0.18 }, relief: { style: 'hachure', amt: 0.55, alpha: 0.8, color: '#5A3E22' } },
    portolan: {
      font: 'cormorant', paper: '#EDDCAB', ink: '#2B1D12', accent: '#A3261B', frameColor: '#2B1D12',
      palette: ['#A3261B', '#2F5E3A', '#1E3F73', '#B07A1E', '#6B2C55', '#2B1D12', '#8C4A22', '#3E6E70'],
      sea: '#E7D3A0', land: '#F1E3B8', water: { n: 2, gap: 2.2, color: '#2B1D12', alpha: 0.35 }, shadow: { color: 'rgba(90,60,20,.3)', blur: 5 },
      relief: { style: 'hachure', amt: 0.3, shade: false, alpha: 0.65, density: 0.85 }, tex: { type: 'coast', color: '#A3261B', alpha: 0.45 }, coast: { color: '#2B1D12', w: 1.3 }, rivers: { color: '#4C6E86', w: 0.9 },
      rhumbs: { colors: ['#2B1D12', '#2F6E3A', '#A3261B'], alpha: 0.5, w: 0.55, network: true },
      waves: { color: '#2B1D12', alpha: 0.4, density: 0.22 },
      aging: { amount: 0.8, seed: 11 }, vignette: 'rgba(90,55,15,.4)',
      routes: { style: 'hand', width: 2.4, curve: 0.18 }, markers: { style: 'dot', size: 1 }, labels: { style: 'italic', halo: 'halo' },
      frame: { style: 'ornament' }, cartouche: { style: 'medallion' }, compass: { style: 'portolan', size: 1.15 },
      show: { rhumbs: true, graticule: false, borders: false, depth: false, stipple: true, waves: false, relief: true }, autoShips: 2, shipTypes: ['caravel'],
    },
    admiralty: {
      font: 'oldstandard', paper: '#F4F1E8', ink: '#1D2A33', accent: '#7A1E1E', frameColor: '#1D2A33',
      palette: ['#B22A1E', '#1B3F8F', '#2C6E49', '#C08A1E', '#6A2C70', '#1F7A8C', '#8A4F2A', '#333333'],
      sea: '#EEF4F4', land: '#EFE2BF', water: { n: 3, gap: 2.2, w: 0.55, color: '#4F7A8E', alpha: 0.7 }, depth: { color: '#A9CCD8', alpha: 0.85 },
      shadow: { color: 'rgba(40,60,70,.25)', blur: 4 }, relief: { style: 'contour', amt: 0.6, alpha: 0.55, color: '#7A5A3A' }, tex: { type: 'stipple', color: '#8A6A3A', alpha: 0.5 },
      coast: { color: '#1D2A33', w: 1.05 }, rivers: { color: '#4F7A8E', w: 0.9 }, borders: { style: 'dashdot', color: '#6A5A48', w: 0.7, ribbon: '' },
      grat: { color: '#1D2A33', alpha: 0.4, w: 0.6, dash: false }, vignette: 'rgba(0,0,0,0)', aging: { amount: 0.22, seed: 21 },
      routes: { style: 'solid', width: 2.4, curve: 0.16, arrows: true }, markers: { style: 'ring' }, labels: { style: 'roman', halo: 'halo' },
      frame: { style: 'degrees' }, cartouche: { style: 'frame' }, compass: { style: 'modern' }, scale: { style: 'checker' },
      show: { degrees: true, depth: true, waves: false, ships: false, vignette: false, texture: false }, autoShips: 0,
    },
    night: {
      font: 'garamond', paper: '#111822', ink: '#E7D6A8', accent: '#D4A64A', frameColor: '#D4A64A',
      palette: ['#E8674A', '#6FA8DC', '#8BC48A', '#E6C15A', '#C58BC8', '#5FC2C2', '#E0A36E', '#DDDDDD'],
      sea: '#152131', land: '#223044', lake: '#152131', water: { n: 5, gap: 3.4, w: 0.6, color: '#D4A64A', alpha: 0.28 }, depth: { color: '#1C3148', alpha: 0.9 },
      shadow: { color: 'rgba(212,166,74,.38)', blur: 14 }, relief: { style: 'tanaka', amt: 0.6, alpha: 0.9, lines: 0.8, color: '#05080D', palette: 'mono' }, tex: { type: 'none' },
      coast: { color: '#D4A64A', w: 0.9 }, rivers: { color: '#4C6D8C', w: 0.9 }, borders: { style: 'dotted', color: '#8C99A8', w: 0.9, ribbon: '' },
      grat: { color: '#D4A64A', alpha: 0.28, w: 0.7, dash: true }, rhumbs: { colors: ['#D4A64A', '#8C99A8', '#8C99A8'], alpha: 0.22, w: 0.5 },
      waves: { color: '#D4A64A', alpha: 0.4, density: 0.25 }, vignette: 'rgba(0,0,0,.55)',
      routes: { style: 'casing', width: 2.6, curve: 0.2, arrows: true, casing: '#0B1018' }, markers: { style: 'star', size: 1.05 }, labels: { style: 'italic', halo: 'halo' },
      frame: { style: 'double' }, cartouche: { style: 'medallion' }, compass: { style: 'ornate' }, city: { style: 'night' },
      show: { texture: false, aging: false, stipple: false, depth: true }, autoShips: 1, shipTypes: ['galleon'],
    },
    atlas: {
      font: 'jost', paper: '#FFFFFF', ink: '#1A1A1A', accent: '#E0301E', frameColor: '#1A1A1A',
      palette: ['#E0301E', '#1F3FBF', '#F2B705', '#00875A', '#F26B1D', '#6B3FA0', '#0097B2', '#1A1A1A'],
      sea: '#D5E5EE', land: '#F4F2EC', water: { n: 0 }, relief: { style: 'swiss', amt: 1, alpha: 0.95, palette: 'classic' }, tex: { type: 'none' },
      coast: { color: '#86A3B4', w: 0.8 }, rivers: { color: '#8DB2C8', w: 0.9 }, borders: { style: 'solid', color: '#A8A8A8', w: 0.7, ribbon: '' },
      grat: { color: '#7A93A3', alpha: 0.35, w: 0.6, dash: false }, vignette: 'rgba(0,0,0,0)',
      routes: { style: 'casing', width: 3.6, curve: 0.14, arrows: true, casing: '#FFFFFF' }, markers: { style: 'ring' }, labels: { style: 'roman', halo: 'halo' },
      frame: { style: 'line' }, cartouche: { style: 'block' }, compass: { style: 'simple' }, scale: { style: 'line' }, city: { style: 'modern' },
      show: { texture: false, vignette: false, aging: false, waterlines: false, shadow: false, stipple: false, ships: false, waves: false, degrees: true }, autoShips: 0,
    },
  };
  const PRESET_KEYS = Object.keys(PRESETS);
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  function merge(a, b) { const o = { ...a }; for (const k in b || {}) o[k] = isObj(b[k]) && isObj(a[k]) ? merge(a[k], b[k]) : b[k]; return o; }
  function preset(name) { const n = PRESETS[name] ? name : 'discovery'; return merge(merge(BASE, PRESETS[n]), { preset: n }); }
  // Keys that belong to the old raster version; ignored now.
  const LEGACY = ['basemap', 'tint', 'tintAmt', 'sat', 'bright', 'contrast'];
  function design(d, mode) {
    if (d && d._merged) return d;
    const src = { ...(d || {}) }; LEGACY.forEach((k) => delete src[k]);
    const base = preset(src.preset);
    if (mode === 'journey') base.show = { ...base.show, numbers: true };
    const out = merge(base, src);
    Object.defineProperty(out, '_merged', { value: true, enumerable: false });
    return out;
  }
  // What the base map renderer needs, derived from the design.
  function baseStyle(D, lz) {
    const s = D.show;
    const step = lz < 3 ? 20 : lz < 4 ? 10 : lz < 5.2 ? 5 : lz < 6.5 ? 2 : 1;
    return {
      sea: D.sea, lake: D.lake || D.sea, land: D.land, maskLevel: lz < 3.2 ? 'l0' : 'l1',
      water: { on: s.waterlines, ...D.water }, depth: { on: s.depth, ...D.depth }, shadow: { on: s.shadow && D.shadow.blur > 0, dx: 0, dy: 0, ...D.shadow },
      relief: { on: s.relief, ...D.relief }, tex: s.stipple ? D.tex : { type: 'none' }, coast: D.coast,
      rivers: { on: s.rivers, ...D.rivers }, borders: { on: s.borders, ...D.borders }, grat: { on: s.graticule, step, ...D.grat },
      rhumbs: { on: s.rhumbs, ...D.rhumbs }, waves: { on: s.waves, ...D.waves },
    };
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hasGeo = (e) => Number.isFinite(e.lat) && Number.isFinite(e.lng);
  const keyOf = (e) => e.lat.toFixed(2) + ',' + e.lng.toFixed(2);
  const t = (k, v) => (window.I18N ? I18N.t(k, v) : k);
  const rel = (r) => (/^(me|я|myself|ich)$/i.test((r || '').trim()) ? '' : r || '');
  const chrono = (ev) => ev.map((e, i) => ({ e, i })).sort((a, b) => (a.e.year ?? 9999) - (b.e.year ?? 9999) || a.i - b.i).map((x) => x.e);
  function colors(people, palette) {
    const m = {}; (people || []).forEach((p, i) => (m[p.id] = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : palette[i % palette.length])); return m;
  }
  function arc(a, b, k, n = 32) {
    const [y1, x1] = a, [y2, x2] = b;
    const cx = (x1 + x2) / 2 - (y2 - y1) * k, cy = (y1 + y2) / 2 + (x2 - x1) * k, pts = [];
    for (let i = 0; i <= n; i++) { const s = i / n, u = 1 - s; pts.push([u * u * y1 + 2 * u * s * cy + s * s * y2, u * u * x1 + 2 * u * s * cx + s * s * x2]); }
    return pts;
  }
  // "Hand-drawn": a slow wobble across the line, the same on screen and in the export.
  function wobble(pts, seed, amp = 0.016) {
    const [y1, x1] = pts[0], [y2, x2] = pts[pts.length - 1], len = Math.hypot(x2 - x1, y2 - y1) || 1e-6, nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
    const p1 = seed * 1.7, p2 = seed * 3.1;
    return pts.map(([y, x], i) => { const s = i / (pts.length - 1), w = (Math.sin(s * Math.PI * 3 + p1) * 0.6 + Math.sin(s * Math.PI * 7 + p2) * 0.4) * Math.sin(s * Math.PI) * len * amp; return [y + ny * w, x + nx * w]; });
  }
  function years(events) { const y = events.map((e) => e.year).filter(Boolean); return y.length ? [Math.min(...y), Math.max(...y)] : null; }
  const span = (y) => (y ? (y[0] === y[1] ? String(y[0]) : y[0] + '–' + y[1]) : '');
  const dash = (style, w) => (style === 'dashed' ? [w * 3.2, w * 2.2] : style === 'dotted' ? [0.1, w * 2.4] : null);
  // Route strokes: [{pts, color, w, dash, alpha}] for one step. Same list for Leaflet and canvas.
  function routeStrokes(s, D, f, idx) {
    let pts = arc([s.from.lat, s.from.lng], [s.e.lat, s.e.lng], D.routes.curve);
    const w = D.routes.width * f, st = D.routes.style, c = s.color;
    if (st === 'double') return { pts, list: [{ pts, color: c, w: w * 2.3 }, { pts, color: D.paper, w: w * 0.85 }] };
    if (st === 'casing') return { pts, list: [{ pts, color: D.routes.casing || D.paper, w: w + 3.4 * f, alpha: 0.95 }, { pts, color: c, w }] };
    if (st === 'hand') { const a = wobble(pts, idx + 1), b = wobble(pts, idx + 7, 0.011); return { pts: a, list: [{ pts: b, color: c, w: w * 0.55, alpha: 0.55 }, { pts: a, color: c, w: w * 0.85, alpha: 0.95 }] }; }
    return { pts, list: [{ pts, color: c, w, dash: dash(st, w), alpha: 0.95 }] };
  }
  // Marker shapes in unit coordinates (1 = marker radius). Each part: [path, fill, stroke width].
  const circ = (r, cx = 0, cy = 0) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  const star = (r1, r2) => { let d = ''; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r2 : r1; d += (i ? 'L' : 'M') + (Math.cos(a) * r).toFixed(3) + ' ' + (Math.sin(a) * r).toFixed(3); } return d + 'Z'; };
  function markerParts(style, color, multi, D) {
    const ink = D.ink, paper = D.paper;
    switch (style) {
      case 'dot': return [[circ(0.8), color, ink, 0.18]];
      case 'square': return [['M-.85 -.85H.85V.85H-.85Z', paper, ink, 0.3], ['M-.38 -.38H.38V.38H-.38Z', multi ? ink : color, null, 0]];
      case 'star': return [[star(1.35, 0.58), color, ink, 0.14]];
      case 'pin': return [['M0 0C-.25-.55-1-1-1-1.75A1 1 0 1 1 1-1.75C1-1 .25-.55 0 0Z', color, ink, 0.14], [circ(0.36, 0, -1.75), paper, null, 0]];
      case 'town': return [['M-1.1 .7V-.25H-.75V-.8H-.4V-.25H-.15V-1.05L0-1.35L.15-1.05V-.25H.4V-.8H.75V-.25H1.1V.7Z', paper, ink, 0.16], ['M-.2 .7V.2A.2 .2 0 0 1 .2 .2V.7Z', multi ? ink : color, null, 0], [circ(0.12, 0, 1.05), multi ? ink : color, null, 0]];
      default: return [[circ(1), paper, ink, 0.34], [circ(multi ? 0.45 : 0.43), multi ? ink : color, null, 0]];
    }
  }
  const markerR = (D, multi) => (multi ? 8 : 6) * (D.markers.size || 1);

  // Data model shared by screen and export.
  function model(state, ds) {
    const col = colors(state.people, ds.palette), names = {}, byId = {};
    (state.people || []).forEach((p) => { names[p.id] = p.name; byId[p.id] = p; });
    const events = chrono((state.events || []).filter(hasGeo));
    const places = {}, steps = [], last = {};
    for (const e of events) {
      const k = keyOf(e);
      (places[k] ||= { key: k, e, list: [], people: new Set(), n: 0 }).list.push(e);
      places[k].people.add(e.personId);
      const p = last[e.personId];
      steps.push({ e, from: p && keyOf(p) !== k ? p : null, color: col[e.personId] || '#000' });
      last[e.personId] = e;
    }
    let num = 0; for (const k in places) places[k].color = col[places[k].e.personId];
    for (const e of events) { const pl = places[keyOf(e)]; if (!pl.n) pl.n = ++num; }
    const all = Object.values(places);
    let insets = [];
    if (ds.show.insets) {
      if (Array.isArray(ds.insets.pick)) insets = ds.insets.pick.map((k) => places[k]).filter(Boolean);
      else insets = all.filter((p) => !p.list.every((e) => e.kind === 'country' || e.kind === 'region')).sort((a, b) => b.list.length - a.list.length).slice(0, ds.insets.max);
      insets.sort((a, b) => a.n - b.n);
    }
    const mode = state.mode || 'family';
    let panel = ds.panel === 'auto' ? (mode === 'tree' ? 'tree' : mode === 'journey' ? 'chronicle' : 'none') : ds.panel;
    if (panel === 'tree' && !(state.people || []).some((p) => p.parents && p.parents.length)) panel = 'none';
    if (panel === 'chronicle' && !events.length) panel = 'none';
    return { col, names, byId, events, places, all, steps, insets, panel, mode };
  }

  // Rectangles in logical units.
  const BAND = { line: 0, double: 8, ornament: 18, degrees: 12, none: 0 };
  function layout(ds, m) {
    const W = W0, H = W0 / RATIO[ds.format || 'landscape'], pad = 40;
    const outer = { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };
    const band = ds.show.frame ? BAND[ds.frame.style] ?? 12 : 0;
    const C = { x: outer.x + band + 10, y: outer.y + band + 10, w: outer.w - 2 * (band + 10), h: outer.h - 2 * (band + 10) };
    let M = { ...C }, strip = null, panel = null, ins = [];
    const n = m.insets.length, g = 18;
    if (n) {
      let per = n, s = Math.min(170, (C.w - (per - 1) * g) / per);
      if (s < 112) { per = Math.ceil(n / 2); s = Math.min(170, (C.w - (per - 1) * g) / per); }
      const rows = Math.ceil(n / per), rowH = s + 52, sh = rows * rowH;
      strip = { x: C.x, y: C.y + C.h - sh, w: C.w, h: sh };
      M.h -= sh + 16;
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / per), c = i % per, inRow = Math.min(per, n - r * per);
        const x0 = C.x + (C.w - (inRow * s + (inRow - 1) * g)) / 2;
        ins.push({ x: x0 + c * (s + g), y: strip.y + r * rowH + 6, w: s, h: s });
      }
    }
    if (m.panel !== 'none') {
      if (ds.format === 'landscape') { const pw = Math.round(M.w * (ds.panelSize || 0.3)); panel = { x: M.x + M.w - pw, y: M.y, w: pw, h: M.h }; M.w -= pw + 16; }
      else { const ph = Math.round(M.h * ((ds.panelSize || 0.3) + 0.02)); panel = { x: M.x, y: M.y + M.h - ph, w: M.w, h: ph }; M.h -= ph + 16; }
    }
    // Graduated neat line and degree labels take a margin around the map itself.
    const grad = ds.show.frame && ds.frame.style === 'degrees' ? 8 : 0, lab = ds.show.degrees ? 17 : 0, mg = grad + lab;
    if (mg) M = { x: M.x + mg, y: M.y + mg, w: M.w - 2 * mg, h: M.h - 2 * mg };
    return { W, H, outer, band, C, M, strip, panel, ins, grad, lab };
  }

  // Text measurement in logical units with loaded web fonts.
  const mctx = document.createElement('canvas').getContext('2d');
  function tw(text, size, family, style = '', weight = 400, spacing = 0) { mctx.font = `${style} ${weight} ${size}px ${family}`; return mctx.measureText(text).width + spacing * size * Math.max(0, String(text).length - 1); }
  function fitText(text, size, family, maxW, style, weight) {
    let s = String(text || ''); if (tw(s, size, family, style, weight) <= maxW) return s;
    while (s.length > 1 && tw(s + '…', size, family, style, weight) > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  function placeBox(L, ds, el, w, h, dx, dy) {
    const p = ds.pos && ds.pos[el], M = L.M;
    let x = dx, y = dy;
    if (p && Number.isFinite(p.x)) { x = M.x + p.x * M.w; y = M.y + p.y * M.h; }
    x = Math.max(M.x, Math.min(M.x + M.w - w, x)); y = Math.max(M.y, Math.min(M.y + M.h - h, y));
    return { x, y, w, h };
  }
  const f2 = (n) => Math.round(n * 100) / 100;

  // ---------- SVG decoration ----------
  function svgFrame(L, ds, P) {
    if (!ds.show.frame) return '';
    const o = L.outer, b = L.band, c = ds.frameColor, st = ds.frame.style, M = L.M;
    let s = '';
    const rect = (r, sw, fill = 'none') => `<rect x="${f2(r.x)}" y="${f2(r.y)}" width="${f2(r.w)}" height="${f2(r.h)}" fill="${fill}" stroke="${c}" stroke-width="${sw}"/>`;
    const inner = { x: o.x + b, y: o.y + b, w: o.w - 2 * b, h: o.h - 2 * b };
    if (st === 'line') s += rect(o, 1.6);
    else if (st === 'double') s += rect(o, 2.4) + rect({ x: o.x + 6, y: o.y + 6, w: o.w - 12, h: o.h - 12 }, 0.8);
    else if (st === 'ornament') {
      s += rect(o, 2.4) + rect(inner, 1.1) + rect({ x: o.x + 3.5, y: o.y + 3.5, w: o.w - 7, h: o.h - 7 }, 0.6);
      // Band of lozenges between two rules, with rosettes in the corners.
      const mid = b / 2, a = ds.accent, run = (x1, y1, x2, y2) => {
        const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.round(len / 22)), ux = (x2 - x1) / len, uy = (y2 - y1) / len, st2 = len / n;
        for (let i = 0; i < n; i++) {
          const cx = x1 + ux * st2 * (i + 0.5), cy = y1 + uy * st2 * (i + 0.5), hx = ux * st2 * 0.42, hy = uy * st2 * 0.42, px = -uy * mid * 0.5, py = ux * mid * 0.5;
          s += `<path d="M${f2(cx - hx)} ${f2(cy - hy)} L${f2(cx + px)} ${f2(cy + py)} L${f2(cx + hx)} ${f2(cy + hy)} L${f2(cx - px)} ${f2(cy - py)} Z" fill="${i % 2 ? a : 'none'}" stroke="${c}" stroke-width=".7"/>`;
          s += `<circle cx="${f2(cx + ux * st2 * 0.5)}" cy="${f2(cy + uy * st2 * 0.5)}" r="1.3" fill="${c}"/>`;
        }
      };
      run(o.x + b, o.y + mid, o.x + o.w - b, o.y + mid); run(o.x + b, o.y + o.h - mid, o.x + o.w - b, o.y + o.h - mid);
      run(o.x + mid, o.y + b, o.x + mid, o.y + o.h - b); run(o.x + o.w - mid, o.y + b, o.x + o.w - mid, o.y + o.h - b);
      for (const [x, y] of [[o.x, o.y], [o.x + o.w - b, o.y], [o.x, o.y + o.h - b], [o.x + o.w - b, o.y + o.h - b]]) {
        s += `<rect x="${f2(x)}" y="${f2(y)}" width="${b}" height="${b}" fill="${ds.paper}" stroke="${c}" stroke-width="1"/>`;
        const cx = x + b / 2, cy = y + b / 2;
        for (let i = 0; i < 4; i++) { const an = (i * Math.PI) / 2 + Math.PI / 4; s += `<ellipse cx="${f2(cx + Math.cos(an) * b * 0.2)}" cy="${f2(cy + Math.sin(an) * b * 0.2)}" rx="${f2(b * 0.2)}" ry="${f2(b * 0.09)}" transform="rotate(${(an * 180) / Math.PI} ${f2(cx + Math.cos(an) * b * 0.2)} ${f2(cy + Math.sin(an) * b * 0.2)})" fill="${a}"/>`; }
        s += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(b * 0.1)}" fill="${c}"/>`;
      }
    } else {
      s += rect(o, 2.4) + rect(inner, 1);
    }
    // Neat line around the map; graduated in real degrees for the "degrees" frame.
    s += rect(M, 1.3);
    if (st === 'degrees' && P) {
      const g = L.grad, step = P.step / (P.step >= 10 ? 5 : P.step >= 5 ? 5 : P.step >= 2 ? 4 : 6);
      const outerR = { x: M.x - g, y: M.y - g, w: M.w + 2 * g, h: M.h + 2 * g };
      s += rect(outerR, 1);
      const bars = (vals, pos, horiz) => {
        for (let i = 0; i < vals.length - 1; i++) {
          if (i % 2) continue;
          const a = pos(vals[i]), b2 = pos(vals[i + 1]);
          if (horiz) { const x1 = Math.max(M.x, Math.min(a, b2)), x2 = Math.min(M.x + M.w, Math.max(a, b2)); if (x2 <= x1) continue; s += `<rect x="${f2(x1)}" y="${f2(M.y - g)}" width="${f2(x2 - x1)}" height="${g}" fill="${c}"/><rect x="${f2(x1)}" y="${f2(M.y + M.h)}" width="${f2(x2 - x1)}" height="${g}" fill="${c}"/>`; }
          else { const y1 = Math.max(M.y, Math.min(a, b2)), y2 = Math.min(M.y + M.h, Math.max(a, b2)); if (y2 <= y1) continue; s += `<rect x="${f2(M.x - g)}" y="${f2(y1)}" width="${g}" height="${f2(y2 - y1)}" fill="${c}"/><rect x="${f2(M.x + M.w)}" y="${f2(y1)}" width="${g}" height="${f2(y2 - y1)}" fill="${c}"/>`; }
        }
      };
      const lngs = [], lats = [];
      for (let v = Math.floor(P.lngA / step) * step; v <= P.lngB + step; v += step) lngs.push(v);
      for (let v = Math.floor(P.latA / step) * step; v <= P.latB + step; v += step) lats.push(v);
      bars(lngs, P.xAt, true); bars(lats, P.yAt, false);
    }
    return s;
  }
  const degFmt = (v, lat) => { const a = Math.round(Math.abs(v) * 100) / 100; const h = lat ? (v > 0 ? t('p.N') : v < 0 ? t('p.S') : '') : v > 0 ? t('p.E') : v < 0 ? t('p.W') : ''; return a + '°' + (a === 0 || a === 180 ? '' : h); };
  function svgDegrees(L, ds, F, P) {
    if (!ds.show.degrees || !P) return '';
    const M = L.M, g = L.grad, c = ds.ink, fs = 11.5, off = g + 5;
    let s = `<g font-family="${esc(F.text)}" font-size="${fs}" fill="${c}">`;
    for (let v = Math.ceil(P.lngA / P.step) * P.step; v <= P.lngB; v += P.step) {
      const x = P.xAt(v); if (x < M.x + 12 || x > M.x + M.w - 12) continue;
      s += `<text x="${f2(x)}" y="${f2(M.y - off)}" text-anchor="middle">${esc(degFmt(v))}</text><text x="${f2(x)}" y="${f2(M.y + M.h + off + fs - 2)}" text-anchor="middle">${esc(degFmt(v))}</text>`;
    }
    for (let v = Math.ceil(P.latA / P.step) * P.step; v <= P.latB; v += P.step) {
      const y = P.yAt(v); if (y < M.y + 12 || y > M.y + M.h - 12) continue;
      s += `<text transform="translate(${f2(M.x - off)} ${f2(y)}) rotate(-90)" text-anchor="middle">${esc(degFmt(v, true))}</text><text transform="translate(${f2(M.x + M.w + off)} ${f2(y)}) rotate(90)" text-anchor="middle">${esc(degFmt(v, true))}</text>`;
    }
    return s + '</g>';
  }

  function cartoucheBox(L, ds, F, inf) {
    const k = ds.cartouche.size || 1, st = ds.cartouche.style;
    const title = inf.title || t('familyMap'), sub = inf.subtitle || '';
    const ts = 40 * k, ss = 18 * k, maxW = Math.min(L.M.w * 0.8, 760 * k);
    const t1 = fitText(title, ts, F.title, maxW - 60 * k, '', 700), s1 = fitText(sub, ss, F.text, maxW - 60 * k, 'italic');
    const textW = Math.max(tw(t1, ts, F.title, '', 700), tw(s1, ss, F.text, 'italic'), 180 * k);
    let w = textW + 64 * k, h = (sub ? 118 : 84) * k;
    if (st === 'medallion') { w = textW * 1.22 + 70 * k; h = (sub ? 150 : 118) * k; }
    if (st === 'scroll') { w = textW + 110 * k; h = (sub ? 122 : 90) * k; }
    if (st === 'block') { w = textW + 56 * k; h = (sub ? 104 : 74) * k; }
    return { k, t1, s1, sub, ts, ss, w, h, st };
  }
  function svgCartouche(L, ds, F, info) {
    if (!ds.show.cartouche) return { svg: '', box: null };
    const B = cartoucheBox(L, ds, F, info), { k, t1, s1, sub, ts, ss, w, h, st } = B;
    const { x, y } = placeBox(L, ds, 'cartouche', w, h, L.M.x + 24, L.M.y + 24);
    const c = ds.ink, a = ds.accent, p = ds.paper, cx = x + w / 2, u = (v) => v * k;
    const dia = (px, py, r = 5) => `<path d="M${f2(px)} ${f2(py - u(r))} L${f2(px + u(r))} ${f2(py)} L${f2(px)} ${f2(py + u(r))} L${f2(px - u(r))} ${f2(py)} Z" fill="${a}"/>`;
    const texts = (ty, sy, color = c) => `<text x="${f2(cx)}" y="${f2(ty)}" text-anchor="middle" font-family="${esc(F.title)}" font-weight="700" font-size="${f2(ts)}" fill="${color}">${esc(t1)}</text>` +
      (sub ? `<text x="${f2(cx)}" y="${f2(sy)}" text-anchor="middle" font-family="${esc(F.text)}" font-style="italic" font-size="${f2(ss)}" fill="${color}">${esc(s1)}</text>` : '');
    let svg = '';
    if (st === 'scroll') {
      const x0 = x + u(22), x1 = x + w - u(22), top = y + u(8), bot = y + h - u(8), wv = u(7), r = u(14);
      svg = `<path d="M${f2(x0)} ${f2(top)} Q${f2(cx)} ${f2(top - wv)} ${f2(x1)} ${f2(top)} L${f2(x1)} ${f2(bot)} Q${f2(cx)} ${f2(bot - wv)} ${f2(x0)} ${f2(bot)} Z" fill="${p}" fill-opacity=".95" stroke="${c}" stroke-width="1.8"/>
        <path d="M${f2(x0 + u(8))} ${f2(top + u(8))} Q${f2(cx)} ${f2(top - wv + u(8))} ${f2(x1 - u(8))} ${f2(top + u(8))}" fill="none" stroke="${c}" stroke-width=".7"/>
        <path d="M${f2(x0 + u(8))} ${f2(bot - u(8))} Q${f2(cx)} ${f2(bot - wv - u(8))} ${f2(x1 - u(8))} ${f2(bot - u(8))}" fill="none" stroke="${c}" stroke-width=".7"/>`;
      for (const [ex, dir] of [[x0, -1], [x1, 1]]) {
        const ey = (top + bot) / 2, hh = (bot - top) / 2 + u(4);
        svg += `<path d="M${f2(ex)} ${f2(top)} C${f2(ex + dir * r * 1.6)} ${f2(top)} ${f2(ex + dir * r * 1.6)} ${f2(bot)} ${f2(ex)} ${f2(bot)}" fill="${p}" stroke="${c}" stroke-width="1.6"/>
          <ellipse cx="${f2(ex + dir * r * 0.55)}" cy="${f2(ey)}" rx="${f2(r * 0.62)}" ry="${f2(hh)}" fill="${p}" stroke="${c}" stroke-width="1.6"/>
          <ellipse cx="${f2(ex + dir * r * 0.55)}" cy="${f2(ey)}" rx="${f2(r * 0.3)}" ry="${f2(hh * 0.55)}" fill="none" stroke="${a}" stroke-width="1.1"/>
          <circle cx="${f2(ex + dir * r * 0.55)}" cy="${f2(ey)}" r="${f2(u(2.2))}" fill="${c}"/>`;
      }
      svg += texts(y + u(sub ? 58 : 58), y + u(96));
      if (sub) svg += `<line x1="${f2(cx - u(60))}" y1="${f2(y + u(72))}" x2="${f2(cx + u(60))}" y2="${f2(y + u(72))}" stroke="${a}" stroke-width="1"/>${dia(cx, y + u(72), 4)}`;
    } else if (st === 'medallion') {
      const cy = y + h / 2, rx = w / 2, ry = h / 2;
      svg = `<ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(rx)}" ry="${f2(ry)}" fill="${p}" fill-opacity=".95" stroke="${c}" stroke-width="2.2"/>
        <ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(rx - u(7))}" ry="${f2(ry - u(7))}" fill="none" stroke="${c}" stroke-width=".8"/>`;
      // Laurel of small leaves along the ring.
      for (let i = 0; i < 44; i++) {
        const an = (i / 44) * Math.PI * 2; if (Math.abs(Math.sin(an)) > 0.93) continue;
        const ex = cx + Math.cos(an) * (rx - u(3.5)), ey = cy + Math.sin(an) * (ry - u(3.5)), deg = (an * 180) / Math.PI + 90 + (i % 2 ? 25 : -25);
        svg += `<ellipse cx="${f2(ex)}" cy="${f2(ey)}" rx="${f2(u(1.4))}" ry="${f2(u(3.2))}" transform="rotate(${f2(deg)} ${f2(ex)} ${f2(ey)})" fill="${a}" fill-opacity=".8"/>`;
      }
      svg += dia(cx, y + u(2), 6) + dia(cx, y + h - u(2), 6);
      svg += texts(cy + (sub ? -u(4) : u(13)), cy + u(30));
      if (sub) svg += `<line x1="${f2(cx - u(50))}" y1="${f2(cy + u(9))}" x2="${f2(cx + u(50))}" y2="${f2(cy + u(9))}" stroke="${a}" stroke-width="1"/>`;
    } else if (st === 'block') {
      svg = `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="${c}"/><rect x="${f2(x)}" y="${f2(y)}" width="${f2(u(7))}" height="${f2(h)}" fill="${a}"/>`;
      svg += `<text x="${f2(x + u(30))}" y="${f2(y + u(50))}" font-family="${esc(F.title)}" font-weight="700" font-size="${f2(ts)}" fill="${p}">${esc(t1)}</text>` +
        (sub ? `<text x="${f2(x + u(30))}" y="${f2(y + u(82))}" font-family="${esc(F.text)}" font-size="${f2(ss)}" fill="${p}" fill-opacity=".85">${esc(s1)}</text>` : '');
    } else {
      svg = `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="${p}" fill-opacity=".93" stroke="${c}" stroke-width="2"/>
        <rect x="${f2(x + u(6))}" y="${f2(y + u(6))}" width="${f2(w - u(12))}" height="${f2(h - u(12))}" fill="none" stroke="${c}" stroke-width=".8"/>
        ${dia(x + u(6), y + u(6))}${dia(x + w - u(6), y + u(6))}${dia(x + u(6), y + h - u(6))}${dia(x + w - u(6), y + h - u(6))}`;
      svg += texts(y + u(56), y + u(98));
      if (sub) svg += `<line x1="${f2(cx - u(70))}" y1="${f2(y + u(72))}" x2="${f2(cx - u(12))}" y2="${f2(y + u(72))}" stroke="${a}" stroke-width="1"/>${dia(cx, y + u(72))}<line x1="${f2(cx + u(12))}" y1="${f2(y + u(72))}" x2="${f2(cx + u(70))}" y2="${f2(y + u(72))}" stroke="${a}" stroke-width="1"/>`;
    }
    return { svg: `<g>${svg}</g>`, box: { x, y, w, h } };
  }
  function svgLegend(L, ds, F, m) {
    if (!ds.show.legend) return { svg: '', box: null };
    const used = [...new Set(m.events.map((e) => e.personId))].filter((id) => m.byId[id]);
    if (used.length < 1) return { svg: '', box: null };
    const list = used.slice(0, 10), more = used.length - list.length, fs = 15, lh = 24;
    const rows = list.map((id) => { const p = m.byId[id], y = years(m.events.filter((e) => e.personId === id)); return { id, text: p.name + (rel(p.relation) ? ', ' + rel(p.relation) : ''), yrs: span(y) }; });
    const w = Math.min(360, Math.max(...rows.map((r) => tw(r.text, fs, F.text) + tw(r.yrs, 13, F.text, 'italic') + 20), 120) + 70);
    const h = 44 + rows.length * lh + (more ? lh : 0);
    const { x, y } = placeBox(L, ds, 'legend', w, h, L.M.x + 24, L.M.y + L.M.h - h - 24);
    const block = ds.cartouche.style === 'block';
    let s = `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${h}" fill="${ds.paper}" fill-opacity="${block ? 0.96 : 0.93}" stroke="${ds.ink}" stroke-width="${block ? 0 : 1.4}"/>
      ${block ? `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="3" fill="${ds.ink}"/>` : ''}
      <text x="${f2(x + 14)}" y="${f2(y + 26)}" font-family="${esc(F.title)}" font-weight="700" font-size="16" fill="${ds.ink}">${esc(ds.legendTitle || t('p.legend'))}</text>`;
    rows.forEach((r, i) => {
      const yy = y + 50 + i * lh, st = ds.routes.style, dA = dash(st, 2.2);
      const sample = st === 'double' ? `<line x1="${x + 14}" y1="${yy - 5}" x2="${x + 44}" y2="${yy - 5}" stroke="${m.col[r.id]}" stroke-width="5"/><line x1="${x + 14}" y1="${yy - 5}" x2="${x + 44}" y2="${yy - 5}" stroke="${ds.paper}" stroke-width="1.8"/>`
        : st === 'casing' ? `<line x1="${x + 14}" y1="${yy - 5}" x2="${x + 44}" y2="${yy - 5}" stroke="${ds.routes.casing || ds.paper}" stroke-width="6" stroke-linecap="round"/><line x1="${x + 14}" y1="${yy - 5}" x2="${x + 44}" y2="${yy - 5}" stroke="${m.col[r.id]}" stroke-width="3" stroke-linecap="round"/>`
          : `<line x1="${x + 14}" y1="${yy - 5}" x2="${x + 44}" y2="${yy - 5}" stroke="${m.col[r.id]}" stroke-width="3" ${dA ? `stroke-dasharray="${dA.join(' ')}"` : ''} stroke-linecap="round"/>`;
      s += sample + `<text x="${x + 54}" y="${yy}" font-family="${esc(F.text)}" font-size="${fs}" fill="${ds.ink}">${esc(fitText(r.text, fs, F.text, w - 130))} <tspan font-style="italic" font-size="13" fill-opacity=".75">${esc(r.yrs)}</tspan></text>`;
    });
    if (more) s += `<text x="${x + 54}" y="${y + 50 + rows.length * lh}" font-family="${esc(F.text)}" font-style="italic" font-size="14" fill="${ds.ink}">${esc(t('p.more', { n: more }))}</text>`;
    return { svg: s, box: { x, y, w, h } };
  }
  function compassBox(L, ds) {
    const k = ds.compass.size || 1, r = 54 * k;
    return { ...placeBox(L, ds, 'compass', 2 * r + 20 * k, 2 * r + 36 * k, L.M.x + L.M.w - 2 * r - 50, L.M.y + 14), r, k };
  }
  const compassCenter = (b) => ({ x: b.x + b.w / 2, y: b.y + 26 * b.k + b.r });
  function svgCompass(L, ds, F) {
    if (!ds.show.compass) return { svg: '', box: null };
    const box = compassBox(L, ds), { r, k } = box, { x: cx, y: cy } = compassCenter(box), c = ds.ink, a = ds.accent, p = ds.paper, st = ds.compass.style;
    const P = (an, rr) => [f2(cx + Math.sin(an) * rr), f2(cy - Math.cos(an) * rr)];
    const pt = (an, len, wid, fillL, fillR, sw = 0.7) => {
      const tip = P(an, len), l = P(an - Math.PI / 2, wid), rr = P(an + Math.PI / 2, wid);
      return `<path d="M${f2(cx)} ${f2(cy)} L${l} L${tip} Z" fill="${fillL}" stroke="${c}" stroke-width="${sw}"/><path d="M${f2(cx)} ${f2(cy)} L${rr} L${tip} Z" fill="${fillR}" stroke="${c}" stroke-width="${sw}"/>`;
    };
    const N = (y2 = cy - r - 10 * k, size = 18) => `<text x="${f2(cx)}" y="${f2(y2)}" text-anchor="middle" font-family="${esc(F.title)}" font-weight="700" font-size="${f2(size * k)}" fill="${c}">${esc(t('p.Nshort'))}</text>`;
    let s = '<g>';
    if (st === 'simple') {
      s += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r * 0.8)}" fill="none" stroke="${c}" stroke-width="1"/>`;
      for (let i = 0; i < 4; i++) s += pt((i * Math.PI) / 2, r * 0.95, 9 * k, i === 0 ? a : p, i === 0 ? a : c);
      s += N();
    } else if (st === 'modern') {
      s += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}" fill="${p}" fill-opacity=".85" stroke="${c}" stroke-width="1.2"/><circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r - 12 * k)}" fill="none" stroke="${c}" stroke-width=".6"/>`;
      for (let i = 0; i < 72; i++) { const an = (i / 72) * Math.PI * 2, r2 = i % 9 === 0 ? r - 12 * k : i % 3 === 0 ? r - 7 * k : r - 4 * k; s += `<line x1="${P(an, r)[0]}" y1="${P(an, r)[1]}" x2="${P(an, r2)[0]}" y2="${P(an, r2)[1]}" stroke="${c}" stroke-width="${i % 9 ? 0.5 : 0.9}"/>`; }
      for (let i = 0; i < 12; i++) { if (i % 3 === 0) continue; const an = (i / 12) * Math.PI * 2, [tx, ty] = P(an, r - 20 * k); s += `<text x="${tx}" y="${f2(+ty + 3 * k)}" text-anchor="middle" font-family="${esc(F.text)}" font-size="${f2(8.5 * k)}" fill="${c}">${i * 30}</text>`; }
      const card = ['N', 'E', 'S', 'W'].map((d) => t('p.' + d));
      card.forEach((d, i) => { const [tx, ty] = P((i * Math.PI) / 2, r - 21 * k); s += `<text x="${tx}" y="${f2(+ty + 4.5 * k)}" text-anchor="middle" font-family="${esc(F.title)}" font-weight="700" font-size="${f2(12 * k)}" fill="${i ? c : a}">${esc(d)}</text>`; });
      s += `<path d="M${f2(cx)} ${f2(cy - r * 0.52)} L${f2(cx + 6 * k)} ${f2(cy)} L${f2(cx)} ${f2(cy + r * 0.52)} L${f2(cx - 6 * k)} ${f2(cy)} Z" fill="${c}"/><path d="M${f2(cx)} ${f2(cy - r * 0.52)} L${f2(cx + 6 * k)} ${f2(cy)} L${f2(cx - 6 * k)} ${f2(cy)} Z" fill="${a}"/><circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(2.5 * k)}" fill="${p}" stroke="${c}"/>`;
    } else if (st === 'portolan') {
      const green = (ds.rhumbs.colors && ds.rhumbs.colors[1]) || '#2F6E3A';
      s += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r * 0.98)}" fill="${p}" fill-opacity=".6" stroke="${c}" stroke-width=".8"/><circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r * 0.3)}" fill="none" stroke="${c}" stroke-width=".6"/>`;
      for (let i = 0; i < 16; i++) if (i % 2) s += pt((i * Math.PI) / 8, r * 0.62, 4.2 * k, a, a, 0.5);
      for (let i = 0; i < 8; i++) if (i % 2) s += pt((i * Math.PI) / 4, r * 0.8, 7 * k, green, p);
      for (let i = 0; i < 4; i++) s += pt((i * Math.PI) / 2, r * 1.02, 9.5 * k, i % 2 ? c : p, i % 2 ? p : c);
      // Fleur-de-lis at north, a cross at east (the direction of the Holy Land on medieval charts).
      const fy = cy - r * 1.02 - 2 * k, fk = 6 * k;
      s += `<path d="M${f2(cx)} ${f2(fy - fk * 2.2)} C${f2(cx + fk * 0.7)} ${f2(fy - fk * 1.3)} ${f2(cx + fk * 0.5)} ${f2(fy - fk * 0.4)} ${f2(cx)} ${f2(fy)} C${f2(cx - fk * 0.5)} ${f2(fy - fk * 0.4)} ${f2(cx - fk * 0.7)} ${f2(fy - fk * 1.3)} ${f2(cx)} ${f2(fy - fk * 2.2)} Z" fill="${a}" stroke="${c}" stroke-width=".6"/>
        <path d="M${f2(cx - fk * 0.3)} ${f2(fy - fk * 0.5)} C${f2(cx - fk * 1.6)} ${f2(fy - fk * 1.6)} ${f2(cx - fk * 1.9)} ${f2(fy - fk * 0.2)} ${f2(cx - fk * 1.2)} ${f2(fy + fk * 0.1)} M${f2(cx + fk * 0.3)} ${f2(fy - fk * 0.5)} C${f2(cx + fk * 1.6)} ${f2(fy - fk * 1.6)} ${f2(cx + fk * 1.9)} ${f2(fy - fk * 0.2)} ${f2(cx + fk * 1.2)} ${f2(fy + fk * 0.1)}" fill="none" stroke="${a}" stroke-width="${f2(1.6 * k)}"/>
        <line x1="${f2(cx - fk * 1.2)}" y1="${f2(fy - fk * 0.3)}" x2="${f2(cx + fk * 1.2)}" y2="${f2(fy - fk * 0.3)}" stroke="${c}" stroke-width="${f2(1.2 * k)}"/>`;
      const ex = cx + r * 1.02 + 7 * k;
      s += `<path d="M${f2(ex - 5 * k)} ${f2(cy)} H${f2(ex + 5 * k)} M${f2(ex)} ${f2(cy - 5 * k)} V${f2(cy + 5 * k)}" stroke="${a}" stroke-width="${f2(2 * k)}"/>`;
      s += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(3 * k)}" fill="${a}" stroke="${c}" stroke-width=".6"/>`;
    } else {
      s += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}" fill="none" stroke="${c}" stroke-width="1"/><circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r - 6 * k)}" fill="none" stroke="${c}" stroke-width=".6"/>`;
      for (let i = 0; i < 32; i++) { const an = (i / 32) * Math.PI * 2, r1 = r - 6 * k, r2 = i % 4 ? r - 2 * k : r + 4 * k; s += `<line x1="${P(an, r1)[0]}" y1="${P(an, r1)[1]}" x2="${P(an, r2)[0]}" y2="${P(an, r2)[1]}" stroke="${c}" stroke-width=".7"/>`; }
      for (let i = 0; i < 4; i++) s += pt(Math.PI / 4 + (i * Math.PI) / 2, r * 0.62, 7 * k, p, c);
      for (let i = 0; i < 4; i++) s += pt((i * Math.PI) / 2, r * 0.95, 10 * k, i === 0 ? a : p, i === 0 ? a : c);
      s += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(3.5 * k)}" fill="${p}" stroke="${c}"/>` + N();
    }
    return { svg: s + '</g>', box };
  }
  function svgScale(L, ds, F, kmPerUnit) {
    if (!ds.show.scale || !kmPerUnit) return { svg: '', box: null };
    const k = ds.scale.size || 1, mi = ds.scale.units === 'mi', per = mi ? kmPerUnit / 1.609344 : kmPerUnit;
    const target = 160 * k * per, p = 10 ** Math.floor(Math.log10(target)), nice = [1, 2, 5, 10].map((q) => q * p).filter((v) => v <= target).pop() || p;
    const len = nice / per, w = len + 24, h = 44 * Math.max(1, k * 0.9);
    const { x: bx, y: by } = placeBox(L, ds, 'scale', w, h, L.M.x + L.M.w - w - 24, L.M.y + L.M.h - h - 16);
    const x = bx + 10, y = by + h - 12, c = ds.ink, fs = 12 * Math.max(1, k * 0.9), niceTxt = +nice.toPrecision(3);
    let s = `<g><rect x="${f2(bx)}" y="${f2(by)}" width="${f2(w)}" height="${f2(h)}" fill="${ds.paper}" fill-opacity=".85"/>`;
    if (ds.scale.style === 'line') s += `<path d="M${f2(x)} ${f2(y - 6 * k)} V${f2(y)} H${f2(x + len)} V${f2(y - 6 * k)} M${f2(x + len / 2)} ${f2(y)} V${f2(y - 4 * k)}" fill="none" stroke="${c}" stroke-width="1.3"/>`;
    else for (let i = 0; i < 4; i++) s += `<rect x="${f2(x + (i * len) / 4)}" y="${f2(y - 6 * k)}" width="${f2(len / 4)}" height="${f2(6 * k)}" fill="${i % 2 ? ds.paper : c}" stroke="${c}" stroke-width=".8"/>`;
    s += `<text x="${f2(x)}" y="${f2(y - 6 * k - 6)}" font-family="${esc(F.text)}" font-size="${f2(fs)}" fill="${c}">0</text><text x="${f2(x + len)}" y="${f2(y - 6 * k - 6)}" text-anchor="end" font-family="${esc(F.text)}" font-size="${f2(fs)}" fill="${c}">${niceTxt} ${esc(t(mi ? 'p.mi' : 'p.km'))}</text></g>`;
    return { svg: s, box: { x: bx, y: by, w, h } };
  }
  function svgInsets(L, ds, F, m) {
    let s = '';
    m.insets.forEach((pl, i) => {
      const r = L.ins[i]; if (!r) return;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, c = ds.ink;
      if (ds.insets.shape === 'circle') s += `<circle cx="${cx}" cy="${cy}" r="${r.w / 2}" fill="none" stroke="${c}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${r.w / 2 + 5}" fill="none" stroke="${c}" stroke-width=".8"/>`;
      else s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="${c}" stroke-width="2"/><rect x="${r.x - 5}" y="${r.y - 5}" width="${r.w + 10}" height="${r.h + 10}" fill="none" stroke="${c}" stroke-width=".8"/>`;
      const cfg = (ds.insetCfg || {})[pl.key] || {};
      const name = fitText(cfg.label || pl.e.place || pl.e.query, 17, F.title, r.w + 30, '', 700);
      s += `<text x="${cx}" y="${r.y + r.h + 26}" text-anchor="middle" font-family="${esc(F.title)}" font-weight="700" font-size="17" fill="${c}">${ds.show.numbers ? pl.n + '. ' : ''}${esc(name)}</text>`;
      const y = span(years(pl.list)), ppl = [...pl.people];
      const dots = ppl.slice(0, 6).map((id, k) => `<circle cx="${cx - ((Math.min(ppl.length, 6) - 1) * 9) / 2 + k * 9 - (y ? tw(y, 13, F.text, 'italic') / 2 + 10 : 0)}" cy="${r.y + r.h + 41}" r="3.3" fill="${m.col[id]}"/>`).join('');
      s += dots + `<text x="${cx + (ppl.length ? Math.min(ppl.length, 6) * 4.5 : 0)}" y="${r.y + r.h + 45}" text-anchor="middle" font-family="${esc(F.text)}" font-style="italic" font-size="13" fill="${c}">${esc(y)}</text>`;
    });
    return s;
  }

  // ---------- ships ----------
  // Drawn facing right in a 120 x 90 box; the centre of the waterline is (60, 62).
  const SHIPS = {
    galleon: (c, a, p) => `<path d="M6 60 L20 60 L20 50 L32 50 L32 60 L98 60 L110 51 L106 64 Q62 76 14 68 Z" fill="${c}" fill-opacity=".9" stroke="${c}" stroke-width="1.2"/>
      <path d="M16 64 Q62 72 104 61" fill="none" stroke="${a}" stroke-width="1.6"/>
      <path d="M36 60 V14 M62 60 V7 M86 60 V20 M100 55 L119 42" stroke="${c}" stroke-width="1.6" fill="none"/>
      <path d="M78 24 Q86 22 94 24 L95 34 Q86 37 77 34 Z M76 38 Q86 36 96 38 L97 51 Q86 54 75 51 Z M52 12 Q62 10 72 12 L73 26 Q62 29 51 26 Z M49 30 Q62 28 75 30 L76 47 Q62 51 48 47 Z M36 16 L22 48 L36 46 Z M88 22 L117 43 L98 51 Z" fill="${p}" stroke="${c}" stroke-width="1.1"/>
      <path d="M62 7 L72 9.5 L62 12 Z M36 14 L43 16 L36 18 Z M86 20 L93 22 L86 24 Z" fill="${a}"/>`,
    caravel: (c, a, p) => `<path d="M12 60 L96 60 L112 50 L106 64 Q62 76 20 68 L8 54 Z" fill="${c}" fill-opacity=".9" stroke="${c}" stroke-width="1.2"/>
      <path d="M44 60 V16 M76 60 V24 M24 52 L60 8 M62 52 L90 18" stroke="${c}" stroke-width="1.5" fill="none"/>
      <path d="M60 8 Q55 34 62 48 L25 51 Q40 30 60 8 Z M90 18 Q86 38 91 49 L63 51 Q74 34 90 18 Z" fill="${p}" stroke="${c}" stroke-width="1.1"/>
      <path d="M40 28 H52 M46 22 V36 M78 32 H86 M82 27 V38" stroke="${a}" stroke-width="2.2"/>
      <path d="M44 16 L53 18.5 L44 21 Z" fill="${a}"/>`,
    steamer: (c, a, p) => `<path d="M6 56 L112 56 L102 68 L18 68 Z" fill="${c}" fill-opacity=".9" stroke="${c}" stroke-width="1.2"/>
      <path d="M28 56 V45 H84 V56 Z" fill="${p}" stroke="${c}" stroke-width="1.1"/>
      <path d="M50 45 V24 H62 V45 Z" fill="${a}" stroke="${c}" stroke-width="1.1"/><path d="M50 28 H62" stroke="${c}" stroke-width="2"/>
      <path d="M20 56 V26 M98 56 V30 M20 26 L50 40 M98 30 L62 40" stroke="${c}" stroke-width="1" fill="none"/>
      <circle cx="58" cy="17" r="5" fill="${c}" fill-opacity=".25"/><circle cx="67" cy="11" r="6.5" fill="${c}" fill-opacity=".18"/><circle cx="79" cy="7" r="7.5" fill="${c}" fill-opacity=".12"/>
      <path d="M36 50 h4 M46 50 h4 M66 50 h4 M76 50 h4" stroke="${c}" stroke-width="2.4"/>`,
    sloop: (c, a, p) => `<path d="M28 60 L94 60 L84 69 L38 69 Z" fill="${c}" fill-opacity=".9" stroke="${c}" stroke-width="1.2"/>
      <path d="M60 60 V12" stroke="${c}" stroke-width="1.5"/>
      <path d="M62 14 Q76 36 90 58 L62 58 Z M58 18 L34 58 L58 58 Z" fill="${p}" stroke="${c}" stroke-width="1.1"/>
      <path d="M60 12 L69 14.5 L60 17 Z" fill="${a}"/>`,
  };
  const SHIP_TYPES = Object.keys(SHIPS);
  function shipSVG(sh, ds) {
    const w = 120 * (sh.s || 1) * 0.75, h = 90 * (sh.s || 1) * 0.75, sc = w / 120, fn = SHIPS[sh.type] || SHIPS.galleon;
    const x = sh.px - w / 2, y = sh.py - 62 * sc;
    const flip = sh.flip ? `translate(${f2(x + w)} ${f2(y)}) scale(${f2(-sc)} ${f2(sc)})` : `translate(${f2(x)} ${f2(y)}) scale(${f2(sc)})`;
    const waves = `<path d="M-4 74 q6 -4 12 0 t12 0 t12 0 M70 72 q6 -4 12 0 t12 0 t12 0 t12 0 M30 80 q5 -3 10 0 t10 0 t10 0" fill="none" stroke="${ds.ink}" stroke-width="1" stroke-opacity=".7"/>`;
    return { svg: `<g transform="${flip}" stroke-linejoin="round" stroke-linecap="round">${fn(ds.ink, ds.accent, ds.paper)}${waves}</g>`, box: { x, y: y + 4 * sc, w, h: h - 4 * sc } };
  }

  // ---------- free labels ----------
  function textFont(tx, F) {
    switch (tx.style) {
      case 'caps': return { family: F.title, style: '', weight: 400, upper: true, spacing: tx.spacing ?? 0.28 };
      case 'script': return { family: SCRIPT, style: '', weight: 400, spacing: tx.spacing ?? 0 };
      case 'roman': return { family: F.text, style: '', weight: 400, spacing: tx.spacing ?? 0.04 };
      default: return { family: F.text, style: 'italic', weight: 400, spacing: tx.spacing ?? 0.12 };
    }
  }
  function svgText(tx, L, ds, F) {
    const fn = textFont(tx, F), size = tx.size || 26, str = fn.upper ? String(tx.text || '').toUpperCase() : String(tx.text || '');
    const w = tw(str, size, fn.family, fn.style, fn.weight, fn.spacing), h = size * 1.2;
    const cx = L.M.x + (Number.isFinite(tx.x) ? tx.x : 0.5) * L.M.w, cy = L.M.y + (Number.isFinite(tx.y) ? tx.y : 0.5) * L.M.h;
    const rot = tx.rot || 0, col = tx.color || ds.ink;
    const svg = `<text x="${f2(cx)}" y="${f2(cy + size * 0.35)}" text-anchor="middle" transform="rotate(${rot} ${f2(cx)} ${f2(cy)})" font-family="${esc(fn.family)}" font-style="${fn.style || 'normal'}" font-size="${size}" letter-spacing="${f2(fn.spacing * size)}" fill="${col}" fill-opacity="${tx.alpha ?? 0.85}">${esc(str)}</text>`;
    const rr = (Math.abs(rot) * Math.PI) / 180, bw = Math.abs(w * Math.cos(rr)) + Math.abs(h * Math.sin(rr)), bh = Math.abs(w * Math.sin(rr)) + Math.abs(h * Math.cos(rr));
    return { svg, box: { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh } };
  }

  // Generations layout for the tree panel.
  function treeLayout(state) {
    const people = state.people || [], byId = Object.fromEntries(people.map((p) => [p.id, p]));
    const kids = {}; people.forEach((p) => (p.parents || []).forEach((q) => (kids[q] ||= []).push(p.id)));
    const root = byId[state.rootId] ? state.rootId : people[0] && people[0].id; if (!root) return null;
    const gen = { [root]: 0 }, order = [root], q = [root];
    while (q.length) {
      const id = q.shift(), p = byId[id], g = gen[id];
      const nb = [...(p.parents || []).map((x) => [x, g - 1]), ...(kids[id] || []).map((x) => [x, g + 1]), ...(p.spouses || []).map((x) => [x, g])];
      for (const [x, gg] of nb) if (byId[x] && gen[x] === undefined) { gen[x] = gg; order.push(x); q.push(x); }
    }
    const rows = {}; order.forEach((id) => (rows[gen[id]] ||= []).push(id));
    const gens = Object.keys(rows).map(Number).sort((a, b) => a - b);
    const pos = {}; const place = () => gens.forEach((g) => rows[g].forEach((id, i) => (pos[id] = (i + 0.5) / rows[g].length)));
    place();
    for (let pass = 0; pass < 4; pass++) {
      for (const g of pass % 2 ? gens.slice().reverse() : gens) {
        const bary = (id) => { const p = byId[id], nb = [...(p.parents || []), ...(kids[id] || [])].filter((x) => pos[x] !== undefined && gen[x] !== g); return nb.length ? nb.reduce((s, x) => s + pos[x], 0) / nb.length : pos[id]; };
        rows[g].sort((a, b) => bary(a) - bary(b));
        const r = []; for (const id of rows[g]) { if (r.includes(id)) continue; r.push(id); for (const s of byId[id].spouses || []) if (rows[g].includes(s) && !r.includes(s)) r.push(s); }
        rows[g] = r; rows[g].forEach((id, i) => (pos[id] = (i + 0.5) / rows[g].length));
      }
    }
    return { rows, gens, gen, byId, root };
  }
  function svgPanel(L, ds, F, m, state) {
    const P = L.panel; if (!P) return '';
    const c = ds.ink;
    let s = `<rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" fill="${ds.paper}" fill-opacity=".96" stroke="${c}" stroke-width="1.4"/>
      <rect x="${P.x + 5}" y="${P.y + 5}" width="${P.w - 10}" height="${P.h - 10}" fill="none" stroke="${c}" stroke-width=".6"/>`;
    const title = ds.panelTitle || (m.panel === 'tree' ? t('p.tree') : t('p.chronicle'));
    s += `<text x="${P.x + P.w / 2}" y="${P.y + 40}" text-anchor="middle" font-family="${esc(F.title)}" font-weight="700" font-size="22" fill="${c}">${esc(title)}</text>`;
    const top = P.y + 60, inner = { x: P.x + 16, y: top, w: P.w - 32, h: P.h - (top - P.y) - 16 };
    if (m.panel === 'chronicle') {
      const lh = 26, cap = Math.floor(inner.h / lh), list = m.events.slice(0, cap - (m.events.length > cap ? 1 : 0)), names = m.names;
      list.forEach((e, i) => {
        const y = inner.y + 16 + i * lh, pl = m.places[keyOf(e)];
        s += ds.show.numbers ? `<text x="${inner.x + 18}" y="${y}" text-anchor="end" font-family="${esc(F.title)}" font-weight="700" font-size="14" fill="${m.col[e.personId]}">${pl.n}.</text>` : `<circle cx="${inner.x + 10}" cy="${y - 5}" r="4" fill="${m.col[e.personId]}"/>`;
        const typ = e.type !== 'other' ? t('type.' + e.type) : '';
        const who = m.mode === 'journey' ? '' : names[e.personId] || '';
        const txt = [e.place, typ, who].filter(Boolean).join(', ');
        s += `<text x="${inner.x + 28}" y="${y}" font-family="${esc(F.text)}" font-size="14" fill="${c}"><tspan font-weight="500">${esc(e.when || '—')}</tspan>  ${esc(fitText(txt, 14, F.text, inner.w - 28 - tw((e.when || '—') + '  ', 14, F.text, '', 500)))}</text>`;
      });
      if (m.events.length > list.length) s += `<text x="${inner.x + 28}" y="${inner.y + 16 + list.length * lh}" font-family="${esc(F.text)}" font-style="italic" font-size="14" fill="${c}">${esc(t('p.more', { n: m.events.length - list.length }))}</text>`;
      return s;
    }
    const T = treeLayout(state); if (!T) return s;
    let { rows, gens } = T;
    const maxRow = Math.max(...gens.map((g) => rows[g].length));
    const rowH = Math.min(96, inner.h / gens.length), nh = Math.min(46, rowH * 0.62);
    let nw = Math.min(150, (inner.w - (maxRow - 1) * 6) / maxRow);
    if (nw < 56) {
      const direct = new Set(Object.keys(T.byId).filter((id) => T.byId[id].branch !== 'side'));
      gens.forEach((g) => (rows[g] = rows[g].filter((id) => direct.has(id) || id === T.root)));
      gens = gens.filter((g) => rows[g].length);
      nw = Math.min(150, (inner.w - (Math.max(...gens.map((g) => rows[g].length)) - 1) * 6) / Math.max(...gens.map((g) => rows[g].length)));
    }
    const fs = Math.max(8, Math.min(14, nw / 8.5)), xy = {};
    gens.forEach((g, gi) => { const r = rows[g], tot = r.length * nw + (r.length - 1) * 6, x0 = inner.x + (inner.w - tot) / 2; r.forEach((id, i) => (xy[id] = { x: x0 + i * (nw + 6), y: inner.y + gi * rowH + (rowH - nh) / 2 })); });
    let lines = '';
    for (const id in xy) {
      const p = T.byId[id], par = (p.parents || []).filter((x) => xy[x]); if (!par.length) continue;
      const cx = xy[id].x + nw / 2, cy = xy[id].y;
      const px = par.reduce((s2, x) => s2 + xy[x].x + nw / 2, 0) / par.length, py = Math.max(...par.map((x) => xy[x].y + nh));
      const mid = (py + cy) / 2;
      lines += `<path d="M${px} ${py} V${mid} H${cx} V${cy}" fill="none" stroke="${c}" stroke-width=".9" stroke-opacity=".7"/>`;
      if (par.length === 2) lines += `<line x1="${xy[par[0]].x + nw / 2}" y1="${py}" x2="${xy[par[1]].x + nw / 2}" y2="${py}" stroke="${c}" stroke-width=".9" stroke-opacity=".7"/>`;
    }
    let nodes = '';
    for (const id in xy) {
      const p = T.byId[id], b = xy[id], isRoot = id === T.root;
      const yrs = p.born || p.died ? `${p.born || '?'}–${p.died || ''}` : '';
      nodes += `<rect x="${b.x}" y="${b.y}" width="${nw}" height="${nh}" fill="${ds.paper}" stroke="${c}" stroke-width="${isRoot ? 2 : 1}"/><rect x="${b.x}" y="${b.y}" width="4" height="${nh}" fill="${m.col[id]}"/>
        <text x="${b.x + nw / 2 + 2}" y="${b.y + nh * 0.45}" text-anchor="middle" font-family="${esc(F.text)}" font-weight="500" font-size="${fs}" fill="${c}">${esc(fitText(p.name, fs, F.text, nw - 10, '', 500))}</text>
        <text x="${b.x + nw / 2 + 2}" y="${b.y + nh * 0.45 + fs * 1.15}" text-anchor="middle" font-family="${esc(F.text)}" font-style="italic" font-size="${fs * 0.85}" fill="${c}" fill-opacity=".75">${esc(yrs)}</text>`;
    }
    return s + lines + nodes;
  }
  function svgAttribution(L, ds, F, m) {
    const osm = ds.show.insets && m && m.insets.length && m.insets.some((p) => { const c = (ds.insetCfg || {})[p.key] || {}; return (Number.isFinite(c.z) ? c.z : ds.insets.zoom) >= 11; });
    return `<text x="${L.outer.x + L.outer.w}" y="${L.H - 14}" text-anchor="end" font-family="${esc(F.text)}" font-size="11" fill="${ds.ink}" fill-opacity=".6">MapHeritage · Natural Earth · ETOPO1 (NOAA)${osm ? ' · © OpenMapTiles · © OpenStreetMap contributors' : ''}</text>`;
  }
  const NOISE = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .42 0 0 0 0 .32 0 0 0 0 .2 0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  const NOISE_URL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(NOISE);

  function info(S, D, M) {
    const title = S.title || t('title.ph');
    if (D.subtitle) return { title, subtitle: D.subtitle };
    const y = span(years(M.events)), people = S.people || [];
    let sub;
    if (S.mode === 'journey') { const r = people.find((p) => p.id === S.rootId) || people[0]; sub = t('sub.journey', { name: r ? r.name : '' }); }
    else if (S.mode === 'tree') sub = t('sub.tree', { n: people.length, people: window.I18N ? I18N.plural(people.length, 'count.people') : '' });
    else sub = t('sub.family');
    return { title, subtitle: y ? sub + ', ' + y : sub };
  }

  // ---------- Leaflet: the base map as a canvas layer ----------
  const BaseLayer = L.Layer.extend({
    initialize(o) { this.o = o; },
    onAdd(map) {
      this._map = map;
      const pane = map.getPane('mhBase') || map.createPane('mhBase'); pane.style.zIndex = 150; pane.style.pointerEvents = 'none';
      this._c = L.DomUtil.create('canvas', 'p-base', pane);
      map.on('move zoom resize viewreset', this.request, this);
      this._unsub = Basemap.subscribe(() => this.request());
      this._unsub2 = window.CityMap ? CityMap.subscribe(() => this.request()) : null;
    },
    onRemove(map) { map.off('move zoom resize viewreset', this.request, this); if (this._unsub) this._unsub(); if (this._unsub2) this._unsub2(); this._c.remove(); cancelAnimationFrame(this._raf); },
    request() { if (this._raf || this.o.silent) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.redraw(); }); },
    view() {
      const map = this._map, sz = map.getSize(), s = 256 * 2 ** map.getZoom(), nw = map.containerPointToLayerPoint([0, 0]), o = map.getPixelOrigin();
      return { w: sz.x, h: sz.y, x0: nw.x + o.x, y0: nw.y + o.y, s };
    },
    redraw() {
      if (!this._map || this.o.silent) return;
      const ctx0 = this.o.context(); if (!ctx0) return;
      const V = { ...this.view(), ...ctx0.V }, dpr = Math.min(2, window.devicePixelRatio || 1), c = this._c;
      if (!V.w || !V.h) return;
      c.width = Math.round(V.w * dpr); c.height = Math.round(V.h * dpr); c.style.width = V.w + 'px'; c.style.height = V.h + 'px';
      L.DomUtil.setPosition(c, this._map.containerPointToLayerPoint([0, 0]));
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); V.dpr = dpr;
      const r = Basemap.render(g, V, ctx0.S);
      if (ctx0.after) ctx0.after(g, V);
      this.mask = r.mask;
      if (this.o.onDraw) this.o.onDraw(r);
    },
  });

  function makeMap(el, interactive, baseCtx) {
    const map = L.map(el, {
      zoomControl: false, attributionControl: false, zoomSnap: 0, zoomDelta: 0.5, wheelPxPerZoomLevel: 140,
      dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive, touchZoom: interactive,
      boxZoom: false, keyboard: false, inertia: false, worldCopyJump: true, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false,
    });
    map.setView([50, 30], 3);
    const base = new BaseLayer(baseCtx).addTo(map);
    const group = L.layerGroup().addTo(map), temp = L.layerGroup().addTo(map);
    return { map, base, group, temp };
  }

  function create(host, opts = {}) {
    const interactive = opts.interactive !== false;
    const root = document.createElement('div'); root.className = 'poster'; host.appendChild(root);
    const mapEl = document.createElement('div'); mapEl.className = 'p-map'; root.appendChild(mapEl);
    const vig = document.createElement('div'); vig.className = 'p-vig'; root.appendChild(vig);
    const insetHost = document.createElement('div'); root.appendChild(insetHost);
    const over = document.createElement('div'); over.className = 'p-over'; root.appendChild(over);
    const tex = document.createElement('div'); tex.className = 'p-tex'; tex.style.backgroundImage = `url("${NOISE_URL}")`; root.appendChild(tex);
    const age = document.createElement('canvas'); age.className = 'p-age'; root.appendChild(age);
    const hitLayer = document.createElement('div'); hitLayer.className = 'p-hits'; root.appendChild(hitLayer);
    if (opts.editable) root.classList.add('editing');
    let insets = [], S = null, D = null, M = null, Lr = null, f = 1, timers = [], applying = false, fitted = false, autoShipList = [], ageKey = '';
    const lz = (map) => map.getZoom() - Math.log2(f);
    const main = makeMap(mapEl, interactive, {
      silent: !!opts.exporting,
      context: () => (D ? { V: { f, lz: lz(main.map), rhumbs: rhumbCenters(), wantMask: D.show.ships }, S: baseStyle(D, lz(main.map)) } : null),
      onDraw: () => { if (S && D && D.show.ships && !Array.isArray(D.ships)) { const prev = JSON.stringify(autoShipList); computeAutoShips(); if (JSON.stringify(autoShipList) !== prev) overlay(); } },
    });

    function px(r) { return `left:${r.x * f}px;top:${r.y * f}px;width:${r.w * f}px;height:${r.h * f}px`; }
    function size(width) {
      const ratio = RATIO[(D && D.format) || 'landscape'];
      const w = Math.floor(width || opts.width || host.clientWidth), h = Math.floor(w / ratio);
      f = w / W0; root.style.width = w + 'px'; root.style.height = h + 'px';
      return { w, h };
    }
    function kmPerUnit() {
      const s = main.map.getSize(); if (!s.x) return 0;
      const a = main.map.containerPointToLatLng([s.x / 2 - 50, s.y / 2]), b = main.map.containerPointToLatLng([s.x / 2 + 50, s.y / 2]);
      return main.map.distance(a, b) / 1000 / (100 / f);
    }
    function rhumbCenters() {
      if (!D || !Lr) return [];
      const c = D.show.compass ? compassCenter(compassBox(Lr, D)) : { x: Lr.M.x + Lr.M.w / 2, y: Lr.M.y + Lr.M.h / 2 };
      return [{ x: (c.x - Lr.M.x) * f, y: (c.y - Lr.M.y) * f }];
    }
    // Projection helpers in poster units for the degree scale.
    function projector() {
      const map = main.map, s = map.getSize(); if (!s.x) return null;
      const tl = map.containerPointToLatLng([0, 0]), br = map.containerPointToLatLng([s.x, s.y]), z = lz(map);
      const step = z < 3 ? 20 : z < 4 ? 10 : z < 5.2 ? 5 : z < 6.5 ? 2 : 1;
      return { step, lngA: tl.lng, lngB: br.lng, latA: br.lat, latB: tl.lat,
        xAt: (lng) => Lr.M.x + map.latLngToContainerPoint([tl.lat, lng]).x / f, yAt: (lat) => Lr.M.y + map.latLngToContainerPoint([lat, tl.lng]).y / f };
    }
    // Ships: explicit list, or placed automatically in open sea away from the other elements.
    function computeAutoShips() {
      const mask = main.base.mask; autoShipList = [];
      if (!mask || !D.autoShips) return;
      const Mr = Lr.M, avoid = [boxes.cartouche, boxes.legend, boxes.compass, boxes.scale].filter(Boolean).map((b) => ({ x: b.x - 40, y: b.y - 30, w: b.w + 80, h: b.h + 60 }));
      const places = M.all.map((pl) => { const p = main.map.latLngToContainerPoint([pl.e.lat, pl.e.lng]); return { x: Mr.x + p.x / f, y: Mr.y + p.y / f }; });
      const cands = [];
      for (let y = Mr.y + 50; y < Mr.y + Mr.h - 40; y += 24) for (let x = Mr.x + 60; x < Mr.x + Mr.w - 60; x += 24) {
        if (avoid.some((b) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h)) continue;
        const cx = (x - Mr.x) * f, cy = (y - Mr.y) * f; let ok = !mask.land(cx, cy);
        for (let i = 0; ok && i < 8; i++) { const a = (i / 8) * Math.PI * 2; ok = !mask.land(cx + Math.cos(a) * 44 * f, cy + Math.sin(a) * 30 * f); }
        if (!ok) continue;
        const dp = places.reduce((m2, p) => Math.min(m2, Math.hypot(p.x - x, p.y - y)), 1e9); if (dp < 70) continue;
        cands.push({ x, y, dp });
      }
      const pick = [];
      while (pick.length < D.autoShips && cands.length) {
        let best = null, bs = -1;
        for (const c of cands) { const d = pick.reduce((m2, p) => Math.min(m2, Math.hypot(p.x - c.x, p.y - c.y)), 1e9), sc = Math.min(d, 600) + Math.min(c.dp, 300) * 0.4; if (sc > bs) { bs = sc; best = c; } }
        if (!best || (pick.length && bs < 200)) break;
        pick.push(best);
      }
      const types = D.shipTypes && D.shipTypes.length ? D.shipTypes : ['galleon'];
      autoShipList = pick.map((p, i) => ({ type: types[i % types.length], x: +((p.x - Mr.x) / Mr.w).toFixed(4), y: +((p.y - Mr.y) / Mr.h).toFixed(4), s: 1, flip: p.x > Mr.x + Mr.w / 2 }));
    }
    // A free spot in open sea for a ship added by hand (fractions of the map area), or the centre if none is found.
    function seaSpot() {
      const mask = main.base.mask, Mr = Lr.M; if (!mask) return { x: 0.5, y: 0.5 };
      const taken = shipList().map((sh) => ({ x: Mr.x + sh.x * Mr.w, y: Mr.y + sh.y * Mr.h }));
      const avoid = [boxes.cartouche, boxes.legend, boxes.compass, boxes.scale].filter(Boolean);
      let best = null, bs = -1;
      for (let y = Mr.y + 50; y < Mr.y + Mr.h - 40; y += 20) for (let x = Mr.x + 60; x < Mr.x + Mr.w - 60; x += 20) {
        if (avoid.some((b) => x > b.x - 40 && x < b.x + b.w + 40 && y > b.y - 30 && y < b.y + b.h + 30)) continue;
        const cx = (x - Mr.x) * f, cy = (y - Mr.y) * f; let ok = !mask.land(cx, cy);
        for (let i = 0; ok && i < 8; i++) { const a = (i / 8) * Math.PI * 2; ok = !mask.land(cx + Math.cos(a) * 44 * f, cy + Math.sin(a) * 30 * f); }
        if (!ok) continue;
        const d = taken.reduce((m2, p) => Math.min(m2, Math.hypot(p.x - x, p.y - y)), 1e9), sc = Math.min(d, 500) - Math.hypot(x - (Mr.x + Mr.w / 2), y - (Mr.y + Mr.h / 2)) * 0.2;
        if (sc > bs) { bs = sc; best = { x, y }; }
      }
      return best ? { x: +((best.x - Mr.x) / Mr.w).toFixed(4), y: +((best.y - Mr.y) / Mr.h).toFixed(4) } : { x: 0.5, y: 0.5 };
    }
    const shipList = () => (!D.show.ships ? [] : Array.isArray(D.ships) ? D.ships : opts.ships || autoShipList);

    let boxes = {}, selected = null;
    const isMovable = (k) => ['cartouche', 'legend', 'compass', 'scale'].includes(k) || /^(ship|text):/.test(k);
    function overlay() {
      if (!S) return;
      const F = FONTS[D.font] || FONTS.alegreya, inf = (opts.info || info)(S, D, M), P = projector();
      const cart = svgCartouche(Lr, D, F, inf), leg = svgLegend(Lr, D, F, M), comp = svgCompass(Lr, D, F), sc = svgScale(Lr, D, F, kmPerUnit());
      boxes = { cartouche: cart.box, legend: leg.box, compass: comp.box, scale: sc.box, panel: Lr.panel };
      M.insets.forEach((pl, i) => (boxes['inset:' + i] = { ...Lr.ins[i], key: pl.key }));
      let decor = '';
      shipList().forEach((sh, i) => { const r = shipSVG({ ...sh, px: Lr.M.x + sh.x * Lr.M.w, py: Lr.M.y + sh.y * Lr.M.h }, D); decor += r.svg; boxes['ship:' + i] = r.box; });
      (D.texts || []).forEach((tx, i) => { if (!tx.text) return; const r = svgText(tx, Lr, D, F); decor += r.svg; boxes['text:' + i] = r.box; });
      over.innerHTML = `<svg viewBox="0 0 ${Lr.W} ${f2(Lr.H)}" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="mhClipM"><rect x="${Lr.M.x}" y="${Lr.M.y}" width="${Lr.M.w}" height="${Lr.M.h}"/></clipPath></defs>${svgFrame(Lr, D, P)}${svgDegrees(Lr, D, F, P)}<g clip-path="url(#mhClipM)">${decor}</g>${svgInsets(Lr, D, F, M)}${svgPanel(Lr, D, F, M, S)}${cart.svg}${leg.svg}${comp.svg}${sc.svg}${svgAttribution(Lr, D, F, M)}</svg>`;
      if (opts.editable) hits();
      return cart.box;
    }
    function hits() {
      hitLayer.innerHTML = '';
      for (const k in boxes) {
        const b = boxes[k]; if (!b) continue;
        const d = document.createElement('div'); d.className = 'p-hit' + (k === selected ? ' sel' : '') + (isMovable(k) && opts.canMove !== false ? ' movable' : '');
        d.dataset.el = k; d.style.cssText = px({ x: b.x - 5, y: b.y - 5, w: b.w + 10, h: b.h + 10 });
        hitLayer.appendChild(d);
      }
      insets.forEach((x, i) => {
        const on = selected === 'inset:' + i;
        x.el.classList.toggle('p-inset-sel', on);
        if (on) { x.map.dragging.enable(); x.map.scrollWheelZoom.enable(); x.map.touchZoom.enable(); } else { x.map.dragging.disable(); x.map.scrollWheelZoom.disable(); x.map.touchZoom.disable(); }
      });
    }
    function select(el) { selected = el; if (opts.editable) hits(); if (opts.onSelect) opts.onSelect(el, el && boxes[el]); }
    // Ships placed automatically become an explicit list as soon as one of them is edited.
    function ensureShips() { if (!Array.isArray(D.ships)) D.ships = autoShipList.map((x) => ({ ...x })); return D.ships; }
    let drag = null;
    hitLayer.addEventListener('pointerdown', (e) => {
      const h = e.target.closest('.p-hit'); if (!h) return;
      const el = h.dataset.el; e.preventDefault();
      if (selected !== el) select(el);
      if (!isMovable(el) || opts.canMove === false) return;
      const b = boxes[el]; drag = { el, sx: e.clientX, sy: e.clientY, x: b.x, y: b.y, moved: false };
      if (el.startsWith('ship:')) { const sh = ensureShips()[+el.slice(5)]; drag.ox = sh.x; drag.oy = sh.y; }
      if (el.startsWith('text:')) { const tx = D.texts[+el.slice(5)]; drag.ox = tx.x ?? 0.5; drag.oy = tx.y ?? 0.5; }
      hitLayer.setPointerCapture(e.pointerId);
    });
    hitLayer.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.sx) / f, dy = (e.clientY - drag.sy) / f;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      const cl = (v) => +Math.max(0, Math.min(1, v)).toFixed(4);
      if (drag.el.startsWith('ship:')) { const sh = D.ships[+drag.el.slice(5)]; sh.x = cl(drag.ox + dx / Lr.M.w); sh.y = cl(drag.oy + dy / Lr.M.h); }
      else if (drag.el.startsWith('text:')) { const tx = D.texts[+drag.el.slice(5)]; tx.x = cl(drag.ox + dx / Lr.M.w); tx.y = cl(drag.oy + dy / Lr.M.h); }
      else {
        (D.pos ||= {})[drag.el] = { x: +((drag.x + dx - Lr.M.x) / Lr.M.w).toFixed(4), y: +((drag.y + dy - Lr.M.y) / Lr.M.h).toFixed(4) };
        if (drag.el === 'compass' && D.show.rhumbs) main.base.redraw();
      }
      overlay();
    });
    const endDrag = () => { if (drag && drag.moved && opts.onDesign) opts.onDesign('pos'); drag = null; };
    hitLayer.addEventListener('pointerup', endDrag); hitLayer.addEventListener('pointercancel', endDrag);
    hitLayer.addEventListener('dblclick', (e) => { const h = e.target.closest('.p-hit'); if (h && opts.onSelect) opts.onSelect(h.dataset.el, boxes[h.dataset.el], true); });

    function drawRoute(group, s, i) {
      const R = routeStrokes(s, D, f, i);
      for (const st of R.list) L.polyline(st.pts, { color: st.color, weight: st.w, opacity: st.alpha ?? 1, lineCap: 'round', lineJoin: 'round', dashArray: st.dash ? st.dash.join(' ') : null, interactive: false }).addTo(group);
      return R;
    }
    function arrowAt(pts, color) {
      if (!D.routes.arrows) return;
      const a = main.map.latLngToLayerPoint(pts[15]), b = main.map.latLngToLayerPoint(pts[17]), deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, z = 16 * f;
      L.marker(pts[16], { interactive: false, icon: L.divIcon({ className: 'p-arrow', iconSize: [z, z], iconAnchor: [z / 2, z / 2],
        html: `<svg width="${z}" height="${z}" viewBox="-8 -8 16 16" style="transform:rotate(${deg}deg)"><path d="M-6,-5 L7,0 L-6,5 L-3,0 Z" fill="${color}" stroke="${D.ink}" stroke-width=".8"/></svg>` }) }).addTo(main.group);
    }
    function markerIcon(pl) {
      const multi = pl.people.size > 1, R = markerR(D, multi) * f, parts = markerParts(D.markers.style, pl.color, multi, D), box = R * 3;
      const pin = D.markers.style === 'pin';
      const svg = `<svg width="${box}" height="${box}" viewBox="${-1.5} ${pin ? -2.9 : -1.5} 3 3" style="overflow:visible">${parts.map(([d, fill, stroke, sw]) => `<path d="${d}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${sw}"` : ''} stroke-linejoin="round"/>`).join('')}</svg>`;
      return L.divIcon({ className: 'p-mark', html: svg, iconSize: [box, box], iconAnchor: [box / 2, pin ? box * 0.97 : box / 2] });
    }
    // Label placement: the most important places first; each label tries eight spots around its marker and is
    // left out when none is free of other labels, markers, the cartouche, legend, compass, scale, ships and lettering.
    let measureCtx = null;
    function placeLabels() {
      const out = {}; if (!D || !D.show.labels || !M) return out;
      const F = FONTS[D.font] || FONTS.alegreya, fs = 15 * D.labelSize * f, st = D.labels.style, caps = st === 'caps';
      measureCtx ||= document.createElement('canvas').getContext('2d');
      measureCtx.font = `${st === 'italic' ? 'italic' : 'normal'} 400 ${fs}px ${F.text}`;
      const sz = main.map.getSize(), pad = D.labels.halo === 'box' ? 5 * f : 2 * f, gap = 4 * f, taken = [];
      const hit = (r) => taken.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
      for (const k of ['cartouche', 'legend', 'compass', 'scale']) { const b = boxes[k]; if (b) taken.push({ x: (b.x - Lr.M.x) * f, y: (b.y - Lr.M.y) * f, w: b.w * f, h: b.h * f }); }
      for (const k in boxes) if (/^(ship|text):/.test(k)) { const b = boxes[k]; taken.push({ x: (b.x - Lr.M.x) * f, y: (b.y - Lr.M.y) * f, w: b.w * f, h: b.h * f }); }
      const pts = M.all.map((pl) => ({ pl, p: main.map.latLngToContainerPoint([pl.e.lat, pl.e.lng]), R: markerR(D, pl.people.size > 1) * f }));
      pts.forEach(({ p, R }) => taken.push({ x: p.x - R, y: p.y - R, w: 2 * R, h: 2 * R }));
      const order = pts.slice().sort((a, b) => b.pl.list.length - a.pl.list.length || a.pl.n - b.pl.n);
      for (const { pl, p, R } of order) {
        let txt = (D.show.numbers ? pl.n + '. ' : '') + (pl.e.place || pl.e.query || ''); if (caps) txt = txt.toUpperCase();
        const w = measureCtx.measureText(txt).width * (caps ? 1.12 : 1) + 2 * pad, h = fs * 1.25, yo = D.markers.style === 'pin' ? -R * 1.6 : 0, d = R + gap;
        const cands = [
          { dir: 'right', dx: d, dy: yo, x: p.x + d, y: p.y + yo - h / 2 }, { dir: 'left', dx: -d, dy: yo, x: p.x - d - w, y: p.y + yo - h / 2 },
          { dir: 'right', dx: d * 0.7, dy: -d * 0.8 - h / 2, x: p.x + d * 0.7, y: p.y - d * 0.8 - h }, { dir: 'right', dx: d * 0.7, dy: d * 0.8 + h / 2, x: p.x + d * 0.7, y: p.y + d * 0.8 },
          { dir: 'left', dx: -d * 0.7, dy: -d * 0.8 - h / 2, x: p.x - d * 0.7 - w, y: p.y - d * 0.8 - h }, { dir: 'left', dx: -d * 0.7, dy: d * 0.8 + h / 2, x: p.x - d * 0.7 - w, y: p.y + d * 0.8 },
          { dir: 'top', dx: 0, dy: -d, x: p.x - w / 2, y: p.y - d - h }, { dir: 'bottom', dx: 0, dy: d, x: p.x - w / 2, y: p.y + d },
        ];
        let ok = null;
        for (const c of cands) { const r = { x: c.x, y: c.y, w, h }; if (r.x < 2 * f || r.y < 2 * f || r.x + w > sz.x - 2 * f || r.y + h > sz.y - 2 * f) continue; if (!hit(r)) { ok = c; taken.push(r); break; } }
        out[pl.key] = ok ? { ...ok, w, h, txt } : { hidden: true };
      }
      return out;
    }
    let labelled = [];
    function relabel() {
      const pos = placeLabels(), F = FONTS[D.font] || FONTS.alegreya;
      for (const { mk, pl } of labelled) {
        mk.unbindTooltip(); const q = pos[pl.key]; if (!q || q.hidden) continue;
        const dir = q.dir === 'top' || q.dir === 'bottom' ? q.dir : q.dir, off = q.dir === 'top' || q.dir === 'bottom' ? [0, q.dy] : [q.dx, q.dy];
        mk.bindTooltip((D.show.numbers ? pl.n + '. ' : '') + esc(pl.e.place || pl.e.query), { permanent: true, direction: dir, offset: off, className: `p-label ${D.labels.style} h-${D.labels.halo} d-${q.dir}` });
      }
      void F;
    }
    function vectors(animate, highlight) {
      timers.forEach(clearTimeout); timers = []; main.group.clearLayers(); labelled = [];
      const F = FONTS[D.font] || FONTS.alegreya, drawn = {};
      const marker = (pl) => {
        if (drawn[pl.key]) return; drawn[pl.key] = 1;
        const multi = pl.people.size > 1, ll = [pl.e.lat, pl.e.lng], R = markerR(D, multi) * f;
        const mk = L.marker(ll, { icon: markerIcon(pl), interactive: !!opts.onPlace, keyboard: false }).addTo(main.group);
        labelled.push({ mk, pl }); void R; if (D.show.labels) relabel();
        if (opts.onPlace) mk.on('click', () => opts.onPlace(pl));
      };
      const route = (s, i, anim) => {
        const layer = L.layerGroup().addTo(main.group), R = drawRoute(layer, s, i);
        const paths = []; layer.eachLayer((l) => l._path && paths.push(l));
        if (anim && paths.length && paths[0]._path.getTotalLength) {
          paths.forEach((l) => { const p = l._path, len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len; p.getBoundingClientRect(); p.style.transition = 'stroke-dashoffset .8s cubic-bezier(.6,0,.3,1)'; p.style.strokeDashoffset = 0; });
          timers.push(setTimeout(() => { paths.forEach((l) => { const p = l._path; p.style.transition = ''; p.style.strokeDashoffset = ''; p.style.strokeDasharray = l.options.dashArray || ''; }); arrowAt(R.pts, s.color); }, 850));
        } else arrowAt(R.pts, s.color);
      };
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!animate || reduced) { M.steps.forEach((s, i) => s.from && route(s, i, false)); M.steps.forEach((s) => marker(M.places[keyOf(s.e)])); }
      else M.steps.forEach((s, i) => timers.push(setTimeout(() => { if (s.from) { route(s, i, true); timers.push(setTimeout(() => marker(M.places[keyOf(s.e)]), 750)); } else marker(M.places[keyOf(s.e)]); }, i * (opts.stepMs || 520))));
      if (highlight && highlight.size) for (const e of M.events) if (highlight.has(e.id)) {
        const z = 46 * f, mk = L.marker([e.lat, e.lng], { interactive: false, icon: L.divIcon({ className: 'p-pulse', html: `<i style="border-color:${D.accent}"></i>`, iconSize: [z, z], iconAnchor: [z / 2, z / 2] }) }).addTo(main.group);
        timers.push(setTimeout(() => main.group.removeLayer(mk), 2300));
      }
      root.style.setProperty('--p-label-font', F.text); root.style.setProperty('--p-label-size', 15 * D.labelSize * f + 'px');
      root.style.setProperty('--p-ink', D.ink); root.style.setProperty('--p-halo', D.paper); root.style.setProperty('--p-f', f);
    }
    // The inset's own scale: zoom of a 170-unit window, whatever size the inset has on the poster.
    function insetZoom(x) { const r = Lr && Lr.ins[x.i]; return r ? x.map.getZoom() - Math.log2((f * r.w) / 170) : 0; }
    function insetStyle(x) {
      const z = insetZoom(x), st = { ...baseStyle(D, lz(x.map)), rhumbs: { on: false }, waves: { on: false }, grat: { on: false } };
      st.borders = { on: false }; // insets show the settlement, not countries
      if (z >= CityMap.MIN_Z) { st.rivers = { on: false }; st.tex = { type: 'none' }; st.water = { on: false }; }
      return st;
    }
    function insetCity(x) { const z = insetZoom(x), c = x.map.getCenter().wrap(); return { lat: c.lat, lng: c.lng, z }; }
    function insetContext(x) {
      const S2 = insetStyle(x), c = insetCity(x);
      const cfg = (x.place && (D.insetCfg || {})[x.place.key]) || {}, detail = Number.isFinite(cfg.d) ? cfg.d : D.insets.detail ?? 3;
      return { V: { f, lz: lz(x.map) }, S: S2, after: (g, V) => CityMap.draw(g, V, S2, CityMap.get(c.lat, c.lng, c.z), D.city, detail) };
    }
    function setupInsets() {
      while (insets.length > M.insets.length) { const x = insets.pop(); x.map.remove(); x.el.remove(); }
      while (insets.length < M.insets.length) {
        const el = document.createElement('div'); el.className = 'p-inset'; insetHost.appendChild(el);
        const x = { el, i: insets.length };
        Object.assign(x, makeMap(el, false, { silent: !!opts.exporting, context: () => (D ? insetContext(x) : null) }));
        insets.push(x);
        x.map.on('moveend', () => {
          if (x.applying || !opts.onDesign || selected !== 'inset:' + x.i) return;
          const pl = M.insets[x.i], r = Lr.ins[x.i]; if (!pl || !r) return;
          const c = x.map.getCenter().wrap();
          (D.insetCfg ||= {})[pl.key] = { ...(D.insetCfg[pl.key] || {}), lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), z: +(x.map.getZoom() - Math.log2((f * r.w) / 170)).toFixed(2) };
          opts.onDesign('inset');
        });
      }
      M.insets.forEach((pl, i) => {
        const x = insets[i], r = Lr.ins[i], cfg = (D.insetCfg || {})[pl.key] || {};
        x.i = i; x.el.style.cssText = px(r); x.el.style.borderRadius = D.insets.shape === 'circle' ? '50%' : '0';
        x.el.style.background = D.sea;
        x.map.invalidateSize(false);
        x.applying = true;
        x.map.setView([Number.isFinite(cfg.lat) ? cfg.lat : pl.e.lat, Number.isFinite(cfg.lng) ? cfg.lng : pl.e.lng], Math.min(16.5, Number.isFinite(cfg.z) ? cfg.z : D.insets.zoom) + Math.log2((f * r.w) / 170), { animate: false });
        x.applying = false;
        x.group.clearLayers(); x.place = pl;
        x.group.addLayer(L.marker([pl.e.lat, pl.e.lng], { icon: markerIcon({ ...pl, people: new Set([1]) }), interactive: false }));
        x.base.redraw();
      });
    }
    function fit() {
      const pts = M.events.map((e) => [e.lat, e.lng]); if (!pts.length) { main.map.setView([50, 30], 3 + Math.log2(f)); return; }
      const tl = [(D.show.cartouche ? 60 : 50) * f, (D.show.cartouche ? 170 : 50) * f], br = [(D.show.compass ? 150 : 50) * f, (D.show.legend ? 90 : 50) * f];
      if (pts.length === 1) main.map.setView(pts[0], 6 + Math.log2(f), { animate: false });
      else main.map.fitBounds(pts, { paddingTopLeft: tl, paddingBottomRight: br, maxZoom: 8 + Math.log2(f), animate: false });
    }
    function applyView() {
      applying = true;
      if (D.view && Number.isFinite(D.view.lat)) main.map.setView([D.view.lat, D.view.lng], D.view.z + Math.log2(f), { animate: false });
      else fit();
      applying = false;
    }
    function paperFx() {
      tex.style.display = D.show.texture ? '' : 'none';
      const w = Math.round(Lr.W * f), h = Math.round(Lr.H * f), key = [w, h, D.show.aging, JSON.stringify(D.aging)].join('|');
      if (key === ageKey) return; ageKey = key;
      age.style.display = D.show.aging ? '' : 'none';
      if (!D.show.aging || opts.exporting) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      age.width = w * dpr; age.height = h * dpr; age.style.width = w + 'px'; age.style.height = h + 'px';
      const g = age.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      Basemap.aging(g, w, h, f, D.aging);
    }
    function render(state, d, o = {}) {
      S = state; D = design(d, state.mode); M = model(state, D); Lr = layout(D, M);
      size(o.width); mapEl.style.cssText = px(Lr.M); mapEl.style.background = D.sea;
      vig.style.cssText = px(Lr.M) + (D.show.vignette ? `;box-shadow:inset 0 0 ${70 * f}px ${10 * f}px ${D.vignette}` : ';display:none');
      root.style.background = D.paper;
      main.map.invalidateSize(false);
      if (o.keepView !== true || !fitted) { applyView(); fitted = true; }
      main.base.redraw();
      overlay(); // boxes first, so ships avoid the cartouche and the legend
      if (D.show.ships && !Array.isArray(D.ships)) computeAutoShips();
      vectors(o.animate, o.highlight); setupInsets(); overlay(); paperFx();
    }
    main.map.on('moveend', () => {
      if (!S) return; overlay(); if (D.show.labels && labelled.length) relabel();
      if (!applying && opts.onView) { const c = main.map.getCenter().wrap(); opts.onView({ lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), z: +(main.map.getZoom() - Math.log2(f)).toFixed(3) }); }
    });
    main.map.on('zoomend', () => S && vectors(false));
    main.map.on('click', () => { if (opts.editable && selected) select(null); });

    function pick(cb) {
      mapEl.classList.add('p-picking');
      const done = (e) => { mapEl.classList.remove('p-picking'); cb(e ? e.latlng.wrap() : null); };
      main.map.once('click', done);
      return () => { main.map.off('click', done); mapEl.classList.remove('p-picking'); };
    }
    function preview(lat, lng) {
      main.temp.clearLayers(); if (!Number.isFinite(lat)) return;
      const z = 36 * f; L.marker([lat, lng], { interactive: false, icon: L.divIcon({ className: 'p-target', html: '<i></i>', iconSize: [z, z], iconAnchor: [z / 2, z / 2] }) }).addTo(main.temp);
      if (!main.map.getBounds().pad(-0.1).contains([lat, lng])) main.map.setView([lat, lng], Math.max(main.map.getZoom(), 5 + Math.log2(f)));
    }
    function resize() { if (S) render(S, D, { keepView: true, width: undefined }); }
    // Everything the export needs: geo data for every visible view and the relief images.
    async function ready() {
      const jobs = [];
      const one = (mm, st) => { const V = { ...mm.base.view(), f }; jobs.push(Basemap.ensure(V, st)); };
      one(main, baseStyle(D, lz(main.map)));
      insets.forEach((x) => { one(x, insetStyle(x)); const c = insetCity(x); jobs.push(CityMap.ensure(c.lat, c.lng, c.z)); });
      await Promise.all(jobs);
    }
    return {
      root, map: main.map, render, resize, pick, preview, ready, overlay, select, ensureShips, seaSpot,
      setCanMove(v) { opts.canMove = v; if (opts.editable && S) hits(); },
      get selected() { return selected; }, get boxes() { return boxes; }, get design() { return D; }, get model() { return M; }, get layout() { return Lr; }, get f() { return f; },
      get ships() { return shipList().map((x) => ({ ...x })); },
      currentView: () => { const c = main.map.getCenter().wrap(); return { lat: c.lat, lng: c.lng, z: main.map.getZoom() - Math.log2(f) }; },
      destroy() { timers.forEach(clearTimeout); insets.forEach((x) => x.map.remove()); main.map.remove(); root.remove(); },
      _parts: () => ({ main, insets, mapEl, over, f, Lr, D, M, S, rhumbCenters, lz, insetContext, placeLabels }),
    };
  }

  // ---------- PNG export ----------
  let fontCSS = null;
  async function embeddedFonts() {
    if (fontCSS) return fontCSS;
    fontCSS = (async () => {
      try {
        let css = await (await fetch(FONT_CSS)).text();
        const urls = [...new Set((css.match(/url\(([^)]+)\)/g) || []).map((u) => u.slice(4, -1).replace(/["']/g, '')))];
        await Promise.all(urls.map(async (u) => {
          const b = await (await fetch(u)).blob();
          const d = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
          css = css.split(u).join(d);
        }));
        return css.replace(/\/\*[^*]*\*\//g, '');
      } catch { return ''; }
    })();
    return fontCSS;
  }
  // Canvas versions of routes, markers and labels (the screen uses Leaflet for these).
  function drawVectors(c, P) {
    const { main, D, M, f } = P, F = FONTS[D.font] || FONTS.alegreya, pt = (ll) => main.map.latLngToContainerPoint(ll);
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    M.steps.forEach((s, i) => {
      if (!s.from) return;
      const R = routeStrokes(s, D, f, i);
      for (const st of R.list) {
        const pts = st.pts.map(pt);
        c.setLineDash(st.dash || []); c.strokeStyle = st.color; c.globalAlpha = st.alpha ?? 1; c.lineWidth = st.w;
        c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
      }
      c.globalAlpha = 1; c.setLineDash([]);
      if (D.routes.arrows) {
        const pts = R.pts.map(pt), a = pts[15], b = pts[17], m = pts[16]; c.save(); c.translate(m.x, m.y); c.rotate(Math.atan2(b.y - a.y, b.x - a.x)); c.scale(f, f);
        c.beginPath(); c.moveTo(-6, -5); c.lineTo(7, 0); c.lineTo(-6, 5); c.lineTo(-3, 0); c.closePath(); c.fillStyle = s.color; c.fill(); c.strokeStyle = D.ink; c.lineWidth = 0.8; c.stroke(); c.restore();
      }
    });
    for (const pl of M.all) drawMarker(c, pt([pl.e.lat, pl.e.lng]), pl, D, f);
    if (D.show.labels) {
      const fs = 15 * D.labelSize * f, st = D.labels.style, caps = st === 'caps';
      c.font = `${st === 'italic' ? 'italic' : 'normal'} 400 ${fs}px ${F.text}`; c.textBaseline = 'middle';
      if ('letterSpacing' in c) c.letterSpacing = caps ? fs * 0.1 + 'px' : '0px';
      const pos = P.placeLabels(), pad = D.labels.halo === 'box' ? 5 * f : 2 * f;
      for (const pl of M.all) {
        const q = pos[pl.key]; if (!q || q.hidden) continue;
        const txt = q.txt, x = q.x + pad, y = q.y + q.h / 2;
        if (D.labels.halo === 'box') { const w = c.measureText(txt).width; c.fillStyle = D.paper; c.fillRect(x - 4 * f, y - fs * 0.62, w + 8 * f, fs * 1.24); c.strokeStyle = D.ink; c.lineWidth = f; c.strokeRect(x - 4 * f, y - fs * 0.62, w + 8 * f, fs * 1.24); }
        else if (D.labels.halo === 'halo') { c.lineWidth = 4 * f; c.strokeStyle = D.paper; c.lineJoin = 'round'; c.strokeText(txt, x, y); }
        c.fillStyle = D.ink; c.fillText(txt, x, y);
      }
      if ('letterSpacing' in c) c.letterSpacing = '0px';
    }
    c.restore();
  }
  function drawMarker(c, p, pl, D, f) {
    const multi = pl.people.size > 1, R = markerR(D, multi) * f;
    c.save(); c.translate(p.x, p.y); c.scale(R, R); c.lineJoin = 'round';
    for (const [d, fill, stroke, sw] of markerParts(D.markers.style, pl.color, multi, D)) { const pa = new Path2D(d); c.fillStyle = fill; c.fill(pa); if (stroke) { c.strokeStyle = stroke; c.lineWidth = sw; c.stroke(pa); } }
    c.restore();
  }
  // Largest canvas this browser can really draw (iOS Safari stops at about 16.7 megapixels).
  function canvasFits(w, h) {
    try { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (!g) return false;
      g.fillStyle = '#123456'; g.fillRect(w - 1, h - 1, 1, 1); const ok = g.getImageData(w - 1, h - 1, 1, 1).data[2] === 0x56; c.width = c.height = 1; return ok; } catch { return false; }
  }
  function fitWidth(width, ratio) {
    let w = width;
    for (let i = 0; i < 16 && !canvasFits(w, Math.round(w / ratio)); i++) w = Math.floor(w * 0.93);
    return w;
  }
  async function exportPNG(state, d, o = {}) {
    const wanted = o.width || 3200, ratio = RATIO[design(d, state.mode).format || 'landscape'];
    const width = fitWidth(wanted, ratio);
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;opacity:0;pointer-events:none;z-index:-1`;
    document.body.appendChild(host);
    const P = create(host, { interactive: false, width, info: o.info, exporting: true, ships: o.ships });
    try {
      P.render(state, { ...(d || {}), view: o.view || (d && d.view) || null }, { width });
      await (document.fonts && document.fonts.ready);
      await P.ready();
      if (o.onProgress) o.onProgress(0.3);
      const parts = P._parts(), { Lr, f, main } = parts, W = Math.round(Lr.W * f), H = Math.round(Lr.H * f), D = parts.D;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const c = cv.getContext('2d'); c.fillStyle = D.paper; c.fillRect(0, 0, W, H);
      const lzMain = parts.lz(main.map);
      c.save(); c.translate(Lr.M.x * f, Lr.M.y * f);
      Basemap.render(c, { ...main.base.view(), f, lz: lzMain, rhumbs: parts.rhumbCenters(), dpr: 1 }, baseStyle(D, lzMain));
      c.beginPath(); c.rect(0, 0, Lr.M.w * f, Lr.M.h * f); c.clip(); drawVectors(c, parts);
      c.restore();
      if (o.onProgress) o.onProgress(0.6);
      if (D.show.vignette) {
        const r = Lr.M, e = 90 * f, X = r.x * f, Y = r.y * f, RW = r.w * f, RH = r.h * f, col = D.vignette;
        const g = (x0, y0, x1, y1) => { const gr = c.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); return gr; };
        c.fillStyle = g(X, 0, X + e, 0); c.fillRect(X, Y, e, RH); c.fillStyle = g(X + RW, 0, X + RW - e, 0); c.fillRect(X + RW - e, Y, e, RH);
        c.fillStyle = g(0, Y, 0, Y + e); c.fillRect(X, Y, RW, e); c.fillStyle = g(0, Y + RH, 0, Y + RH - e); c.fillRect(X, Y + RH - e, RW, e);
      }
      parts.insets.forEach((x, i) => {
        const r = Lr.ins[i]; if (!r || !x.place) return;
        c.save(); c.beginPath();
        if (D.insets.shape === 'circle') c.arc((r.x + r.w / 2) * f, (r.y + r.h / 2) * f, (r.w / 2) * f, 0, 7); else c.rect(r.x * f, r.y * f, r.w * f, r.h * f);
        c.clip(); c.translate(r.x * f, r.y * f);
        const lzi = parts.lz(x.map), ic = parts.insetContext(x), V2 = { ...x.base.view(), f, lz: lzi, dpr: 1 };
        Basemap.render(c, V2, ic.S); ic.after(c, V2);
        drawMarker(c, x.map.latLngToContainerPoint([x.place.e.lat, x.place.e.lng]), { ...x.place, people: new Set([1]) }, D, f);
        c.restore();
      });
      const css = await embeddedFonts();
      const svg = parts.over.innerHTML.replace('<svg ', `<svg width="${W}" height="${H}" `).replace(/(<svg[^>]*>)/, `$1<style>${css}</style>`);
      await new Promise((res) => { const img = new Image(); img.onload = () => { c.drawImage(img, 0, 0, W, H); res(); }; img.onerror = () => { console.warn('overlay svg failed'); res(); }; img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); });
      if (D.show.texture) await new Promise((res) => { const img = new Image(); img.onload = () => { c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.5; c.fillStyle = c.createPattern(img, 'repeat'); c.fillRect(0, 0, W, H); c.restore(); res(); }; img.onerror = res; img.src = NOISE_URL; });
      if (D.show.aging) Basemap.aging(c, W, H, f, D.aging);
      if (o.onProgress) o.onProgress(0.9);
      const type = o.type || 'image/png';
      const blob = await new Promise((r) => cv.toBlob(r, type, 0.95));
      return { blob, width: W, height: H, reduced: width < wanted };
    } finally { P.destroy(); host.remove(); }
  }

  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const slug = (s) => (s || 'family-map').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'family-map';
  // Small swatches for style pickers.
  const swatch = (name) => { const p = preset(name); return `linear-gradient(90deg,${p.paper} 0 22%,${p.sea} 22% 48%,${p.land} 48% 72%,${p.palette[0]} 72% 84%,${p.accent} 84%)`; };

  window.Poster = { info, create, exportPNG, exportWidth, SIZES, design, preset, PRESETS, PRESET_KEYS, BASE, FONTS, SHIP_TYPES, model, colors, chrono, hasGeo, keyOf, esc, rel, years, span, download, slug, treeLayout, swatch, merge };
})();
