export const prerender = false;

import type { APIRoute } from 'astro';

const debounceMap = new Map<string, NodeJS.Timeout>();

export const POST: APIRoute = async ({ request }) => {
  const secret = new URL(request.url).searchParams.get('secret')?.trim();
  if (secret !== process.env.WEBHOOK_SECRET?.trim()) {
    return new Response('Unauthorized', { status: 401 });
  }

  const hookUrl = process.env.VERCEL_DEPLOY_HOOK;
  if (!hookUrl) {
    return new Response('No deploy hook configured', { status: 500 });
  }

  // Debounce: mehrere Inserts in 60s = 1 Build
  const key = 'build';
  if (debounceMap.has(key)) {
    return new Response(JSON.stringify({ ok: true, status: 'debounced' }), { status: 200 });
  }

  debounceMap.set(key, setTimeout(() => debounceMap.delete(key), 60000));

  await fetch(hookUrl, { method: 'POST' });

  return new Response(JSON.stringify({ ok: true, status: 'triggered' }), { status: 200 });
};
