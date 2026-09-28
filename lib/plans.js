// Plans. Change the numbers here; the site reads them from /api/auth/me.
export const PLANS = {
  lite: { exports: 5, presets: ['discovery', 'admiralty'], custom: false },
  pro: { exports: Infinity, presets: ['discovery', 'admiralty', 'night', 'atlas'], custom: true },
};
export const planOf = (user) => PLANS[user && user.plan === 'pro' ? 'pro' : 'lite'];

// Lite keeps only the basic choices; everything else falls back to the style defaults.
export function limitDesign(d, user) {
  if (!d || typeof d !== 'object') return d;
  const p = planOf(user);
  if (p.custom) return d;
  const out = {};
  out.preset = p.presets.includes(d.preset) ? d.preset : p.presets[0];
  for (const k of ['format', 'subtitle', 'view', 'panel']) if (d[k] !== undefined) out[k] = d[k];
  if (d.show && typeof d.show === 'object') out.show = d.show;
  if (d.insets && typeof d.insets === 'object') out.insets = { max: d.insets.max, pick: d.insets.pick };
  return out;
}
export const month = () => new Date().toISOString().slice(0, 7);
export async function exportsUsed(env, userId) {
  const r = await env.DB.prepare('SELECT count FROM exports WHERE user_id = ? AND month = ?').bind(userId, month()).first();
  return r ? r.count : 0;
}
