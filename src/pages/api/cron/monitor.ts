export const prerender = false;

import type { APIRoute } from 'astro';
import { runMonitoring } from '../../../lib/automation/monitoring';

export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  await runMonitoring();
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
