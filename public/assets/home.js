const PL = { vitebsk: ['Vitebsk', 'Витебск', 55.19, 30.2], tashkent: ['Tashkent', 'Ташкент', 41.3, 69.24], leningrad: ['Leningrad', 'Ленинград', 59.94, 30.31], norilsk: ['Norilsk', 'Норильск', 69.35, 88.2],
  odesa: ['Odesa', 'Одесса', 46.48, 30.72], konig: ['Königsberg', 'Кёнигсберг', 54.71, 20.51], moscow: ['Moscow', 'Москва', 55.75, 37.62], berlin: ['Berlin', 'Берлин', 52.52, 13.4], kyiv: ['Kyiv', 'Киев', 50.45, 30.52], haifa: ['Haifa', 'Хайфа', 32.79, 34.99] };
const PP = [ // id, en, ru, rel en, rel ru, sex, born, died, parents, spouses, branch
  ['p1', 'Me', 'Я', '', '', 'f', 1988, null, ['p3', 'p2'], [], 'direct'],
  ['p2', 'Irina', 'Ирина', 'mother', 'мама', 'f', 1960, null, ['p5', 'p4'], ['p3'], 'direct'],
  ['p3', 'Mark', 'Марк', 'father', 'папа', 'm', 1958, null, [], ['p2'], 'direct'],
  ['p4', 'Anna', 'Анна', 'grandmother', 'бабушка', 'f', 1934, 2010, ['p8'], ['p5'], 'direct'],
  ['p5', 'David', 'Давид', 'grandfather', 'дедушка', 'm', 1930, 2004, [], ['p4'], 'direct'],
  ['p8', 'Hirsh', 'Гирш', 'great-grandfather', 'прадед', 'm', 1896, 1961, [], [], 'direct'],
  ['p9', 'Sofia', 'Софья', 'aunt', 'тётя', 'f', 1964, null, ['p5', 'p4'], [], 'side'],
];
const EV = [['p8', 1896, 'birth', 'vitebsk'], ['p8', 1941, 'evacuation', 'tashkent'], ['p4', 1934, 'birth', 'vitebsk'], ['p4', 1941, 'evacuation', 'tashkent'], ['p4', 1952, 'study', 'leningrad'], ['p4', 1958, 'work', 'norilsk'],
  ['p5', 1930, 'birth', 'odesa'], ['p5', 1949, 'service', 'konig'], ['p5', 1953, 'study', 'leningrad'], ['p5', 1958, 'work', 'norilsk'], ['p2', 1960, 'birth', 'norilsk'], ['p2', 1978, 'study', 'moscow'], ['p2', 1996, 'move', 'berlin'],
  ['p3', 1958, 'birth', 'kyiv'], ['p3', 1976, 'study', 'moscow'], ['p3', 1996, 'move', 'berlin'], ['p1', 1988, 'birth', 'moscow'], ['p1', 1996, 'move', 'berlin'], ['p9', 1964, 'birth', 'norilsk'], ['p9', 1991, 'move', 'haifa']];
function demo() {
  const r = I18N.lang === 'ru' ? 1 : 0;
  return { title: r ? 'Семья Левиных' : 'The Levin family', mode: 'tree', rootId: 'p1',
    people: PP.map((p) => ({ id: p[0], name: p[1 + r], relation: p[3 + r], sex: p[5], born: p[6], died: p[7], parents: p[8], spouses: p[9], branch: p[10] })),
    events: EV.map((e, i) => { const pl = PL[e[3]]; return { id: 'e' + i, personId: e[0], year: e[1], when: String(e[1]), type: e[2], place: pl[r], query: pl[0], lat: pl[2], lng: pl[3], note: '' }; }) };
}
let styleName = 'discovery';
const poster = Poster.create(document.getElementById('demo'), { interactive: false });
const width = () => Math.min(document.getElementById('demo').clientWidth, 1400);
const paint = (animate) => poster.render(demo(), { preset: styleName, insets: { max: 7 } }, { width: width(), animate, keepView: !animate && false });
function styles() {
  document.getElementById('styles').innerHTML = Poster.PRESET_KEYS.map((k) => `<button type="button" data-style="${k}" aria-pressed="${k === styleName}"><i style="background:${Poster.swatch(k)}"></i><span>${Poster.esc(I18N.t('d.preset.' + k))}</span></button>`).join('');
}
document.getElementById('styles').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; styleName = b.dataset.style; styles(); paint(false); document.getElementById('demo').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
I18N.apply(); styles(); setTimeout(() => paint(true), 150);
I18N.on(() => { styles(); paint(false); });
let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => paint(false), 200); });
