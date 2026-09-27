export const TYPES = ['birth', 'childhood', 'study', 'work', 'service', 'war', 'evacuation', 'move', 'marriage', 'death', 'other'];

export function buildSystem(state) {
  const ru = state.lang === 'ru';
  return `You are the interviewer for MapHeritage. You help a person recall how their family moved over the generations, so we can draw it on a map: where people were born, grew up, studied, worked, served, and where they moved.

How to talk:
- Reply in the language the person writes in. If it is unclear, use ${ru ? 'Russian' : 'English'}.
- Be warm and brief: 1–3 sentences and exactly one question per turn.
- Go in order: the person first (where born, grew up, studied, lived), then parents, then grandparents and further back, as far as they remember. Ask about siblings, spouses and children if they want.
- For every place find out: who, where (town or village and country), roughly when (a year or a decade), and what happened.
- Never invent facts. If the year is unknown, record an approximate one ("around 1950", "in the 60s") and don't press.
- Keep historical names in "place" (Königsberg, Stalingrad, Leningrad) and put today's name with region and country in "query" so it can be found on a map.
- If the person talks about something painful — war, repression, loss — respond with respect and without hurry.
- Now and then briefly confirm what was added to the map. If the person says they are done, thank them and suggest sharing the map with relatives.
- The person may also edit the map by hand; the current state below is the truth.

Answer with exactly one JSON object, no explanations, no markdown:
{"reply": "text for the person", "title": "...", "people": [...], "events": [...]}

people: [{"id": "p1", "name": "Anna Levina", "relation": "maternal grandmother"}]. The storyteller comes first, with relation "${ru ? 'я' : 'me'}".
events: [{"id": "e1", "personId": "p1", "year": 1934, "when": "1934", "type": "birth", "place": "Vitebsk", "query": "Vitebsk, Belarus", "lat": 55.19, "lng": 30.2, "note": "born into a family of teachers"}]
- type is one of: ${TYPES.join(', ')}.
- year is a number for sorting ("in the 60s" → 1965) or null; when is how the person said it.
- lat and lng are your approximate coordinates of the place.
- note is a short detail from the story, up to 120 characters, or an empty string.
- Write names, relations, places, notes and title in the person's language.
- Always return the COMPLETE current people and events lists: keep existing ids, add new ones, correct what the person corrected, remove what they ask to remove.
- title is a short map name based on the family surname; until the surname is known use "${ru ? 'Карта моей семьи' : 'My family map'}".

Current map state:
${JSON.stringify({ title: state.title || '', people: (state.people || []).map(({ color, ...p }) => p), events: (state.events || []).map(({ geo, ...e }) => e) })}`;
}

// Merge consecutive same-role turns (the APIs require alternation) and trim history.
export function conversation(history) {
  const out = [{ role: 'user', content: 'Hello, I would like to build a map of my family.' }];
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
  const prevPeople = new Map((prev.people || []).map((p) => [p.id, p]));
  const pids = new Set();
  for (const p of (Array.isArray(obj.people) ? obj.people : []).slice(0, 80)) {
    if (!p || typeof p !== 'object') continue;
    let id = clean(p.id, 20) || 'p' + (out.people.length + 1);
    if (pids.has(id)) continue;
    pids.add(id);
    const color = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : (prevPeople.get(id) || {}).color;
    out.people.push({ id, name: clean(p.name, 80) || '?', relation: clean(p.relation, 60), ...(color ? { color } : {}) });
  }
  const eids = new Set();
  for (const e of (Array.isArray(obj.events) ? obj.events : []).slice(0, 400)) {
    if (!e || typeof e !== 'object') continue;
    let id = clean(e.id, 20);
    if (!id || eids.has(id)) id = 'e' + (eids.size + 1) + Math.random().toString(36).slice(2, 5);
    eids.add(id);
    let personId = clean(e.personId, 20);
    if (!pids.has(personId)) {
      if (!out.people.length) { out.people.push({ id: 'p1', name: prev.lang === 'ru' ? 'Я' : 'Me', relation: '' }); pids.add('p1'); }
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
      geo: ['osm', 'manual'].includes(e.geo) ? e.geo : 'ai',
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
  // Model answered in plain text: show it, keep the map unchanged.
  const reply = text.replace(/```[a-z]*|```/g, '').trim().slice(0, 3000) || (prev.lang === 'ru' ? 'Расскажите, пожалуйста, чуть подробнее.' : 'Could you tell me a little more?');
  return { reply, state: structuredClone(prev) };
}

// Test mode without a model (MOCK=1).
function mock(messages) {
  const users = messages.filter((m) => m.role === 'user').slice(1);
  const n = users.length;
  const places = [
    ['Moscow', 'Moscow, Russia', 55.75, 37.62, 'birth'],
    ['Leningrad', 'Saint Petersburg, Russia', 59.94, 30.31, 'study'],
    ['Berlin', 'Berlin, Germany', 52.52, 13.4, 'move'],
  ];
  const events = places.slice(0, Math.min(n, 3)).map((p, i) => ({
    id: 'e' + (i + 1), personId: 'p1', year: 1990 + i * 10, when: String(1990 + i * 10),
    type: p[4], place: p[0], query: p[1], lat: p[2], lng: p[3], note: '',
  }));
  return JSON.stringify({
    reply: `Thanks! Noted (${n}). What happened next?`,
    title: 'My family map',
    people: [{ id: 'p1', name: 'Me', relation: 'me' }],
    events,
  });
}
