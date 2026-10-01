import { TYPES, MODES } from './scenarios.js';

export const LIMITS = { people: 600, events: 2500 };

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
    const res = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [{ role: 'system', content: system }, ...messages], max_tokens: 3500, temperature: 0.4,
    });
    const r = res && res.response;
    return typeof r === 'string' ? r : JSON.stringify(r);
  }
  throw new Error('NO_MODEL');
}

const clean = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : typeof s === 'number' ? String(s) : '');
const year = (v) => { if (v === null || v === '' || v === undefined) return null; const y = Math.round(+v); return y > 0 && y < 2100 ? y : null; };
const ids = (a) => (Array.isArray(a) ? a.map((x) => clean(x, 24)).filter(Boolean) : []);

// Full, strict normalisation of a map state. Keeps design/mode/options/rootId.
export function normalize(obj, prev = {}) {
  const prevPeople = new Map((prev.people || []).map((p) => [p.id, p]));
  const out = {
    title: clean(obj.title, 90) || prev.title || '',
    lang: prev.lang || obj.lang || 'en',
    mode: MODES.includes(obj.mode) ? obj.mode : MODES.includes(prev.mode) ? prev.mode : 'family',
    options: { side: !!((obj.options || prev.options || {}).side) },
    people: [], events: [],
  };
  const pids = new Set();
  for (const p of (Array.isArray(obj.people) ? obj.people : []).slice(0, LIMITS.people)) {
    if (!p || typeof p !== 'object') continue;
    const id = clean(p.id, 24) || 'p' + (out.people.length + 1);
    if (pids.has(id)) continue;
    pids.add(id);
    const old = prevPeople.get(id) || {};
    const color = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : old.color;
    out.people.push({
      id, name: clean(p.name, 90) || '?', relation: clean(p.relation, 60),
      sex: p.sex === 'm' || p.sex === 'f' ? p.sex : '',
      born: year(p.born), died: year(p.died),
      parents: ids(p.parents).slice(0, 2), spouses: ids(p.spouses).slice(0, 6),
      branch: p.branch === 'direct' || p.branch === 'side' ? p.branch : '',
      ...(color ? { color } : {}),
    });
  }
  for (const p of out.people) {
    p.parents = p.parents.filter((x) => pids.has(x) && x !== p.id);
    p.spouses = p.spouses.filter((x) => pids.has(x) && x !== p.id);
  }
  const eids = new Set();
  for (const e of (Array.isArray(obj.events) ? obj.events : []).slice(0, LIMITS.events)) {
    if (!e || typeof e !== 'object') continue;
    let id = clean(e.id, 24);
    if (!id || eids.has(id)) id = 'e' + (eids.size + 1) + Math.random().toString(36).slice(2, 5);
    eids.add(id);
    let personId = clean(e.personId, 24);
    if (!pids.has(personId)) {
      if (!out.people.length) { out.people.push({ id: 'p1', name: out.lang === 'ru' ? 'Я' : 'Me', relation: '', sex: '', born: null, died: null, parents: [], spouses: [], branch: '' }); pids.add('p1'); }
      personId = out.people[0].id;
    }
    const y = year(e.year), lat = +e.lat, lng = +e.lng;
    out.events.push({
      id, personId, year: y, when: clean(e.when, 40) || (y ? String(y) : ''),
      type: TYPES.includes(e.type) ? e.type : 'other',
      place: clean(e.place, 90), query: clean(e.query, 160) || clean(e.place, 90),
      lat: e.lat !== null && e.lat !== '' && Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null,
      lng: e.lng !== null && e.lng !== '' && Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : null,
      note: clean(e.note, 300),
      geo: ['osm', 'manual', 'gedcom'].includes(e.geo) ? e.geo : 'ai',
      kind: ['settlement', 'region', 'country'].includes(e.kind) ? e.kind : '',
    });
  }
  const root = clean(obj.rootId ?? prev.rootId, 24);
  out.rootId = pids.has(root) ? root : (out.people[0] ? out.people[0].id : null);
  out.design = sanitizeDesign(obj.design !== undefined ? obj.design : prev.design);
  return out;
}

