/**
 * Cloudflare Worker — proxy 1ª parte (dribla ad-block)
 * Routes: cryptobingo.bet/cl/* (Clarity) e cryptobingo.bet/ga/* (GA4 collect)
 * Format: service-worker (classic)
 */
const CLARITY_HOST = 'https://www.clarity.ms';
const GA_HOST = 'https://www.google-analytics.com';

function rewriteUrl(pathname) {
  if (pathname.startsWith('/cl')) return CLARITY_HOST + pathname.replace(/^\/cl/, '');
  if (pathname.startsWith('/ga')) return GA_HOST + pathname.replace(/^\/ga/, '');
  return null;
}

async function handle(request) {
  const url = new URL(request.url);
  const targetBase = rewriteUrl(url.pathname);
  if (!targetBase) {
    return new Response('Not found', { status: 404 });
  }
  const target = targetBase + url.search;
  const init = {
    method: request.method,
    headers: {
      'User-Agent': request.headers.get('User-Agent') || 'cb-proxy',
      'Accept': request.headers.get('Accept') || '*/*',
      'Origin': 'https://cryptobingo.bet',
      'Referer': 'https://cryptobingo.bet/',
    },
    redirect: 'follow',
  };
  if (request.method === 'POST') {
    init.body = request.body;
    init.headers['Content-Type'] = request.headers.get('Content-Type') || 'text/plain';
  }
  try {
    const resp = await fetch(target, init);
    const headers = new Headers(resp.headers);
    if (url.pathname.startsWith('/cl/tag/')) {
      headers.set('Content-Type', 'application/javascript; charset=utf-8');
      headers.set('Cache-Control', 'public, max-age=3600');
    } else {
      headers.set('Cache-Control', 'no-store');
    }
    headers.set('Access-Control-Allow-Origin', 'https://cryptobingo.bet');
    return new Response(resp.body, { status: resp.status, headers });
  } catch (e) {
    return new Response('Proxy error: ' + e.message, { status: 502 });
  }
}

addEventListener('fetch', (event) => {
  event.respondWith(handle(event.request));
});
