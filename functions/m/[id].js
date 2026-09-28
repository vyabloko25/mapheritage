// /m/:id — viewer page. The family name goes into the link preview only if the map is shared.
export async function onRequestGet({ request, env, params }) {
  const page = await env.ASSETS.fetch(new Request(new URL('/m', request.url)));
  let title = 'MapHeritage';
  try {
    const row = await env.DB.prepare('SELECT title, shared FROM maps WHERE id = ?').bind(params.id).first();
    if (row && row.shared === 1 && row.title) title = row.title + ' — MapHeritage';
  } catch {}
  return new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(title); } })
    .on('meta[property="og:title"]', { element(e) { e.setAttribute('content', title); } })
    .transform(page);
}
