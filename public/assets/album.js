/* MapHeritage albums: one project shown as several pages — by generation, by family branch, by person, or pages put together by hand.
   design.album = { on, by: 'generation' | 'branch' | 'person' | 'manual', overview: bool, pages: [{ title, people: [ids] }] } */
(function () {
  const t = (k, v) => (window.I18N ? I18N.t(k, v) : k);
  const byId = (S) => new Map((S.people || []).map((p) => [p.id, p]));
  const withEvents = (S) => new Set((S.events || []).filter((e) => Number.isFinite(e.lat)).map((e) => e.personId));
  const yearsOf = (S, ids) => { const ys = (S.events || []).filter((e) => ids.has(e.personId) && Number.isFinite(e.year)).map((e) => e.year); return ys.length ? [Math.min(...ys), Math.max(...ys)] : null; };
  const span = (y) => (!y ? '' : y[0] === y[1] ? String(y[0]) : y[0] + '–' + y[1]);
  const names = (S, ids) => { const m = byId(S); return [...ids].map((id) => (m.get(id) || {}).name).filter(Boolean); };
  const short = (list) => (list.length <= 3 ? list.join(', ') : list.slice(0, 3).join(', ') + ' …');

  function children(S) { const c = new Map(); (S.people || []).forEach((p) => (p.parents || []).forEach((x) => { if (!c.has(x)) c.set(x, []); c.get(x).push(p.id); })); return c; }
  // Generation of each person relative to the root: parents +1, children −1, spouses the same.
  function generations(S) {
    const P = byId(S), ch = children(S), g = new Map(), root = P.has(S.rootId) ? S.rootId : (S.people[0] || {}).id;
    const visit = (start) => {
      const q = [start]; if (!g.has(start)) g.set(start, 0);
      while (q.length) {
        const id = q.shift(), p = P.get(id), v = g.get(id); if (!p) continue;
        const step = (x, d) => { if (P.has(x) && !g.has(x)) { g.set(x, v + d); q.push(x); } };
        (p.parents || []).forEach((x) => step(x, 1)); (ch.get(id) || []).forEach((x) => step(x, -1)); (p.spouses || []).forEach((x) => step(x, 0));
      }
    };
    if (root) visit(root);
    return g;
  }
  // Branches: one page for each of the root's parents (that line upwards, with its other children), and one for the root's own family.
  function branches(S) {
    const P = byId(S), ch = children(S), root = P.has(S.rootId) ? S.rootId : (S.people[0] || {}).id; if (!root) return [];
    const r = P.get(root), out = [], taken = new Set([root]);
    for (const par of r.parents || []) {
      const set = new Set(), q = [par];
      while (q.length) {
        const id = q.shift(); if (set.has(id) || id === root) continue; set.add(id);
        const p = P.get(id); if (!p) continue;
        (p.parents || []).forEach((x) => q.push(x));
        (p.spouses || []).forEach((x) => { if (!(r.parents || []).includes(x)) q.push(x); });
        (ch.get(id) || []).forEach((x) => { if (x === root || set.has(x)) return; if ((P.get(x).parents || []).some((y) => (r.parents || []).includes(y))) return; q.push(x); }); // the root's brothers and sisters go to the root's own page
      }
      set.forEach((x) => taken.add(x));
      out.push({ key: 'b-' + par, title: t('alb.line', { name: (P.get(par) || {}).name || '?' }), people: set });
    }
    const own = new Set([root]); (r.spouses || []).forEach((x) => own.add(x));
    const q = [root]; while (q.length) { const id = q.shift(); (ch.get(id) || []).forEach((x) => { if (!own.has(x)) { own.add(x); q.push(x); (P.get(x).spouses || []).forEach((s) => own.add(s)); } }); }
    (S.people || []).forEach((p) => { if ((p.parents || []).some((x) => (r.parents || []).includes(x)) && p.id !== root) own.add(p.id); }); // brothers and sisters
    out.push({ key: 'b-own', title: t('alb.own', { name: r.name || '?' }), people: own });
    const rest = new Set((S.people || []).map((p) => p.id).filter((id) => !taken.has(id) && !own.has(id)));
    if (rest.size) out.push({ key: 'b-rest', title: t('alb.others'), people: rest });
    return out;
  }

  // The pages of an album, each { key, title, subtitle, people:Set }. Pages without places are left out.
  function pages(S, A) {
    if (!S || !A || !A.on) return [];
    const has = withEvents(S), out = [];
    const push = (key, title, ids) => { const set = new Set([...ids].filter((x) => has.has(x))); if (!set.size) return; out.push({ key, title, subtitle: [span(yearsOf(S, set)), short(names(S, set))].filter(Boolean).join(' · '), people: set }); };
    if (A.overview !== false) push('all', t('alb.all'), (S.people || []).map((p) => p.id));
    const by = A.by || 'generation';
    if (by === 'manual') (A.pages || []).forEach((p, i) => push('m' + i, p.title || t('alb.page', { n: i + 1 }), p.people || []));
    else if (by === 'person') (S.people || []).forEach((p) => push('p-' + p.id, p.name, [p.id]));
    else if (by === 'branch') {
      const b = branches(S);
      if (b.length > 1) b.forEach((x) => push(x.key, x.title, x.people)); else (S.people || []).forEach((p) => push('p-' + p.id, p.name, [p.id]));
    } else {
      const g = generations(S), groups = new Map();
      (S.people || []).forEach((p) => { const v = g.has(p.id) ? g.get(p.id) : null; const k = v === null ? 'x' : v; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.id); });
      const keys = [...groups.keys()].filter((k) => k !== 'x').sort((a, b) => b - a);
      keys.forEach((k, i) => push('g' + k, t('alb.gen', { n: i + 1 }), groups.get(k)));
      if (groups.has('x')) push('gx', t('alb.others'), groups.get('x'));
    }
    return out;
  }
  // The project limited to one page: its people, their events, the tree links between them.
  function filter(S, page) {
    if (!page || page.key === 'all') return S;
    const ids = page.people, people = (S.people || []).filter((p) => ids.has(p.id)).map((p) => ({ ...p, parents: (p.parents || []).filter((x) => ids.has(x)), spouses: (p.spouses || []).filter((x) => ids.has(x)) }));
    return { ...S, people, events: (S.events || []).filter((e) => ids.has(e.personId)), rootId: ids.has(S.rootId) ? S.rootId : (people[0] || {}).id };
  }
  // Turn the automatic grouping into editable manual pages.
  function toManual(S, A) {
    return pages(S, { ...A, on: true, overview: false }).map((p) => ({ title: p.title, people: [...p.people] }));
  }

  // ---------- a small ZIP writer (stored, no compression: PNG and JPEG are compressed already) ----------
  const CRC = (() => { const tb = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; } return tb; })();
  const crc32 = (u) => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function zip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = new Uint8Array(await f.blob.arrayBuffer()), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    }
    const size = central.reduce((s, u) => s + u.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
  }

  window.Album = { pages, filter, toManual, zip, generations };
})();
