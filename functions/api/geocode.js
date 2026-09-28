import { json, needDb } from '../../lib/util.js';
import { geocode } from '../../lib/geo.js';

// GET /api/geocode?q=Vitebsk, Belarus — used by the map editor.
export async function onRequestGet({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 140);
  if (!q) return json({ error: 'empty' }, 400);
  const { point } = await geocode(env, q);
  if (point === undefined) return json({ error: 'geocode_failed' }, 502);
  if (!point) return json({ error: 'not_found' }, 404);
  return json(point);
}
