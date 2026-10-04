/* MapHeritage: order a printed map. The price is recomputed on the server; this form only shows it. */
(function () {
  const { t } = I18N, esc = Poster.esc;
  let cfg = null;
  const money = (v, c) => { try { return new Intl.NumberFormat(({ ru: 'ru-RU', uk: 'uk-UA', en: 'en-IE', fr: 'fr-FR', es: 'es-ES' })[I18N.lang] || 'de-DE', { style: 'currency', currency: c || 'EUR' }).format(v); } catch { return v + ' ' + (c || 'EUR'); } };
  const zone = (c) => (c === 'DE' ? 'DE' : cfg.countries && ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'].includes(c) ? 'EU' : 'WORLD');
  const regionName = (c) => { try { return new Intl.DisplayNames([I18N.lang], { type: 'region' }).of(c); } catch { return c; } };

  async function open({ mapId, state, design, poster }) {
    if (!state || !state.events.some(Poster.hasGeo)) return;
    try { cfg = cfg || await (await fetch('/api/print/options')).json(); } catch { cfg = { enabled: false }; }
    const me = (window.Account && Account.me) || {};
    const dlg = document.createElement('div'); dlg.className = 'dlg'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true');
    const close = () => { dlg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape' && !busy) close(); };
    let busy = false;
    document.addEventListener('keydown', onKey);
    document.body.appendChild(dlg);
    if (!cfg.enabled) {
      dlg.innerHTML = `<div class="box"><h3><span>${esc(t('print.title'))}</span><button type="button" data-close>×</button></h3><p class="note">${esc(t('print.off'))}</p></div>`;
      dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) close(); });
      return;
    }
    const o = (group, prefix) => Object.keys(cfg[group]).map((k) => `<option value="${k}">${esc(t(prefix + k))}${+cfg[group][k].price ? ' · +' + esc(money(cfg[group][k].price, cfg.currency)) : ''}</option>`).join('');
    const fmtOpt = Object.keys(cfg.formats).map((k) => `<option value="${k}">${k.toUpperCase()} · ${esc(cfg.formats[k].mm || '')} mm · ${esc(money(cfg.formats[k].price, cfg.currency))}</option>`).join('');
    const countries = cfg.countries.map((c) => [c, regionName(c)]).sort((a, b) => (a[0] === 'DE' ? -1 : b[0] === 'DE' ? 1 : a[1].localeCompare(b[1])));
    const u = me.user || {};
    dlg.innerHTML = `<div class="box"><h3><span>${esc(t('print.title'))}</span><button type="button" data-close aria-label="${esc(t('f.cancel'))}">×</button></h3>
      <p class="note">${esc(t('print.p', { days: cfg.days || '7–10' }))}</p>
      <form class="grid" novalidate>
        <label>${esc(t('print.format'))}<select name="format">${fmtOpt}</select></label>
        <label>${esc(t('print.paper'))}<select name="paper">${o('papers', 'print.paper.')}</select></label>
        <label class="full">${esc(t('print.frame'))}<select name="frame">${o('frames', 'print.frame.')}</select></label>
        <label class="full">${esc(t('print.name'))}<input name="name" autocomplete="name" required maxlength="120" value="${esc(u.name || '')}"></label>
        <label class="full">${esc(t('print.street'))}<input name="street" autocomplete="street-address" required maxlength="160"></label>
        <label>${esc(t('print.zip'))}<input name="zip" autocomplete="postal-code" required maxlength="20"></label>
        <label>${esc(t('print.city'))}<input name="city" autocomplete="address-level2" required maxlength="100"></label>
        <label>${esc(t('print.country'))}<select name="country">${countries.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('')}</select></label>
        <label>${esc(t('print.phone'))}<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
        <label class="full">${esc(t('auth.email'))}<input name="email" type="email" autocomplete="email" required value="${esc(u.email || '')}"></label>
        <label class="full">${esc(t('print.note'))}<textarea name="note" rows="2" maxlength="1000"></textarea></label>
        <div class="full"><div class="price" id="prPrice"></div>
        <label class="chk"><input type="checkbox" name="agb" value="1"> <span>${t('print.agb').replace('{agb}', `<a href="/agb" target="_blank" rel="noopener">${esc(t('legal.terms'))}</a>`).replace('{privacy}', `<a href="/datenschutz" target="_blank" rel="noopener">${esc(t('legal.privacy'))}</a>`)}</span></label>
        <label class="chk"><input type="checkbox" name="custom" value="1"> <span>${esc(t('print.custom'))}</span></label></div>
      </form>
      <div class="progress" hidden><i></i></div><p class="err" role="alert"></p>
      <div class="acts"><button class="btn" type="button" data-close>${esc(t('f.cancel'))}</button><button class="btn primary" type="button" data-send>${esc(t('print.send'))}</button></div></div>`;
    const form = dlg.querySelector('form'), err = dlg.querySelector('.err'), bar = dlg.querySelector('.progress');
    const price = () => {
      const v = Object.fromEntries(new FormData(form)), ship = +cfg.shipping[zone(v.country)] || 0;
      const items = +cfg.formats[v.format].price + +cfg.papers[v.paper].price + +cfg.frames[v.frame].price;
      dlg.querySelector('#prPrice').innerHTML = `${esc(money(items + ship, cfg.currency))} <small>${esc(t('print.incl', { ship: money(ship, cfg.currency) }))}</small>`;
    };
    form.addEventListener('change', price); price();
    dlg.addEventListener('click', async (e) => {
      if ((e.target === dlg || e.target.closest('[data-close]')) && !busy) return close();
      if (!e.target.closest('[data-send]') || busy) return;
      const v = Object.fromEntries(new FormData(form));
      err.textContent = '';
      if (!v.name.trim() || !v.street.trim() || !v.zip.trim() || !v.city.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return (err.textContent = t('print.err.address'));
      if (v.agb !== '1' || v.custom !== '1') return (err.textContent = t('print.err.consent'));
      busy = true; const btn = e.target.closest('[data-send]'); btn.disabled = true; bar.hidden = false; btn.textContent = t('print.rendering');
      try {
        const d = Poster.design(design, state.mode), size = cfg.formats[v.format] ? v.format : 'a3';
        const { blob, reduced, width: gotW } = await Poster.exportPNG(state, design, { view: poster.currentView(), width: Poster.exportWidth(size, d.format), ships: poster.ships, type: 'image/jpeg',
          onProgress: (p) => (bar.firstChild.style.width = p * 80 + '%') });
        btn.textContent = t('print.uploading');
        const fd = new FormData(); for (const k in v) fd.append(k, v[k]);
        fd.append('mapId', mapId); if (reduced) fd.append('note_px', String(gotW)); fd.append('lang', I18N.lang); fd.append('file', blob, 'map.jpg');
        const r = await fetch('/api/print/order', { method: 'POST', body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(t('print.err.' + (j.error || 'server')) === 'print.err.' + (j.error || 'server') ? t('err.' + (j.error || 'model_failed')) : t('print.err.' + j.error));
        bar.firstChild.style.width = '100%';
        dlg.querySelector('.box').innerHTML = `<h3><span>${esc(t('print.done.t'))}</span><button type="button" data-close>×</button></h3><p class="note">${esc(t('print.done.p', { id: j.id, total: money(j.total, j.currency), email: v.email }))}</p><div class="acts"><button class="btn primary" type="button" data-close>OK</button></div>`;
        busy = false;
      } catch (e2) { busy = false; err.textContent = e2.message; btn.disabled = false; btn.textContent = t('print.send'); bar.hidden = true; }
    });
  }
  window.PrintOrder = { open };
})();
