// Print prices. Override any part with the PRINT_PRICES variable (JSON), e.g.
// {"formats":{"a3":{"price":99}},"frames":{"oak":{"price":129}},"shipping":{"DE":0,"EU":15,"WORLD":35}}
export const DEFAULT_PRINT = {
  currency: 'EUR',
  formats: { a3: { price: 89, mm: '297 × 420' }, a2: { price: 139, mm: '420 × 594' } },
  papers: { matte: { price: 0 }, fineart: { price: 35 }, canvas: { price: 60 } },
  frames: { none: { price: 0 }, black: { price: 79 }, white: { price: 79 }, oak: { price: 99 } },
  shipping: { DE: 0, EU: 15, WORLD: 35 },
  days: '7–10',
};
export const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
export const COUNTRIES = ['DE', ...EU, 'CH', 'GB', 'NO', 'IL', 'US', 'CA'];
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const merge = (a, b) => { const o = { ...a }; for (const k in b || {}) o[k] = isObj(b[k]) && isObj(a[k]) ? merge(a[k], b[k]) : b[k]; return o; };
export function printConfig(env) {
  let extra = {};
  try { extra = env.PRINT_PRICES ? JSON.parse(env.PRINT_PRICES) : {}; } catch { console.log('PRINT_PRICES is not valid JSON'); }
  return merge(DEFAULT_PRINT, extra);
}
export const zone = (country) => (country === 'DE' ? 'DE' : EU.includes(country) ? 'EU' : 'WORLD');
export function quote(cfg, { format, paper, frame, country }) {
  const F = cfg.formats[format], P = cfg.papers[paper], R = cfg.frames[frame];
  if (!F || !P || !R || !COUNTRIES.includes(country)) return null;
  const ship = +cfg.shipping[zone(country)] || 0, items = +F.price + +P.price + +R.price;
  return { items, shipping: ship, total: Math.round((items + ship) * 100) / 100, currency: cfg.currency };
}
