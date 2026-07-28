/**
 * Cloudflare Worker — Clarity proxy 1ª parte (dribla ad-block)
 * Route: cryptobingo.bet/cl/*
 * - GET /cl/tag/:id  -> serve https://www.clarity.ms/tag/:id (JS do Clarity)
 * - POST/GET /cl/collect -> proxy de ingestão https://www.clarity.ms/collect
 */
const CLARITY_HOST = 'https://www.clarity.ms';

function rewriteUrl(pathname) {
  // /cl/tag/xge781i2so -> /tag/xge781i2so
  // /cl/collect?...    -> /collect?...
  return CLARITY_HOST + pathname.replace(/^\/cl/, '');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/cl/')) {
      return new Response('Not found', { status: 404 });
    }
    const target = rewriteUrl(url.pathname) + url.search;
    const init = {
      method: request.method,
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'clarity-proxy',
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
      // Clarity JS precisa de content-type application/javascript
      const headers = new Headers(resp.headers);
      if (url.pathname.startsWith('/cl/tag/')) {
        headers.set('Content-Type', 'application/javascript; charset=utf-8');
        headers.set('Cache-Control', 'public, max-age=3600');
      }
      headers.set('Access-Control-Allow-Origin', 'https://cryptobingo.bet');
      return new Response(resp.body, {
        status: resp.status,
        headers,
      });
    } catch (e) {
      return new Response('Proxy error: ' + e.message, { status: 502 });
    }
  },
};
