import { json, needDb, loadMap, canEdit, newId } from '../../../lib/util.js';
import { getUser, randomHex } from '../../../lib/auth.js';
import { printConfig, quote } from '../../../lib/print.js';
import { limit } from '../../../lib/rate.js';
import { sendMail } from '../../../lib/mail.js';
import { TERMS_VERSION } from '../../../lib/legal.js';

const MAX_FILE = 95 * 1024 * 1024;
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

// POST /api/print/order (multipart): file + mapId, format, paper, frame, name, street, zip, city, country, email, phone, note, agb, custom
export async function onRequestPost({ request, env }) {
  const bad = needDb(env); if (bad) return bad;
  if (!env.PRINTS) return json({ error: 'print_off' }, 503);
  const user = await getUser(request, env); if (!user) return json({ error: 'auth_required' }, 401);
  const rl = await limit(env, request, 'print', user.id); if (rl) return rl;
  let fd; try { fd = await request.formData(); } catch { return json({ error: 'bad_request' }, 400); }
  const f = (k, n = 200) => str(fd.get(k), n);
  const o = { format: f('format', 10), paper: f('paper', 20), frame: f('frame', 20), country: f('country', 2).toUpperCase() };
  const addr = { name: f('name', 120), street: f('street', 160), zip: f('zip', 20), city: f('city', 100), country: o.country, email: f('email', 200).toLowerCase(), phone: f('phone', 40) };
  const px = parseInt(f('note_px', 6), 10);
  const note = f('note', 1000) + (px > 0 ? `\n[File was rendered at ${px} px wide: this device could not draw the full 300 dpi size. Ask the customer to order from a computer if quality matters.]` : '');
  if (!addr.name || !addr.street || !addr.zip || !addr.city || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr.email)) return json({ error: 'address' }, 400);
  if (fd.get('agb') !== '1' || fd.get('custom') !== '1') return json({ error: 'consent' }, 400);
  const cfg = printConfig(env), q = quote(cfg, o);
  if (!q) return json({ error: 'options' }, 400);
  const m = await loadMap(env, f('mapId', 20));
  if (!m || !canEdit(m, user)) return json({ error: 'forbidden' }, 403);
  const file = fd.get('file');
  if (!file || typeof file === 'string') return json({ error: 'file' }, 400);
  const type = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : null;
  if (!type || file.size < 1000 || file.size > MAX_FILE) return json({ error: 'file' }, 400);

  const id = newId(10), key = `orders/${id}.${type}`, token = randomHex(20), now = Date.now();
  await env.PRINTS.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { order: id, map: m.id, user: user.id } });
  await env.DB.prepare(`INSERT INTO print_orders (id, user_id, map_id, file_key, file_token, format, paper, frame, name, street, zip, city, country, email, phone, note,
      items, shipping, total, currency, status, terms_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`)
    .bind(id, user.id, m.id, key, token, o.format, o.paper, o.frame, addr.name, addr.street, addr.zip, addr.city, addr.country, addr.email, addr.phone, note,
      q.items, q.shipping, q.total, q.currency, TERMS_VERSION, now).run();

  const origin = new URL(request.url).origin, link = `${origin}/api/print/file/${id}?k=${token}`;
  const lines = [`Order ${id}`, `Map: ${m.state.title || m.id} (${origin}/m/${m.id})`, `Format: ${o.format.toUpperCase()} · paper: ${o.paper} · frame: ${o.frame}`,
    `Price: ${q.items} + shipping ${q.shipping} = ${q.total} ${q.currency}`, '', 'Ship to:', addr.name, addr.street, `${addr.zip} ${addr.city}`, addr.country,
    `E-mail: ${addr.email}`, addr.phone ? `Phone: ${addr.phone}` : '', note ? `\nNote: ${note}` : '', '', `Print file (${Math.round(file.size / 1e5) / 10} MB): ${link}`].filter((x) => x !== '').join('\n');
  const owner = env.OWNER_EMAIL || env.LEGAL_EMAIL;
  await sendMail(env, { to: owner, subject: `New print order ${id} · ${o.format.toUpperCase()} · ${q.total} ${q.currency}`, text: lines, replyTo: addr.email });
  const ru = f('lang', 2) === 'ru', de = f('lang', 2) === 'de';
  const conf = ru
    ? `Здравствуйте, ${addr.name}!\n\nМы получили заявку на печать ${id}: ${o.format.toUpperCase()}, бумага ${o.paper}, рама ${o.frame}.\nСумма: ${q.total} ${q.currency} (включая доставку ${q.shipping}).\n\nЭто ещё не оплата. Мы проверим файл и пришлём счёт и срок изготовления отдельным письмом. Договор заключается, когда вы получите наше подтверждение.\n\nMapHeritage`
    : de
      ? `Hallo ${addr.name},\n\nwir haben Ihre Druckanfrage ${id} erhalten: ${o.format.toUpperCase()}, Papier ${o.paper}, Rahmen ${o.frame}.\nBetrag: ${q.total} ${q.currency} (inkl. Versand ${q.shipping}).\n\nDas ist noch keine Zahlung. Wir prüfen die Datei und senden Ihnen Rechnung und Lieferzeit in einer eigenen E-Mail. Der Vertrag kommt mit unserer Bestätigung zustande.\n\nMapHeritage`
      : `Hello ${addr.name},\n\nwe have received your print request ${id}: ${o.format.toUpperCase()}, paper ${o.paper}, frame ${o.frame}.\nTotal: ${q.total} ${q.currency} (shipping ${q.shipping} included).\n\nThis is not a payment yet. We will check the file and send an invoice and the production time in a separate e-mail. The contract is concluded with our confirmation.\n\nMapHeritage`;
  await sendMail(env, { to: addr.email, subject: ru ? `Заявка на печать ${id}` : de ? `Ihre Druckanfrage ${id}` : `Your print request ${id}`, text: conf, replyTo: owner });
  return json({ ok: true, id, ...q });
}
