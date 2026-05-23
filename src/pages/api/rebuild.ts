export const prerender = false;
import type { APIRoute } from 'astro';

const debounceMap = new Map<string, ReturnType<typeof setTimeout>>();

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ status: 'rebuild endpoint active' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ request }) => {
  const secret = new URL(request.url).searchParams.get('secret')?.trim();

  if (!secret || secret !== process.env.WEBHOOK_SECRET?.trim()) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const hookUrl = process.env.VERCEL_DEPLOY_HOOK;
  if (!hookUrl) {
    return new Response(JSON.stringify({ error: 'No deploy hook configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const key = 'build';
  if (debounceMap.has(key)) {
    return new Response(JSON.stringify({ ok: true, status: 'debounced' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  debounceMap.set(key, setTimeout(() => debounceMap.delete(key), 60000));

  await fetch(hookUrl, { method: 'POST' });

  return new Response(JSON.stringify({ ok: true, status: 'triggered' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
