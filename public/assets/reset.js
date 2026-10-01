/* MapHeritage: forgot password / choose a new one */
(function () {
  const { t } = I18N, box = document.getElementById('box');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const token = new URLSearchParams(location.search).get('token');
  let sent = false, dev = '';
  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(t('auth.err.' + (j.error || 'x')) === 'auth.err.' + (j.error || 'x') ? t('err.' + (j.error || 'network')) : t('auth.err.' + j.error)); return j;
  }
  function draw(msg = '') {
    I18N.apply();
    if (token) box.innerHTML = `<h2>${esc(t('reset.new.t'))}</h2><form class="aform" id="f"><label>${esc(t('auth.password'))}<input name="password" type="password" autocomplete="new-password" minlength="8" required><small>${esc(t('auth.min'))}</small></label>
      <p class="aerr" role="alert">${esc(msg)}</p><button class="btn primary big" type="submit">${esc(t('reset.save'))}</button></form>`;
    else if (sent) box.innerHTML = `<h2>${esc(t('reset.sent.t'))}</h2><p>${esc(t('reset.sent.p'))}</p>${dev ? `<p><a href="${esc(dev)}">dev: ${esc(dev)}</a></p>` : ''}<p><a href="/create">${esc(t('auth.signin'))}</a></p>`;
    else box.innerHTML = `<h2>${esc(t('reset.t'))}</h2><p>${esc(t('reset.p'))}</p><form class="aform" id="f"><label>${esc(t('auth.email'))}<input name="email" type="email" autocomplete="email" required></label>
      <p class="aerr" role="alert">${esc(msg)}</p><button class="btn primary big" type="submit">${esc(t('reset.send'))}</button></form><p><a href="/create">${esc(t('auth.toSignin'))}</a></p>`;
    const f = document.getElementById('f'); if (!f) return;
    f.onsubmit = async (e) => {
      e.preventDefault(); const b = f.querySelector('button'); b.disabled = true;
      const v = Object.fromEntries(new FormData(f));
      try {
        if (token) { await post('/api/auth/reset/confirm', { token, password: v.password }); location.href = '/create'; }
        else { const j = await post('/api/auth/reset/request', { email: v.email, lang: I18N.lang }); sent = true; dev = j.devLink || ''; draw(); }
      } catch (err) { b.disabled = false; f.querySelector('.aerr').textContent = err.message; }
    };
  }
  I18N.on(() => draw()); draw();
})();
