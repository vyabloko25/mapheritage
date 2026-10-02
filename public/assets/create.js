/* MapHeritage: create / edit / design / import */
(function () {
  const $ = (id) => document.getElementById(id);
  const { t, plural } = I18N, esc = Poster.esc;
  const TYPES = ['birth', 'childhood', 'study', 'work', 'service', 'war', 'evacuation', 'move', 'marriage', 'death', 'other'];
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const small = () => innerWidth <= 860;
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  let cur = null, busy = false, state = null, design = null, open = { ev: null, person: null }, draft = null, cancelPick = null, ged = null, msgs = [], maps = [];
  const pro = () => !!Account.limits().custom;
  const allowedPresets = () => Account.limits().presets || ['discovery', 'admiralty'];

  const poster = Poster.create($('stage'), {
    editable: true, canMove: true,
    onView: (v) => { if (!design) return; design.view = v; saveDesignSoon(); },
    onPlace: (pl) => { if (document.querySelector('.app').dataset.view === 'edit') openEvent(pl.list[0]); },
    onSelect: (el, box, dbl) => inspector(el, dbl),
    onDesign: () => { saveDesignSoon(); if (poster.selected) inspector(poster.selected); },
  });
  window.MHPoster = poster; // handy for debugging in the console
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

  // ---------- maps list (server) ----------
  async function loadMaps() { try { maps = (await api('/api/maps', null, 'GET')).maps || []; } catch { maps = []; } renderMyMaps(); }
  function remember(m) {
    store.set('mh:current', m.id);
    const i = maps.findIndex((x) => x.id === m.id);
    if (i >= 0) maps[i].title = m.title || ''; else maps.unshift({ id: m.id, title: m.title || '' });
    renderMyMaps();
  }
  function renderMyMaps() { if (!$('projects').hidden) renderProjects(); }

  function setState(next, o = {}) {
    const before = new Set(state ? state.events.map((e) => e.id) : []);
    state = next;
    if (!design || o.resetDesign) design = Poster.design(state.design, state.mode);
    if (document.activeElement !== $('title')) $('title').value = state.title || '';
    $('viewMap').href = '/m/' + cur.id;
    poster.setCanMove(pro());
    const hl = o.highlight ? new Set(state.events.filter((e) => !before.has(e.id)).map((e) => e.id)) : null;
    paint({ keepView: !o.fit, highlight: hl });
    const v = document.querySelector('.app').dataset.view;
    if (v === 'edit') renderEdit(); if (v === 'design') renderDesign();
  }

  // ---------- chat ----------
  function renderLog() {
    const log = $('log'); log.innerHTML = '';
    msgs.forEach((m, i) => {
      const w = document.createElement('div'); w.className = 'msgwrap ' + (m.role === 'assistant' ? 'bot' : 'me'); w.dataset.i = i;
      const d = document.createElement('div'); d.className = 'msg ' + (m.role === 'assistant' ? 'bot' : m.role === 'err' ? 'err' : 'me'); d.textContent = m.content; w.appendChild(d);
      if (m.role === 'user') { const e = document.createElement('button'); e.type = 'button'; e.className = 'editbtn'; e.dataset.edit = i; e.textContent = '✎ ' + t('chat.edit'); w.appendChild(e); }
      log.appendChild(w);
    });
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant' && last.suggestions && last.suggestions.length && !busy) {
      const c = document.createElement('div'); c.className = 'chips';
      last.suggestions.forEach((x) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.chip = x; b.textContent = x; c.appendChild(b); });
      log.appendChild(c);
    }
    log.scrollTop = log.scrollHeight;
  }
  function addMsg(role, text) { msgs.push({ role: role === 'bot' ? 'assistant' : role === 'me' ? 'user' : role, content: text }); renderLog(); }
  async function send(text, editIndex) {
    if (busy || !text.trim() || !cur) return;
    busy = true; $('send').disabled = true;
    const backup = msgs.slice();
    if (Number.isInteger(editIndex)) msgs = msgs.slice(0, editIndex);
    msgs.push({ role: 'user', content: text }); renderLog(); $('input').value = ''; grow();
    const ty = document.createElement('div'); ty.className = 'typing'; ty.textContent = t('thinking'); $('log').appendChild(ty); $('log').scrollTop = $('log').scrollHeight;
    try {
      const r = await api(`/api/maps/${cur.id}/chat`, { message: text, token: cur.token, editIndex });
      if (r.messages) msgs = r.messages; else msgs.push({ role: 'assistant', content: r.reply, suggestions: r.suggestions });
      if (r.designChanged) design = Poster.design(r.map.design, r.map.mode);
      busy = false; renderLog();
      setState(r.map, { highlight: true, fit: !design.view });
      remember({ ...cur, title: r.map.title });
    } catch (e) {
      busy = false; msgs = backup; msgs.push({ role: 'err', content: e.message }); renderLog();
      if (!Number.isInteger(editIndex)) { $('input').value = text; grow(); }
    } finally { busy = false; $('send').disabled = false; if (!small()) $('input').focus(); }
  }
  $('log').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.chip) return send(b.dataset.chip);
    if (b.dataset.edit !== undefined) {
      const i = +b.dataset.edit, w = b.parentNode, m = msgs[i];
      w.innerHTML = `<textarea>${esc(m.content)}</textarea><div style="display:flex;gap:6px"><button class="btn small primary" type="button" data-resend="${i}">${esc(t('chat.save'))}</button><button class="btn small" type="button" data-cancel="1">${esc(t('f.cancel'))}</button></div>`;
      w.querySelector('textarea').focus();
    }
    if (b.dataset.cancel) renderLog();
    if (b.dataset.resend !== undefined) {
      const i = +b.dataset.resend, text = b.closest('.msgwrap').querySelector('textarea').value.trim();
      if (!text) return;
      if (i < msgs.length - 2 && !confirm(t('chat.editQ'))) return;
      send(text, i);
    }
  });
  function grow() { const i = $('input'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight + 4, 160) + 'px'; }
  $('input').addEventListener('input', grow);
  $('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($('input').value); } });
  $('form').addEventListener('submit', (e) => { e.preventDefault(); send($('input').value); });

  // ---------- projects ----------
  // Three ways to begin; each starts in a style that suits it (changeable later in Design).
  const TEMPLATES = [
    { mode: 'journey', key: 'tpl.personal', preset: 'discovery' },
    { mode: 'family', key: 'tpl.family', preset: 'admiralty' },
    { mode: 'tree', key: 'tpl.tree', preset: 'atlas' },
  ];
  let menuFor = null;
  const fmtDate = (t0) => { try { return new Date(t0).toLocaleDateString(I18N.lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
  function showProjects() {
    $('projects').hidden = false; document.body.classList.add('in-projects');
    document.documentElement.style.setProperty('--barh', document.querySelector('.bar').getBoundingClientRect().height + 'px');
    renderProjects(); loadMaps();
  }
  function hideProjects() { $('projects').hidden = true; document.body.classList.remove('in-projects'); menuFor = null; }
  function showStart() { showProjects(); }
  function hideStart() { hideProjects(); }
  function renderProjects() {
    const el = $('projects'), tl = (m) => t('tpl.' + ({ journey: 'personal', family: 'family', tree: 'tree' }[m] || 'family') + '.t');
    el.innerHTML = `<div class="wrap">
      <h2><span>${esc(t('proj.new'))}</span>${cur && state ? `<button class="btn small" type="button" data-close>${esc(t('proj.back'))}</button>` : ''}</h2>
      <p class="lead">${esc(t('proj.newLead'))}</p>
      <div class="tpls">${TEMPLATES.map((T) => `<div class="tpl" role="button" tabindex="0" data-tpl="${T.mode}"><i style="background:${Poster.swatch(T.preset)}"></i><div><b>${esc(t(T.key + '.t'))}</b><span>${esc(t(T.key + '.p'))}</span>
        ${T.mode === 'tree' ? `<div class="row2"><label><input type="checkbox" id="sideOpt"> ${esc(t('start.side'))}</label><button class="btn small" type="button" data-ged>${esc(t('s.tree.b'))}</button></div>` : ''}</div></div>`).join('')}</div>
      <h2><span>${esc(t('proj.mine'))}</span></h2>
      ${maps.length ? `<div class="plist">${maps.map((m) => `<div class="proj ${cur && m.id === cur.id ? 'cur' : ''}">
          <button class="open" type="button" data-open="${m.id}"><i style="background:${m.colors && m.colors.length >= 5 ? `linear-gradient(90deg,${m.colors[0]} 0 22%,${m.colors[1]} 22% 48%,${m.colors[2]} 48% 72%,${m.colors[3]} 72% 84%,${m.colors[4]} 84%)` : Poster.swatch(m.preset || 'discovery')}"></i>
          <span class="meta"><span class="badge">${esc(tl(m.mode))}${m.shared ? ' · ' + esc(t('proj.shared')) : ''}</span><b>${esc(m.title || t('untitled'))}</b>
          <span>${esc(t('proj.counts', { p: m.people ?? 0, l: m.places ?? 0 }))} · ${esc(fmtDate(m.updated_at))}</span></span></button>
          <button class="more" type="button" data-more="${m.id}" aria-label="${esc(t('proj.actions'))}">⋯</button>
          ${menuFor === m.id ? `<div class="menu"><button type="button" data-rename="${m.id}">${esc(t('proj.rename'))}</button><button type="button" data-dup="${m.id}">${esc(t('proj.duplicate'))}</button><button type="button" class="danger" data-del="${m.id}">${esc(t('proj.delete'))}</button></div>` : ''}
        </div>`).join('')}</div>` : `<p class="empty">${esc(t('proj.none'))}</p>`}
    </div>`;
  }
  $('projects').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tpl],[data-open],[data-more],[data-rename],[data-dup],[data-del],[data-close],[data-ged]');
    if (!b) { if (menuFor) { menuFor = null; renderProjects(); } return; }
    const d = b.dataset;
    if (d.close !== undefined) return hideProjects();
    if (d.ged !== undefined) { e.stopPropagation(); hideProjects(); return setView('import'); }
    if (e.target.closest('label')) return;
    if (d.tpl) { const T = TEMPLATES.find((x) => x.mode === d.tpl); hideProjects(); return createNew(T.mode, { side: !!($('sideOpt') && $('sideOpt').checked) }, { design: { preset: T.preset } }, { view: 'chat' }); }
    if (d.open) { hideProjects(); if (!cur || d.open !== cur.id) load(d.open); return; }
    if (d.more) { menuFor = menuFor === d.more ? null : d.more; return renderProjects(); }
    menuFor = null;
    if (d.rename) {
      const m = maps.find((x) => x.id === d.rename), name = prompt(t('proj.renameAsk'), m ? m.title : ''); if (name == null) return renderProjects();
      try { await api(`/api/maps/${d.rename}`, { title: name }, 'PATCH'); if (cur && cur.id === d.rename) { state.title = name.trim(); $('title').value = state.title; } await loadMaps(); } catch (e2) { toast(e2.message); }
      return;
    }
    if (d.dup) {
      const m = maps.find((x) => x.id === d.dup);
      try { await api(`/api/maps/${d.dup}/duplicate`, { lang: I18N.lang, title: (m && m.title ? m.title + ' — ' : '') + t('proj.copy') }); toast(t('proj.copied')); await loadMaps(); } catch (e2) { toast(e2.message); }
      return;
    }
    if (d.del) {
      if (!confirm(t('confirm.delMap'))) return renderProjects();
      try {
        await api(`/api/maps/${d.del}`, {}, 'DELETE'); maps = maps.filter((x) => x.id !== d.del);
        if (cur && cur.id === d.del) { cur = null; state = null; store.set('mh:current', null); }
        toast(t('toast.removed')); renderProjects();
      } catch (e2) { toast(e2.message); }
    }
  });
  $('projects').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.tpl) { e.preventDefault(); e.target.click(); } });
  $('projectsBtn').addEventListener('click', () => ($('projects').hidden ? showProjects() : cur && state ? hideProjects() : null));

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
        try { const r = await fetch('/api/geocode?q=' + encodeURIComponent(draft.query)); if (!r.ok) throw 0; const g = await r.json(); Object.assign(draft, { lat: g.lat, lng: g.lng, geo: 'osm', kind: g.kind || '' }); }
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
  const sel = (path, values, prefix) => `<select data-set="${path}">${opts(values.map((v) => [v, t(prefix + v)]), get(path))}</select>`;
  const range = (path, min, max, step) => `<input type="range" data-set="${path}" data-num="1" min="${min}" max="${max}" step="${step}" value="${get(path) ?? min}">`;
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#888888');
  const colorDefault = (path) => ({ 'relief.color': design.coast.color, 'insets.colors.sea': design.sea, 'insets.colors.land': design.land, 'insets.colors.lake': design.lake || design.sea, 'insets.colors.ink': design.coast.color })[path] || '';
  const color = (path) => `<input type="color" data-set="${path}" value="${hex(get(path) || colorDefault(path))}">`;
  const check = (path, label) => `<label><input type="checkbox" data-set="${path}" ${get(path) ? 'checked' : ''}> ${esc(t(label))}</label>`;
  const ctl = (label, html) => `<div class="ctl"><span>${esc(t(label))}</span>${html}</div>`;
  const lockB = () => (pro() ? '' : `<b class="lock">${esc(t('pro'))}</b>`);
  const proSec = (title, html, open) => `<details class="dsec ${pro() ? '' : 'locked-sec'}" ${open ? 'open' : ''}><summary>${esc(t(title))}${lockB()}</summary><div class="dbody">${html}</div></details>`;
  const SHOW_GROUPS = {
    'd.g.chart': ['frame', 'cartouche', 'legend', 'compass', 'scale', 'labels', 'numbers', 'insets'],
    'd.g.map': ['graticule', 'degrees', 'rhumbs', 'relief', 'waterlines', 'depth', 'shadow', 'stipple', 'rivers', 'borders'],
    'd.g.mood': ['ships', 'waves', 'aging', 'texture', 'vignette'],
  };
  const openSecs = new Set(store.get('mh:dsec', ['d.colors']));
  function renderDesign() {
    if (!state) return;
    const places = Object.values(Poster.model(state, design).places);
    const picked = Array.isArray(design.insets.pick) ? new Set(design.insets.pick) : null;
    const fonts = [['alegreya', 'Alegreya'], ['oldstandard', 'Old Standard'], ['garamond', 'EB Garamond'], ['cormorant', 'Cormorant'], ['jost', 'Jost']];
    const ships = poster.ships, autoShips = !Array.isArray(design.ships);
    const texts = design.texts || [];
    $('design').innerHTML = `
      <section><h3>${esc(t('d.presets'))}</h3><div class="presets">${Poster.PRESET_KEYS.map((k) => `<button type="button" data-preset="${k}" aria-pressed="${design.preset === k && !design.userStyle}"><i style="background:${Poster.swatch(k)}"></i><span>${esc(t('d.preset.' + k))}</span></button>`).join('')}
        ${myStyles.map((st) => `<button type="button" class="mine" data-ustyle="${esc(st.id)}" aria-pressed="${design.userStyle === st.id}"><i style="background:${Poster.swatch(st.design)}"></i><span>${esc(st.name)}</span>${pro() ? `<b class="x" data-udel="${esc(st.id)}" title="${esc(t('f.delete'))}">×</b>` : ''}</button>`).join('')}</div>
        <div class="stylebox"><button class="btn small" type="button" data-act="scratch">${esc(t('d.scratch'))}${lockB()}</button><button class="btn small" type="button" data-act="saveStyle">${esc(t(design.userStyle ? 'd.updateStyle' : 'd.saveStyle'))}${lockB()}</button></div>
        <p class="note" style="margin-top:10px">${esc(t(pro() ? 'insp.dragHint' : 'd.liteHint'))}</p></section>
      <section><h3>${esc(t('d.layout'))}</h3>${ctl('d.format', seg('format', ['landscape', 'portrait', 'square'], 'd.format.'))}
        ${ctl('d.panel', sel('panel', ['auto', 'tree', 'chronicle', 'none'], 'd.panel.'))}
        ${ctl('d.subtitle', `<input data-set="subtitle" value="${esc(design.subtitle)}" placeholder="${esc(t('d.subtitle.ph'))}">`)}</section>
      <section><h3>${esc(t('d.elements'))}</h3>${Object.entries(SHOW_GROUPS).map(([g, ks]) => `<p class="note grp">${esc(t(g))}</p><div class="checks">${ks.map((k) => check('show.' + k, 'd.show.' + k)).join('')}</div>`).join('')}</section>
      <section><h3>${esc(t('d.insets'))}</h3><div class="${pro() ? '' : 'locked-sec'}">${ctl('d.insets.shape', seg('insets.shape', ['circle', 'square'], 'd.shape.'))}${ctl('d.insets.zoom', range('insets.zoom', 7, 16.5, 0.25))}</div>${ctl('d.insets.detail', range('insets.detail', 1, 5, 1))}
        <div class="${pro() ? '' : 'locked-sec'}">${ctl('d.insets.look', `<select data-set="insets.look">${opts([['', t('d.look.map')], ...Poster.PRESET_KEYS.map((k) => [k, t('d.preset.' + k)]), ['custom', t('d.look.custom')]], design.insets.look || '')}</select>`)}
        ${design.insets.look === 'custom' ? `${ctl('d.sea', color('insets.colors.sea'))}${ctl('d.land', color('insets.colors.land'))}${ctl('d.look.water', color('insets.colors.lake'))}${ctl('d.ink', color('insets.colors.ink'))}
          ${ctl('d.look.city', sel('insets.colors.city', ['engraved', 'modern', 'night'], 'd.city.'))}<div class="checks">${check('insets.colors.hatch', 'd.look.hatch')}</div>` : ''}</div><p class="note">${esc(t('d.insets.osm'))}</p>
        <div class="checks" style="grid-template-columns:1fr"><label><input type="checkbox" id="insAuto" ${picked ? '' : 'checked'}> ${esc(t('d.insets.auto'))}</label></div>
        ${picked ? `<div class="picks">${places.map((p) => `<label><input type="checkbox" data-pick="${p.key}" ${picked.has(p.key) ? 'checked' : ''}> ${esc(p.e.place)} <small>${esc(Poster.span(Poster.years(p.list)))}</small></label>`).join('')}</div>` : ctl('d.insets.max', range('insets.max', 0, 16, 1))}</section>
      <h3 class="prohead">${esc(t('d.fine'))}${lockB()}</h3>
      ${pro() ? '' : `<p class="note">${esc(t('d.fineLite'))} <a href="/plans">${esc(t('pl.more'))}</a></p>`}
      ${proSec('d.colors', `${ctl('d.paper', color('paper'))}${ctl('d.sea', color('sea'))}${ctl('d.land', color('land'))}${ctl('d.ink', color('ink'))}${ctl('d.accent', color('accent'))}${ctl('d.frameColor', color('frameColor'))}
        <div class="ctl" style="grid-template-columns:1fr"><span>${esc(t('d.palette'))}</span><div class="palette">${design.palette.map((c, i) => `<input type="color" data-pal="${i}" value="${hex(c)}">`).join('')}</div></div>`, openSecs.has('d.colors'))}
      ${proSec('d.type', `${ctl('d.font', `<select data-set="font">${opts(fonts, design.font)}</select>`)}${ctl('d.labelSize', range('labelSize', 0.6, 1.8, 0.05))}
        ${ctl('d.labels.style', seg('labels.style', ['italic', 'roman', 'caps'], 'd.labels.'))}${ctl('d.labels.halo', seg('labels.halo', ['halo', 'box', 'none'], 'd.halo.'))}`, openSecs.has('d.type'))}
      ${proSec('d.water', `${ctl('d.water.n', range('water.n', 0, 10, 1))}${ctl('d.water.gap', range('water.gap', 1.5, 6, 0.1))}${ctl('d.water.alpha', range('water.alpha', 0, 1, 0.02))}${ctl('d.water.color', color('water.color'))}
        ${ctl('d.relief.style', sel('relief.style', ['shade', 'swiss', 'hypso', 'contour', 'tanaka', 'hachure'], 'd.rs.'))}
        ${['hypso', 'swiss', 'tanaka'].includes(design.relief.style) ? ctl('d.relief.palette', sel('relief.palette', ['classic', 'swiss', 'sepia', 'mono'], 'd.rp.')) : ''}
        ${design.relief.style !== 'shade' ? ctl('d.relief.alpha', range('relief.alpha', 0.1, 1, 0.02)) : ''}
        ${design.relief.style === 'hachure' ? ctl('d.relief.density', range('relief.density', 0.5, 1.8, 0.05)) : ''}${design.relief.style === 'tanaka' ? ctl('d.relief.lines', range('relief.lines', 0.2, 1, 0.02)) : ''}
        ${['contour', 'hachure', 'tanaka'].includes(design.relief.style) ? ctl('d.relief.color', color('relief.color')) : ''}
        ${!['shade', 'swiss'].includes(design.relief.style) ? `<div class="checks">${check('relief.shade', 'd.relief.shade')}</div>` : ''}
        ${['shade', 'swiss'].includes(design.relief.style) || design.relief.shade !== false ? ctl('d.relief.amt', range('relief.amt', 0, 2, 0.05)) : ''}${ctl('d.tex.type', sel('tex.type', ['coast', 'stipple', 'hatch', 'none'], 'd.tex.'))}${ctl('d.tex.alpha', range('tex.alpha', 0, 1, 0.02))}
        ${ctl('d.shadow.blur', range('shadow.blur', 0, 24, 1))}${ctl('d.borders.style', sel('borders.style', ['dashed', 'dotted', 'dashdot', 'solid'], 'd.border.'))}
        ${ctl('d.aging.amount', range('aging.amount', 0, 1, 0.02))}<div class="checks">${check('rhumbs.network', 'd.rhumbs.network')}</div>`, openSecs.has('d.water'))}
      ${proSec('d.furniture', `${ctl('d.cartouche.style', sel('cartouche.style', ['frame', 'scroll', 'medallion', 'block'], 'd.cart.'))}${ctl('d.compass.style', sel('compass.style', ['ornate', 'simple', 'portolan', 'modern'], 'd.comp.'))}
        ${ctl('d.frame.style', sel('frame.style', ['degrees', 'double', 'ornament', 'line'], 'd.frame.'))}${ctl('d.scale.style', sel('scale.style', ['checker', 'line'], 'd.scale.'))}`, openSecs.has('d.furniture'))}
      ${proSec('d.routes', `${ctl('d.routes.style', sel('routes.style', ['solid', 'dashed', 'dotted', 'double', 'casing', 'hand'], 'd.style.'))}${ctl('d.routes.width', range('routes.width', 1, 7, 0.2))}${ctl('d.routes.curve', range('routes.curve', 0, 0.45, 0.01))}
        <div class="checks">${check('routes.arrows', 'd.routes.arrows')}</div>
        ${ctl('d.markers.style', sel('markers.style', ['ring', 'dot', 'square', 'star', 'pin', 'town'], 'd.mark.'))}${ctl('d.markers.size', range('markers.size', 0.6, 1.8, 0.05))}`, openSecs.has('d.routes'))}
      ${proSec('d.ships', `${autoShips ? ctl('d.ships.auto', range('autoShips', 0, 4, 1)) : `<p class="note">${esc(t('d.ships.manual'))} <button class="linkbtn" type="button" data-act="shipsAuto">${esc(t('d.ships.backAuto'))}</button></p>`}
        <ul class="rows">${ships.map((s, i) => `<li class="mini"><select data-ship="${i}" data-k="type">${opts(Poster.SHIP_TYPES.map((x) => [x, t('ship.' + x)]), s.type)}</select><input type="range" data-ship="${i}" data-k="s" min="0.5" max="2" step="0.05" value="${s.s || 1}" aria-label="${esc(t('insp.size'))}"><button class="btn small" type="button" data-shipflip="${i}" title="${esc(t('d.ships.flip'))}">⇋</button><button class="btn small" type="button" data-shipdel="${i}" title="${esc(t('f.delete'))}">×</button></li>`).join('')}</ul>
        <div class="acts"><button class="btn small" type="button" data-act="addShip">${esc(t('d.ships.add'))}</button></div><p class="note">${esc(t('d.ships.hint'))}</p>`, openSecs.has('d.ships'))}
      ${proSec('d.texts', `<ul class="rows">${texts.map((x, i) => `<li class="mini tx"><input data-text="${i}" data-k="text" value="${esc(x.text)}" placeholder="${esc(t('d.texts.ph'))}"><select data-text="${i}" data-k="style">${opts(['italic', 'caps', 'script', 'roman'].map((v) => [v, t('d.tstyle.' + v)]), x.style || 'italic')}</select>
          <input type="range" data-text="${i}" data-k="size" min="12" max="90" step="1" value="${x.size || 26}" aria-label="${esc(t('insp.size'))}"><input type="range" data-text="${i}" data-k="rot" min="-90" max="90" step="1" value="${x.rot || 0}" aria-label="${esc(t('d.texts.rot'))}"><button class="btn small" type="button" data-textdel="${i}">×</button></li>`).join('')}</ul>
        <div class="acts"><button class="btn small" type="button" data-act="addText">${esc(t('d.texts.add'))}</button></div><p class="note">${esc(t('d.texts.hint'))}</p>`, openSecs.has('d.texts'))}
      <section><div class="acts" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" type="button" data-act="resetView">${esc(t('d.resetView'))}</button><button class="btn small" type="button" data-act="resetStyle">${esc(t('d.resetStyle'))}</button></div></section>`;
  }
  $('design').addEventListener('toggle', (e) => {
    const d = e.target; if (d.tagName !== 'DETAILS') return;
    const k = [...d.querySelectorAll('summary')][0].textContent; // stable enough: store by index instead
    const idx = [...$('design').querySelectorAll('details')].indexOf(d), keys = ['d.colors', 'd.type', 'd.water', 'd.furniture', 'd.routes', 'd.ships', 'd.texts'];
    if (keys[idx]) { d.open ? openSecs.add(keys[idx]) : openSecs.delete(keys[idx]); store.set('mh:dsec', [...openSecs]); }
    void k;
  }, true);
  const needPro = () => { if (pro()) return false; lockedToast(); return true; };
  $('design').addEventListener('input', (e) => {
    const el = e.target, d = el.dataset;
    if (d.pal !== undefined) { design.palette[+d.pal] = el.value; return designChanged(); }
    if (d.ship !== undefined) { const s = poster.ensureShips()[+d.ship]; if (!s) return; s[d.k] = d.k === 's' ? +el.value : el.value; return designChanged(); }
    if (d.text !== undefined) { const x = design.texts[+d.text]; x[d.k] = el.type === 'range' ? +el.value : el.value; return designChanged(); }
    if (!d.set || el.type === 'checkbox' || el.tagName === 'SELECT') return;
    set(d.set, d.num ? +el.value : el.value); designChanged();
  });
  $('design').addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'insAuto') { design.insets.pick = el.checked ? null : Poster.model(state, design).insets.map((p) => p.key); renderDesign(); return designChanged(); }
    if (el.dataset.pick) { const s = new Set(design.insets.pick || []); el.checked ? s.add(el.dataset.pick) : s.delete(el.dataset.pick); design.insets.pick = [...s]; return designChanged(); }
    if (el.dataset.ship !== undefined && el.tagName === 'SELECT') { poster.ensureShips()[+el.dataset.ship].type = el.value; return designChanged(); }
    if (el.dataset.text !== undefined && el.tagName === 'SELECT') { design.texts[+el.dataset.text].style = el.value; return designChanged(); }
    if (el.type === 'checkbox' && el.dataset.set) { set(el.dataset.set, el.checked); designChanged(); if (el.dataset.set === 'relief.shade') renderDesign(); return; }
    if (el.tagName === 'SELECT' && el.dataset.set) { set(el.dataset.set, el.value); designChanged(); if (el.dataset.set === 'relief.style') { if (!design.show.relief) design.show.relief = true; renderDesign(); } if (el.dataset.set === 'insets.look') { if (el.value === 'custom') design.insets.colors = { sea: design.sea, land: design.land, lake: design.lake || design.sea, ink: design.coast.color, city: design.city.style, hatch: design.city.hatch !== false, ...(design.insets.colors || {}) }; renderDesign(); } }
  });
  // Switching the style keeps the content and layout the person chose, but takes colours and drawing from the new style.
  const KEEP = ['format', 'subtitle', 'view', 'panel', 'panelSize', 'pos', 'insetCfg', 'legendTitle', 'panelTitle', 'texts', 'ships', 'labelSize'];
  let myStyles = [];
  async function loadStyles() { if (!pro()) { myStyles = []; return; } try { myStyles = (await api('/api/styles', null, 'GET')).styles || []; } catch { myStyles = []; } }
  const styleOnly = (d) => { const o = JSON.parse(JSON.stringify(d)); for (const k of KEEP) delete o[k]; delete o.userStyle; if (o.insets) delete o.insets.pick; return o; };
  function applyStyle(st) {
    const keep = {}; for (const k of KEEP) if (design[k] !== undefined) keep[k] = JSON.parse(JSON.stringify(design[k]));
    const pick = design.insets.pick, max = design.insets.max;
    design = Poster.design({ ...JSON.parse(JSON.stringify(st)), ...keep }, state.mode); design.insets.pick = pick; design.insets.max = max;
  }
  function applyPreset(name) {
    const keep = {}; for (const k of KEEP) if (design[k] !== undefined) keep[k] = JSON.parse(JSON.stringify(design[k]));
    const pick = design.insets.pick, max = design.insets.max;
    design = Poster.design({ preset: name, ...keep }, state.mode); design.insets.pick = pick; design.insets.max = max;
  }
  $('design').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (e.target.closest('[data-udel]')) { const id = e.target.closest('[data-udel]').dataset.udel; if (!confirm(t('d.delStyle'))) return; try { await api('/api/styles/' + id, null, 'DELETE'); myStyles = myStyles.filter((x) => x.id !== id); if (design.userStyle === id) delete design.userStyle; renderDesign(); saveDesignSoon(); } catch (e2) { toast(e2.message); } return; }
    if (d.preset) { applyPreset(d.preset); delete design.userStyle; renderDesign(); return designChanged(); }
    if (d.ustyle) { const st = myStyles.find((x) => x.id === d.ustyle); if (st) { applyStyle(st.design); design.userStyle = st.id; renderDesign(); designChanged(); } return; }
    if (d.act === 'scratch') { if (needPro()) return; applyPreset('blank'); delete design.userStyle; openSecs.add('d.colors'); openSecs.add('d.type'); renderDesign(); toast(t('d.scratchHint')); return designChanged(); }
    if (d.act === 'saveStyle') {
      if (needPro()) return;
      const cur0 = myStyles.find((x) => x.id === design.userStyle), name = prompt(t('d.styleName'), cur0 ? cur0.name : t('d.myStyle')); if (!name) return;
      const same = myStyles.find((x) => x.name === name.trim()) || (cur0 && cur0.name === name.trim() ? cur0 : null);
      try {
        const r = await api('/api/styles', { id: same ? same.id : undefined, name, design: styleOnly(design) });
        myStyles = [r, ...myStyles.filter((x) => x.id !== r.id)]; design.userStyle = r.id; renderDesign(); saveDesignSoon(); toast(t('d.styleSaved'));
      } catch (e2) { toast(e2.message); }
      return;
    }
    if (d.set) { set(d.set, d.val); renderDesign(); return designChanged({ refit: d.set === 'format' && !design.view }); }
    if (d.act === 'resetView') { design.view = null; poster.select(null); paint({ keepView: false }); return saveDesignSoon(); }
    if (d.act === 'resetStyle') { applyPreset(design.preset); renderDesign(); return designChanged(); }
    if ((d.act === 'addShip' || d.act === 'addText' || d.act === 'shipsAuto' || d.shipflip || d.shipdel || d.textdel) && needPro()) return;
    if (d.act === 'addShip') { design.show.ships = true; const at = poster.seaSpot(); poster.ensureShips().push({ type: design.shipTypes[0] || 'galleon', x: at.x, y: at.y, s: 1, flip: at.x > 0.5 }); renderDesign(); designChanged(); return poster.select('ship:' + (design.ships.length - 1)); }
    if (d.act === 'shipsAuto') { design.ships = null; poster.select(null); designChanged(); return renderDesign(); }
    if (d.shipflip) { const s = poster.ensureShips()[+d.shipflip]; s.flip = !s.flip; return designChanged(); }
    if (d.shipdel) { poster.ensureShips().splice(+d.shipdel, 1); poster.select(null); designChanged(); return renderDesign(); }
    if (d.act === 'addText') { (design.texts ||= []).push({ text: t('d.texts.sample'), x: 0.5, y: 0.35, size: 30, rot: 0, style: 'caps' }); renderDesign(); designChanged(); return poster.select('text:' + (design.texts.length - 1)); }
    if (d.textdel) { design.texts.splice(+d.textdel, 1); poster.select(null); designChanged(); return renderDesign(); }
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
    for (const ev of sel.events) if (!Poster.hasGeo(ev)) { const g = found[ev.query]; if (g) Object.assign(ev, { lat: g.lat, lng: g.lng, geo: 'osm', kind: g.kind || '' }); else miss++; }
    const root = sel.people.find((p) => p.id === sel.rootId);
    const title = root ? (I18N.lang === 'ru' ? 'Род: ' : 'The family of ') + root.name : '';
    await createNew('tree', { side: $('gedScope').value !== 'direct' }, { title, people: sel.people, events: sel.events, rootId: sel.rootId });
    $('gedStatus').textContent = t('i.done', { n: miss }); btn.disabled = false;
  });

  // ---------- header ----------
  $('title').addEventListener('change', async () => {
    try { const m = await api(`/api/maps/${cur.id}`, { token: cur.token, title: $('title').value }, 'PATCH'); state.title = m.title; paint(); remember({ ...cur, title: m.title }); toast(t('toast.saved')); } catch (e) { toast(e.message); }
  });
  function drawShare() {
    const p = $('sharePop'), url = location.origin + '/m/' + cur.id;
    p.innerHTML = `<h4>${esc(t('share.title'))}</h4><label><input type="checkbox" id="shareOn" ${state.shared ? 'checked' : ''}> <span>${esc(t(state.shared ? 'share.on' : 'share.off'))}</span></label>
      ${state.shared ? `<input type="text" readonly value="${esc(url)}"><button class="btn small primary" type="button" id="shareCopy">${esc(t('share.copy'))}</button>` : ''}`;
  }
  $('share').addEventListener('click', (e) => { if (!cur) return; e.stopPropagation(); const p = $('sharePop'); p.hidden = !p.hidden; if (!p.hidden) drawShare(); });
  document.addEventListener('click', (e) => { const p = $('sharePop'); if (!p.hidden && !p.contains(e.target)) p.hidden = true; });
  $('sharePop').addEventListener('change', async (e) => {
    if (e.target.id !== 'shareOn') return;
    try { const m = await api(`/api/maps/${cur.id}`, { shared: e.target.checked }, 'PATCH'); state.shared = m.shared; drawShare(); } catch (err) { toast(err.message); }
  });
  $('sharePop').addEventListener('click', async (e) => {
    if (e.target.id !== 'shareCopy') return;
    const url = location.origin + '/m/' + cur.id;
    if (navigator.share && small()) { try { await navigator.share({ title: state.title || t('familyMap'), url }); return; } catch {} }
    try { await navigator.clipboard.writeText(url); toast(t('toast.copied')); } catch { prompt(t('btn.share'), url); }
  });
  function lockedToast() { toast(t('pro.locked')); }

  // ---------- inspector for chart elements ----------
  const NAMES = { cartouche: 'insp.cartouche', legend: 'insp.legend', compass: 'insp.compass', scale: 'insp.scale', panel: 'insp.panel' };
  function inspector(el, focusTitle) {
    const box = $('insp');
    if (!el || !state) { box.hidden = true; return; }
    const P = pro(), dis = P ? '' : 'disabled', lock = P ? '' : `<b class="lock">${esc(t('pro'))}</b>`;
    const rng = (path, min, max, step, v) => `<input type="range" data-ip="${path}" min="${min}" max="${max}" step="${step}" value="${v}" ${dis}>`;
    const hide = (k) => `<button class="btn small" type="button" data-ihide="${k}">${esc(t('insp.hide'))}</button>`;
    const reset = (k) => `<button class="btn small" type="button" data-ireset="${k}" ${dis}>${esc(t('insp.resetPos'))}</button>`;
    let html = '';
    if (el === 'cartouche') html = `<label>${esc(t('insp.title'))}<input data-ititle value="${esc(state.title)}" placeholder="${esc(t('title.ph'))}"></label>
      <label>${esc(t('insp.subtitle'))}<input data-ip="subtitle" value="${esc(design.subtitle)}" placeholder="${esc(t('d.subtitle.ph'))}"></label>
      <label>${esc(t('insp.style'))}${lock}<select data-ip="cartouche.style" ${dis}>${opts(['frame', 'scroll', 'medallion', 'block'].map((x) => [x, t('d.cart.' + x)]), design.cartouche.style)}</select></label>
      <label>${esc(t('insp.size'))}${lock}${rng('cartouche.size', 0.6, 1.6, 0.05, design.cartouche.size)}</label><div class="acts">${reset(el)}${hide(el)}</div>`;
    else if (el === 'legend') html = `<label>${esc(t('insp.heading'))}${lock}<input data-ip="legendTitle" value="${esc(design.legendTitle)}" placeholder="${esc(t('p.legend'))}" ${dis}></label><div class="acts">${reset(el)}${hide(el)}</div>`;
    else if (el === 'compass') html = `<label>${esc(t('insp.size'))}${lock}${rng('compass.size', 0.5, 2, 0.05, design.compass.size)}</label>
      <label>${esc(t('insp.style'))}${lock}<select data-ip="compass.style" ${dis}>${opts(['ornate', 'simple', 'portolan', 'modern'].map((x) => [x, t('d.comp.' + x)]), design.compass.style)}</select></label><div class="acts">${reset(el)}${hide(el)}</div>`;
    else if (el === 'scale') html = `<label>${esc(t('insp.units'))}${lock}<select data-ip="scale.units" ${dis}>${opts([['km', t('insp.km')], ['mi', t('insp.mi')]], design.scale.units)}</select></label>
      <label>${esc(t('insp.size'))}${lock}${rng('scale.size', 0.6, 2, 0.05, design.scale.size)}</label><div class="acts">${reset(el)}${hide(el)}</div>`;
    else if (el === 'panel') html = `<label>${esc(t('insp.type'))}<select data-ip="panel">${opts(['auto', 'tree', 'chronicle', 'none'].map((x) => [x, t('d.panel.' + x)]), design.panel)}</select></label>
      <label>${esc(t('insp.width'))}${lock}${rng('panelSize', 0.2, 0.5, 0.01, design.panelSize)}</label>
      <label>${esc(t('insp.heading'))}${lock}<input data-ip="panelTitle" value="${esc(design.panelTitle)}" ${dis}></label>`;
    else if (el.startsWith('ship:')) {
      const i = +el.slice(5), sh = poster.ships[i]; if (!sh) { box.hidden = true; return; }
      html = `<label>${esc(t('d.ships.type'))}${lock}<select data-iship="type" ${dis}>${opts(Poster.SHIP_TYPES.map((x) => [x, t('ship.' + x)]), sh.type)}</select></label>
        <label>${esc(t('insp.size'))}${lock}<input type="range" data-iship="s" min="0.5" max="2" step="0.05" value="${sh.s || 1}" ${dis}></label>
        <div class="acts"><button class="btn small" type="button" data-ishipflip ${dis}>${esc(t('d.ships.flip'))}</button><button class="btn small" type="button" data-ishipdel ${dis}>${esc(t('f.delete'))}</button></div>`;
    } else if (el.startsWith('text:')) {
      const x = (design.texts || [])[+el.slice(5)]; if (!x) { box.hidden = true; return; }
      html = `<label>${esc(t('d.texts.text'))}<input data-itext="text" value="${esc(x.text)}"></label>
        <label>${esc(t('insp.style'))}<select data-itext="style">${opts(['italic', 'caps', 'script', 'roman'].map((v) => [v, t('d.tstyle.' + v)]), x.style || 'italic')}</select></label>
        <label>${esc(t('insp.size'))}<input type="range" data-itext="size" min="12" max="90" step="1" value="${x.size || 26}"></label>
        <label>${esc(t('d.texts.rot'))}<input type="range" data-itext="rot" min="-90" max="90" step="1" value="${x.rot || 0}"></label>
        <label>${esc(t('d.texts.spacing'))}<input type="range" data-itext="spacing" min="0" max="0.8" step="0.02" value="${x.spacing ?? 0.12}"></label>
        <label>${esc(t('f.color'))}<input type="color" data-itext="color" value="${/^#[0-9a-f]{6}$/i.test(x.color || '') ? x.color : design.ink}"></label>
        <div class="acts"><button class="btn small" type="button" data-itextdel>${esc(t('f.delete'))}</button></div>`;
    }
    else if (el.startsWith('inset:')) {
      const b = poster.boxes[el]; if (!b) { box.hidden = true; return; }
      const key = b.key, cfg = (design.insetCfg || {})[key] || {}, pl = Poster.model(state, design).places[key];
      html = `<p>${esc(t('insp.panHint'))}</p><label>${esc(t('insp.label'))}${lock}<input data-ilabel="${key}" value="${esc(cfg.label || '')}" placeholder="${esc(pl ? pl.e.place : '')}" ${dis}></label>
        <label>${esc(t('insp.detail'))}${lock}<input type="range" data-izoom="${key}" min="7" max="16.5" step="0.25" value="${Number.isFinite(cfg.z) ? cfg.z : design.insets.zoom}" ${dis}></label>
        <label>${esc(t('insp.roads'))}<input type="range" data-idetail="${key}" min="1" max="5" step="1" value="${Number.isFinite(cfg.d) ? cfg.d : design.insets.detail ?? 3}"></label>
        <label>${esc(t('d.insets.look'))}${lock}<select data-ilook="${key}" ${dis}>${opts([['', t('d.look.all')], ...Poster.PRESET_KEYS.map((k) => [k, t('d.preset.' + k)])], cfg.look || '')}</select></label>
        <div class="acts"><button class="btn small" type="button" data-imove="-1" data-key="${key}">←</button><button class="btn small" type="button" data-imove="1" data-key="${key}">→</button>
        <button class="btn small" type="button" data-ireset-inset="${key}" ${dis}>${esc(t('insp.resetInset'))}</button><button class="btn small" type="button" data-iremove="${key}">${esc(t('insp.remove'))}</button></div>`;
    }
    const name = el.startsWith('inset:') ? t('insp.inset') : el.startsWith('ship:') ? t('insp.ship') : el.startsWith('text:') ? t('insp.text') : t(NAMES[el]);
    box.innerHTML = `<h4><span>${esc(name)}</span><button type="button" data-iclose aria-label="${esc(t('f.cancel'))}">×</button></h4>${html}`;
    box.hidden = false;
    if (focusTitle && el === 'cartouche') { const i = box.querySelector('[data-ititle]'); i.focus(); i.select(); }
  }
  const setPath = (path, val) => { const ks = path.split('.'); let o = design; ks.slice(0, -1).forEach((k) => (o = o[k] ||= {})); o[ks[ks.length - 1]] = val; };
  const explicitPick = () => { if (!Array.isArray(design.insets.pick)) design.insets.pick = Poster.model(state, design).insets.map((p) => p.key); return design.insets.pick; };
  $('insp').addEventListener('input', (e) => {
    const d = e.target.dataset;
    if (d.ip) { setPath(d.ip, e.target.type === 'range' ? +e.target.value : e.target.value); paint(); saveDesignSoon(); }
    const sel = poster.selected || '';
    if (d.iship && sel.startsWith('ship:')) { const sh = poster.ensureShips()[+sel.slice(5)]; sh[d.iship] = e.target.type === 'range' ? +e.target.value : e.target.value; paint(); saveDesignSoon(); }
    if (d.itext && sel.startsWith('text:')) { const x = design.texts[+sel.slice(5)]; x[d.itext] = e.target.type === 'range' ? +e.target.value : e.target.value; paint(); saveDesignSoon(); if (document.querySelector('.app').dataset.view === 'design' && d.itext === 'text') { const inp = $('design').querySelector(`[data-text="${sel.slice(5)}"][data-k="text"]`); if (inp) inp.value = e.target.value; } }
    if (d.ilabel) { ((design.insetCfg ||= {})[d.ilabel] ||= {}).label = e.target.value; paint(); saveDesignSoon(); }
    if (d.izoom) { ((design.insetCfg ||= {})[d.izoom] ||= {}).z = +e.target.value; paint(); saveDesignSoon(); }
    if (d.idetail) { ((design.insetCfg ||= {})[d.idetail] ||= {}).d = +e.target.value; paint(); saveDesignSoon(); }
  });
  $('insp').addEventListener('change', async (e) => {
    const d = e.target.dataset, sel = poster.selected || '';
    if (e.target.tagName === 'SELECT' && d.iship && sel.startsWith('ship:')) { poster.ensureShips()[+sel.slice(5)].type = e.target.value; paint(); saveDesignSoon(); return; }
    if (e.target.tagName === 'SELECT' && d.itext && sel.startsWith('text:')) { design.texts[+sel.slice(5)].style = e.target.value; paint(); saveDesignSoon(); return; }
    if (e.target.tagName === 'SELECT' && d.ilook) { const c = ((design.insetCfg ||= {})[d.ilook] ||= {}); if (e.target.value) c.look = e.target.value; else delete c.look; paint(); saveDesignSoon(); return; }
    if (e.target.tagName === 'SELECT' && d.ip) { setPath(d.ip, e.target.value); paint(); saveDesignSoon(); return; }
    if (e.target.dataset.ititle === undefined) return;
    try { const m = await api(`/api/maps/${cur.id}`, { token: cur.token, title: e.target.value }, 'PATCH'); state.title = m.title; $('title').value = m.title; paint(); remember({ ...cur, title: m.title }); } catch (err) { toast(err.message); }
  });
  $('insp').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.iclose !== undefined) { poster.select(null); return; }
    const cur2 = poster.selected || '';
    if (d.ishipflip !== undefined) { const sh = poster.ensureShips()[+cur2.slice(5)]; sh.flip = !sh.flip; paint(); saveDesignSoon(); return; }
    if (d.ishipdel !== undefined) { poster.ensureShips().splice(+cur2.slice(5), 1); poster.select(null); paint(); saveDesignSoon(); if (document.querySelector('.app').dataset.view === 'design') renderDesign(); return; }
    if (d.itextdel !== undefined) { design.texts.splice(+cur2.slice(5), 1); poster.select(null); paint(); saveDesignSoon(); if (document.querySelector('.app').dataset.view === 'design') renderDesign(); return; }
    if (d.ihide) { design.show[d.ihide] = false; poster.select(null); paint(); saveDesignSoon(); return; }
    if (d.ireset) { if (design.pos) delete design.pos[d.ireset]; paint(); saveDesignSoon(); return; }
    if (d.iresetInset) { const c = (design.insetCfg || {})[d.iresetInset]; if (c) { delete c.lat; delete c.lng; delete c.z; } paint(); saveDesignSoon(); inspector(poster.selected); return; }
    if (d.iremove) { design.insets.pick = explicitPick().filter((k) => k !== d.iremove); poster.select(null); paint(); saveDesignSoon(); return; }
    if (d.imove) {
      const list = explicitPick(), i = list.indexOf(d.key), j = i + +d.imove;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]]; paint(); saveDesignSoon(); poster.select('inset:' + j);
    }
  });

  // ---------- export and print ----------
  const allowedSizes = () => Account.limits().sizes || ['screen', '3200'];
  function exportDialog() {
    if (!state || !state.events.some(Poster.hasGeo)) return toast(t('toast.emptyMap'));
    const fmt = design.format, lim = Account.limits(), left = Account.me && Account.me.exportsLeft;
    let size = store.get('mh:size', '3200'); if (!allowedSizes().includes(size)) size = '3200';
    const dim = (k) => { const w = Poster.exportWidth(k, fmt), r = { landscape: 1600 / 1131, portrait: 1131 / 1600, square: 1 }[fmt]; return `${w} × ${Math.round(w / r)} px`; };
    const dlg = document.createElement('div'); dlg.className = 'dlg'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true');
    dlg.innerHTML = `<div class="box"><h3><span>${esc(t('ex.title'))}</span><button type="button" data-close aria-label="${esc(t('f.cancel'))}">×</button></h3>
      <p class="note">${esc(left == null ? t('acc.unlimited') : t('acc.exports', { n: left }))}</p>
      <div class="sizes">${['screen', '3200', 'a3', 'a2'].map((k) => { const ok = allowedSizes().includes(k); return `<label class="sizeopt ${ok ? '' : 'off'}"><input type="radio" name="size" value="${k}" ${k === size ? 'checked' : ''} ${ok ? '' : 'disabled'}><span><b>${esc(t('size.' + k))}</b><small>${esc(dim(k))}${k === 'a3' || k === 'a2' ? ' · ' + esc(t('size.print')) : ''}</small></span>${ok ? '' : `<b class="lock">${esc(t('pro'))}</b>`}</label>`; }).join('')}</div>
      <label class="chk" style="margin-top:10px"><input type="checkbox" id="exJpg"> ${esc(t('ex.jpg'))}</label>
      <div class="progress" hidden><i></i></div><p class="err" role="alert"></p>
      <div class="acts">${Account.me && Account.me.print ? `<button class="btn" type="button" data-print>${esc(t('print.btn'))}</button>` : ''}<button class="btn primary" type="button" data-go>${esc(t('btn.download'))}</button></div></div>`;
    document.body.appendChild(dlg);
    const close = () => { dlg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    dlg.addEventListener('click', async (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) return close();
      if (e.target.closest('[data-print]')) { close(); return PrintOrder.open({ mapId: cur.id, state, design, poster }); }
      if (!e.target.closest('[data-go]')) return;
      const k = dlg.querySelector('input[name=size]:checked').value, jpg = dlg.querySelector('#exJpg').checked, go = e.target.closest('[data-go]');
      const bar = dlg.querySelector('.progress'), err = dlg.querySelector('.err');
      store.set('mh:size', k); go.disabled = true; bar.hidden = false; err.textContent = '';
      try {
        await api(`/api/maps/${cur.id}/export`, { size: k });
        const { blob, reduced, width: gotW } = await Poster.exportPNG(state, design, { view: poster.currentView(), width: Poster.exportWidth(k, design.format), ships: poster.ships,
          type: jpg ? 'image/jpeg' : 'image/png', onProgress: (v) => (bar.firstChild.style.width = v * 100 + '%') });
        Poster.download(blob, Poster.slug(state.title || t('title.ph')) + '-' + k + (jpg ? '.jpg' : '.png'));
        toast(reduced ? t('toast.reduced', { w: gotW }) : t('toast.exported')); Account.load(); close();
      } catch (e2) { err.textContent = e2.message || 'Export failed'; go.disabled = false; bar.hidden = true; }
    });
    void lim;
  }
  $('export').addEventListener('click', exportDialog);
  $('newMap').addEventListener('click', () => { showProjects(); $('projects').scrollTop = 0; });
  let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => paint(), 150); });
  I18N.on(() => { renderMyMaps(); paint(); renderLog(); const v = document.querySelector('.app').dataset.view; if (v !== 'chat' && v !== 'map') setView(v); if (!$('projects').hidden) renderProjects(); if (poster.selected) inspector(poster.selected); if (document.body.dataset.auth === 'out') showAuth(); });
  async function deleteMap() {
    if (!cur || !confirm(t('acc.delMapQ'))) return;
    try { await api(`/api/maps/${cur.id}`, { token: cur.token }, 'DELETE'); maps = maps.filter((m) => m.id !== cur.id); cur = null; state = null; store.set('mh:current', null); renderMyMaps(); toast(t('toast.removed')); maps.length ? load(maps[0].id) : showStart(); } catch (e) { toast(e.message); }
  }

  // ---------- boot ----------
  async function load(id) {
    cur = { id }; closeForms(false); hideStart(); msgs = []; renderLog(); state = null; design = null; poster.select(null);
    try {
      const h = await api(`/api/maps/${id}/history`, {});
      msgs = h.messages; renderLog();
      setState(h.map, { fit: true }); remember({ ...cur, title: h.map.title }); history.replaceState(null, '', '/create?id=' + id);
    } catch (e) {
      if (e.status === 404 || e.status === 403) { store.set('mh:current', null); return showStart(); }
      addMsg('err', e.message);
    }
  }
  async function createNew(mode, options, seed, o = {}) {
    try {
      const r = await api('/api/maps', { lang: I18N.lang, mode, options, state: seed });
      cur = { id: r.id, token: r.token }; closeForms(false); hideStart(); state = null; design = null; poster.select(null);
      msgs = r.messages; renderLog(); maps.unshift({ id: r.id, title: r.map.title, mode, preset: (seed && seed.design && seed.design.preset) || 'discovery', people: 0, places: 0, updated_at: Date.now() }); remember({ ...cur, title: r.map.title });
      setState(r.map, { fit: true }); history.replaceState(null, '', '/create?id=' + r.id);
      setView(o.view || (seed && seed.events ? 'design' : 'chat'));
    } catch (e) { toast(e.message); }
  }
  function showAuth() {
    document.body.dataset.auth = 'out'; $('auth').hidden = false;
    $('auth').innerHTML = `<div class="side" id="authSide"></div><div class="pic"><blockquote>${esc(t('hero.title'))}</blockquote></div>`;
    Account.renderAuth($('authSide'), start);
  }
  async function start() {
    const me = await Account.load();
    if (!me.user) return showAuth();
    document.body.dataset.auth = 'in'; $('auth').hidden = true; $('avatar').hidden = false;
    Account.menu($('avatar'), [{ label: t('acc.delMap'), danger: true, run: deleteMap }]);
    await Promise.all([loadMaps(), loadStyles()]);
    const qs = new URLSearchParams(location.search), want = qs.get('id') || store.get('mh:current', null);
    if (want && maps.some((m) => m.id === want)) { await load(want); if (qs.get('tab')) setView(qs.get('tab')); }
    else if (maps.length && !qs.get('tab')) await load(maps[0].id);
    else { showStart(); if (qs.get('tab') === 'import') setView('import'); }
  }
  I18N.apply();
  start();
})();
