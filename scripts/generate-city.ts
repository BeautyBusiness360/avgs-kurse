// TASK 21 — generate-city.ts
// TASK 38 — automation_logs schreiben nach jedem Schritt
// Usage: npm run generate:city -- --city berlin

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
  // parse --city argument
  const cityArg = process.argv.find(a => a.startsWith('--city'));
  const citySlug = cityArg ? cityArg.split('=')[1] ?? process.argv[process.argv.indexOf(cityArg) + 1] : null;

  if (!citySlug) {
    console.error('Usage: npm run generate:city -- --city <citySlug>');
    process.exit(1);
  }

  console.log(`\n[generate-city] Processing: ${citySlug}`);

  // 1. Load city
  const { data: cityData } = await supabase
    .from('cities')
    .select('id, name, slug')
    .eq('slug', citySlug)
    .single();

  if (!cityData) {
    await log('generate-city', 'error', `City not found: ${citySlug}`);
    console.error(`City not found: ${citySlug}`);
    process.exit(1);
  }

  // 2. Load active dozentinnen with services for this city
  const { data: dozentinnen } = await supabase
    .from('dozentinnen')
    .select('id, slug, first_name, last_name, dozentin_services(services(id, slug, name, avgs_eligible))')
    .eq('city_id', cityData.id)
    .eq('active', true);

  if (!dozentinnen?.length) {
    await log('generate-city', 'warning', `No active dozentinnen in ${citySlug}`);
    console.warn(`No active dozentinnen in ${citySlug}`);
    return;
  }

  // 3. Build unique city × service combinations
  const serviceMap = new Map<string, { id: string; slug: string; name: string; avgsEligible: boolean }>();
  for (const doz of dozentinnen) {
    for (const ds of (doz.dozentin_services ?? [])) {
      const svc = (ds as any).services;
      if (svc?.slug) serviceMap.set(svc.slug, { id: svc.id, slug: svc.slug, name: svc.name, avgsEligible: svc.avgs_eligible });
    }
  }

  const services = [...serviceMap.values()];
  let processed = 0;

  for (const svc of services) {
    const pageSlug = `${citySlug}/${svc.slug}`;

    // Check existing entry in generated_pages
    const { data: existing } = await supabase
      .from('generated_pages')
      .select('id, content_hash, ai_content')
      .eq('slug', pageSlug)
      .maybeSingle();

    // Build context for content generation
    const ctx: ContentContext = {
      type: 'city_service',
      cityService: {
        city:             cityData.name,
        cityId:           cityData.id,
        service:          svc.name,
        serviceId:        svc.id,
        dozentinnenCount: dozentinnen.filter(d =>
          (d.dozentin_services ?? []).some((ds: any) => ds.services?.slug === svc.slug)
        ).length,
        avgsInfo: svc.avgsEligible ? 'Förderbar über AVGS (Arbeitsagentur).' : '',
      },
    };

    const newHash = buildContentHash(ctx);

    // 4. Skip if hash matches (TASK 30 — no unnecessary API calls)
    if (existing?.content_hash === newHash && existing?.ai_content) {
      console.log(`  [skip] ${pageSlug} — content unchanged`);
      continue;
    }

    // Generate new content
    const aiContent = await generateContent(ctx);

    const upsertPayload = {
      slug:           pageSlug,
      city_id:        cityData.id,
      service_id:     svc.id,
      ai_content:     aiContent ?? '',
      content_hash:   newHash,
      last_generated: new Date().toISOString(),
    };

    if (existing) {
      await supabase.from('generated_pages').update(upsertPayload).eq('id', existing.id);
    } else {
      await supabase.from('generated_pages').insert(upsertPayload);
    }

    console.log(`  [ok] ${pageSlug} — ${aiContent ? 'generated' : 'content null, saved empty'}`);
    processed++;
  }

  // 5. TASK 38 — log result
  const message = `${citySlug}: ${processed}/${services.length} pages processed`;
  await log('generate-city', 'success', message);
  console.log(`\n[generate-city] Done — ${message}\n`);
}

main().catch(async err => {
  console.error('[generate-city] Fatal:', err);
  await supabase.from('automation_logs').insert({
    scenario: 'generate-city', status: 'error', message: String(err)
  }).catch(() => {});
  process.exit(1);
});
