/**
 * CanvasQuest — Cloudflare Worker CORS Proxy
 *
 * Deploy instructions:
 *  1. Go to https://dash.cloudflare.com → Workers & Pages → Create Worker
 *  2. Paste this file into the editor and click "Deploy"
 *  3. Note your worker URL: https://your-worker.your-subdomain.workers.dev
 *  4. In CanvasQuest, your API calls will be routed through this proxy when
 *     direct Canvas API calls are blocked by CORS.
 *
 * Usage:
 *  GET https://your-worker.workers.dev/api/v1/courses
 *      ?domain=myschool.instructure.com
 *      &Authorization=Bearer <token>
 *
 *  The worker strips the `domain` query param, forwards the rest of the
 *  path + remaining query params to Canvas, and injects CORS headers on
 *  the response so the browser accepts it.
 *
 * Security note:
 *  The user's Canvas token is sent in the Authorization header (HTTPS only).
 *  This worker does NOT log or store any credentials.
 */

const ALLOWED_HOSTS = /^[a-zA-Z0-9.-]+\.instructure\.com$/;

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);
    const domain = url.searchParams.get('domain');

    if (!domain || !ALLOWED_HOSTS.test(domain)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid domain param' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // Remove the domain param, keep everything else
    url.searchParams.delete('domain');

    // Build target URL: https://{domain}{pathname}{search}
    const targetUrl = `https://${domain}${url.pathname}${url.search}`;

    // Forward the request with original headers (includes Authorization)
    const upstreamReq = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    });

    let upstream;
    try {
      upstream = await fetch(upstreamReq);
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Upstream fetch failed', detail: String(err) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // Clone response and inject CORS headers
    const response = new Response(upstream.body, upstream);
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Max-Age':       '86400',
  };
}
