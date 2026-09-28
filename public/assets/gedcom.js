/* GEDCOM 5.5 / 5.5.1 / 7 reader for MapHeritage */
(function () {
  const TAGS = { BIRT: 'birth', CHR: 'birth', BAPM: 'birth', DEAT: 'death', BURI: 'death', CREM: 'death', RESI: 'move', EMIG: 'move', IMMI: 'move', NATU: 'move',
    EDUC: 'study', GRAD: 'study', OCCU: 'work', RETI: 'work', MILI: 'service', _MILI: 'service', EVEN: 'other', CENS: 'other', MARR: 'marriage', ADOP: 'childhood' };

  function decode(buf) {
    const u = new TextDecoder('utf-8').decode(buf);
    return (u.match(/\uFFFD/g) || []).length > 5 ? new TextDecoder('windows-1251').decode(buf) : u;
  }
  function tree(text) {
    const root = { children: [] }, stack = [root];
    for (const raw of text.split(/\r\n|\r|\n/)) {
      const m = raw.replace(/^\uFEFF/, '').match(/^\s*(\d+)\s+(@[^@]+@\s+)?(\S+)(?:\s(.*))?$/); if (!m) continue;
      const lvl = +m[1], node = { xref: m[2] ? m[2].trim() : null, tag: m[3].toUpperCase(), value: m[4] || '', children: [] };
      if (node.tag === 'CONC' || node.tag === 'CONT') { const p = stack[lvl]; if (p) p.value += (node.tag === 'CONT' ? '\n' : '') + node.value; continue; }
      stack.length = lvl + 1; (stack[lvl] || root).children.push(node); stack[lvl + 1] = node;
    }
    return root.children;
  }
  const kid = (n, tag) => n.children.find((c) => c.tag === tag);
  const kids = (n, tag) => n.children.filter((c) => c.tag === tag);
  function year(v) {
    if (!v) return null;
    const m = v.match(/(\d{3,4})(?!.*\d{3,4}.*(?:AND|TO))/i) || v.match(/(\d{3,4})/); const y = m ? +m[1] : null;
    return y && y > 500 && y < 2100 ? y : null;
  }
  function firstYear(v) { const m = (v || '').match(/(\d{3,4})/); const y = m ? +m[1] : null; return y && y > 500 && y < 2100 ? y : null; }
  function coord(v) { if (!v) return null; const m = v.trim().match(/^([NSEW])?\s*(-?[\d.]+)/i); if (!m) return null; let x = +m[2]; if (/[SW]/i.test(m[1] || '')) x = -x; return Number.isFinite(x) ? x : null; }
  function name(n) {
    const nm = kid(n, 'NAME'); if (!nm) return '?';
    const g = kid(nm, 'GIVN'), s = kid(nm, 'SURN');
    const raw = nm.value.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
    return raw || [g && g.value, s && s.value].filter(Boolean).join(' ') || '?';
  }
  function eventOf(n, type, personId, idx) {
    const d = kid(n, 'DATE'), pl = kid(n, 'PLAC'); if (!pl || !pl.value.trim()) return null;
    const map = kid(pl, 'MAP'), lat = map ? coord((kid(map, 'LATI') || {}).value) : null, lng = map ? coord((kid(map, 'LONG') || {}).value) : null;
    const parts = pl.value.split(',').map((x) => x.trim()).filter(Boolean);
    const ty = kid(n, 'TYPE'), note = [n.tag === 'OCCU' || n.tag === 'EDUC' ? n.value : '', ty ? ty.value : '', (kid(n, 'NOTE') || {}).value || ''].filter(Boolean).join('. ').slice(0, 200);
    return { id: 'g' + idx, personId, year: firstYear(d && d.value), when: d ? d.value.replace(/\b(ABT|ABOUT|EST|CAL)\b/gi, '~').replace(/\bBEF\b/gi, '<').replace(/\bAFT\b/gi, '>').trim() : '',
      type, place: parts[0] || pl.value, query: parts.join(', '), lat, lng, geo: lat != null && lng != null ? 'gedcom' : 'ai', note };
  }

  function parse(buf) {
    const nodes = tree(typeof buf === 'string' ? buf : decode(buf));
    const people = {}, fams = {}, events = []; let idx = 0;
    const pid = (x) => 'i' + x.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
    for (const n of nodes) {
      if (n.tag === 'INDI' && n.xref) {
        const id = pid(n.xref), sx = (kid(n, 'SEX') || {}).value;
        const p = { id, name: name(n), sex: sx === 'M' ? 'm' : sx === 'F' ? 'f' : '', born: null, died: null, parents: [], spouses: [], relation: '', branch: '', famc: kids(n, 'FAMC').map((x) => x.value), fams: kids(n, 'FAMS').map((x) => x.value) };
        for (const c of n.children) {
          const type = TAGS[c.tag]; if (!type || c.tag === 'MARR') continue;
          const d = kid(c, 'DATE'); if (c.tag === 'BIRT' && d) p.born = firstYear(d.value); if (c.tag === 'DEAT' && d) p.died = firstYear(d.value);
          const e = eventOf(c, type, id, idx++); if (e) events.push(e);
        }
        people[id] = p;
      } else if (n.tag === 'FAM' && n.xref) {
        fams[n.xref] = { husb: (kid(n, 'HUSB') || {}).value, wife: (kid(n, 'WIFE') || {}).value, chil: kids(n, 'CHIL').map((x) => x.value), marr: kids(n, 'MARR') };
      }
    }
    for (const x in fams) {
      const F = fams[x], h = F.husb && people[pid(F.husb)], w = F.wife && people[pid(F.wife)];
      if (h && w) { h.spouses.push(w.id); w.spouses.push(h.id); }
      for (const c of F.chil) { const ch = people[pid(c)]; if (!ch) continue; if (h) ch.parents.push(h.id); if (w) ch.parents.push(w.id); }
      for (const m of F.marr) for (const sp of [h, w]) if (sp) { const e = eventOf(m, 'marriage', sp.id, idx++); if (e) events.push(e); }
    }
    const list = Object.values(people).map(({ famc, fams: _f, ...p }) => ({ ...p, parents: [...new Set(p.parents)].slice(0, 2), spouses: [...new Set(p.spouses)] }));
    return { people: list, events };
  }

  const REL = {
    en: { m: { '-1': 'father', '-2': 'grandfather', 1: 'son', 2: 'grandson', sib: 'brother', unc: 'uncle', nep: 'nephew', sp: 'husband' }, f: { '-1': 'mother', '-2': 'grandmother', 1: 'daughter', 2: 'granddaughter', sib: 'sister', unc: 'aunt', nep: 'niece', sp: 'wife' }, great: 'great-', greatN: (n) => n + '×great-' },
    ru: { m: { '-1': 'отец', '-2': 'дед', 1: 'сын', 2: 'внук', sib: 'брат', unc: 'дядя', nep: 'племянник', sp: 'муж' }, f: { '-1': 'мать', '-2': 'бабушка', 1: 'дочь', 2: 'внучка', sib: 'сестра', unc: 'тётя', nep: 'племянница', sp: 'жена' }, great: 'пра', greatN: (n) => 'пра'.repeat(n) },
  };
  function relLabel(gen, sex, kind, lang) {
    const R = REL[lang] || REL.en, S = R[sex === 'f' ? 'f' : 'm'];
    if (kind === 'sib') return S.sib; if (kind === 'unc') return S.unc; if (kind === 'nep') return S.nep; if (kind === 'sp') return S.sp;
    if (kind !== 'line' || gen === 0) return '';
    const a = Math.abs(gen), dir = gen < 0 ? -1 : 1;
    if (a <= 2) return S[String(gen)];
    const base = S[String(2 * dir)];
    return lang === 'ru' ? R.greatN(a - 2) + base : (a === 3 ? R.great : R.greatN(a - 2)) + base;
  }

  // Select a part of the tree around the root. scope: direct | side | all
  function select(data, rootId, scope, lang, limit = 600) {
    const byId = Object.fromEntries(data.people.map((p) => [p.id, p]));
    const children = {}; data.people.forEach((p) => p.parents.forEach((q) => (children[q] ||= []).push(p.id)));
    const info = {};
    const mark = (id, gen, kind, branch) => { if (!byId[id] || info[id]) return false; info[id] = { gen, kind, branch }; return true; };
    mark(rootId, 0, 'line', 'direct');
    const up = [rootId]; while (up.length) { const id = up.shift(); for (const q of byId[id].parents) if (mark(q, info[id].gen - 1, 'line', 'direct')) up.push(q); }
    const down = [rootId]; while (down.length) { const id = down.shift(); for (const c of children[id] || []) if (mark(c, info[id].gen + 1, 'line', 'direct')) down.push(c); }
    for (const s of byId[rootId].spouses) mark(s, 0, 'sp', 'direct');
    if (scope !== 'direct') {
      const direct = Object.keys(info).filter((id) => info[id].branch === 'direct' && info[id].gen <= 0);
      for (const id of direct) for (const par of byId[id].parents) for (const sib of children[par] || []) {
        if (mark(sib, info[id].gen, info[id].gen === 0 ? 'sib' : info[id].gen === -1 ? 'unc' : 'side', 'side')) {
          for (const sp of byId[sib].spouses) mark(sp, info[id].gen, 'side', 'side');
          for (const nk of children[sib] || []) mark(nk, info[id].gen + 1, info[id].gen === 0 ? 'nep' : 'side', 'side');
        }
      }
    }
    if (scope === 'all') {
      const q = Object.keys(info);
      while (q.length) { const id = q.shift(), p = byId[id]; for (const x of [...p.parents, ...p.spouses, ...(children[id] || [])]) if (mark(x, info[id].gen + (p.parents.includes(x) ? -1 : children[id] && children[id].includes(x) ? 1 : 0), 'side', 'side')) q.push(x); }
    }
    let ids = Object.keys(info).sort((a, b) => (info[a].branch === 'direct' ? 0 : 1) - (info[b].branch === 'direct' ? 0 : 1) || Math.abs(info[a].gen) - Math.abs(info[b].gen));
    ids = ids.slice(0, limit); const keep = new Set(ids);
    const people = ids.map((id) => { const p = byId[id], I = info[id]; return { ...p, parents: p.parents.filter((x) => keep.has(x)), spouses: p.spouses.filter((x) => keep.has(x)), branch: I.branch, relation: relLabel(I.gen, p.sex, I.kind, lang) }; });
    const events = data.events.filter((e) => keep.has(e.personId));
    return { people, events, rootId };
  }

  window.Gedcom = { parse, select };
})();