export function sanitizeDesign(d) {
  if (!d || typeof d !== 'object') return null;
  try { const s = JSON.stringify(d); return s.length < 20000 ? JSON.parse(s) : null; } catch { return null; }
}

// Apply the model's upsert/remove diff on top of the previous state.
export function applyDiff(prev, obj) {
  const people = new Map((prev.people || []).map((p) => [p.id, { ...p }]));
  const events = new Map((prev.events || []).map((e) => [e.id, { ...e }]));
  const up = obj.upsert || {}, rm = obj.remove || {};
  for (const p of Array.isArray(up.people) ? up.people : []) {
    if (!p || !p.id) continue;
    const old = people.get(String(p.id)) || {};
    people.set(String(p.id), { ...old, ...p, color: old.color || p.color });
  }
  for (const e of Array.isArray(up.events) ? up.events : []) {
    if (!e || !e.id) continue;
    const old = events.get(String(e.id));
    const next = { ...(old || {}), ...e };
    // Keep confirmed coordinates unless the place itself changed.
    if (old && (old.geo === 'osm' || old.geo === 'manual' || old.geo === 'gedcom') && (e.query === undefined || e.query === old.query)) {
      next.lat = old.lat; next.lng = old.lng; next.geo = old.geo; next.query = old.query;
    } else next.geo = 'ai';
    events.set(String(e.id), next);
  }
  for (const id of Array.isArray(rm.people) ? rm.people : []) {
    people.delete(String(id));
    for (const [k, e] of events) if (e.personId === String(id)) events.delete(k);
  }
  for (const id of Array.isArray(rm.events) ? rm.events : []) events.delete(String(id));
  const title = clean(obj.title, 90);
  return normalize({ ...prev, title: prev.titleManual ? prev.title : title || prev.title, people: [...people.values()], events: [...events.values()] }, prev);
}

export function parseModel(raw, prev) {
  const text = (raw || '').trim();
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const obj = JSON.parse(text.slice(a, b + 1));
      const reply = clean(obj.reply, 3000);
      if (reply) {
        // Backward compatibility: a model that returns full lists instead of a diff.
        if (!obj.upsert && (Array.isArray(obj.people) || Array.isArray(obj.events))) obj.upsert = { people: obj.people || [], events: obj.events || [] };
        const suggestions = (Array.isArray(obj.suggestions) ? obj.suggestions : []).map((x) => clean(x, 70)).filter(Boolean).slice(0, 3);
        const design = obj.design && typeof obj.design === 'object' && Object.keys(obj.design).length ? pickDesign(obj.design) : null;
        return { reply, state: applyDiff(prev, obj), suggestions, design };
      }
    } catch {}
  }
  const reply = text.replace(/```[a-z]*|```/g, '').trim().slice(0, 3000) || (prev.lang === 'ru' ? 'Расскажите, пожалуйста, чуть подробнее.' : 'Could you tell me a little more?');
  return { reply, state: normalize(prev, prev), suggestions: [], design: null };
}

