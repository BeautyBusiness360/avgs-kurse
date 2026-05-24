import { config } from 'dotenv';
config();

const BASE   = 'https://avgs-kurse.vercel.app';
const SECRET = process.env.WEBHOOK_SECRET;
const results = {};
const issues  = [];

function ok(key, msg)   { results[key] = `✅ ${msg}`; }
function fail(key, msg) { results[key] = `❌ ${msg}`; issues.push(msg); }

// ── TEST 1: Supabase-Style Payload wird korrekt verarbeitet ──
process.stdout.write('Testing Supabase webhook payload... ');
try {
  const supabasePayload = {
    type: 'INSERT',
    table: 'dozentinnen',
    schema: 'public',
    record: { id: 'test-uuid', slug: 'test-dozentin', active: true },
    old_record: null
  };
  const url = `${BASE}/api/rebuild/?secret=${encodeURIComponent(SECRET)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(supabasePayload)
  });
  const body = await res.json().catch(() => null);
  if (res.status === 200 && (body?.status === 'triggered' || body?.status === 'debounced')) {
    ok('SUPABASE_PAYLOAD', `Payload akzeptiert → ${body.status}`);
  } else {
    fail('SUPABASE_PAYLOAD', `Status ${res.status}, body: ${JSON.stringify(body)}`);
  }
} catch (e) {
  fail('SUPABASE_PAYLOAD', e.message);
}

// ── TEST 2: Debounce — 3 schnelle Requests → nur 1 Trigger ──
process.stdout.write('Testing debounce (3 rapid requests)... ');
await new Promise(r => setTimeout(r, 65000)); // warten bis vorheriger Debounce abläuft

try {
  const url = `${BASE}/api/rebuild/?secret=${encodeURIComponent(SECRET)}`;
  // Sequentiell — simuliert Supabase-Verhalten (kein concurrent flood)
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
  const statuses = [];
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, opts);
    const b = await r.json().catch(() => null);
    statuses.push(b?.status);
  }

  const triggeredCount = statuses.filter(s => s === 'triggered').length;
  const debouncedCount = statuses.filter(s => s === 'debounced').length;

  if (triggeredCount === 1 && debouncedCount === 2) {
    ok('DEBOUNCE', `1 triggered + 2 debounced (korrekt)`);
  } else {
    fail('DEBOUNCE', `triggered: ${triggeredCount}, debounced: ${debouncedCount} (erwartet 1+2)`);
  }
} catch (e) {
  fail('DEBOUNCE', e.message);
}

// ── REPORT ────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(50));
console.log('  EDGE CASE VALIDATION REPORT');
console.log('═'.repeat(50));
for (const [key, val] of Object.entries(results)) {
  console.log(val);
}
console.log('═'.repeat(50));
if (issues.length === 0) {
  console.log('✅ ALLE EDGE CASES BESTANDEN — PRODUCTION SAFE');
} else {
  console.log('❌ ISSUES:');
  issues.forEach(i => console.log(`   → ${i}`));
}
console.log('═'.repeat(50));
