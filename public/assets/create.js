/* MapHeritage: create/edit page */
(function () {
  const $ = (id) => document.getElementById(id);
  const { t, plural } = I18N, esc = MapKit.esc;
  const TYPES = ['birth', 'childhood', 'study', 'work', 'service', 'war', 'evacuation', 'move', 'marriage', 'death', 'other'];
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const small = () => innerWidth <= 820;
  let cur = null, busy = false, openId = null, draft = null, cancelPick = null;
  let state = { title: '', people: [], events: [] };
  const kit = MapKit.create($('map'), { padding: () => ({ topLeft: [48, 48], bottomRight: [48, $('legendbox').hidden ? 48 : 90] }) });

  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); }
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  async function api(path, body, method = 'POST') {
    let r;
    try { r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw Object.assign(new Error(t('err.network')), { code: 'network' }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const code = j.error || 'model_failed';
      const msg = t('err.' + code);
      throw Object.assign(new Error(msg === 'err.' + code ? code : msg), { status: r.status, code });
    }
    return j;
  }

  // ---------- views ----------
  function setView(v) {
    document.querySelector('.app').dataset.view = v;
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    if (v === 'map' || !small()) requestAnimationFrame(() => kit.invalidate());
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { setView(b.dataset.view); if (b.dataset.view === 'map') kit.fit(state.events); }));

  // ---------- my maps ----------
  const myMaps = () => store.get('mh:maps', []);
  function remember(m) {
    const list = myMaps().filter((x) => x.id !== m.id);
    list.unshift({ id: m.id, token: m.token, title: m.title || '' });
    store.set('mh:maps', list.slice(0, 30));
    store.set('mh:current', m.id);
    renderMyMaps();
  }
  function renderMyMaps() {
    const list = myMaps(), sel = $('myMaps');
    sel.hidden = list.length < 2;
    sel.innerHTML = list.map((m) => `<option value="${m.id}" ${cur && m.id === cur.id ? 'selected' : ''}>${esc(m.title || t('untitled'))}</option>`).join('');
  }

  // ---------- drawing ----------
  function draw(next, highlightNew) {
    const before = new Set(state.events.map((e) => e.id));
    state = next;
    const fresh = new Set(highlightNew ? state.events.filter((e) => !before.has(e.id)).map((e) => e.id) : []);
    const col = MapKit.colors(state.people);
    const used = new Set(state.events.map((e) => e.personId));
    const people = state.people.filter((p) => used.has(p.id));
    $('legendbox').hidden = people.length < 2;
    $('legend').innerHTML = people.map((p) => `<li><i style="background:${col[p.id]}"></i>${esc(p.name)} <small>${esc(MapKit.rel(p.relation))}</small></li>`).join('');
    $('empty').hidden = state.events.some(MapKit.hasGeo);
    kit.render(state, { highlight: fresh, fit: !openId });
    if (document.activeElement !== $('title')) $('title').value = state.title || '';
    $('viewMap').href = '/m/' + cur.id;
    renderEditor();
  }

  // ---------- chat ----------
  function addMsg(role, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + role; d.textContent = text;
    $('log').appendChild(d); $('log').scrollTop = $('log').scrollHeight;
  }
  async function send(text) {
    if (busy || !text.trim() || !cur) return;
    busy = true; $('send').disabled = true;
    addMsg('me', text);
    $('input').value = ''; grow();
    const ty = document.createElement('div'); ty.className = 'typing'; ty.textContent = t('thinking');
    $('log').appendChild(ty); $('log').scrollTop = $('log').scrollHeight;
    try {
      const r = await api(`/api/maps/${cur.id}/chat`, { token: cur.token, message: text });
      ty.remove(); addMsg('bot', r.reply);
      draw(r.map, true);
      remember({ ...cur, title: r.map.title });
    } catch (e) {
      ty.remove(); addMsg('err', e.message);
      $('input').value = text; grow();
    } finally { busy = false; $('send').disabled = false; if (!small()) $('input').focus(); }
  }
  function grow() { const i = $('input'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight + 4, 160) + 'px'; }
  $('input').addEventListener('input', grow);
  $('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($('input').value); } });
  $('form').addEventListener('submit', (e) => { e.preventDefault(); send($('input').value); });

  // ---------- editor ----------
  async function save(msg) {
    try {
      const m = await api(`/api/maps/${cur.id}`, { token: cur.token, state: { title: state.title, people: state.people, events: state.events } }, 'PATCH');
      draw(m, false);
      remember({ ...cur, title: m.title });
      if (msg) toast(msg);
      return m;
    } catch (e) { toast(e.message); }
  }
  function typeOptions(sel) { return TYPES.map((x) => `<option value="${x}" ${x === sel ? 'selected' : ''}>${esc(t('type.' + x))}</option>`).join(''); }
  function renderEditor() {
    const col = MapKit.colors(state.people), names = Object.fromEntries(state.people.map((p) => [p.id, p.name]));
    const events = MapKit.chrono(state.events);
    if (draft && !state.events.some((e) => e.id === draft.id)) events.unshift(draft);
    const row = (e) => {
      if (e.id === openId) return `<li>${form()}</li>`;
      const typ = e.type !== 'other' ? t('type.' + e.type) : '';
      return `<li><button class="ev-row" type="button" data-open="${esc(e.id)}"><i style="background:${col[e.personId] || '#000'}"></i><b>${esc(e.when || '—')}</b><span>${esc(e.place || '…')}<em class="${MapKit.hasGeo(e) ? '' : 'warn'}">${esc([names[e.personId], typ].filter(Boolean).join(', '))}${MapKit.hasGeo(e) ? '' : ' · ' + esc(t('noLoc'))}</em></span></button></li>`;
    };
    $('editor').innerHTML = `
      <section>
        <h3><span>${esc(t('edit.people'))}</span><button class="btn small" type="button" data-act="addPerson">${esc(t('edit.addPerson'))}</button></h3>
        ${state.people.length ? '' : `<p>${esc(t('edit.emptyPeople'))}</p>`}
        <ul class="people">${state.people.map((p) => `
          <li><button class="sw" type="button" data-sw="${esc(p.id)}" style="background:${col[p.id]}" title="${esc(t('swatch'))}" aria-label="${esc(t('swatch'))}"></button>
            <input class="ed-in" data-pn="${esc(p.id)}" value="${esc(p.name)}" placeholder="${esc(t('name.ph'))}" aria-label="${esc(t('name.ph'))}">
            <input class="ed-in" data-pr="${esc(p.id)}" value="${esc(p.relation)}" placeholder="${esc(t('relation.ph'))}" aria-label="${esc(t('relation.ph'))}">
            <button class="x" type="button" data-pdel="${esc(p.id)}" aria-label="${esc(t('f.delete'))}">×</button></li>`).join('')}</ul>
      </section>
      <section>
        <h3><span>${esc(t('edit.events'))}</span><button class="btn small" type="button" data-act="addEvent">${esc(t('edit.addEvent'))}</button></h3>
        ${events.length ? '' : `<p>${esc(t('edit.emptyEvents'))}</p>`}
        <ul class="events">${events.map(row).join('')}</ul>
      </section>`;
    const f = $('evform');
    if (f && !f.dataset.bound) bindForm(f);
  }
  function form() {
    const d = draft;
    return `<form class="ev-form" id="evform">
      <label>${esc(t('f.person'))}<select name="personId">${state.people.map((p) => `<option value="${esc(p.id)}" ${p.id === d.personId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label>${esc(t('f.place'))}<input name="place" value="${esc(d.place)}" required></label>
      <label>${esc(t('f.query'))}<span class="row"><input name="query" value="${esc(d.query)}" placeholder="Vitebsk, Belarus"><button class="btn small" type="button" data-act="find">${esc(t('f.find'))}</button></span></label>
      <div class="row"><span class="geo ${MapKit.hasGeo(d) ? 'ok' : 'no'}" id="geoStatus">${esc(t(MapKit.hasGeo(d) ? 'f.coords' : 'f.nocoords'))}</span><button class="linkbtn" type="button" data-act="pick">${esc(t('f.pick'))}</button></div>
      <div class="two"><label>${esc(t('f.year'))}<input name="year" type="number" min="1" max="2100" value="${d.year ?? ''}"></label>
        <label>${esc(t('f.when'))}<input name="when" value="${esc(d.when)}"></label></div>
      <label>${esc(t('f.type'))}<select name="type">${typeOptions(d.type)}</select></label>
      <label>${esc(t('f.note'))}<textarea name="note" maxlength="300">${esc(d.note)}</textarea></label>
      <div class="actions"><button class="btn small primary" type="submit">${esc(t('f.save'))}</button><button class="btn small" type="button" data-act="close">${esc(t('f.cancel'))}</button><button class="linkbtn del" type="button" data-act="delEvent">${esc(t('f.delete'))}</button></div>
    </form>`;
  }
  function readForm(f) {
    const v = Object.fromEntries(new FormData(f));
    const y = parseInt(v.year, 10);
    Object.assign(draft, { personId: v.personId, place: v.place.trim(), query: v.query.trim() || v.place.trim(), when: v.when.trim() || (y ? String(y) : ''), year: y > 0 ? y : null, type: v.type, note: v.note.trim() });
  }
  function setGeoStatus() {
    const s = $('geoStatus'); if (!s) return;
    s.className = 'geo ' + (MapKit.hasGeo(draft) ? 'ok' : 'no');
    s.textContent = t(MapKit.hasGeo(draft) ? 'f.coords' : 'f.nocoords');
    kit.preview(draft.lat, draft.lng);
  }
  function bindForm(f) {
    f.dataset.bound = '1';
    const q = f.elements.query, p = f.elements.place;
    p.addEventListener('input', () => { if (!q.dataset.touched) q.value = p.value; });
    q.addEventListener('input', () => { q.dataset.touched = '1'; if (draft.geo !== 'manual') { draft.lat = null; draft.lng = null; draft.geo = 'ai'; setGeoStatus(); } });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); readForm(f);
      const i = state.events.findIndex((x) => x.id === draft.id);
      const events = state.events.slice();
      if (i >= 0) events[i] = { ...draft }; else events.push({ ...draft });
      state = { ...state, events };
      closeForm(false);
      await save(t('toast.saved'));
    });
    if (!p.value) p.focus();
  }
  function openForm(ev) {
    draft = JSON.parse(JSON.stringify(ev)); openId = ev.id;
    renderEditor(); kit.preview(draft.lat, draft.lng);
  }
  function closeForm(render = true) {
    if (cancelPick) { cancelPick(); cancelPick = null; $('pickbar').hidden = true; }
    openId = null; draft = null; kit.preview(NaN, NaN);
    if (render) renderEditor();
  }

  $('editor').addEventListener('click', async (e) => {
    const el = e.target.closest('button'); if (!el) return;
    const d = el.dataset, f = $('evform');
    if (d.open) { const ev = state.events.find((x) => x.id === d.open); if (ev) openForm(ev); return; }
    if (d.sw) {
      const p = state.people.find((x) => x.id === d.sw), col = MapKit.colors(state.people)[p.id];
      p.color = MapKit.COLORS[(MapKit.COLORS.indexOf(col) + 1) % MapKit.COLORS.length];
      return save();
    }
    if (d.pdel) {
      const p = state.people.find((x) => x.id === d.pdel);
      if (!confirm(t('confirm.delPerson', { name: p.name }))) return;
      state = { ...state, people: state.people.filter((x) => x.id !== p.id), events: state.events.filter((x) => x.personId !== p.id) };
      if (draft && draft.personId === p.id) closeForm(false);
      return save(t('toast.removed'));
    }
    switch (d.act) {
      case 'addPerson':
        state.people.push({ id: uid('p'), name: '', relation: '' });
        renderEditor();
        [...document.querySelectorAll('[data-pn]')].pop().focus();
        return;
      case 'addEvent': {
        if (!state.people.length) { state.people.push({ id: uid('p'), name: t('me'), relation: '' }); }
        closeForm(false);
        openForm({ id: uid('m'), personId: state.people[0].id, year: null, when: '', type: 'other', place: '', query: '', lat: null, lng: null, note: '', geo: 'ai' });
        return;
      }
      case 'close': return closeForm();
      case 'delEvent': {
        const id = draft.id; closeForm(false);
        state = { ...state, events: state.events.filter((x) => x.id !== id) };
        return save(t('toast.removed'));
      }
      case 'find': {
        readForm(f); if (!draft.query) return;
        el.disabled = true;
        try {
          const r = await fetch('/api/geocode?q=' + encodeURIComponent(draft.query));
          if (!r.ok) throw 0;
          const g = await r.json();
          Object.assign(draft, { lat: g.lat, lng: g.lng, geo: 'osm' });
        } catch { toast(t('toast.notFound')); }
        el.disabled = false; setGeoStatus();
        return;
      }
      case 'pick': {
        readForm(f);
        if (small()) setView('map');
        $('pickbar').hidden = false;
        cancelPick = kit.pick((ll) => {
          cancelPick = null; $('pickbar').hidden = true;
          if (small()) setView('edit');
          if (ll) { const w = ll.wrap(); Object.assign(draft, { lat: +w.lat.toFixed(5), lng: +w.lng.toFixed(5), geo: 'manual' }); }
          setGeoStatus();
        });
        return;
      }
    }
  });
  $('pickCancel').addEventListener('click', () => { if (cancelPick) { cancelPick(); cancelPick = null; } $('pickbar').hidden = true; if (small()) setView('edit'); });
  $('editor').addEventListener('change', (e) => {
    const d = e.target.dataset;
    const p = state.people.find((x) => x.id === (d.pn || d.pr)); if (!p) return;
    if (d.pn) p.name = e.target.value.trim(); else p.relation = e.target.value.trim();
    if (p.name) save(t('toast.saved'));
  });

  // ---------- header actions ----------
  $('title').addEventListener('change', async () => {
    try { const m = await api(`/api/maps/${cur.id}`, { token: cur.token, title: $('title').value }, 'PATCH'); state.title = m.title; remember({ ...cur, title: m.title }); toast(t('toast.saved')); }
    catch (e) { toast(e.message); }
  });
  $('share').addEventListener('click', async () => {
    const url = location.origin + '/m/' + cur.id;
    if (navigator.share && small()) { try { await navigator.share({ title: state.title || t('familyMap'), url }); return; } catch {} }
    try { await navigator.clipboard.writeText(url); toast(t('toast.copied')); } catch { prompt(t('btn.share'), url); }
  });
  $('export').addEventListener('click', async () => {
    if (!state.events.some(MapKit.hasGeo)) return toast(t('toast.emptyMap'));
    const btn = $('export'); btn.disabled = true;
    try {
      if (small()) { setView('map'); await new Promise((r) => setTimeout(r, 60)); kit.invalidate(); }
      kit.preview(NaN, NaN); kit.fit(state.events);
      await kit.waitTiles();
      const geo = state.events.filter(MapKit.hasGeo), years = state.events.map((e) => e.year).filter(Boolean);
      const n = new Set(geo.map((e) => e.lat.toFixed(2) + ',' + e.lng.toFixed(2))).size;
      const title = state.title || t('title.ph');
      const { blob, tiles } = await kit.exportPNG(state, { title, subtitle: `${n} ${plural(n, 'count.places')}${years.length ? ', ' + Math.min(...years) + '–' + Math.max(...years) : ''}` });
      MapKit.download(blob, MapKit.slug(title) + '.png');
      toast(t(tiles ? 'toast.exported' : 'toast.noTiles'));
    } catch (e) { toast(e.message || 'Export failed'); }
    btn.disabled = false;
  });
  $('newMap').addEventListener('click', () => { if (state.events.length && !confirm(t('confirm.new'))) return; createNew(); });
  $('myMaps').addEventListener('change', (e) => open(e.target.value));
  addEventListener('resize', () => kit.invalidate());
  I18N.on(() => { renderMyMaps(); renderEditor(); kit.rerender(); });

  // ---------- boot ----------
  async function open(id) {
    const m = myMaps().find((x) => x.id === id);
    if (!m) return createNew();
    cur = { id: m.id, token: m.token }; closeForm(false);
    $('log').innerHTML = ''; state = { title: '', people: [], events: [] };
    try {
      const h = await api(`/api/maps/${id}/history`, { token: m.token });
      h.messages.forEach((x) => addMsg(x.role === 'assistant' ? 'bot' : 'me', x.content));
      draw(h.map, false);
      remember({ ...cur, title: h.map.title });
      history.replaceState(null, '', '/create?id=' + id);
    } catch (e) {
      if (e.status === 404 || e.status === 403) { store.set('mh:maps', myMaps().filter((x) => x.id !== id)); return createNew(); }
      addMsg('err', e.message);
    }
  }
  async function createNew() {
    $('log').innerHTML = ''; closeForm(false); state = { title: '', people: [], events: [] };
    try {
      const r = await api('/api/maps', { lang: I18N.lang });
      cur = { id: r.id, token: r.token };
      remember({ ...cur, title: '' });
      r.messages.forEach((x) => addMsg('bot', x.content));
      draw(r.map, false);
      history.replaceState(null, '', '/create?id=' + r.id);
      setView('chat');
    } catch (e) { addMsg('err', e.message); }
  }

  I18N.apply();
  const want = new URLSearchParams(location.search).get('id') || store.get('mh:current', null);
  if (want && myMaps().some((m) => m.id === want)) open(want); else createNew();
  if (!small()) $('input').focus();
  if (new URLSearchParams(location.search).get('tab') === 'edit') setView('edit');
})();
