/* MapHeritage poster engine: Leaflet maps + SVG decoration + PNG export.
   All sizes are in "logical" units of a 1600-wide poster and scaled by f = pxWidth / 1600. */
(function () {
  const W0 = 1600;
  const RATIO = { landscape: 1600 / 1131, portrait: 1131 / 1600, square: 1 };
  const FONTS = {
    alegreya: { title: "'Alegreya SC', Georgia, serif", text: "'Alegreya', Georgia, serif", families: ['Alegreya SC', 'Alegreya'] },
    oldstandard: { title: "'Old Standard TT', Georgia, serif", text: "'Old Standard TT', Georgia, serif", families: ['Old Standard TT'] },
    garamond: { title: "'EB Garamond', Georgia, serif", text: "'EB Garamond', Georgia, serif", families: ['EB Garamond'] },
    jost: { title: "'Jost', 'Futura', Arial, sans-serif", text: "'Jost', 'Futura', Arial, sans-serif", families: ['Jost'] },
  };
  const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Alegreya+SC:wght@400;700&family=Alegreya:ital,wght@0,400;0,500;1,400&family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Jost:wght@400;500;600&display=swap';

  const BASE = {
    basemap: 'voyager', tint: '#D9BF8C', tintAmt: 0.55, sat: 0.35, bright: 1.02, contrast: 0.92,
    paper: '#EADFC4', ink: '#3A2A1A', accent: '#9B2F1F', frameColor: '#3A2A1A',
    palette: ['#A8331F', '#1F4A6E', '#4E7A45', '#B98A2E', '#6E2F4F', '#3C4A8C', '#7A5230', '#2F6E6A'],
    font: 'alegreya', labelSize: 1, format: 'landscape',
    routes: { style: 'dashed', width: 2.6, curve: 0.2, arrows: true },
    show: { frame: true, cartouche: true, legend: true, compass: true, scale: true, graticule: true, texture: true, vignette: true, insets: true, labels: true, numbers: false },
    panel: 'auto', insets: { max: 8, shape: 'circle', zoom: 11, pick: null }, subtitle: '', view: null,
  };
  const PRESETS = {
    discovery: {},
    admiralty: { basemap: 'light', tint: '#BCD2DA', tintAmt: 0.45, sat: 1, bright: 1, contrast: 1.06, paper: '#F3F0E6', ink: '#1D2A33', accent: '#7A1E1E', frameColor: '#1D2A33',
      palette: ['#B22A1E', '#1B3F8F', '#2C6E49', '#C08A1E', '#6A2C70', '#1F7A8C', '#8A4F2A', '#333333'], font: 'oldstandard', routes: { style: 'solid', width: 2.4, curve: 0.16, arrows: true }, show: { vignette: false } },
    night: { basemap: 'dark', tint: '#2A3B52', tintAmt: 0.35, sat: 0.6, bright: 1.15, contrast: 1, paper: '#141A22', ink: '#E9D9AE', accent: '#D4A64A', frameColor: '#D4A64A',
      palette: ['#E8674A', '#6FA8DC', '#8BC48A', '#E6C15A', '#C58BC8', '#5FC2C2', '#E0A36E', '#DDDDDD'], font: 'garamond', show: { texture: false } },
    atlas: { basemap: 'light', tint: '#FFFFFF', tintAmt: 0, sat: 0, bright: 1.03, contrast: 1.08, paper: '#FFFFFF', ink: '#000000', accent: '#E0301E', frameColor: '#000000',
      palette: ['#E0301E', '#1F3FBF', '#F2B705', '#00875A', '#F26B1D', '#6B3FA0', '#0097B2', '#000000'], font: 'jost', routes: { style: 'solid', width: 4, curve: 0.14, arrows: true }, show: { texture: false, vignette: false, graticule: false } },
  };
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  function merge(a, b) { const o = { ...a }; for (const k in b || {}) o[k] = isObj(b[k]) && isObj(a[k]) ? merge(a[k], b[k]) : b[k]; return o; }
  function preset(name) { return merge(merge(BASE, PRESETS[name] || {}), { preset: name }); }
  function design(d, mode) {
    const base = preset((d && d.preset) || 'discovery');
    if (mode === 'journey') base.show.numbers = true;
    return merge(base, d || {});
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hasGeo = (e) => Number.isFinite(e.lat) && Number.isFinite(e.lng);
  const keyOf = (e) => e.lat.toFixed(2) + ',' + e.lng.toFixed(2);
  const t = (k, v) => (window.I18N ? I18N.t(k, v) : k);
  const rel = (r) => (/^(me|я|myself)$/i.test((r || '').trim()) ? '' : r || '');
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
  function years(events) { const y = events.map((e) => e.year).filter(Boolean); return y.length ? [Math.min(...y), Math.max(...y)] : null; }
  const span = (y) => (y ? (y[0] === y[1] ? String(y[0]) : y[0] + '–' + y[1]) : '');
  const dash = (style, w) => (style === 'dashed' ? `${w * 3.2} ${w * 2.2}` : style === 'dotted' ? `0.1 ${w * 2.4}` : null);

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
      else insets = all.slice().sort((a, b) => b.list.length - a.list.length).slice(0, ds.insets.max);
      insets.sort((a, b) => a.n - b.n);
    }
    const mode = state.mode || 'family';
    let panel = ds.panel === 'auto' ? (mode === 'tree' ? 'tree' : mode === 'journey' ? 'chronicle' : 'none') : ds.panel;
    if (panel === 'tree' && !(state.people || []).some((p) => p.parents && p.parents.length)) panel = 'none';
    if (panel === 'chronicle' && !events.length) panel = 'none';
    return { col, names, byId, events, places, all, steps, insets, panel, mode };
  }

  // Rectangles in logical units.
  function layout(ds, m) {
    const W = W0, H = W0 / RATIO[ds.format || 'landscape'], pad = 40;
    const outer = { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };
    const band = ds.show.frame ? 14 : 0;
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
      if (ds.format === 'landscape') { const pw = Math.round(M.w * 0.3); panel = { x: M.x + M.w - pw, y: M.y, w: pw, h: M.h }; M.w -= pw + 16; }
      else { const ph = Math.round(M.h * 0.32); panel = { x: M.x, y: M.y + M.h - ph, w: M.w, h: ph }; M.h -= ph + 16; }
    }
    return { W, H, outer, band, C, M, strip, panel, ins };
  }

  // Text measurement in logical units with loaded web fonts.
  const mctx = document.createElement('canvas').getContext('2d');
  function tw(text, size, family, style = '', weight = 400) { mctx.font = `${style} ${weight} ${size}px ${family}`; return mctx.measureText(text).width; }
  function fitText(text, size, family, maxW, style, weight) {
    let s = String(text || ''); if (tw(s, size, family, style, weight) <= maxW) return s;
    while (s.length > 1 && tw(s + '…', size, family, style, weight) > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  // ---------- SVG decoration ----------
  function svgFrame(L, ds) {
    if (!ds.show.frame) return '';
    const o = L.outer, b = L.band, c = ds.frameColor, i = { x: o.x + b, y: o.y + b, w: o.w - 2 * b, h: o.h - 2 * b };
    let s = `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="none" stroke="${c}" stroke-width="2.2"/>`;
    s += `<rect x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" fill="none" stroke="${c}" stroke-width="1"/>`;
    const seg = 40, half = b / 2;
    const run = (x1, y1, x2, y2) => { const len = Math.hypot(x2 - x1, y2 - y1), n = Math.floor(len / seg); for (let k = 0; k < n; k += 2) { const a = k / n, z = (k + 1) / n; s += `<line x1="${x1 + (x2 - x1) * a}" y1="${y1 + (y2 - y1) * a}" x2="${x1 + (x2 - x1) * z}" y2="${y1 + (y2 - y1) * z}" stroke="${c}" stroke-width="${half}"/>`; } };
    run(o.x + b, o.y + half / 2 + b / 4, o.x + o.w - b, o.y + half / 2 + b / 4);
    run(o.x + b, o.y + o.h - b / 2 + 0, o.x + o.w - b, o.y + o.h - b / 2);
    run(o.x + b / 2, o.y + b, o.x + b / 2, o.y + o.h - b);
    run(o.x + o.w - b / 2, o.y + b, o.x + o.w - b / 2, o.y + o.h - b);
    s += `<rect x="${L.M.x}" y="${L.M.y}" width="${L.M.w}" height="${L.M.h}" fill="none" stroke="${c}" stroke-width="1.4"/>`;
    return s;
  }
  function svgCartouche(L, ds, F, info) {
    if (!ds.show.cartouche) return { svg: '', box: null };
    const title = info.title || t('familyMap'), sub = info.subtitle || '';
    const ts = 40, ss = 18, maxW = Math.min(L.M.w * 0.62, 640);
    const t1 = fitText(title, ts, F.title, maxW - 60, '', 700), s1 = fitText(sub, ss, F.text, maxW - 60, 'italic');
    const w = Math.max(tw(t1, ts, F.title, '', 700), tw(s1, ss, F.text, 'italic'), 180) + 64, h = sub ? 118 : 84;
    const x = L.M.x + 24, y = L.M.y + 24, c = ds.ink, a = ds.accent, cx = x + w / 2;
    const dia = (px, py) => `<path d="M${px} ${py - 5} L${px + 5} ${py} L${px} ${py + 5} L${px - 5} ${py} Z" fill="${a}"/>`;
    const svg = `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${ds.paper}" fill-opacity=".93" stroke="${c}" stroke-width="2"/>
      <rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${h - 12}" fill="none" stroke="${c}" stroke-width=".8"/>
      ${dia(x + 6, y + 6)}${dia(x + w - 6, y + 6)}${dia(x + 6, y + h - 6)}${dia(x + w - 6, y + h - 6)}
      <text x="${cx}" y="${y + 56}" text-anchor="middle" font-family="${esc(F.title)}" font-weight="700" font-size="${ts}" fill="${c}">${esc(t1)}</text>
      ${sub ? `<line x1="${cx - 70}" y1="${y + 72}" x2="${cx - 12}" y2="${y + 72}" stroke="${a}" stroke-width="1"/>${dia(cx, y + 72)}<line x1="${cx + 12}" y1="${y + 72}" x2="${cx + 70}" y2="${y + 72}" stroke="${a}" stroke-width="1"/>
      <text x="${cx}" y="${y + 98}" text-anchor="middle" font-family="${esc(F.text)}" font-style="italic" font-size="${ss}" fill="${c}">${esc(s1)}</text>` : ''}</g>`;
    return { svg, box: { x, y, w, h } };
  }
  function svgLegend(L, ds, F, m) {
    if (!ds.show.legend) return '';
    const used = [...new Set(m.events.map((e) => e.personId))].filter((id) => m.byId[id]);
    if (used.length < 1 || m.panel === 'tree') return '';
    const list = used.slice(0, 10), more = used.length - list.length, fs = 15, lh = 24;
    const rows = list.map((id) => { const p = m.byId[id], y = years(m.events.filter((e) => e.personId === id)); return { id, text: p.name + (rel(p.relation) ? ', ' + rel(p.relation) : ''), yrs: span(y) }; });
    const w = Math.min(360, Math.max(...rows.map((r) => tw(r.text, fs, F.text) + tw(r.yrs, 13, F.text, 'italic') + 20), 120) + 70);
    const h = 44 + rows.length * lh + (more ? lh : 0);
    const x = L.M.x + 24, y = L.M.y + L.M.h - h - 24, dA = dash(ds.routes.style, 2.2);
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${ds.paper}" fill-opacity=".93" stroke="${ds.ink}" stroke-width="1.4"/>
      <text x="${x + 14}" y="${y + 26}" font-family="${esc(F.title)}" font-weight="700" font-size="16" fill="${ds.ink}">${esc(t('p.legend'))}</text>`;
    rows.forEach((r, i) => {
      const yy = y + 50 + i * lh;
      s += `<line x1="${x + 14}" y1="${yy - 5}" x2="${x + 44}" y2="${yy - 5}" stroke="${m.col[r.id]}" stroke-width="3" ${dA ? `stroke-dasharray="${dA}"` : ''} stroke-linecap="round"/>
        <text x="${x + 54}" y="${yy}" font-family="${esc(F.text)}" font-size="${fs}" fill="${ds.ink}">${esc(fitText(r.text, fs, F.text, w - 130))} <tspan font-style="italic" font-size="13" fill-opacity=".75">${esc(r.yrs)}</tspan></text>`;
    });
    if (more) s += `<text x="${x + 54}" y="${y + 50 + rows.length * lh}" font-family="${esc(F.text)}" font-style="italic" font-size="14" fill="${ds.ink}">${esc(t('p.more', { n: more }))}</text>`;
    return s;
  }
  function svgCompass(L, ds, F) {
    if (!ds.show.compass) return '';
    const r = 54, cx = L.M.x + L.M.w - r - 30, cy = L.M.y + r + 44, c = ds.ink, a = ds.accent;
    let s = `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${r - 6}" fill="none" stroke="${c}" stroke-width=".6"/>`;
    for (let i = 0; i < 32; i++) { const an = (i / 32) * Math.PI * 2, r1 = r - 6, r2 = i % 4 ? r - 2 : r + 4; s += `<line x1="${cx + Math.sin(an) * r1}" y1="${cy - Math.cos(an) * r1}" x2="${cx + Math.sin(an) * r2}" y2="${cy - Math.cos(an) * r2}" stroke="${c}" stroke-width=".7"/>`; }
    const pt = (an, len, wid, fillL, fillR) => {
      const tip = [cx + Math.sin(an) * len, cy - Math.cos(an) * len], l = [cx + Math.sin(an - Math.PI / 2) * wid, cy - Math.cos(an - Math.PI / 2) * wid], rr = [cx + Math.sin(an + Math.PI / 2) * wid, cy - Math.cos(an + Math.PI / 2) * wid];
      return `<path d="M${cx} ${cy} L${l} L${tip} Z" fill="${fillL}" stroke="${c}" stroke-width=".7"/><path d="M${cx} ${cy} L${rr} L${tip} Z" fill="${fillR}" stroke="${c}" stroke-width=".7"/>`;
    };
    for (let i = 0; i < 4; i++) s += pt(Math.PI / 4 + (i * Math.PI) / 2, r * 0.62, 7, ds.paper, c);
    for (let i = 0; i < 4; i++) s += pt((i * Math.PI) / 2, r * 0.95, 10, i === 0 ? a : ds.paper, i === 0 ? a : c);
    s += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${ds.paper}" stroke="${c}"/><text x="${cx}" y="${cy - r - 10}" text-anchor="middle" font-family="${esc(F.title)}" font-weight="700" font-size="18" fill="${c}">N</text></g>`;
    return s;
  }
  function svgScale(L, ds, F, kmPerUnit) {
    if (!ds.show.scale || !kmPerUnit) return '';
    const target = 160 * kmPerUnit, p = 10 ** Math.floor(Math.log10(target)), nice = [1, 2, 5, 10].map((k) => k * p).filter((v) => v <= target).pop() || p;
    const len = nice / kmPerUnit, x = L.M.x + L.M.w - len - 34, y = L.M.y + L.M.h - 34, c = ds.ink;
    let s = `<g><rect x="${x - 10}" y="${y - 30}" width="${len + 24}" height="44" fill="${ds.paper}" fill-opacity=".85"/>`;
    for (let i = 0; i < 4; i++) s += `<rect x="${x + (i * len) / 4}" y="${y - 6}" width="${len / 4}" height="6" fill="${i % 2 ? ds.paper : c}" stroke="${c}" stroke-width=".8"/>`;
    s += `<text x="${x}" y="${y - 12}" font-family="${esc(F.text)}" font-size="12" fill="${c}">0</text><text x="${x + len}" y="${y - 12}" text-anchor="end" font-family="${esc(F.text)}" font-size="12" fill="${c}">${nice} ${esc(t('p.km'))}</text></g>`;
    return s;
  }
  function svgInsets(L, ds, F, m) {
    let s = '';
    m.insets.forEach((pl, i) => {
      const r = L.ins[i]; if (!r) return;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, c = ds.ink;
      if (ds.insets.shape === 'circle') s += `<circle cx="${cx}" cy="${cy}" r="${r.w / 2}" fill="none" stroke="${c}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${r.w / 2 + 5}" fill="none" stroke="${c}" stroke-width=".8"/>`;
      else s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="${c}" stroke-width="2"/><rect x="${r.x - 5}" y="${r.y - 5}" width="${r.w + 10}" height="${r.h + 10}" fill="none" stroke="${c}" stroke-width=".8"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="6" fill="${ds.paper}" stroke="${c}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="2.2" fill="${c}"/>`;
      const name = fitText(pl.e.place || pl.e.query, 17, F.title, r.w + 30, '', 700);
      s += `<text x="${cx}" y="${r.y + r.h + 26}" text-anchor="middle" font-family="${esc(F.title)}" font-weight="700" font-size="17" fill="${c}">${ds.show.numbers ? pl.n + '. ' : ''}${esc(name)}</text>`;
      const y = span(years(pl.list)), ppl = [...pl.people];
      const dots = ppl.slice(0, 6).map((id, k) => `<circle cx="${cx - ((Math.min(ppl.length, 6) - 1) * 9) / 2 + k * 9 - (y ? tw(y, 13, F.text, 'italic') / 2 + 10 : 0)}" cy="${r.y + r.h + 41}" r="3.3" fill="${m.col[id]}"/>`).join('');
      s += dots + `<text x="${cx + (ppl.length ? Math.min(ppl.length, 6) * 4.5 : 0)}" y="${r.y + r.h + 45}" text-anchor="middle" font-family="${esc(F.text)}" font-style="italic" font-size="13" fill="${c}">${esc(y)}</text>`;
    });
    return s;
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
    const title = m.panel === 'tree' ? t('p.tree') : t('p.chronicle');
    s += `<text x="${P.x + P.w / 2}" y="${P.y + 40}" text-anchor="middle" font-family="${esc(F.title)}" font-weight="700" font-size="22" fill="${c}">${esc(title)}</text>`;
    const top = P.y + 60, inner = { x: P.x + 16, y: top, w: P.w - 32, h: P.h - (top - P.y) - 16 };
    if (m.panel === 'chronicle') {
      const lh = 26, cap = Math.floor(inner.h / lh), list = m.events.slice(0, cap - (m.events.length > cap ? 1 : 0)), names = m.names;
      list.forEach((e, i) => {
        const y = inner.y + 16 + i * lh, pl = m.places[keyOf(e)];
        const lab = ds.show.numbers ? `${pl.n}.` : '';
        s += ds.show.numbers ? `<text x="${inner.x + 18}" y="${y}" text-anchor="end" font-family="${esc(F.title)}" font-weight="700" font-size="14" fill="${m.col[e.personId]}">${lab}</text>` : `<circle cx="${inner.x + 10}" cy="${y - 5}" r="4" fill="${m.col[e.personId]}"/>`;
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
    if (nw < 56) { // too wide: keep the direct line only
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
  function svgAttribution(L, ds, F) {
    return `<text x="${L.outer.x + L.outer.w}" y="${L.H - 14}" text-anchor="end" font-family="${esc(F.text)}" font-size="11" fill="${ds.ink}" fill-opacity=".6">MapHeritage · © OpenStreetMap contributors © CARTO</text>`;
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

  // ---------- Leaflet helpers ----------
  // Tint = an SVG colour-matrix filter (multiply by the tint), chained after saturate/brightness/contrast.
  // It colours every tile at once (no seams) and matches the export's pixel maths exactly.
  let filterSeq = 0;
  function tintFilter() {
    const id = 'mhTint' + ++filterSeq, ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
    svg.innerHTML = `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter>`;
    document.body.appendChild(svg);
    return { id, el: svg, m: svg.querySelector('feColorMatrix') };
  }
  const tileURL = (style) => `/api/tile/${style}/{z}/{x}/{y}.png`;
  function makeMap(el, interactive) {
    const map = L.map(el, {
      zoomControl: false, attributionControl: false, zoomSnap: 0, zoomDelta: 0.5, wheelPxPerZoomLevel: 140,
      dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive, touchZoom: interactive,
      boxZoom: false, keyboard: false, inertia: false, worldCopyJump: true, fadeAnimation: false, zoomAnimation: interactive, markerZoomAnimation: interactive,
    });
    map.setView([50, 30], 3);
    const base = L.tileLayer(tileURL('voyager'), { maxZoom: 18, keepBuffer: 1 }).addTo(map);
    const group = L.layerGroup().addTo(map), grat = L.layerGroup().addTo(map), temp = L.layerGroup().addTo(map);
    return { map, base, group, grat, temp, style: 'voyager', filter: tintFilter() };
  }
  function styleMap(mm, ds) {
    if (mm.style !== ds.basemap) { mm.base.setUrl(tileURL(ds.basemap)); mm.style = ds.basemap; }
    const a = ds.tintAmt, h = (i) => 1 - a + (a * parseInt(ds.tint.slice(i, i + 2), 16)) / 255;
    mm.filter.m.setAttribute('values', `${h(1)} 0 0 0 0 0 ${h(3)} 0 0 0 0 0 ${h(5)} 0 0 0 0 0 1 0`);
    const c = mm.base.getContainer(); if (c) c.style.filter = `saturate(${ds.sat}) brightness(${ds.bright}) contrast(${ds.contrast}) url(#${mm.filter.id})`;
  }

  function create(host, opts = {}) {
    const interactive = opts.interactive !== false;
    const root = document.createElement('div'); root.className = 'poster'; host.appendChild(root);
    const mapEl = document.createElement('div'); mapEl.className = 'p-map'; root.appendChild(mapEl);
    const vig = document.createElement('div'); vig.className = 'p-vig'; root.appendChild(vig);
    const insetHost = document.createElement('div'); root.appendChild(insetHost);
    const over = document.createElement('div'); over.className = 'p-over'; root.appendChild(over);
    const tex = document.createElement('div'); tex.className = 'p-tex'; tex.style.backgroundImage = `url("${NOISE_URL}")`; root.appendChild(tex);
    const main = makeMap(mapEl, interactive);
    let insets = [], S = null, D = null, M = null, Lr = null, f = 1, timers = [], applying = false, fitted = false;

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
    function overlay() {
      if (!S) return;
      const F = FONTS[D.font] || FONTS.alegreya, inf = (opts.info || info)(S, D, M);
      const cart = svgCartouche(Lr, D, F, inf);
      over.innerHTML = `<svg viewBox="0 0 ${Lr.W} ${Lr.H}" xmlns="http://www.w3.org/2000/svg">${svgFrame(Lr, D)}${svgInsets(Lr, D, F, M)}${svgPanel(Lr, D, F, M, S)}${cart.svg}${svgLegend(Lr, D, F, M)}${svgCompass(Lr, D, F)}${svgScale(Lr, D, F, kmPerUnit())}${svgAttribution(Lr, D, F)}</svg>`;
      return cart.box;
    }
    function graticule() {
      main.grat.clearLayers(); if (!D.show.graticule) return;
      const z = main.map.getZoom() - Math.log2(f), step = z < 3 ? 20 : z < 4 ? 10 : z < 5.2 ? 5 : z < 6.5 ? 2 : 1;
      const b = main.map.getBounds().pad(0.3), o = { color: D.ink, weight: 0.8 * f, opacity: 0.35, dashArray: `${2 * f} ${4 * f}`, interactive: false };
      for (let x = Math.floor(b.getWest() / step) * step; x <= b.getEast(); x += step) L.polyline([[Math.max(b.getSouth(), -85), x], [Math.min(b.getNorth(), 85), x]], o).addTo(main.grat);
      for (let y = Math.floor(b.getSouth() / step) * step; y <= b.getNorth(); y += step) if (Math.abs(y) <= 85) { const pts = []; for (let x = b.getWest(); x <= b.getEast(); x += step / 4) pts.push([y, x]); pts.push([y, b.getEast()]); L.polyline(pts, o).addTo(main.grat); }
    }
    function vectors(animate, highlight) {
      timers.forEach(clearTimeout); timers = []; main.group.clearLayers();
      const F = FONTS[D.font] || FONTS.alegreya, w = D.routes.width * f, drawn = {};
      const marker = (pl) => {
        if (drawn[pl.key]) return; drawn[pl.key] = 1;
        const multi = pl.people.size > 1, ll = [pl.e.lat, pl.e.lng];
        L.circleMarker(ll, { radius: (multi ? 8 : 6) * f, weight: 2 * f, color: D.ink, fillColor: D.paper, fillOpacity: 1, interactive: false }).addTo(main.group);
        const dot = L.circleMarker(ll, { radius: (multi ? 3.6 : 2.6) * f, weight: 0, fillColor: multi ? D.ink : pl.color, fillOpacity: 1 }).addTo(main.group);
        if (D.show.labels) dot.bindTooltip((D.show.numbers ? pl.n + '. ' : '') + esc(pl.e.place || pl.e.query), { permanent: true, direction: 'right', offset: [9 * f, 0], className: 'p-label' });
        if (opts.onPlace) dot.on('click', () => opts.onPlace(pl));
      };
      const route = (s, anim) => {
        const pts = arc([s.from.lat, s.from.lng], [s.e.lat, s.e.lng], D.routes.curve);
        const line = L.polyline(pts, { color: s.color, weight: w, opacity: 0.95, lineCap: 'round', dashArray: dash(D.routes.style, w), interactive: false }).addTo(main.group);
        const arrow = () => {
          if (!D.routes.arrows) return;
          const a = main.map.latLngToLayerPoint(pts[15]), b = main.map.latLngToLayerPoint(pts[17]), deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, z = 16 * f;
          L.marker(pts[16], { interactive: false, icon: L.divIcon({ className: 'p-arrow', iconSize: [z, z], iconAnchor: [z / 2, z / 2],
            html: `<svg width="${z}" height="${z}" viewBox="-8 -8 16 16" style="transform:rotate(${deg}deg)"><path d="M-6,-5 L7,0 L-6,5 L-3,0 Z" fill="${s.color}" stroke="${D.ink}" stroke-width=".8"/></svg>` }) }).addTo(main.group);
        };
        const p = line._path;
        if (anim && p && p.getTotalLength) {
          const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len; p.getBoundingClientRect();
          p.style.transition = 'stroke-dashoffset .8s cubic-bezier(.6,0,.3,1)'; p.style.strokeDashoffset = 0;
          timers.push(setTimeout(() => { p.style.transition = ''; p.style.strokeDashoffset = ''; p.style.strokeDasharray = dash(D.routes.style, w) || ''; arrow(); }, 850));
        } else arrow();
      };
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!animate || reduced) { M.steps.forEach((s) => s.from && route(s, false)); M.steps.forEach((s) => marker(M.places[keyOf(s.e)])); }
      else M.steps.forEach((s, i) => timers.push(setTimeout(() => { if (s.from) { route(s, true); timers.push(setTimeout(() => marker(M.places[keyOf(s.e)]), 750)); } else marker(M.places[keyOf(s.e)]); }, i * (opts.stepMs || 520))));
      if (highlight && highlight.size) for (const e of M.events) if (highlight.has(e.id)) {
        const z = 46 * f, mk = L.marker([e.lat, e.lng], { interactive: false, icon: L.divIcon({ className: 'p-pulse', html: `<i style="border-color:${D.accent}"></i>`, iconSize: [z, z], iconAnchor: [z / 2, z / 2] }) }).addTo(main.group);
        timers.push(setTimeout(() => main.group.removeLayer(mk), 2300));
      }
      root.style.setProperty('--p-label-font', F.text); root.style.setProperty('--p-label-size', 15 * D.labelSize * f + 'px');
      root.style.setProperty('--p-ink', D.ink); root.style.setProperty('--p-halo', D.paper);
    }
    function setupInsets() {
      while (insets.length > M.insets.length) { const x = insets.pop(); x.map.remove(); x.el.remove(); x.filter.el.remove(); }
      while (insets.length < M.insets.length) { const el = document.createElement('div'); el.className = 'p-inset'; insetHost.appendChild(el); insets.push({ el, ...makeMap(el, false) }); }
      M.insets.forEach((pl, i) => {
        const x = insets[i], r = Lr.ins[i];
        x.el.style.cssText = px(r); x.el.style.borderRadius = D.insets.shape === 'circle' ? '50%' : '0';
        x.map.invalidateSize(false); styleMap(x, D);
        x.map.setView([pl.e.lat, pl.e.lng], D.insets.zoom + Math.log2(f * r.w / 170), { animate: false });
      });
    }
    function fit() {
      const pts = M.events.map((e) => [e.lat, e.lng]); if (!pts.length) { main.map.setView([50, 30], 3 + Math.log2(f)); return; }
      const cb = { x: 0, y: 0, w: 0, h: 0 };
      const tl = [(D.show.cartouche ? 60 : 50) * f, (D.show.cartouche ? 170 : 50) * f], br = [(D.show.compass ? 150 : 50) * f, (D.show.legend ? 90 : 50) * f];
      if (pts.length === 1) main.map.setView(pts[0], 6 + Math.log2(f), { animate: false });
      else main.map.fitBounds(pts, { paddingTopLeft: tl, paddingBottomRight: br, maxZoom: 8 + Math.log2(f), animate: false });
      void cb;
    }
    function applyView() {
      applying = true;
      if (D.view && Number.isFinite(D.view.lat)) main.map.setView([D.view.lat, D.view.lng], D.view.z + Math.log2(f), { animate: false });
      else fit();
      applying = false;
    }
    function render(state, d, o = {}) {
      S = state; D = design(d, state.mode); M = model(state, D); Lr = layout(D, M);
      size(o.width); mapEl.style.cssText = px(Lr.M);
      vig.style.cssText = px(Lr.M) + (D.show.vignette ? `;box-shadow:inset 0 0 ${70 * f}px ${10 * f}px rgba(60,40,15,.35)` : ';display:none');
      root.style.background = D.paper; tex.style.display = D.show.texture ? '' : 'none';
      main.map.invalidateSize(false); styleMap(main, D);
      if (o.keepView !== true || !fitted) { applyView(); fitted = true; }
      graticule(); vectors(o.animate, o.highlight); setupInsets(); overlay();
    }
    main.map.on('moveend', () => {
      if (!S) return; graticule(); overlay();
      if (!applying && opts.onView) { const c = main.map.getCenter().wrap(); opts.onView({ lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), z: +(main.map.getZoom() - Math.log2(f)).toFixed(3) }); }
    });
    main.map.on('zoomend', () => S && vectors(false));

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
    function waitTiles(ms = 9000) {
      const layers = [main.base, ...insets.map((x) => x.base)];
      return Promise.race([
        Promise.all(layers.map((l) => new Promise((r) => { if (!l._loading) return setTimeout(r, 50); l.once('load', r); }))),
        new Promise((r) => setTimeout(r, ms)),
      ]).then(() => new Promise((r) => setTimeout(r, 200)));
    }
    return {
      root, map: main.map, render, resize, pick, preview, waitTiles, overlay, get design() { return D; }, get model() { return M; }, get layout() { return Lr; }, get f() { return f; },
      currentView: () => { const c = main.map.getCenter().wrap(); return { lat: c.lat, lng: c.lng, z: main.map.getZoom() - Math.log2(f) }; },
      destroy() { timers.forEach(clearTimeout); insets.forEach((x) => { x.map.remove(); x.filter.el.remove(); }); main.map.remove(); main.filter.el.remove(); root.remove(); },
      _parts: () => ({ main, insets, mapEl, over, f, Lr, D, M, S }),
    };
  }

  // ---------- PNG export ----------
  let fontCSS = null;
  async function embeddedFonts() {
    if (fontCSS) return fontCSS;
    fontCSS = (async () => {
      try {
        let css = await (await fetch(FONT_CSS)).text();
        const urls = [...new Set(css.match(/url\(([^)]+)\)/g).map((u) => u.slice(4, -1).replace(/["']/g, '')))];
        await Promise.all(urls.map(async (u) => {
          const b = await (await fetch(u)).blob();
          const d = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
          css = css.split(u).join(d);
        }));
        return css;
      } catch { return ''; }
    })();
    return fontCSS;
  }
  function processTiles(mm, mapEl, W, H) {
    const cv = document.createElement('canvas'); cv.width = Math.round(W); cv.height = Math.round(H);
    const c = cv.getContext('2d'), box = mapEl.getBoundingClientRect(), sx = W / box.width;
    mm.base.getContainer().querySelectorAll('img.leaflet-tile-loaded').forEach((img) => {
      const r = img.getBoundingClientRect(); c.drawImage(img, (r.left - box.left) * sx, (r.top - box.top) * sx, r.width * sx, r.height * sx);
    });
    return cv;
  }
  function colorize(cv, ds) {
    const c = cv.getContext('2d'); let im;
    try { im = c.getImageData(0, 0, cv.width, cv.height); } catch { return false; }
    const d = im.data, s = ds.sat, b = ds.bright, k = ds.contrast, a = ds.tintAmt;
    const tr = parseInt(ds.tint.slice(1, 3), 16) / 255, tg = parseInt(ds.tint.slice(3, 5), 16) / 255, tb = parseInt(ds.tint.slice(5, 7), 16) / 255;
    const mr = 1 - a + a * tr, mg = 1 - a + a * tg, mb = 1 - a + a * tb;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      let r = (0.213 + 0.787 * s) * R + (0.715 - 0.715 * s) * G + (0.072 - 0.072 * s) * B;
      let g = (0.213 - 0.213 * s) * R + (0.715 + 0.285 * s) * G + (0.072 - 0.072 * s) * B;
      let bl = (0.213 - 0.213 * s) * R + (0.715 - 0.715 * s) * G + (0.072 + 0.928 * s) * B;
      r = ((r * b - 127.5) * k + 127.5) * mr; g = ((g * b - 127.5) * k + 127.5) * mg; bl = ((bl * b - 127.5) * k + 127.5) * mb;
      d[i] = r; d[i + 1] = g; d[i + 2] = bl;
    }
    c.putImageData(im, 0, 0); return true;
  }
  function drawVectors(c, P, ox, oy) {
    const { main, D, M, f } = P, F = FONTS[D.font] || FONTS.alegreya, pt = (ll) => main.map.latLngToContainerPoint(ll);
    c.save(); c.translate(ox, oy); c.lineCap = 'round'; c.lineJoin = 'round';
    main.grat.eachLayer((l) => { const ls = l.getLatLngs(); c.beginPath(); ls.forEach((q, i) => { const p = pt(q); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }); c.strokeStyle = D.ink; c.globalAlpha = 0.35; c.lineWidth = 0.8 * f; c.setLineDash([2 * f, 4 * f]); c.stroke(); });
    c.globalAlpha = 1;
    const w = D.routes.width * f, dA = dash(D.routes.style, w);
    for (const s of M.steps) {
      if (!s.from) continue;
      const pts = arc([s.from.lat, s.from.lng], [s.e.lat, s.e.lng], D.routes.curve).map(pt);
      c.setLineDash(dA ? dA.split(' ').map(Number) : []); c.strokeStyle = s.color; c.globalAlpha = 0.95; c.lineWidth = w;
      c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke(); c.globalAlpha = 1; c.setLineDash([]);
      if (D.routes.arrows) {
        const a = pts[15], b = pts[17], m = pts[16], z = f; c.save(); c.translate(m.x, m.y); c.rotate(Math.atan2(b.y - a.y, b.x - a.x)); c.scale(z, z);
        c.beginPath(); c.moveTo(-6, -5); c.lineTo(7, 0); c.lineTo(-6, 5); c.lineTo(-3, 0); c.closePath(); c.fillStyle = s.color; c.fill(); c.strokeStyle = D.ink; c.lineWidth = 0.8; c.stroke(); c.restore();
      }
    }
    const fs = 15 * D.labelSize * f;
    for (const pl of M.all) {
      const p = pt([pl.e.lat, pl.e.lng]), multi = pl.people.size > 1;
      c.beginPath(); c.arc(p.x, p.y, (multi ? 8 : 6) * f, 0, 7); c.fillStyle = D.paper; c.fill(); c.strokeStyle = D.ink; c.lineWidth = 2 * f; c.stroke();
      c.beginPath(); c.arc(p.x, p.y, (multi ? 3.6 : 2.6) * f, 0, 7); c.fillStyle = multi ? D.ink : pl.color; c.fill();
    }
    if (D.show.labels) {
      c.font = `italic 400 ${fs}px ${F.text}`; c.textBaseline = 'middle';
      for (const pl of M.all) {
        const p = pt([pl.e.lat, pl.e.lng]), txt = (D.show.numbers ? pl.n + '. ' : '') + (pl.e.place || pl.e.query || '');
        c.lineWidth = 4 * f; c.strokeStyle = D.paper; c.lineJoin = 'round'; c.strokeText(txt, p.x + 13 * f, p.y); c.fillStyle = D.ink; c.fillText(txt, p.x + 13 * f, p.y);
      }
    }
    c.restore();
  }
  async function exportPNG(state, d, o = {}) {
    const width = o.width || 3200;
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;opacity:0;pointer-events:none;z-index:-1`;
    document.body.appendChild(host);
    const P = create(host, { interactive: false, width, info: o.info });
    P.render(state, { ...(d || {}), view: o.view || (d && d.view) || null }, { width });
    await (document.fonts && document.fonts.ready);
    await P.waitTiles();
    const parts = P._parts(), { Lr, f } = parts, W = Math.round(Lr.W * f), H = Math.round(Lr.H * f), D = parts.D;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'); c.fillStyle = D.paper; c.fillRect(0, 0, W, H);
    let ok = true;
    const put = (mm, el, r, round) => {
      const t2 = processTiles(mm, el, r.w * f, r.h * f); ok = colorize(t2, D) && ok;
      c.save(); c.beginPath(); if (round) c.arc((r.x + r.w / 2) * f, (r.y + r.h / 2) * f, (r.w / 2) * f, 0, 7); else c.rect(r.x * f, r.y * f, r.w * f, r.h * f); c.clip();
      if (ok) c.drawImage(t2, r.x * f, r.y * f); else { c.fillStyle = D.tint; c.fillRect(r.x * f, r.y * f, r.w * f, r.h * f); }
      c.restore();
    };
    put(parts.main, parts.mapEl, Lr.M, false);
    if (D.show.vignette) {
      const r = Lr.M, e = 90 * f, g = (x0, y0, x1, y1) => { const gr = c.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(60,40,15,.32)'); gr.addColorStop(1, 'rgba(60,40,15,0)'); return gr; };
      const X = r.x * f, Y = r.y * f, RW = r.w * f, RH = r.h * f;
      c.fillStyle = g(X, 0, X + e, 0); c.fillRect(X, Y, e, RH); c.fillStyle = g(X + RW, 0, X + RW - e, 0); c.fillRect(X + RW - e, Y, e, RH);
      c.fillStyle = g(0, Y, 0, Y + e); c.fillRect(X, Y, RW, e); c.fillStyle = g(0, Y + RH, 0, Y + RH - e); c.fillRect(X, Y + RH - e, RW, e);
    }
    c.save(); c.beginPath(); c.rect(Lr.M.x * f, Lr.M.y * f, Lr.M.w * f, Lr.M.h * f); c.clip(); drawVectors(c, parts, Lr.M.x * f, Lr.M.y * f); c.restore();
    parts.insets.forEach((x, i) => put(x, x.el, Lr.ins[i], D.insets.shape === 'circle'));
    const css = await embeddedFonts();
    const svg = parts.over.innerHTML.replace('<svg ', `<svg width="${W}" height="${H}" `).replace(/(<svg[^>]*>)/, `$1<style>${css}</style>`);
    await new Promise((res) => { const img = new Image(); img.onload = () => { c.drawImage(img, 0, 0, W, H); res(); }; img.onerror = () => { console.warn('overlay svg failed'); res(); }; img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); });
    if (D.show.texture) await new Promise((res) => { const img = new Image(); img.onload = () => { c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.5; c.fillStyle = c.createPattern(img, 'repeat'); c.fillRect(0, 0, W, H); c.restore(); res(); }; img.onerror = res; img.src = NOISE_URL; });
    P.destroy(); host.remove();
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    return { blob, tiles: ok };
  }

  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const slug = (s) => (s || 'family-map').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'family-map';

  window.Poster = { info, create, exportPNG, design, preset, PRESETS, BASE, FONTS, model, colors, chrono, hasGeo, keyOf, esc, rel, years, span, download, slug, treeLayout };
})();
