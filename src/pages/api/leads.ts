// TASK 1  — POST /api/leads  (Jotform Webhook receiver)
// TASK 2  — Jotform field mapping
// TASK 3  — Supabase insert via Service Role Key
// TASK 4  — Duplicate check (same email + dozentin_slug within 24h)
// TASK 36 — Retry logic (3 attempts) + dead-letter to failed_leads

export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

// ─── helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getServiceClient() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

// ─── GET — health check / endpoint test ──────────────────────────────────────

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ status: 'leads endpoint active' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// ─── POST — Jotform webhook receiver ─────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  // TASK 1 — validate webhook secret via query parameter
  const url            = new URL(request.url);
  const incomingSecret = url.searchParams.get('secret');
  const expectedSecret = import.meta.env.WEBHOOK_SECRET;

  if (!expectedSecret || incomingSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // FIX — parse body supporting form-encoded (Jotform) and JSON
  const contentType = request.headers.get('content-type') ?? '';

  let body: Record<string, string> = {};

  if (contentType.includes('application/json')) {
    body = await request.json();
  } else if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const formData = await request.formData();
    formData.forEach((value, key) => {
      body[key] = value.toString();
    });
  }

  // debug logging
  console.log('LEAD WEBHOOK RECEIVED', {
    contentType,
    keys: Object.keys(body),
    sample: {
      name:     body.q3_name,
      email:    body.q4_email,
      dozentin: body.q6_dozentinSlug,
    },
  });

  // TASK 2 — map Jotform fields → DB fields
  const lead = {
    name:          body.q3_name         || null,
    email:         body.q4_email        || '',
    phone:         body.q5_phone        || null,
    dozentin_slug: body.q6_dozentinSlug || '',
    city_slug:     body.q7_citySlug     || null,
    service_slug:  body.q8_serviceSlug  || null,
    consent:       body.consent === 'true',
    source:        'jotform' as const,
    status:        'new'     as const,
  };

  // basic validation
  if (!lead.email || !lead.dozentin_slug) {
    return new Response(JSON.stringify({ error: 'email and dozentin_slug required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = getServiceClient();

  // TASK 4 — duplicate check: same email + dozentin_slug in last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('email', lead.email)
    .eq('dozentin_slug', lead.dozentin_slug)
    .gt('created_at', since)
    .limit(1);

  if (existing && existing.length > 0) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // TASK 3 + TASK 36 — insert with up to 3 retries
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.from('leads').insert(lead);

    if (!error) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    lastError = error.message;
    if (attempt < 2) await sleep(1000);
  }

  // TASK 36 — after 3 failures: log + dead-letter queue
  await Promise.allSettled([
    supabase.from('automation_logs').insert({
      scenario: 'lead-webhook',
      status:   'error',
      message:  lastError,
      payload:  body,
    }),
    supabase.from('failed_leads').insert({
      raw_payload: body,
      error:       lastError,
      retry_count: 3,
    }),
  ]);

  // return 500 so Jotform marks the webhook as failed and retries
  return new Response(JSON.stringify({ ok: false, error: lastError }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
};
