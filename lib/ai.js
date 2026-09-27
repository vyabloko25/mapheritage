export const TYPES = ['birth', 'childhood', 'study', 'work', 'service', 'war', 'evacuation', 'move', 'marriage', 'death', 'other'];

export function buildSystem(state) {
  return `Ты — бережный собеседник проекта MapHeritage. Ты помогаешь человеку вспомнить историю перемещений его семьи, чтобы построить карту: где люди рождались, росли, учились, работали, служили, куда переезжали.

Как вести разговор:
- Отвечай на языке пользователя (по умолчанию по-русски), тепло и коротко: 1–3 предложения и ровно один вопрос за раз.
- Иди по порядку: сначала сам человек (где родился, рос, учился, жил), потом его родители, затем бабушки и дедушки и дальше — насколько он помнит. Спрашивай и о братьях, сёстрах, супругах, детях, если человек хочет.
- Для каждого места выясняй: кто, где (город или село и страна), примерно когда (год или десятилетие) и что происходило.
- Ничего не выдумывай. Если год неизвестен, запиши примерный ("около 1950", "в 60-е") и не дави.
- Исторические названия сохраняй в поле place (Кёнигсберг, Сталинград, Ленинград), а в поле query пиши современное название с регионом и страной, чтобы место нашлось на карте.
- Если человек рассказывает о тяжёлом — войне, репрессиях, потерях — отвечай с уважением и без спешки.
- Время от времени коротко подтверждай, что появилось на карте. Если человек говорит, что закончил, поблагодари и предложи поделиться картой с родными.

Формат ответа — строго один JSON-объект, без пояснений и без markdown:
{"reply": "текст для человека", "title": "Семья Ивановых", "people": [...], "events": [...]}

people: [{"id": "p1", "name": "Анна Левина", "relation": "бабушка по маме"}]. Самого рассказчика запиши первым, relation = "я".
events: [{"id": "e1", "personId": "p1", "year": 1934, "when": "1934", "type": "birth", "place": "Витебск", "query": "Витебск, Беларусь", "lat": 55.19, "lng": 30.2, "note": "родилась в семье учителей"}]
- type — одно из: ${TYPES.join(', ')}.
- year — число для сортировки (для "в 60-е" пиши 1965) или null; when — как сказал человек.
- lat и lng — твои приблизительные координаты места.
- note — короткая деталь из рассказа, до 120 символов, или пустая строка.
- Всегда возвращай ПОЛНЫЕ актуальные списки people и events: сохраняй прежние id, добавляй новые, исправляй то, что человек поправил, и удаляй то, что он просит убрать.
- title — короткое название карты по фамилии семьи; пока фамилия неизвестна — "Карта моей семьи".

Текущее состояние карты:
${JSON.stringify({ title: state.title || '', people: state.people || [], events: (state.events || []).map(({ geo, ...e }) => e) })}`;
}

// Склеивает подряд идущие реплики одной роли (API требует чередования) и обрезает историю.
export function conversation(history) {
  const out = [{ role: 'user', content: 'Здравствуйте, я хочу собрать карту своей семьи.' }];
  for (const m of history.slice(-18)) {
    const last = out[out.length - 1];
    if (last.role === m.role) last.content += '\n\n' + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

export async function callModel(env, system, messages) {
  if (env.MOCK === '1') return mock(messages);
  if (env.ANTHROPIC_API_KEY) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 4000, system, messages }),
    });
    if (!r.ok) throw new Error('Claude API ' + r.status + ': ' + (await r.text()).slice(0, 300));
    const j = await r.json();
    return (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  }
  if (env.AI) {
    const model = env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    const res = await env.AI.run(model, {
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: 3500,
      temperature: 0.4,
    });
    const r = res && res.response;
    return typeof r === 'string' ? r : JSON.stringify(r);
  }
  throw new Error('NO_MODEL');
}

function clean(s, n) {
  return typeof s === 'string' ? s.trim().slice(0, n) : typeof s === 'number' ? String(s) : '';
}

export function normalize(obj, prev) {
  const out = { title: clean(obj.title, 80) || prev.title || '', people: [], events: [] };
  const pids = new Set();
  for (const p of (Array.isArray(obj.people) ? obj.people : []).slice(0, 80)) {
    if (!p || typeof p !== 'object') continue;
    let id = clean(p.id, 20) || 'p' + (out.people.length + 1);
    if (pids.has(id)) continue;
    pids.add(id);
    out.people.push({ id, name: clean(p.name, 80) || 'Без имени', relation: clean(p.relation, 60) });
  }
  const eids = new Set();
  for (const e of (Array.isArray(obj.events) ? obj.events : []).slice(0, 400)) {
    if (!e || typeof e !== 'object') continue;
    let id = clean(e.id, 20);
    if (!id || eids.has(id)) id = 'e' + (eids.size + 1) + Math.random().toString(36).slice(2, 5);
    eids.add(id);
    let personId = clean(e.personId, 20);
    if (!pids.has(personId)) {
      if (!out.people.length) { out.people.push({ id: 'p1', name: 'Я', relation: 'я' }); pids.add('p1'); }
      personId = out.people[0].id;
    }
    const y = e.year === null || e.year === '' ? NaN : Math.round(+e.year);
    const lat = +e.lat, lng = +e.lng;
    out.events.push({
      id, personId,
      year: y > 0 && y < 2100 ? y : null,
      when: clean(e.when, 40) || (y > 0 ? String(y) : ''),
      type: TYPES.includes(e.type) ? e.type : 'other',
      place: clean(e.place, 80),
      query: clean(e.query, 140) || clean(e.place, 80),
      lat: e.lat !== null && Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null,
      lng: e.lng !== null && Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : null,
      note: clean(e.note, 300),
      geo: 'ai',
    });
  }
  return out;
}

export function parseModel(raw, prev) {
  const text = (raw || '').trim();
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const obj = JSON.parse(text.slice(a, b + 1));
      const reply = clean(obj.reply, 3000);
      if (reply) {
        const hasData = Array.isArray(obj.events) && Array.isArray(obj.people);
        return { reply, state: hasData ? normalize(obj, prev) : structuredClone(prev) };
      }
    } catch {}
  }
  // Модель ответила текстом без JSON — показываем ответ, карту не трогаем.
  const reply = text.replace(/```[a-z]*|```/g, '').trim().slice(0, 3000) || 'Расскажите, пожалуйста, чуть подробнее.';
  return { reply, state: structuredClone(prev) };
}

// Тестовый режим без нейросети (переменная MOCK=1).
function mock(messages) {
  const users = messages.filter((m) => m.role === 'user').slice(1);
  const n = users.length;
  const places = [
    ['Москва', 'Москва, Россия', 55.75, 37.62, 'birth'],
    ['Ленинград', 'Санкт-Петербург, Россия', 59.94, 30.31, 'study'],
    ['Берлин', 'Берлин, Германия', 52.52, 13.4, 'move'],
  ];
  const events = places.slice(0, Math.min(n, 3)).map((p, i) => ({
    id: 'e' + (i + 1), personId: 'p1', year: 1990 + i * 10, when: String(1990 + i * 10),
    type: p[4], place: p[0], query: p[1], lat: p[2], lng: p[3], note: '',
  }));
  return JSON.stringify({
    reply: `Спасибо! Записал (${n}). Что было дальше?`,
    title: 'Карта моей семьи',
    people: [{ id: 'p1', name: 'Я', relation: 'я' }],
    events,
  });
}
