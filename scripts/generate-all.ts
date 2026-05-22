// TASK 22 — generate-all.ts
// TASK 38 — automation_logs schreiben nach jedem Schritt
// Usage: npm run generate:all

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { spawn }        from 'node:child_process';
import path             from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Supabase client (service key) ───────────────────────────────────────────

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── automation log helper (TASK 38) ─────────────────────────────────────────

async function log(scenario: string, status: 'success' | 'error' | 'warning', message: string) {
  await supabase.from('automation_logs').insert({ scenario, status, message });
}

// ─── run generate-city for a single city ─────────────────────────────────────

function runGenerateCity(citySlug: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, 'generate-city.ts');
    const tsconfig = path.join(__dirname, 'tsconfig.json');

    const child = spawn(
      'npx', ['tsx', '--tsconfig', tsconfig, script, '--city', citySlug],
      { stdio: 'inherit', env: process.env }
    );

    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`generate-city exited with code ${code} for ${citySlug}`));
    });

    child.on('error', reject);
  });
}

// ─── sleep helper ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n[generate-all] Starting batch generation…\n');

  // 1. Load all cities where indexed = false
  const { data: cities, error } = await supabase
    .from('cities')
    .select('id, slug, name')
    .eq('indexed', false);

  if (error) {
    await log('generate-all', 'error', `Failed to load cities: ${error.message}`);
    console.error('[generate-all] Failed to load cities:', error.message);
    process.exit(1);
  }

  if (!cities?.length) {
    await log('generate-all', 'warning', 'No unindexed cities found');
    console.warn('[generate-all] No unindexed cities found. Nothing to do.');
    return;
  }

  console.log(`[generate-all] Found ${cities.length} unindexed cities`);

  const BATCH_SIZE  = 10;
  const BATCH_DELAY = 2_000;

  let processed    = 0;
  let errors       = 0;
  const successIds: string[] = [];

  // 2. Process in batches of 10
  for (let i = 0; i < cities.length; i += BATCH_SIZE) {
    const batch = cities.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(cities.length / BATCH_SIZE);

    console.log(`\n[generate-all] Batch ${batchNum}/${totalBatches}: ${batch.map(c => c.slug).join(', ')}`);

    // 3. Process each city in the batch sequentially
    for (const city of batch) {
      try {
        await runGenerateCity(city.slug);
        successIds.push(city.id);
        processed++;
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [error] ${city.slug}: ${msg}`);
        await log('generate-all', 'error', `City failed: ${city.slug} — ${msg}`);
      }
    }

    // 4. Wait 2 seconds between batches (skip after last batch)
    if (i + BATCH_SIZE < cities.length) {
      console.log(`[generate-all] Batch done — waiting ${BATCH_DELAY / 1000}s before next batch…`);
      await sleep(BATCH_DELAY);
    }
  }

  // 5. Mark successfully processed cities as indexed = true
  if (successIds.length > 0) {
    const { error: updateErr } = await supabase
      .from('cities')
      .update({ indexed: true })
      .in('id', successIds);

    if (updateErr) {
      await log('generate-all', 'error', `Failed to set indexed=true: ${updateErr.message}`);
      console.error('[generate-all] Failed to mark cities as indexed:', updateErr.message);
    } else {
      console.log(`\n[generate-all] Marked ${successIds.length} cities as indexed=true`);
    }
  }

  // 6. Final report (TASK 38)
  const message = `Batch complete: ${processed}/${cities.length} cities processed, ${errors} errors`;
  await log('generate-all', errors > 0 ? 'warning' : 'success', message);
  console.log(`\n[generate-all] Done — ${message}\n`);
}

main().catch(async err => {
  console.error('[generate-all] Fatal:', err);
  await supabase.from('automation_logs').insert({
    scenario: 'generate-all', status: 'error', message: String(err)
  }).catch(() => {});
  process.exit(1);
});
