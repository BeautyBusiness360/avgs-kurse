// TASK 23 — generate-longtail.ts
// TASK 38 — automation_logs schreiben nach jedem Schritt
// Usage: npm run generate:longtail

import 'dotenv/config';
import { createClient }                  from '@supabase/supabase-js';
import { generateContent, buildContentHash } from './content-writer.js';
import type { ContentContext }               from './content-writer.js';

// ─── Supabase client (service key) ───────────────────────────────────────────

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── automation log helper (TASK 38) ─────────────────────────────────────────

async function log(scenario: string, status: 'success' | 'error' | 'warning', message: string) {
  await supabase.from('automation_logs').insert({ scenario, status, message });
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n[generate-longtail] Starting longtail generation…\n');

  // 1. Load all longtail keywords from DB
  const { data: keywords, error } = await supabase
    .from('longtail_keywords')
    .select('id, keyword, city, service, slug')
    .eq('published', false);

  if (error) {
    await log('generate-longtail', 'error', `Failed to load longtail keywords: ${error.message}`);
    console.error('[generate-longtail] Failed to load keywords:', error.message);
    process.exit(1);
  }

  if (!keywords?.length) {
    await log('generate-longtail', 'warning', 'No unpublished longtail keywords found');
    console.warn('[generate-longtail] No unpublished longtail keywords found. Nothing to do.');
    return;
  }

  console.log(`[generate-longtail] Found ${keywords.length} keywords to process`);

  let processed = 0;
  let skipped   = 0;
  let errors    = 0;

  for (const kw of keywords) {
    const pageSlug = kw.slug ?? `${kw.city}/${kw.keyword.toLowerCase().replace(/\s+/g, '-')}`;

    // Build context
    const ctx: ContentContext = {
      type: 'longtail',
      longtail: {
        keyword: kw.keyword,
        city:    kw.city,
        service: kw.service,
      },
    };

    const newHash = buildContentHash(ctx);

    // Check existing entry in longtail_pages
    const { data: existing } = await supabase
      .from('longtail_pages')
      .select('id, content_hash, ai_content')
      .eq('slug', pageSlug)
      .maybeSingle();

    // Skip if hash matches
    if (existing?.content_hash === newHash && existing?.ai_content) {
      console.log(`  [skip] ${pageSlug} — content unchanged`);
      skipped++;
      continue;
    }

    // Generate content via Claude API
    let aiContent: string | null = null;
    try {
      aiContent = await generateContent(ctx);
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [error] ${pageSlug}: ${msg}`);
      await log('generate-longtail', 'error', `Keyword failed: ${kw.keyword} — ${msg}`);
      continue;
    }

    const upsertPayload = {
      slug:            pageSlug,
      keyword_id:      kw.id,
      keyword:         kw.keyword,
      city:            kw.city,
      service:         kw.service,
      ai_content:      aiContent ?? '',
      content_hash:    newHash,
      published:       false,               // published=false until manually reviewed
      last_generated:  new Date().toISOString(),
    };

    if (existing) {
      await supabase.from('longtail_pages').update(upsertPayload).eq('id', existing.id);
    } else {
      await supabase.from('longtail_pages').insert(upsertPayload);
    }

    console.log(`  [ok] ${pageSlug} — ${aiContent ? 'generated' : 'content null, saved empty'}`);
    processed++;
  }

  // Final report (TASK 38)
  const message = `${processed}/${keywords.length} longtail pages generated, ${skipped} skipped, ${errors} errors`;
  await log('generate-longtail', errors > 0 ? 'warning' : 'success', message);
  console.log(`\n[generate-longtail] Done — ${message}\n`);
}

main().catch(async err => {
  console.error('[generate-longtail] Fatal:', err);
  await supabase.from('automation_logs').insert({
    scenario: 'generate-longtail', status: 'error', message: String(err)
  }).catch(() => {});
  process.exit(1);
});
