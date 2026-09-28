/* MapHeritage: create / edit / design / import */
(function () {
  const $ = (id) => document.getElementById(id);
  const { t, plural } = I18N, esc = Poster.esc;
  const TYPES = ['birth', 'childhood', 'study', 'work', 'service', 'war', 'evacuation', 'move', 'marriage', 'death', 'other'];
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const small = () => innerWidth <= 860;
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  let cur = null, busy = false, state = null, design = null, open = { ev: null, person: null }, draft = null, cancelPick = null, ged = null;

  const poster = Poster.create($('stage'), {
    onView: (v) => { if (!design) return; design.view = v; saveDesignSoon(); },
    onPlace: (pl) => { if ($('edit').offsetParent || small()) { setView('edit'); openEvent(pl.list[0]); } },
  });
  function fitWidth() {
    const st = $('stage'), r = { landscape: 1600 / 1131, portrait: 1131 / 1600, square: 1 }[design ? design.format : 'landscape'];
    return Math.max(280, Math.floor(Math.min(st.clientWidth - 32, (st.clientHeight - 32) * r)));
  }
  function paint(o = {}) { if (state) poster.render(state, design, { width: fitWidth(), keepView: o.keepView !== false, animate: o.animate, highlight: o.highlight }); }

  function toast(m) { const el = $('toast'); el.textContent = m; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2800); }
  async function api(path, body, method = 'POST') {
    let r;
    try { r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw Object.assign(new Error(t('err.network')), { code: 'network' }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const code = j.error || 'model_failed', msg = t('err.' + code); throw Object.assign(new Error(msg === 'err.' + code ? code : msg), { status: r.status, code }); }
    return j;
  }

  // ---------- views ----------
  function setView(v) {
    document.querySelector('.app').dataset.view = v;
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    if (v === 'edit') renderEdit(); if (v === 'design') renderDesign(); if (v === 'import') renderImport();
    if (v === 'map' || !small()) requestAnimationFrame(() => paint());
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  // ---------- maps list ----------
  const myMaps = () => store.get('mh:maps', []);
  function remember(m) {
    const list = myMaps().filter((x) => x.id !== m.id); list.unshift({ id: m.id, token: m.token, title: m.title || '' });
    store.set('mh:maps', list.slice(0, 40)); store.set('mh:current', m.id); renderMyMaps();
  }
  function renderMyMaps() {
    const list = myMaps(), sel = $('myMaps'); sel.hidden = list.length < 2;
    sel.innerHTML = list.map((m) => `<option value="${m.id}" ${cur && m.id === cur.id ? 'selected' : ''}>${esc(m.title || t('untitled'))}</option>`).join('');
  }

  function setState(next, o = {}) {
    const before = new Set(state ? state.events.map((e) => e.id) : []);
    state = next;
    if (!design || o.resetDesign) design = Poster.design(state.design, state.mode);
    if (document.activeElement !== $('title')) $('title').value = state.title || '';
    $('viewMap').href = '/m/' + cur.id;
    const hl = o.highlight ? new Set(state.events.filter((e) => !before.has(e.id)).map((e) => e.id)) : null;
    paint({ keepView: !o.fit, highlight: hl });
    const v = document.querySelector('.app').dataset.view;
    if (v === 'edit') renderEdit(); if (v === 'design') renderDesign();
  }

  // ---------- chat ----------
  function addMsg(role, text) { const d = document.createElement('div'); d.className = 'msg ' + role; d.textContent = text; $('log').appendChild(d); $('log').scrollTop = $('log').scrollHeight; }
  async function send(text) {
    if (busy || !text.trim() || !cur) return;
    busy = true; $('send').disabled = true; addMsg('me', text); $('input').value = ''; grow();
    const ty = document.createElement('div'); ty.className = 'typing'; ty.textContent = t('thinking'); $('log').appendChild(ty); $('log').scrollTop = $('log').scrollHeight;
    try {
      const r = await api(`/api/maps/${cur.id}/chat`, { token: cur.token, message: text });
      ty.remove(); addMsg('bot', r.reply);
      const hadGeo = state.events.some(Poster.hasGeo);
      setState(r.map, { highlight: true, fit: !design.view });
      remember({ ...cur, title: r.map.title });
    } catch (e) { ty.remove(); addMsg('err', e.message); $('input').value = text; grow(); }
    finally { busy = false; $('send').disabled = false; if (!small()) $('input').focus(); }
  }
  function grow() { const i = $('input'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight + 4, 160) + 'px'; }
  $('input').addEventListener('input', grow);
  $('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($('input').value); } });
  $('form').addEventListener('submit', (e) => { e.preventDefault(); send($('input').value); });

  function showStart() {
    setView('chat');
    $('start').hidden = false; $('log').hidden = true; $('form').hidden = true; $('hint').hidden = true;
    $('start').innerHTML = `<h2>${esc(t('start.title'))}</h2>
      ${['journey', 'family', 'tree'].map((m) => `<button class="mode" type="button" data-mode="${m}"><b>${esc(t('mode.' + m))}</b><span>${esc(t('s.' + m + '.p'))}</span></button>${m === 'tree' ? `<label><input type="checkbox" id="sideOpt"> ${esc(t('start.side'))}</label>` : ''}`).join('')}
      <button class="linkbtn" type="button" id="toImport">${esc(t('start.ged'))}</button>`;
  }
  function hideStart() { $('start').hidden = true; $('log').hidden = false; $('form').hidden = false; $('hint').hidden = false; }
  $('start').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'toImport') return setView('import');
    if (b.dataset.mode) createNew(b.dataset.mode, { side: !!($('sideOpt') && $('sideOpt').checked) });
  });

  // ---------- saving ----------
  async function saveState(msg) {
    try {
      const m = await api(`/api/maps/${cur.id}`, { token: cur.token, state: { title: state.title, people: state.people, events: state.events, rootId: state.rootId } }, 'PATCH');
      setState(m); remember({ ...cur, title: m.title }); if (msg) toast(msg);
    } catch (e) { toast(e.message); }
  }
  let dT = null;
  function saveDesignSoon() {
    clearTimeout(dT);
    dT = setTimeout(async () => { try { await api(`/api/maps/${cur.id}`, { token: cur.token, design }, 'PATCH'); } catch (e) { toast(e.message); } }, 700);
  }
  function designChanged(o = {}) { paint({ keepView: !o.refit }); saveDesignSoon(); }

  // ---------- edit ----------
  function personName(id) { const p = state.people.find((x) => x.id === id); return p ? p.name : ''; }
  function opts(list, sel, none) { return (none ? `<option value="">${esc(t('f.none'))}</option>` : '') + list.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join(''); }
  function renderEdit() {
    if (!state) return;
    const col = Poster.colors(state.people, design.palette);
    const evs = Poster.chrono(state.events.slice());
    if (draft && draft.kind === 'ev' && !state.events.some((e) => e.id === draft.id)) evs.unshift(draft);
    const ppl = state.people.slice();
    if (draft && draft.kind === 'person' && !ppl.some((p) => p.id === draft.id)) ppl.unshift(draft);
    const pRow = (p) => open.person === p.id ? `<li>${personForm()}</li>` : `<li><button class="row person" type="button" data-openp="${esc(p.id)}"><i style="background:${col[p.id] || '#999'}"></i><span><b>${esc(p.name)}</b>${p.id === state.rootId ? ` <span class="root">${esc(t('edit.root'))}</span>` : ''}<em>${esc([Poster.rel(p.relation), p.born || p.died ? `${p.born || '?'}–${p.died || ''}` : ''].filter(Boolean).join(', '))}</em></span></button></li>`;
    const eRow = (e) => open.ev === e.id ? `<li>${eventForm()}</li>` : `<li><button class="row" type="button" data-opene="${esc(e.id)}"><i style="background:${col[e.personId] || '#999'}"></i><b>${esc(e.when || '—')}</b><span>${esc(e.place || '…')}<em class="${Poster.hasGeo(e) ? '' : 'warn'}">${esc([personName(e.personId), e.type !== 'other' ? t('type.' + e.type) : ''].filter(Boolean).join(', '))}${Poster.hasGeo(e) ? '' : ' · ' + esc(t('noLoc'))}</em></span></button></li>`;
    $('edit').innerHTML = `
      <section><h3><span>${esc(t('edit.people'))}</span><button class="btn small" type="button" data-act="addPerson">${esc(t('edit.addPerson'))}</button></h3>
        ${ppl.length ? '' : `<p class="note">${esc(t('edit.emptyPeople'))}</p>`}<ul class="rows">${ppl.map(pRow).join('')}</ul></section>
      <section><h3><span>${esc(t('edit.events'))}</span><button class="btn small" type="button" data-act="addEvent">${esc(t('edit.addEvent'))}</button></h3>
        ${evs.length ? '' : `<p class="note">${esc(t('edit.emptyEvents'))}</p>`}<ul class="rows">${evs.map(eRow).join('')}</ul></section>`;
    const f = $('evform'); if (f) bindEventForm(f);
  }
  function personForm() {
    const p = draft, others = state.people.filter((x) => x.id !== p.id).map((x) => [x.id, x.name]);
    const col = Poster.colors(state.people, design.palette)[p.id] || design.palette[0];
    return `<form class="form" id="pform">
      <label>${esc(t('f.name'))}<input name="name" value="${esc(p.name)}" required></label>
      <label>${esc(t('f.relation'))}<input name="relation" value="${esc(p.relation)}"></label>
      <div class="two"><label>${esc(t('f.sex'))}<select name="sex">${opts([['', t('f.sex.u')], ['m', t('f.sex.m')], ['f', t('f.sex.f')]], p.sex)}</select></label>
        <label>${esc(t('f.branch'))}<select name="branch">${opts([['', t('f.none')], ['direct', t('f.branch.direct')], ['side', t('f.branch.side')]], p.branch)}</select></label></div>
      <div class="two"><label>${esc(t('f.born'))}<input name="born" type="number" min="500" max="2100" value="${p.born ?? ''}"></label><label>${esc(t('f.died'))}<input name="died" type="number" min="500" max="2100" value="${p.died ?? ''}"></label></div>
      <div class="two"><label>${esc(t('f.father'))}<select name="father">${opts(others, (p.parents || [])[0] || '', true)}</select></label><label>${esc(t('f.mother'))}<select name="mother">${opts(others, (p.parents || [])[1] || '', true)}</select></label></div>
      <label>${esc(t('f.spouse'))}<select name="spouse">${opts(others, (p.spouses || [])[0] || '', true)}</select></label>
      <label>${esc(t('f.color'))}<span class="sws">${design.palette.map((c) => `<button type="button" data-color="${c}" style="background:${c}" aria-pressed="${c.toLowerCase() === col.toLowerCase()}" aria-label="${c}"></button>`).join('')}</span></label>
      <div class="acts"><button class="btn small primary" type="submit">${esc(t('f.save'))}</button><button class="btn small" type="button" data-act="close">${esc(t('f.cancel'))}</button>
        ${p.id !== state.rootId && state.people.some((x) => x.id === p.id) ? `<button class="linkbtn" type="button" data-act="makeRoot">${esc(t('edit.makeRoot'))}</button>` : ''}
        <button class="linkbtn del" type="button" data-act="delPerson">${esc(t('f.delete'))}</button></div></form>`;
  }
  function eventForm() {
    const d = draft;
    return `<form class="form" id="evform">
      <label>${esc(t('f.person'))}<select name="personId">${opts(state.people.map((p) => [p.id, p.name]), d.personId)}</select></label>
      <label>${esc(t('f.place'))}<input name="place" value="${esc(d.place)}" required></label>
      <label>${esc(t('f.query'))}<span class="inline"><input name="query" value="${esc(d.query)}" placeholder="Vitebsk, Belarus"><button class="btn small" type="button" data-act="find">${esc(t('f.find'))}</button></span></label>
      <div class="inline"><span class="geo ${Poster.hasGeo(d) ? '' : 'no'}" id="geoStatus">${esc(t(Poster.hasGeo(d) ? 'f.coords' : 'f.nocoords'))}</span><button class="linkbtn" type="button" data-act="pick">${esc(t('f.pick'))}</button></div>
      <div class="two"><label>${esc(t('f.year'))}<input name="year" type="number" min="500" max="2100" value="${d.year ?? ''}"></label><label>${esc(t('f.when'))}<input name="when" value="${esc(d.when)}"></label></div>
      <label>${esc(t('f.type'))}<select name="type">${opts(TYPES.map((x) => [x, t('type.' + x)]), d.type)}</select></label>
      <label>${esc(t('f.note'))}<textarea name="note" maxlength="300">${esc(d.note)}</textarea></label>
      <div class="acts"><button class="btn small primary" type="submit">${esc(t('f.save'))}</button><button class="btn small" type="button" data-act="close">${esc(t('f.cancel'))}</button><button class="linkbtn del" type="button" data-act="delEvent">${esc(t('f.delete'))}</button></div></form>`;
  }
  function readEvent(f) {
    const v = Object.fromEntries(new FormData(f)), y = parseInt(v.year, 10);
    Object.assign(draft, { personId: v.personId, place: v.place.trim(), query: v.query.trim() || v.place.trim(), when: v.when.trim() || (y ? String(y) : ''), year: y > 0 ? y : null, type: v.type, note: v.note.trim() });
  }
  function geoStatus() { const s = $('geoStatus'); if (!s) return; s.className = 'geo ' + (Poster.hasGeo(draft) ? '' : 'no'); s.textContent = t(Poster.hasGeo(draft) ? 'f.coords' : 'f.nocoords'); poster.preview(draft.lat, draft.lng); }
  function bindEventForm(f) {
    const q = f.elements.query, p = f.elements.place;
    p.addEventListener('input', () => { if (!q.dataset.touched) q.value = p.value; });
    q.addEventListener('input', () => { q.dataset.touched = '1'; if (draft.geo !== 'manual') { draft.lat = null; draft.lng = null; draft.geo = 'ai'; geoStatus(); } });
    f.addEventListener('submit', (e) => {
      e.preventDefault(); readEvent(f);
      const i = state.events.findIndex((x) => x.id === draft.id), events = state.events.slice(), { kind, ...ev } = draft;
      if (i >= 0) events[i] = ev; else events.push(ev);
      state = { ...state, events }; closeForms(); saveState(t('toast.saved'));
    });
    if (!p.value) p.focus();
  }
  function openEvent(ev) { closeForms(false); draft = { ...JSON.parse(JSON.stringify(ev)), kind: 'ev' }; open.ev = ev.id; renderEdit(); poster.preview(draft.lat, draft.lng); }
  function openPerson(p) { closeForms(false); draft = { ...JSON.parse(JSON.stringify(p)), kind: 'person' }; open.person = p.id; renderEdit(); }
  function closeForms(render = true) {
    if (cancelPick) { cancelPick(); cancelPick = null; $('pickbar').hidden = true; }
    open = { ev: null, person: null }; draft = null; poster.preview(NaN); if (render) renderEdit();
  }
  $('edit').addEventListener('click', async (e) => {
    const el = e.target.closest('button'); if (!el) return;
    const d = el.dataset;
    if (d.opene) return openEvent(state.events.find((x) => x.id === d.opene));
    if (d.openp) return openPerson(state.people.find((x) => x.id === d.openp));
    if (d.color) { draft.color = d.color; el.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); return; }
    const f = $('evform');
    switch (d.act) {
      case 'addPerson': return openPerson({ id: uid('p'), name: '', relation: '', sex: '', born: null, died: null, parents: [], spouses: [], branch: '' });
      case 'addEvent':
        if (!state.people.length) state.people.push({ id: uid('p'), name: t('me'), relation: '', sex: '', born: null, died: null, parents: [], spouses: [], branch: '' });
        return openEvent({ id: uid('m'), personId: state.rootId || state.people[0].id, year: null, when: '', type: 'other', place: '', query: '', lat: null, lng: null, note: '', geo: 'ai' });
      case 'close': return closeForms();
      case 'makeRoot': state = { ...state, rootId: draft.id }; closeForms(false); return saveState(t('toast.saved'));
      case 'delPerson': {
        if (!confirm(t('confirm.delPerson', { name: draft.name }))) return;
        const id = draft.id; closeForms(false);
        state = { ...state, people: state.people.filter((x) => x.id !== id).map((p) => ({ ...p, parents: (p.parents || []).filter((x) => x !== id), spouses: (p.spouses || []).filter((x) => x !== id) })), events: state.events.filter((x) => x.personId !== id) };
        return saveState(t('toast.removed'));
      }
      case 'delEvent': { const id = draft.id; closeForms(false); state = { ...state, events: state.events.filter((x) => x.id !== id) }; return saveState(t('toast.removed')); }
      case 'find': {
        readEvent(f); if (!draft.query) return; el.disabled = true;
        try { const r = await fetch('/api/geocode?q=' + encodeURIComponent(draft.query)); if (!r.ok) throw 0; const g = await r.json(); Object.assign(draft, { lat: g.lat, lng: g.lng, geo: 'osm' }); }
        catch { toast(t('toast.notFound')); }
        el.disabled = false; return geoStatus();
      }
      case 'pick': {
        readEvent(f); if (small()) setView('map'); $('pickbar').hidden = false;
        cancelPick = poster.pick((ll) => { cancelPick = null; $('pickbar').hidden = true; if (small()) setView('edit'); if (ll) Object.assign(draft, { lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5), geo: 'manual' }); if (small()) renderEdit(); geoStatus(); });
      }
    }
  });
  $('edit').addEventListener('submit', (e) => {
    if (e.target.id !== 'pform') return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target)), num = (x) => { const n = parseInt(x, 10); return n > 0 ? n : null; };
    const p = { ...draft, name: v.name.trim(), relation: v.relation.trim(), sex: v.sex, branch: v.branch, born: num(v.born), died: num(v.died), parents: [v.father, v.mother].filter(Boolean) };
    const oldSp = (draft.spouses || [])[0];
    p.spouses = v.spouse ? [v.spouse, ...(draft.spouses || []).filter((x) => x !== v.spouse && x !== oldSp)] : (draft.spouses || []).filter((x) => x !== oldSp);
    delete p.kind;
    let people = state.people.some((x) => x.id === p.id) ? state.people.map((x) => (x.id === p.id ? p : x)) : [...state.people, p];
    people = people.map((x) => { if (x.id === p.id) return x; let sp = (x.spouses || []).filter((y) => y !== p.id || p.spouses.includes(x.id)); if (p.spouses.includes(x.id) && !sp.includes(p.id)) sp = [...sp, p.id]; return { ...x, spouses: sp }; });
    state = { ...state, people }; closeForms(false); saveState(t('toast.saved'));
  });
  $('pickCancel').addEventListener('click', () => { if (cancelPick) { cancelPick(); cancelPick = null; } $('pickbar').hidden = true; if (small()) setView('edit'); });

  // ---------- design ----------
  const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), design);
  function set(path, val) { const ks = path.split('.'); let o = design; ks.slice(0, -1).forEach((k) => (o = o[k] ||= {})); o[ks[ks.length - 1]] = val; }
  const seg = (path, values, prefix) => `<div class="seg">${values.map((v) => `<button type="button" data-set="${path}" data-val="${v}" aria-pressed="${get(path) === v}">${esc(t(prefix + v))}</button>`).join('')}</div>`;
  const range = (path, min, max, step) => `<input type="range" data-set="${path}" data-num="1" min="${min}" max="${max}" step="${step}" value="${get(path)}">`;
  const color = (path) => `<input type="color" data-set="${path}" value="${get(path)}">`;
  const ctl = (label, html) => `<div class="ctl"><span>${esc(t(label))}</span>${html}</div>`;
  function renderDesign() {
    if (!state) return;
    const pv = { discovery: 'linear-gradient(90deg,#EADFC4 0 40%,#D9BF8C 40% 70%,#A8331F 70% 80%,#1F4A6E 80%)', admiralty: 'linear-gradient(90deg,#F3F0E6 0 40%,#BCD2DA 40% 70%,#B22A1E 70% 80%,#1B3F8F 80%)', night: 'linear-gradient(90deg,#141A22 0 40%,#2A3B52 40% 70%,#E8674A 70% 80%,#D4A64A 80%)', atlas: 'linear-gradient(90deg,#FFFFFF 0 40%,#E4E7E2 40% 70%,#E0301E 70% 80%,#1F3FBF 80%)' };
    const places = Object.values(Poster.model(state, design).places);
    const picked = Array.isArray(design.insets.pick) ? new Set(design.insets.pick) : null;
    const fonts = [['alegreya', 'Alegreya'], ['oldstandard', 'Old Standard'], ['garamond', 'EB Garamond'], ['jost', 'Jost']];
    $('design').innerHTML = `
      <section><h3>${esc(t('d.presets'))}</h3><div class="presets">${Object.keys(pv).map((k) => `<button type="button" data-preset="${k}" aria-pressed="${design.preset === k}"><i style="background:${pv[k]}"></i><span>${esc(t('d.preset.' + k))}</span></button>`).join('')}</div></section>
      <section><h3>${esc(t('d.base'))}</h3>${seg('basemap', ['light', 'dark', 'voyager'], 'd.base.')}<div style="height:10px"></div>
        ${ctl('d.tint', color('tint'))}${ctl('d.tintAmt', range('tintAmt', 0, 1, 0.05))}${ctl('d.sat', range('sat', 0, 1.6, 0.05))}${ctl('d.bright', range('bright', 0.6, 1.5, 0.02))}${ctl('d.contrast', range('contrast', 0.6, 1.5, 0.02))}</section>
      <section><h3>${esc(t('d.colors'))}</h3>${ctl('d.paper', color('paper'))}${ctl('d.ink', color('ink'))}${ctl('d.accent', color('accent'))}${ctl('d.frameColor', color('frameColor'))}
        <div class="ctl" style="grid-template-columns:1fr"><span>${esc(t('d.palette'))}</span><div class="palette">${design.palette.map((c, i) => `<input type="color" data-pal="${i}" value="${c}">`).join('')}</div></div></section>
      <section><h3>${esc(t('d.type'))}</h3>${ctl('d.font', `<select data-set="font">${opts(fonts, design.font)}</select>`)}${ctl('d.labelSize', range('labelSize', 0.6, 1.8, 0.05))}</section>
      <section><h3>${esc(t('d.layout'))}</h3>${ctl('d.format', seg('format', ['landscape', 'portrait', 'square'], 'd.format.'))}
        ${ctl('d.panel', `<select data-set="panel">${opts(['auto', 'tree', 'chronicle', 'none'].map((x) => [x, t('d.panel.' + x)]), design.panel)}</select>`)}
        ${ctl('d.subtitle', `<input data-set="subtitle" value="${esc(design.subtitle)}" placeholder="${esc(t('d.subtitle.ph'))}">`)}</section>
      <section><h3>${esc(t('d.routes'))}</h3>${ctl('d.routes.style', seg('routes.style', ['solid', 'dashed', 'dotted'], 'd.style.'))}${ctl('d.routes.width', range('routes.width', 1, 7, 0.2))}${ctl('d.routes.curve', range('routes.curve', 0, 0.45, 0.01))}
        <div class="checks"><label><input type="checkbox" data-set="routes.arrows" ${design.routes.arrows ? 'checked' : ''}> ${esc(t('d.routes.arrows'))}</label></div></section>
      <section><h3>${esc(t('d.elements'))}</h3><div class="checks">${Object.keys(design.show).map((k) => `<label><input type="checkbox" data-set="show.${k}" ${design.show[k] ? 'checked' : ''}> ${esc(t('d.show.' + k))}</label>`).join('')}</div></section>
      <section><h3>${esc(t('d.insets'))}</h3>${ctl('d.insets.shape', seg('insets.shape', ['circle', 'square'], 'd.shape.'))}${ctl('d.insets.zoom', range('insets.zoom', 8, 15, 0.5))}
        <div class="checks" style="grid-template-columns:1fr"><label><input type="checkbox" id="insAuto" ${picked ? '' : 'checked'}> ${esc(t('d.insets.auto'))}</label></div>
        ${picked ? `<div class="picks">${places.map((p) => `<label><input type="checkbox" data-pick="${p.key}" ${picked.has(p.key) ? 'checked' : ''}> ${esc(p.e.place)} <small>${esc(Poster.span(Poster.years(p.list)))}</small></label>`).join('')}</div>` : ctl('d.insets.max', range('insets.max', 0, 16, 1))}</section>
      <section><div class="acts" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" type="button" data-act="resetView">${esc(t('d.resetView'))}</button><button class="btn small" type="button" data-act="resetStyle">${esc(t('d.resetStyle'))}</button></div></section>`;
  }
  $('design').addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.pal !== undefined) { design.palette[+el.dataset.pal] = el.value; return designChanged(); }
    if (!el.dataset.set || el.type === 'checkbox') return;
    set(el.dataset.set, el.dataset.num ? +el.value : el.value); designChanged();
  });
  $('design').addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'insAuto') { design.insets.pick = el.checked ? null : Poster.model(state, design).insets.map((p) => p.key); renderDesign(); return designChanged(); }
    if (el.dataset.pick) { const s = new Set(design.insets.pick || []); el.checked ? s.add(el.dataset.pick) : s.delete(el.dataset.pick); design.insets.pick = [...s]; return designChanged(); }
    if (el.type === 'checkbox' && el.dataset.set) { set(el.dataset.set, el.checked); return designChanged(); }
    if (el.tagName === 'SELECT' && el.dataset.set) { set(el.dataset.set, el.value); designChanged(); }
  });
  $('design').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.preset) { const v = design.view, pick = design.insets.pick; design = Poster.design({ preset: b.dataset.preset }, state.mode); design.view = v; design.insets.pick = pick; renderDesign(); return designChanged(); }
    if (b.dataset.set) { set(b.dataset.set, b.dataset.val); renderDesign(); return designChanged({ refit: b.dataset.set === 'format' && !design.view }); }
    if (b.dataset.act === 'resetView') { design.view = null; paint({ keepView: false }); return saveDesignSoon(); }
    if (b.dataset.act === 'resetStyle') { const v = design.view; design = Poster.design({ preset: design.preset }, state.mode); design.view = v; renderDesign(); designChanged(); }
  });

  // ---------- import ----------
  function renderImport() {
    if (!ged) {
      $('import').innerHTML = `<section><h3>${esc(t('i.title'))}</h3><p class="note">${esc(t('i.p'))}</p><label class="btn primary" style="cursor:pointer">${esc(t('i.file'))}<input type="file" id="gedFile" accept=".ged,.gedcom,text/plain" hidden></label></section>`;
      return;
    }
    const people = ged.people.slice().sort((a, b) => a.name.localeCompare(b.name));
    const c = ged.events.filter((e) => e.geo === 'gedcom').length;
    $('import').innerHTML = `<section><h3>${esc(t('i.title'))}</h3><p class="note">${esc(t('i.found', { p: ged.people.length, e: ged.events.length, c }))}</p>
      <div class="form" style="padding:0">
        <label>${esc(t('i.root'))}<select id="gedRoot">${opts(people.map((p) => [p.id, p.name + (p.born ? ' (' + p.born + ')' : '')]), people[0] && people[0].id)}</select></label>
        <label>${esc(t('i.scope'))}<select id="gedScope">${opts(['direct', 'side', 'all'].map((x) => [x, t('i.scope.' + x)]), 'side')}</select></label>
        <div class="acts"><button class="btn primary" type="button" id="gedGo">${esc(t('i.go'))}</button><label class="linkbtn" style="cursor:pointer">${esc(t('i.file'))}<input type="file" id="gedFile" accept=".ged,.gedcom,text/plain" hidden></label></div>
        <p class="note" id="gedStatus"></p><div class="progress" id="gedProg" hidden><i></i></div></div></section>`;
  }
  $('import').addEventListener('change', async (e) => {
    if (e.target.id !== 'gedFile' || !e.target.files[0]) return;
    try { const buf = await e.target.files[0].arrayBuffer(); const d = Gedcom.parse(buf); if (!d.people.length) throw 0; ged = d; }
    catch { ged = null; toast(t('i.bad')); }
    renderImport();
  });
  $('import').addEventListener('click', async (e) => {
    if (e.target.id !== 'gedGo') return;
    const btn = e.target; btn.disabled = true;
    const sel = Gedcom.select(ged, $('gedRoot').value, $('gedScope').value, I18N.lang);
    const need = [...new Set(sel.events.filter((x) => !Poster.hasGeo(x)).map((x) => x.query))].slice(0, 300), found = {};
    $('gedProg').hidden = false;
    for (let i = 0; i < need.length; i++) {
      $('gedStatus').textContent = t('i.geocoding', { n: i + 1, t: need.length }); $('gedProg').firstChild.style.width = ((i + 1) / need.length) * 100 + '%';
      try { const r = await fetch('/api/geocode?q=' + encodeURIComponent(need[i])); if (r.ok) found[need[i]] = await r.json(); } catch {}
    }
    let miss = 0;
    for (const ev of sel.events) if (!Poster.hasGeo(ev)) { const g = found[ev.query]; if (g) Object.assign(ev, { lat: g.lat, lng: g.lng, geo: 'osm' }); else miss++; }
    const root = sel.people.find((p) => p.id === sel.rootId);
    const title = root ? (I18N.lang === 'ru' ? 'Род: ' : 'The family of ') + root.name : '';
    await createNew('tree', { side: $('gedScope').value !== 'direct' }, { title, people: sel.people, events: sel.events, rootId: sel.rootId });
    $('gedStatus').textContent = t('i.done', { n: miss }); btn.disabled = false;
  });

  // ---------- header ----------
  $('title').addEventListener('change', async () => {
    try { const m = await api(`/api/maps/${cur.id}`, { token: cur.token, title: $('title').value }, 'PATCH'); state.title = m.title; paint(); remember({ ...cur, title: m.title }); toast(t('toast.saved')); } catch (e) { toast(e.message); }
  });
  $('share').addEventListener('click', async () => {
    if (!cur) return; const url = location.origin + '/m/' + cur.id;
    if (navigator.share && small()) { try { await navigator.share({ title: state.title || t('familyMap'), url }); return; } catch {} }
    try { await navigator.clipboard.writeText(url); toast(t('toast.copied')); } catch { prompt(t('btn.share'), url); }
  });
  $('export').addEventListener('click', async () => {
    if (!state || !state.events.some(Poster.hasGeo)) return toast(t('toast.emptyMap'));
    const b = $('export'); b.disabled = true; b.textContent = t('btn.exporting');
    try {
      const view = poster.currentView();
      const { blob, tiles } = await Poster.exportPNG(state, design, { view, width: 3200 });
      Poster.download(blob, Poster.slug(state.title || t('title.ph')) + '.png'); toast(t(tiles ? 'toast.exported' : 'toast.noTiles'));
    } catch (e) { toast(e.message || 'Export failed'); }
    b.disabled = false; b.textContent = t('btn.export');
  });
  $('newMap').addEventListener('click', () => { if (state && state.events.length && !confirm(t('confirm.new'))) return; showStart(); });
  $('myMaps').addEventListener('change', (e) => load(e.target.value));
  let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => paint(), 150); });
  I18N.on(() => { renderMyMaps(); paint(); const v = document.querySelector('.app').dataset.view; if (v !== 'chat' && v !== 'map') setView(v); if (!$('start').hidden) showStart(); });

  // ---------- boot ----------
  async function load(id) {
    const m = myMaps().find((x) => x.id === id); if (!m) return showStart();
    cur = { id: m.id, token: m.token }; closeForms(false); hideStart(); $('log').innerHTML = ''; state = null; design = null;
    try {
      const h = await api(`/api/maps/${id}/history`, { token: m.token });
      h.messages.forEach((x) => addMsg(x.role === 'assistant' ? 'bot' : 'me', x.content));
      setState(h.map, { fit: true }); remember({ ...cur, title: h.map.title }); history.replaceState(null, '', '/create?id=' + id);
    } catch (e) {
      if (e.status === 404 || e.status === 403) { store.set('mh:maps', myMaps().filter((x) => x.id !== id)); return showStart(); }
      addMsg('err', e.message);
    }
  }
  async function createNew(mode, options, seed) {
    try {
      const r = await api('/api/maps', { lang: I18N.lang, mode, options, state: seed });
      cur = { id: r.id, token: r.token }; closeForms(false); hideStart(); $('log').innerHTML = ''; state = null; design = null;
      remember({ ...cur, title: r.map.title }); r.messages.forEach((x) => addMsg('bot', x.content));
      setState(r.map, { fit: true }); history.replaceState(null, '', '/create?id=' + r.id);
      setView(seed ? 'design' : 'chat');
    } catch (e) { toast(e.message); }
  }

  I18N.apply();
  const qs = new URLSearchParams(location.search), want = qs.get('id') || store.get('mh:current', null);
  if (want && myMaps().some((m) => m.id === want)) load(want).then(() => { if (qs.get('tab')) setView(qs.get('tab')); });
  else { showStart(); if (qs.get('tab') === 'import') setView('import'); }
})();
