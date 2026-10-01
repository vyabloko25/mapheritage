import { randomHex } from '../../../../lib/auth.js';
import { limit } from '../../../../lib/rate.js';

// Starts "Sign in with Google". Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
// consent=1 means the person ticked "terms" and "16+" before; only then may a new account be created.
export async function onRequestGet({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID) return new Response('Google sign-in is not configured', { status: 501 });
  const rl = await limit(env, request, 'google'); if (rl) return rl;
  const url = new URL(request.url), state = randomHex(16), next = url.searchParams.get('next') || '/create', consent = url.searchParams.get('consent') === '1' ? '1' : '0';
  const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: url.origin + '/api/auth/google/callback', response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/create';
  return new Response(null, { status: 302, headers: [
    ['location', 'https://accounts.google.com/o/oauth2/v2/auth?' + q],
    ['set-cookie', `mh_oauth=${state}|${encodeURIComponent(safeNext)}|${consent}; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`],
  ] });
}
