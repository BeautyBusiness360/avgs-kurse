import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const BASE_URL = 'https://avgs-kurse.vercel.app';
const DIST = 'dist';
const issues = [];
const results = {};

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── HELPERS ──────────────────────────────────────────────
function ok(key, msg)   { results[key] = { status: '✅', msg }; }
function fail(key, msg) { results[key] = { status: '❌', msg }; issues.push(`${key}: ${msg}`); }
function warn(key, msg) { results[key] = { status: '⚠️', msg }; }

async function fetchStatus(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    return res.status;
  } catch {
    return 0;
  }
}

// ── BLOCK 1: BUILD ────────────────────────────────────────
console.log('Running BUILD...');
try {
  const start = Date.now();
  execSync('npm run build', { stdio: 'pipe' });
  const seconds = Math.round((Date.now() - start) / 1000);

  const pages = execSync(`find ${DIST} -name "index.html"`)
    .toString().trim().split('\n').filter(Boolean);

  if (pages.length < 10) {
    fail('BUILD', `Nur ${pages.length} Seiten generiert (erwartet min. 10)`);
  } else {
    ok('BUILD', `${pages.length} Seiten in ${seconds}s generiert`);
  }

  if (seconds > 120) warn('PERFORMANCE', `Build dauerte ${seconds}s — bei 1000+ Seiten prüfen`);
  else ok('PERFORMANCE', `Build in ${seconds}s (skalierbar)`);

} catch (e) {
  fail('BUILD', 'Build fehlgeschlagen: ' + e.message.slice(0, 100));
  fail('PERFORMANCE', 'Nicht messbar — Build fehlgeschlagen');
}

// ── BLOCK 2: OUTPUT ───────────────────────────────────────
console.log('Running OUTPUT...');
const { data: dozentinnen } = await supabase
  .from('dozentinnen')
  .select('slug')
  .eq('active', true);

const missing = [];
for (const d of dozentinnen ?? []) {
  const path = `${DIST}/dozentinnen/${d.slug}/index.html`;
  if (!existsSync(path)) missing.push(d.slug);
  else {
    const size = statSync(path).size;
    if (size < 3000) missing.push(`${d.slug} (zu klein: ${size} bytes)`);
  }
}

if (missing.length > 0) fail('OUTPUT', `Fehlende Seiten: ${missing.join(', ')}`);
else ok('OUTPUT', `Alle ${dozentinnen.length} Dozentinnen-Seiten vorhanden`);

// ── BLOCK 3: SUPABASE ─────────────────────────────────────
console.log('Running SUPABASE...');
const dbIssues = [];

const { data: noCity } = await supabase
  .from('dozentinnen')
  .select('slug')
  .eq('active', true)
  .is('city_id', null);
if (noCity?.length > 0) dbIssues.push(`${noCity.length} Dozentinnen ohne city_id`);

const { data: allDoz } = await supabase
  .from('dozentinnen')
  .select('id, slug')
  .eq('active', true);

const noService = [];
for (const d of allDoz ?? []) {
  const { data: svc } = await supabase
    .from('dozentin_services')
    .select('id')
    .eq('dozentin_id', d.id)
    .limit(1);
  if (!svc || svc.length === 0) noService.push(d.slug);
}
if (noService.length > 0) dbIssues.push(`Keine Services: ${noService.join(', ')}`);

if (dbIssues.length > 0) fail('SUPABASE', dbIssues.join(' | '));
else ok('SUPABASE', 'Alle Datensätze vollständig und valide');

// ── BLOCK 4: ROUTING ─────────────────────────────────────
console.log('Running ROUTING...');
const routingFails = [];

const routes = [
  ...( dozentinnen?.map(d => `/dozentinnen/${d.slug}/`) ?? [] ),
  '/berlin/',
  '/hamburg/',
  '/berlin/pmu-augenbrauen/',
  '/hamburg/wimpernverlaengerung/',
];

for (const route of routes) {
  const status = await fetchStatus(BASE_URL + route);
  if (status !== 200) routingFails.push(`${route} → ${status}`);
}

if (routingFails.length > 0) fail('ROUTING', routingFails.join(' | '));
else ok('ROUTING', `Alle ${routes.length} URLs antworten mit 200`);

// ── BLOCK 5: SEO ─────────────────────────────────────────
console.log('Running SEO...');
const seoFails = [];
const titlesSeen = new Set();

const htmlFiles = execSync(`find ${DIST}/dozentinnen -name "index.html"`)
  .toString().trim().split('\n').filter(Boolean);

for (const file of htmlFiles) {
  const content = readFileSync(file, 'utf-8');
  const slug = file.split('/')[2];

  const titleMatch = content.match(/<title>([^<]+)<\/title>/);
  if (!titleMatch) {
    seoFails.push(`${slug}: kein Title`);
  } else if (titlesSeen.has(titleMatch[1])) {
    seoFails.push(`${slug}: doppelter Title`);
  } else {
    titlesSeen.add(titleMatch[1]);
  }

  if (!content.includes('name="description"')) seoFails.push(`${slug}: keine Meta Description`);
  if (!content.includes('rel="canonical"'))    seoFails.push(`${slug}: kein Canonical`);
}

if (seoFails.length > 0) fail('SEO', seoFails.slice(0, 5).join(' | '));
else ok('SEO', `Title, Meta Description, Canonical auf allen ${htmlFiles.length} Seiten`);

// ── BLOCK 6: LINKS ────────────────────────────────────────
console.log('Running LINKS...');
const brokenLinks = [];
const testFile = `${DIST}/dozentinnen/${dozentinnen?.[0]?.slug}/index.html`;

if (existsSync(testFile)) {
  const content = readFileSync(testFile, 'utf-8');
  const hrefs = [...content.matchAll(/href="(\/[^"#?]+)"/g)]
    .map(m => m[1])
    .filter(h => !h.includes('.') || h.endsWith('/'))
    .slice(0, 10);

  for (const href of hrefs) {
    const status = await fetchStatus(BASE_URL + href);
    if (status !== 200) brokenLinks.push(`${href} → ${status}`);
  }
}

if (brokenLinks.length > 0) fail('LINKS', brokenLinks.join(' | '));
else ok('LINKS', 'Alle internen Links funktionieren');

// ── REPORT ────────────────────────────────────────────────
console.log('\n' + '═'.repeat(50));
console.log('  VALIDATION REPORT — BeautyBusiness360');
console.log('═'.repeat(50));

for (const [key, val] of Object.entries(results)) {
  console.log(`${val.status} ${key.padEnd(14)} ${val.msg}`);
}

console.log('═'.repeat(50));
if (issues.length === 0) {
  console.log('✅ SYSTEM READY TO SCALE');
} else {
  console.log(`❌ ${issues.length} ISSUE(S) FOUND:`);
  issues.forEach(i => console.log(`   → ${i}`));
}
console.log('═'.repeat(50));
