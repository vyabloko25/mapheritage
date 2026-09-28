import { cookies, sha256, sessionCookie } from '../../../lib/auth.js';

export async function onRequestPost({ request, env }) {
  const tok = cookies(request).mh_session;
  if (tok && env.DB) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(tok)).run();
  return new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie('', 0) } });
}
