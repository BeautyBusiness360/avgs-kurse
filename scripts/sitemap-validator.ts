// TASK 25 — sitemap-validator.ts
// Reads all slugs from generated_pages, sends HEAD request to each URL,
// marks broken pages (broken=true) in DB, writes CSV report.
// Usage: npm run validate:sitemap

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import path             from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Supabase client (service key) ───────────────────────────────────────────

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── config ───────────────────────────────────────────────────────────────────

const BASE_URL     = process.env.SITE_URL ?? 'https://avgs-kurse.vercel.app';
const CONCURRENCY  = 10;   // max parallel HEAD requests
const TIMEOUT_MS   = 10_000;

// ─── HEAD request helper ──────────────────────────────────────────────────────

async function checkUrl(url: string): Promise<{ url: string; status: number | null; ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    return { url, status: res.status, ok: res.ok };
  } catch (err) {
    clearTimeout(timer);
    return { url, status: null, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── concurrency limiter ──────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await fn(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n[sitemap-validator] Starting validation…\n');

  // 1. Load all slugs from generated_pages
  const { data: pages, error } = await supabase
    .from('generated_pages')
    .select('id, slug, broken');

  if (error) {
    console.error('[sitemap-validator] Failed to load pages:', error.message);
    process.exit(1);
  }

  if (!pages?.length) {
    console.warn('[sitemap-validator] No pages found in generated_pages.');
    return;
  }

  console.log(`[sitemap-validator] Checking ${pages.length} pages against ${BASE_URL}…`);

  type CheckResult = { id: string; slug: string; url: string; status: number | null; ok: boolean; error?: string };
  const results: CheckResult[] = [];

  // 2. Send HEAD requests with concurrency limit
  await runWithConcurrency(pages, async (page) => {
    const url = `${BASE_URL}/${page.slug}`;
    const result = await checkUrl(url);
    const entry: CheckResult = { id: page.id, slug: page.slug, ...result };
    results.push(entry);

    const icon = result.ok ? '✓' : '✗';
    const statusStr = result.status !== null ? String(result.status) : 'TIMEOUT';
    console.log(`  [${icon}] ${page.slug} → ${statusStr}${result.error ? ` (${result.error})` : ''}`);
  }, CONCURRENCY);

  // 3. Mark broken pages in DB
  const broken    = results.filter(r => !r.ok);
  const recovered = results.filter(r => r.ok);

  if (broken.length > 0) {
    const brokenIds = broken.map(r => r.id);
    await supabase.from('generated_pages').update({ broken: true }).in('id', brokenIds);
    console.log(`\n[sitemap-validator] Marked ${broken.length} pages as broken=true`);
  }

  if (recovered.length > 0) {
    const recoveredIds = recovered.map(r => r.id);
    await supabase.from('generated_pages').update({ broken: false }).in('id', recoveredIds);
  }

  // 4. Write CSV report
  const csvLines = [
    'slug,url,status,ok,error',
    ...results.map(r =>
      [r.slug, r.url, r.status ?? '', r.ok, r.error ?? ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ),
  ];

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath   = path.join(__dirname, `../sitemap-report-${timestamp}.csv`);
  writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');
  console.log(`\n[sitemap-validator] CSV report written: ${csvPath}`);

  // 5. Summary
  console.log(`\n[sitemap-validator] Summary:`);
  console.log(`  Total:    ${results.length}`);
  console.log(`  OK:       ${recovered.length}`);
  console.log(`  Broken:   ${broken.length}`);

  if (broken.length > 0) {
    console.log('\n  Broken pages:');
    for (const r of broken) {
      console.log(`    - ${r.slug} (${r.status ?? 'TIMEOUT'}) ${r.error ?? ''}`);
    }
  }

  console.log();
}

main().catch(err => {
  console.error('[sitemap-validator] Fatal:', err);
  process.exit(1);
});
