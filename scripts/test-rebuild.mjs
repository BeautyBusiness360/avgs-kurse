import { config } from 'dotenv';
config();

const BASE     = 'https://avgs-kurse.vercel.app';
const SECRET   = process.env.WEBHOOK_SECRET;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT = 'avgs-kurse';

const results = {};
const issues  = [];

function ok(key, msg)   { results[key] = `✅ ${msg}`; }
function fail(key, msg) { results[key] = `❌ ${msg}`; issues.push(`${key}: ${msg}`); }

// ── TEST 1: GET /api/rebuild ──────────────────────────
process.stdout.write('Testing GET /api/rebuild... ');
try {
  const res = await fetch(`${BASE}/api/rebuild/`);
  const body = await res.json().catch(() => null);
  if (res.status === 200 && body?.status) {
    ok('API_GET', `200 OK → ${JSON.stringify(body)}`);
  } else {
    fail('API_GET', `Status ${res.status}, body: ${JSON.stringify(body)}`);
  }
} catch (e) {
  fail('API_GET', e.message);
}

// ── TEST 2: POST ohne Secret → 401 ───────────────────
process.stdout.write('Testing POST without secret... ');
try {
  const res = await fetch(`${BASE}/api/rebuild/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (res.status === 401) {
    ok('AUTH_CHECK', '401 Unauthorized (korrekt)');
  } else {
    fail('AUTH_CHECK', `Erwartet 401, bekam ${res.status}`);
  }
} catch (e) {
  fail('AUTH_CHECK', e.message);
}

// ── TEST 3: POST mit Secret → triggered ──────────────
process.stdout.write('Testing POST with secret... ');
let deployTriggeredAt = null;
try {
  const url = `${BASE}/api/rebuild/?secret=${encodeURIComponent(SECRET)}`;
  const res  = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = await res.json().catch(() => null);

  if (res.status === 200 && (body?.status === 'triggered' || body?.status === 'debounced')) {
    deployTriggeredAt = Date.now();
    ok('API_POST', `200 OK → ${JSON.stringify(body)}`);
  } else {
    fail('API_POST', `Status ${res.status}, body: ${JSON.stringify(body)}`);
  }
} catch (e) {
  fail('API_POST', e.message);
}

// ── TEST 4: Deploy Hook ausgelöst? ────────────────────
process.stdout.write('Checking deploy trigger (waiting 8s)... ');
if (!deployTriggeredAt) {
  fail('DEPLOY_TRIGGER', 'POST fehlgeschlagen — kein Trigger möglich');
} else if (!VERCEL_TOKEN) {
  // Fallback: ohne Vercel API Token → VERCEL_DEPLOY_HOOK direkt prüfen
  const hookSet = !!process.env.VERCEL_DEPLOY_HOOK;
  if (hookSet) {
    ok('DEPLOY_TRIGGER', 'VERCEL_DEPLOY_HOOK gesetzt + POST war 200 → Trigger angenommen');
  } else {
    fail('DEPLOY_TRIGGER', 'VERCEL_DEPLOY_HOOK nicht in .env gesetzt');
  }
} else {
  // Mit Vercel API Token → letztes Deployment prüfen
  await new Promise(r => setTimeout(r, 8000));
  try {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT}&limit=1`,
      { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
    );
    const data = await res.json();
    const latest = data.deployments?.[0];
    if (latest) {
      const createdAt = latest.createdAt;
      const secondsAgo = Math.round((Date.now() - createdAt) / 1000);
      if (secondsAgo < 30) {
        ok('DEPLOY_TRIGGER', `Neues Deployment gestartet vor ${secondsAgo}s (${latest.state})`);
      } else {
        fail('DEPLOY_TRIGGER', `Letztes Deployment vor ${secondsAgo}s — kein neues Deployment erkannt`);
      }
    } else {
      fail('DEPLOY_TRIGGER', 'Keine Deployments gefunden');
    }
  } catch (e) {
    fail('DEPLOY_TRIGGER', 'Vercel API Fehler: ' + e.message);
  }
}

// ── TEST 5: End-to-End ────────────────────────────────
process.stdout.write('End-to-end check... ');
const allPassed = !issues.some(i =>
  i.startsWith('API_GET') || i.startsWith('API_POST') || i.startsWith('AUTH_CHECK')
);
if (allPassed) {
  ok('END_TO_END', 'Alle kritischen Tests bestanden');
} else {
  fail('END_TO_END', 'Mindestens ein kritischer Test fehlgeschlagen');
}

// ── REPORT ────────────────────────────────────────────
console.log('\n' + '═'.repeat(52));
console.log('  REBUILD WEBHOOK — VALIDATION REPORT');
console.log('═'.repeat(52));
for (const [key, val] of Object.entries(results)) {
  console.log(`${val.padEnd(60)} [${key}]`);
}
console.log('═'.repeat(52));
if (issues.length === 0) {
  console.log('✅ SYSTEM FULLY AUTOMATED');
} else {
  console.log(`❌ ISSUE(S) FOUND:`);
  issues.forEach(i => console.log(`   → ${i}`));
}
console.log('═'.repeat(52));
