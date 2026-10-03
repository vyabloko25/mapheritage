const $ = (id) => document.getElementById(id);
async function paint() {
  I18N.apply();
  const me = Account.me || await Account.load(), n = (me.plans && me.plans.lite && me.plans.lite.exports) || 5;
  $('liteN').textContent = I18N.t('pl.lite.4');
  const u = me.user;
  $('curLite').hidden = !(u && u.plan === 'lite'); $('curPro').hidden = !(u && u.plan === 'pro');
  $('reqDone').hidden = !(u && u.proRequested && u.plan !== 'pro');
  $('req').hidden = !!(u && (u.plan === 'pro' || u.proRequested));
  if (!u) $('req').textContent = I18N.t('pl.signin');
}
$('req').onclick = async () => {
  if (!Account.me.user) return (location.href = '/create');
  const r = await fetch('/api/auth/request-pro', { method: 'POST' });
  if (r.ok) { await Account.load(); paint(); }
};
I18N.on(paint); paint();
