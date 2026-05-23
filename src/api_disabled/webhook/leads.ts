export const prerender = false;

import type { APIRoute } from 'astro';
import { handleNewLead } from '../../../lib/automation/lead-handler';
import { log } from '../../../lib/logging/logger';

export const POST: APIRoute = async ({ request }) => {
  const secret = new URL(request.url).searchParams.get('secret')?.trim();
  if (secret !== process.env.WEBHOOK_SECRET?.trim()) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = await request.json();
    const lead = body.record;
    await handleNewLead(lead);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    await log('webhook-leads', 'error', String(error));
    return new Response('Error', { status: 500 });
  }
};
