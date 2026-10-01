/* MapHeritage: sign-in, sign-up, Google, account menu */
(function () {
  const { t } = I18N, esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = { me: null };
  A.load = async () => { try { A.me = await (await fetch('/api/auth/me', { cache: 'no-store' })).json(); } catch { A.me = { user: null, plans: {} }; } return A.me; };
  A.plan = () => (A.me && A.me.user ? A.me.user.plan : 'lite');
  A.limits = () => (A.me && A.me.plans ? A.me.plans[A.plan()] : { presets: ['discovery', 'portolan', 'admiralty', 'night', 'atlas'], custom: false, exports: 5, sizes: ['screen', '3200'] }) || {};

  A.renderAuth = function (el, onDone) {
    let mode = 'signin';
    const err = new URLSearchParams(location.search).get('auth_error');
    const next = encodeURIComponent(location.pathname + location.search.replace(/[?&]auth_error=[^&]*/, ''));
    const gHref = (c) => `/api/auth/google?next=${next}&consent=${c}`;
    const draw = (msg) => {
      el.innerHTML = `<div class="auth"><h2>${esc(t('auth.title'))}</h2><p>${esc(t('auth.p'))}</p>
        ${A.me && A.me.google ? `<a class="btn google" id="gBtn" href="${gHref(mode === 'signup' ? '1' : '0')}"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.3 5.7c4.3-4 7-9.9 7-17.1z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6a24 24 0 0 0 0 21.4l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>${esc(t('auth.google'))}</a><div class="or"><span>${esc(t('auth.or'))}</span></div>` : ''}
        <form id="authForm" class="aform">
          ${mode === 'signup' ? `<label>${esc(t('auth.name'))}<input name="name" autocomplete="name" maxlength="80"></label>` : ''}
          <label>${esc(t('auth.email'))}<input name="email" type="email" autocomplete="email" required></label>
          <label>${esc(t('auth.password'))}<input name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="8" required>${mode === 'signup' ? `<small>${esc(t('auth.min'))}</small>` : ''}</label>
          ${mode === 'signup' ? `<label class="chk"><input type="checkbox" name="terms" value="1"> <span>${t('auth.terms').replace('{agb}', '<a href="/agb" target="_blank" rel="noopener">' + esc(t('legal.terms')) + '</a>').replace('{privacy}', '<a href="/datenschutz" target="_blank" rel="noopener">' + esc(t('legal.privacy')) + '</a>')}</span></label>
          <label class="chk"><input type="checkbox" name="age" value="1"> <span>${esc(t('auth.age'))}</span></label>` : ''}
          <p class="aerr" role="alert">${msg ? esc(msg) : ''}</p>
          <button class="btn primary big" type="submit">${esc(t(mode === 'signup' ? 'auth.signup' : 'auth.signin'))}</button>
        </form>
        <button class="linkbtn" type="button" id="authSwitch">${esc(t(mode === 'signup' ? 'auth.toSignin' : 'auth.toSignup'))}</button>
        ${mode === 'signin' ? `<p><a href="/reset">${esc(t('auth.forgot'))}</a></p>` : ''}
        <p class="legal"><a href="/impressum">${esc(t('legal.impressum'))}</a> · <a href="/datenschutz">${esc(t('legal.privacy'))}</a> · <a href="/agb">${esc(t('legal.terms'))}</a></p></div>`;
      const g = el.querySelector('#gBtn'), fm = el.querySelector('#authForm');
      if (g && mode === 'signup') {
        const sync = () => { const ok = fm.terms.checked && fm.age.checked; g.href = gHref(ok ? '1' : '0'); g.classList.toggle('dis', !ok); };
        fm.addEventListener('change', sync); sync();
        g.addEventListener('click', (e) => { if (!(fm.terms.checked && fm.age.checked)) { e.preventDefault(); el.querySelector('.aerr').textContent = t('auth.err.terms'); } });
      }
      el.querySelector('#authSwitch').onclick = () => { mode = mode === 'signup' ? 'signin' : 'signup'; draw(); };
      el.querySelector('#authForm').onsubmit = async (e) => {
        e.preventDefault();
        const b = e.target.querySelector('button[type=submit]'); b.disabled = true;
        const body = Object.fromEntries(new FormData(e.target));
        if (mode === 'signup') { body.terms = body.terms === '1'; body.age = body.age === '1'; if (!body.terms || !body.age) { b.disabled = false; el.querySelector('.aerr').textContent = t(!body.terms ? 'auth.err.terms' : 'auth.err.age'); return; } }
        try {
          const r = await fetch('/api/auth/' + (mode === 'signup' ? 'register' : 'login'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) { b.disabled = false; const k = 'auth.err.' + (j.error || 'bad_login'); el.querySelector('.aerr').textContent = t(k) === k ? t('err.' + j.error) : t(k); return; }
          await A.load(); await A.claim(); onDone && onDone();
        } catch { b.disabled = false; el.querySelector('.aerr').textContent = t('err.network'); }
      };
    };
    if (err === 'terms') mode = 'signup';
    draw(err ? t('auth.err.' + err) : '');
  };

  // Maps created in this browser before accounts existed move into the account.
  A.claim = async () => {
    let list = []; try { list = JSON.parse(localStorage.getItem('mh:maps')) || []; } catch {}
    if (!list.length) return;
    try { await fetch('/api/maps/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ maps: list.map(({ id, token }) => ({ id, token })) }) }); localStorage.removeItem('mh:maps'); } catch {}
  };

  A.menu = function (btn, extra = []) {
    let pop = null;
    const close = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('click', outside, true); } };
    const outside = (e) => { if (pop && !pop.contains(e.target) && e.target !== btn) close(); };
    btn.onclick = () => {
      if (pop) return close();
      const u = A.me.user, left = A.me.exportsLeft;
      pop = document.createElement('div'); pop.className = 'pop acc';
      pop.innerHTML = `<p class="who"><b>${esc(u.name || u.email)}</b><small>${esc(u.email)}</small></p>
        <p class="planline"><span class="badge ${u.plan}">${esc(t('pl.' + u.plan))}</span> ${esc(left == null ? t('acc.unlimited') : t('acc.exports', { n: left }))}</p>
        <a href="/plans">${esc(t('acc.plans'))}</a>${extra.map((x, i) => `<button type="button" data-i="${i}" class="${x.danger ? 'danger' : ''}">${esc(x.label)}</button>`).join('')}
        <a href="/api/auth/export" download>${esc(t('acc.data'))}</a>
        <button type="button" data-act="out">${esc(t('acc.signout'))}</button><button type="button" data-act="del" class="danger">${esc(t('acc.delAcc'))}</button>`;
      btn.parentNode.appendChild(pop);
      pop.onclick = async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.i) { close(); return extra[+b.dataset.i].run(); }
        if (b.dataset.act === 'out') { await fetch('/api/auth/logout', { method: 'POST' }); location.reload(); }
        if (b.dataset.act === 'del') {
          if (prompt(t('acc.delAccQ')) !== 'DELETE') return;
          const r = await fetch('/api/auth/me', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) });
          if (r.ok) location.href = '/';
        }
      };
      setTimeout(() => document.addEventListener('click', outside, true));
    };
    btn.textContent = (A.me.user.name || A.me.user.email || '?').trim()[0].toUpperCase();
    btn.title = A.me.user.email;
  };
  window.Account = A;
})();
