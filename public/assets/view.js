const $ = (id) => document.getElementById(id), esc = Poster.esc, { t } = I18N;
const id = location.pathname.split('/')[2] || new URLSearchParams(location.search).get('id');
const poster = Poster.create($('stage'), { scrollWheelZoom: true });
let data = null;
function toast(m) { const el = $('toast'); el.textContent = m; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); }
const width = () => { const r = { landscape: 1600 / 1131, portrait: 1131 / 1600, square: 1 }[(data.design || {}).format || 'landscape']; const s = $('stage'); return Math.floor(Math.min(s.clientWidth - 2 * parseFloat(getComputedStyle(s).paddingLeft), (innerHeight - 90) * r)); };
function paint(o = {}) { if (data) poster.render(data, data.design, { width: width(), keepView: o.keepView, animate: o.animate }); }
function chronicle() {
  I18N.apply();
  if (!data) return;
  document.title = (data.title || t('familyMap')) + ' — MapHeritage';
  const ds = Poster.design(data.design, data.mode), col = Poster.colors(data.people, ds.palette), used = new Set(data.events.map((e) => e.personId));
  const people = data.people.filter((p) => used.has(p.id));
  $('chron').hidden = !people.length;
  $('people').innerHTML = people.map((p) => `<article class="person"><h3><i style="background:${col[p.id]}"></i>${esc(p.name)}<small>${esc(Poster.rel(p.relation))}</small></h3><ol>${
    Poster.chrono(data.events.filter((e) => e.personId === p.id)).map((e) => `<li><b>${esc(e.when || '—')}</b><span><strong>${esc(e.place)}</strong>${e.type !== 'other' ? ', ' + esc(t('type.' + e.type)) : ''}${e.note ? '. ' + esc(e.note) : ''}</span></li>`).join('')}</ol></article>`).join('');
}
async function load() {
  try {
    const r = await fetch('/api/maps/' + encodeURIComponent(id || ''));
    if (!r.ok) throw new Error(r.status === 404 ? 'notFound.p' : r.status === 403 ? 'err.private' : 'loadFail');
    data = await r.json();
  } catch (e) {
    $('acts').querySelectorAll('.btn').forEach((b) => (b.hidden = true));
    $('stage').innerHTML = `<div class="empty"><h2>${esc(t(e.message === 'err.private' ? 'err.private' : 'notFound.t'))}</h2><p>${esc(t(e.message.includes('.') ? e.message : 'loadFail'))}</p></div>`;
    return;
  }
  chronicle(); paint({ animate: true });
  if (data.mine) { $('orderPrint').hidden = false; $('edit').hidden = false; $('edit').href = '/create?id=' + id + '&tab=design'; }
}
$('play').onclick = () => paint({ animate: true, keepView: true });
$('print').onclick = () => print();
$('download').onclick = async () => {
  if (!data || !data.events.some(Poster.hasGeo)) return toast(t('toast.emptyMap'));
  const size = $('size').value, b = $('download'); b.disabled = true; b.textContent = t('btn.exporting');
  try {
    const q = await fetch('/api/maps/' + id + '/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ size }) });
    if (!q.ok) { const j = await q.json().catch(() => ({})); throw new Error(t('err.' + (j.error || 'auth_required'))); }
    const d = Poster.design(data.design, data.mode);
    const { blob, reduced, width: gotW } = await Poster.exportPNG(data, data.design, { view: poster.currentView(), width: Poster.exportWidth(size, d.format), ships: poster.ships });
    Poster.download(blob, Poster.slug(data.title || 'family-map') + '-' + size + '.png'); toast(reduced ? t('toast.reduced', { w: gotW }) : t('toast.exported'));
  } catch (e) { toast(e.message || 'Export failed'); }
  b.disabled = false; b.textContent = t('btn.download');
};
$('orderPrint').onclick = () => { if (window.PrintOrder) PrintOrder.open({ mapId: id, state: data, design: data.design, poster }); };
$('share').onclick = async () => {
  const url = location.origin + '/m/' + id;
  if (navigator.share) { try { await navigator.share({ title: document.title, url }); return; } catch {} }
  try { await navigator.clipboard.writeText(url); toast(t('toast.copied')); } catch { prompt(t('btn.share'), url); }
};
I18N.on(() => { chronicle(); paint({ keepView: true }); });
let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => paint({ keepView: true }), 150); });
I18N.apply(); load();