// Only whitelisted, well-typed appearance changes from the model.
const EN = { preset: ['discovery', 'portolan', 'admiralty', 'night', 'atlas'], format: ['landscape', 'portrait', 'square'], font: ['alegreya', 'oldstandard', 'garamond', 'cormorant', 'jost'], panel: ['auto', 'tree', 'chronicle', 'none'] };
const SHOW = ['frame', 'cartouche', 'legend', 'compass', 'scale', 'graticule', 'degrees', 'rhumbs', 'relief', 'waterlines', 'depth', 'shadow', 'stipple', 'rivers', 'borders', 'ships', 'waves', 'aging', 'texture', 'vignette', 'insets', 'labels', 'numbers'];
const SUB = {
  routes: { style: ['solid', 'dashed', 'dotted', 'double', 'casing', 'hand'] },
  cartouche: { style: ['frame', 'scroll', 'medallion', 'block'] },
  compass: { style: ['ornate', 'simple', 'portolan', 'modern'] },
  frame: { style: ['degrees', 'double', 'ornament', 'line'] },
  markers: { style: ['ring', 'dot', 'square', 'star', 'pin', 'town'] },
  labels: { style: ['italic', 'roman', 'caps'], halo: ['halo', 'box', 'none'] },
};
function pickDesign(d) {
  const o = {};
  for (const k in EN) if (EN[k].includes(d[k])) o[k] = d[k];
  if (typeof d.subtitle === 'string') o.subtitle = d.subtitle.slice(0, 120);
  if (d.show && typeof d.show === 'object') { o.show = {}; for (const k of SHOW) if (typeof d.show[k] === 'boolean') o.show[k] = d.show[k]; }
  for (const g in SUB) if (d[g] && typeof d[g] === 'object') { const x = {}; for (const k in SUB[g]) if (SUB[g][k].includes(d[g][k])) x[k] = d[g][k]; if (Object.keys(x).length) o[g] = x; }
  if (d.routes && typeof d.routes.arrows === 'boolean') (o.routes ||= {}).arrows = d.routes.arrows;
  if (d.insets && typeof d.insets === 'object') { o.insets = {}; const n = Math.round(+d.insets.max); if (n >= 0 && n <= 16) o.insets.max = n; if (['circle', 'square'].includes(d.insets.shape)) o.insets.shape = d.insets.shape; }
  for (const k of ['sea', 'land', 'paper', 'ink', 'accent']) if (/^#[0-9a-f]{6}$/i.test(d[k] || '')) o[k] = d[k];
  return o;
}
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
// Content and layout survive a change of style; colours and drawing settings come from the new style.
const KEEP_ON_PRESET = ['preset', 'format', 'subtitle', 'view', 'panel', 'panelSize', 'insets', 'pos', 'insetCfg', 'legendTitle', 'panelTitle', 'texts', 'ships', 'labelSize'];
export function mergeDesign(a, b) {
  let base = { ...(a || {}) };
  if (b.preset && b.preset !== base.preset) base = Object.fromEntries(Object.entries(base).filter(([k]) => KEEP_ON_PRESET.includes(k)));
  const merge = (x, y) => { const o = { ...(x || {}) }; for (const k in y) o[k] = isObj(y[k]) && isObj(o[k]) ? merge(o[k], y[k]) : y[k]; return o; };
  return merge(base, b);
}

// Test mode without a model (MOCK=1): adds one place per message.
function mock(messages) {
  const n = messages.filter((m) => m.role === 'user').length - 1;
  const P = [['Moscow', 'Moscow, Russia', 55.75, 37.62, 'birth'], ['Leningrad', 'Saint Petersburg, Russia', 59.94, 30.31, 'study'], ['Berlin', 'Berlin, Germany', 52.52, 13.4, 'move'], ['Odesa', 'Odesa, Ukraine', 46.48, 30.72, 'work']];
  const p = P[(n - 1) % P.length];
  return JSON.stringify({
    reply: `Thanks! Noted (${n}). What happened next?`, title: 'The Test family', suggestions: ['Add where I studied', 'Make the map darker'], design: messages[messages.length - 1].content.includes('darker') ? { preset: 'night' } : messages[messages.length - 1].content.includes('portolan') ? { preset: 'portolan', compass: { style: 'portolan' } } : {},
    upsert: { people: n === 1 ? [{ id: 'p1', name: 'Me', relation: 'me', sex: 'f', born: 1990 }] : [], events: [{ id: 'e' + n, personId: 'p1', year: 1990 + n * 5, type: p[4], place: p[0], query: p[1], lat: p[2], lng: p[3] }] },
    remove: { people: [], events: [] },
  });
}
