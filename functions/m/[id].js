// /m/:id — страница просмотра карты с названием семьи в заголовке и превью ссылки.
export async function onRequestGet({ request, env, params }) {
  const page = await env.ASSETS.fetch(new Request(new URL('/m', request.url)));
  let title = 'Family map';
  try {
    const row = await env.DB.prepare('SELECT title FROM maps WHERE id = ?').bind(params.id).first();
    if (row && row.title) title = row.title;
  } catch {}
  return new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(title + ' — MapHeritage'); } })
    .on('meta[property="og:title"]', { element(e) { e.setAttribute('content', title); } })
    .transform(page);
}
