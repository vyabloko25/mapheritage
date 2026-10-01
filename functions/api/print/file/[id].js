// GET /api/print/file/:id?k=token — the print file, for the shop owner (link from the order e-mail).
export async function onRequestGet({ request, env, params }) {
  if (!env.PRINTS || !env.DB) return new Response('Printing is not configured', { status: 503 });
  const k = new URL(request.url).searchParams.get('k') || '';
  const o = await env.DB.prepare('SELECT file_key, file_token FROM print_orders WHERE id = ?').bind(params.id).first();
  if (!o || !k || k.length !== o.file_token.length) return new Response('Not found', { status: 404 });
  let diff = 0; for (let i = 0; i < k.length; i++) diff |= k.charCodeAt(i) ^ o.file_token.charCodeAt(i);
  if (diff) return new Response('Not found', { status: 404 });
  const obj = await env.PRINTS.get(o.file_key);
  if (!obj) return new Response('File is gone', { status: 410 });
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
    'content-disposition': `attachment; filename="mapheritage-${params.id}.${o.file_key.split('.').pop()}"`, 'cache-control': 'private, no-store' } });
}
