import { json } from '../../../lib/util.js';
import { printConfig, COUNTRIES } from '../../../lib/print.js';

// GET /api/print/options — formats, papers, frames and prices for the order form.
export async function onRequestGet({ env }) {
  const cfg = printConfig(env);
  return json({ enabled: !!(env.PRINTS && env.DB), ...cfg, countries: COUNTRIES });
}
