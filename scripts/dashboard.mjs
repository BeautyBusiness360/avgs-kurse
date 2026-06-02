/**
 * Dashboard Generator — /uebersicht/
 * Writes dist/client/uebersicht/index.html (noindex, not linked).
 * Reads: dist/ (live pages), sitemap.xml (submitted URLs), Supabase (coverage gaps),
 *        GSC URL Inspection API (indexation status per URL).
 * Postbuild, fail-soft — never breaks the build.
 */

import { createClient } from '@supabase/supabase-js';
import { createSign }   from 'node:crypto';
import { config }       from 'dotenv';
import fs               from 'node:fs';
import path             from 'node:path';

config();

// ── Constants ─────────────────────────────────────────────────────────────────

const DIST     = path.resolve('dist/client');
const BASE_URL = 'https://dein-beauty-kurs.de';
const OUTPUTS  = [
  path.join(DIST, 'uebersicht'),
  path.join(path.resolve('.vercel/output/static'), 'uebersicht'),
];

const KNOWN_CITIES  = new Set(['berlin','essen','hamburg','mainz','ulm']);
const NOINDEX_SLUGS = new Set(['link-graph','coverage','uebersicht','404']);

const SVC_LABEL = {
  'powderbrows-ombrebrows-masterclass': 'PowderBrows & OmbreBrows',
  'velvet-lips-lipstick-masterclass':   'Velvet Lips & LipStick',
  'microblading-masterclass':           'Microblading',
  'wimpernverlaengerung-masterclass':   'Wimpernverlängerung',
  'camouflage-removal-masterclass':     'Camouflage & Removal',
};

const CITY_LABEL = {
  berlin: 'Berlin', essen: 'Essen', hamburg: 'Hamburg', mainz: 'Mainz', ulm: 'Ulm',
};

const HUB_CITY_SLUG = {
  'dunya-said-hamburg':    'hamburg',
  'yvonne-klatt-elmshorn': 'hamburg',
  'katarina-hinz-wedel':   'hamburg',
};

// ── Entry point ───────────────────────────────────────────────────────────────

try {
  await run();
} catch (e) {
  console.warn('[dashboard] Warning – skipped:', e.message);
  process.exit(0);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  if (!fs.existsSync(DIST)) {
    console.warn('[dashboard] dist/client not found – skipping.');
    return;
  }

  // 1. Collect all built pages, categorised
  const pages = scanDist();

  // 2. Parse sitemap for submitted URLs (normalised, no trailing slash)
  const sitemapUrls = parseSitemap();

  // 3. GSC inspection for all public (non-noindex) pages
  const publicPages  = pages.filter(p => !p.noindex);
  const gscConfigured = !!(process.env.GSC_SERVICE_ACCOUNT_JSON && process.env.GSC_SITE_URL);
  const gscData      = await inspectAllGSC(publicPages);

  // 4. Coverage gaps from Supabase
  const gaps = await getCoverageGaps();

  // 5. Roadmap (optional)
  const roadmap = getRoadmap();

  // 6. Generate + write HTML
  const ts  = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  const html = generateHtml({ pages, sitemapUrls, gscData, gscConfigured, gaps, roadmap, ts });

  let written = 0;
  for (const dir of OUTPUTS) {
    const parent = path.dirname(dir);
    if (!fs.existsSync(parent)) continue;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    written++;
  }
  if (written === 0) console.warn('[dashboard] No output dirs found.');

  // 7. Console KPIs
  const indexed    = publicPages.filter(p => gscData[p.absUrl]?.verdict === 'PASS').length;
  const notIndexed = publicPages.filter(p => {
    const v = gscData[p.absUrl]?.verdict;
    return v && v !== 'PASS' && v !== 'UNSPECIFIED';
  }).length;

  console.log(
    `[dashboard] Live: ${publicPages.length} · Indexiert: ${indexed}` +
    ` · Nicht indexiert: ${notIndexed} · Lücken: ${gaps.length}`
  );

  // 8. Sample GSC lines for verification
  for (const p of publicPages.slice(0, 4)) {
    const g = gscData[p.absUrl];
    console.log(`  ${p.urlPath.padEnd(52)} ${g ? (g.verdict + ' – ' + g.coverageState) : 'GSC n/a'}`);
  }
}

// ── dist/ scanner ─────────────────────────────────────────────────────────────

function scanDist() {
  const all = fs.readdirSync(DIST, { recursive: true, encoding: 'utf8' });
  const pages = [];

  // Root index
  if (fs.existsSync(path.join(DIST, 'index.html'))) {
    pages.push(makePage('/'));
  }

  for (const rel of all) {
    if (!rel.endsWith('/index.html') && !rel.endsWith('\\index.html')) continue;
    const urlPath = '/' + rel.replace(/[/\\]index\.html$/, '/').replace(/\\/g, '/');
    pages.push(makePage(urlPath));
  }

  return pages;
}

function makePage(urlPath) {
  const parts   = urlPath.split('/').filter(Boolean);
  const absUrl  = BASE_URL + urlPath;
  const noindex = parts.length > 0 && NOINDEX_SLUGS.has(parts[0]);

  if (urlPath === '/') {
    return { urlPath, absUrl, type: 'sonstige', label: 'Startseite', noindex: false };
  }

  if (parts.length === 1) {
    const s = parts[0];
    if (NOINDEX_SLUGS.has(s))       return { urlPath, absUrl, type: 'noindex', label: s, noindex: true };
    if (KNOWN_CITIES.has(s))        return { urlPath, absUrl, type: 'stadt',   label: CITY_LABEL[s] ?? s, city: s, noindex: false };
    if (s === 'ratgeber')           return { urlPath, absUrl, type: 'ratgeber', label: 'Ratgeber (Übersicht)', noindex: false };
    return { urlPath, absUrl, type: 'sonstige', label: s, noindex: false };
  }

  if (parts.length === 2) {
    const [p1, p2] = parts;
    if (NOINDEX_SLUGS.has(p1))      return { urlPath, absUrl, type: 'noindex', label: urlPath, noindex: true };
    if (p1 === 'dozentinnen')       return { urlPath, absUrl, type: 'dozentinnen', slug: p2, label: p2, noindex: false };
    if (p1 === 'ratgeber')          return { urlPath, absUrl, type: 'ratgeber', slug: p2, label: p2, noindex: false };
    if (KNOWN_CITIES.has(p1)) {
      if (SVC_LABEL[p2]) return { urlPath, absUrl, type: 'svc', city: p1, service: p2, label: SVC_LABEL[p2], noindex: false };
      return { urlPath, absUrl, type: 'sonstige', label: urlPath, noindex: false };
    }
  }

  return { urlPath, absUrl, type: noindex ? 'noindex' : 'sonstige', label: urlPath, noindex };
}

// ── Sitemap parser ────────────────────────────────────────────────────────────

function parseSitemap() {
  const xmlPath = path.join(DIST, 'sitemap.xml');
  if (!fs.existsSync(xmlPath)) return new Set();
  const xml  = fs.readFileSync(xmlPath, 'utf8');
  const urls = new Set();
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    urls.add(m[1].trim().replace(/\/$/, '')); // normalise: no trailing slash
  }
  return urls;
}

// ── GSC URL Inspection ────────────────────────────────────────────────────────

async function inspectAllGSC(pages) {
  const saJson = process.env.GSC_SERVICE_ACCOUNT_JSON;
  const siteUrl = process.env.GSC_SITE_URL;
  if (!saJson || !siteUrl) {
    console.log('[dashboard] GSC_SERVICE_ACCOUNT_JSON or GSC_SITE_URL not set – skipping GSC.');
    return {};
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(saJson);
  } catch {
    console.warn('[dashboard] GSC_SERVICE_ACCOUNT_JSON is not valid JSON – skipping GSC.');
    return {};
  }

  let token;
  try {
    token = await getGSCToken(serviceAccount);
  } catch (e) {
    console.warn('[dashboard] GSC token exchange failed:', e.message);
    return {};
  }

  const results = {};
  for (const page of pages) {
    const inspectionUrl = page.absUrl.replace(/\/$/, ''); // GSC prefers no trailing slash
    try {
      const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionUrl, siteUrl }),
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const data = await res.json();
        const r = data?.inspectionResult?.indexStatusResult ?? {};
        results[page.absUrl] = {
          verdict:       r.verdict       ?? 'UNSPECIFIED',
          coverageState: r.coverageState ?? '',
          lastCrawlTime: r.lastCrawlTime ?? null,
        };
      } else if (res.status === 403) {
        // Service account not authorised for this GSC property — treat as disconnected
        console.warn('[dashboard] GSC 403 — Service Account nicht autorisiert. Indexierungs-Spalte bleibt leer.');
        return {};
      } else {
        const errBody = await res.text();
        console.warn(`[dashboard] GSC ${res.status} for ${inspectionUrl}: ${errBody.slice(0, 120)}`);
        results[page.absUrl] = { verdict: 'ERROR', coverageState: `HTTP ${res.status}`, lastCrawlTime: null };
      }
    } catch (e) {
      results[page.absUrl] = { verdict: 'ERROR', coverageState: e.message.slice(0, 60), lastCrawlTime: null };
    }
    // Respect rate limits
    await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

function getGSCToken(sa) {
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const now     = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  })).toString('base64url');

  const msg  = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(msg);
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${msg}.${sig}`;

  return fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })
    .then(r => r.json())
    .then(j => {
      if (!j.access_token) throw new Error(j.error_description ?? JSON.stringify(j));
      return j.access_token;
    });
}

// ── Supabase coverage gaps ────────────────────────────────────────────────────

async function getCoverageGaps() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return [];

  try {
    const supabase = createClient(url, key);
    const { data: doz } = await supabase
      .from('dozentinnen')
      .select('slug, cities(slug, name), dozentin_services(services(slug, name, avgs_eligible))')
      .eq('active', true);

    const { data: svcs } = await supabase
      .from('services').select('slug, name').eq('avgs_eligible', true);

    if (!doz || !svcs) return [];

    const covered = new Set();
    for (const d of doz) {
      const city = Array.isArray(d.cities) ? d.cities[0] : d.cities;
      if (!city?.slug) continue;
      const effCity = HUB_CITY_SLUG[d.slug] ?? city.slug;
      for (const ds of (Array.isArray(d.dozentin_services) ? d.dozentin_services : [])) {
        const s = Array.isArray(ds?.services) ? ds.services[0] : ds?.services;
        if (s?.avgs_eligible) covered.add(`${effCity}__${s.slug}`);
      }
    }

    const activeCities = new Set([...covered].map(k => k.split('__')[0]));
    const gaps = [];
    for (const city of activeCities) {
      for (const svc of svcs) {
        if (!covered.has(`${city}__${svc.slug}`)) {
          gaps.push({ city: CITY_LABEL[city] ?? city, citySlug: city, service: svc.name, serviceSlug: svc.slug });
        }
      }
    }
    return gaps;
  } catch { return []; }
}

// ── Roadmap ───────────────────────────────────────────────────────────────────

function getRoadmap() {
  const p = path.resolve('src/data/roadmap.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// ── GSC status helpers ────────────────────────────────────────────────────────

function gscBadge(gscResult, gscConnected) {
  if (!gscConnected) return '<span class="badge badge-off">GSC nicht verbunden</span>';
  if (!gscResult)    return '<span class="badge badge-unk">–</span>';
  const { verdict, coverageState } = gscResult;
  if (verdict === 'PASS')        return `<span class="badge badge-ok" title="${esc(coverageState)}">✓ Indexiert</span>`;
  if (verdict === 'ERROR')       return `<span class="badge badge-err" title="${esc(coverageState)}">API-Fehler</span>`;
  if (verdict === 'FAIL')        return `<span class="badge badge-err" title="${esc(coverageState)}">✗ ${esc(coverageState)}</span>`;
  if (verdict === 'NEUTRAL')     return `<span class="badge badge-warn" title="${esc(coverageState)}">⚠ ${esc(shortState(coverageState))}</span>`;
  return `<span class="badge badge-unk" title="${esc(coverageState)}">Unbekannt</span>`;
}

function shortState(s) {
  if (!s) return '';
  if (s.includes('Crawled'))    return 'Erstellt, nicht indexiert';
  if (s.includes('Discovered')) return 'Entdeckt, nicht indexiert';
  if (s.includes('unknown'))    return 'Unbekannt für Google';
  return s.length > 35 ? s.slice(0, 33) + '…' : s;
}

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── HTML Generator ────────────────────────────────────────────────────────────

function generateHtml({ pages, sitemapUrls, gscData, gscConfigured, gaps, roadmap, ts }) {
  const gscConnected = Object.keys(gscData).length > 0;

  const svcPages  = pages.filter(p => p.type === 'svc');
  const dozPages  = pages.filter(p => p.type === 'dozentinnen');
  const ratPages  = pages.filter(p => p.type === 'ratgeber');
  const stadtPages= pages.filter(p => p.type === 'stadt');
  const sonst     = pages.filter(p => p.type === 'sonstige');

  const publicPages = pages.filter(p => !p.noindex);
  const indexed     = publicPages.filter(p => gscData[p.absUrl]?.verdict === 'PASS').length;
  const notIndexed  = publicPages.filter(p => gscData[p.absUrl]?.verdict === 'NEUTRAL').length;

  // Helper: sitemap check cell
  function inSitemap(page) {
    const normalised = page.absUrl.replace(/\/$/, '');
    return sitemapUrls.has(normalised)
      ? '<span class="badge badge-ok">✓</span>'
      : '<span class="badge badge-warn">–</span>';
  }

  // Table row builder for most sections
  function pageRow(p) {
    return `<tr>
      <td><a href="${esc(p.urlPath)}" target="_blank" rel="noopener" class="url-link">${esc(p.urlPath)}</a></td>
      <td class="c">${inSitemap(p)}</td>
      <td class="c">${gscBadge(gscData[p.absUrl], gscConnected)}</td>
    </tr>`;
  }

  // SVC rows include Stadt + Modul columns
  function svcRow(p) {
    return `<tr>
      <td><a href="${esc(p.urlPath)}" target="_blank" rel="noopener" class="url-link">${esc(p.urlPath)}</a></td>
      <td>${esc(CITY_LABEL[p.city] ?? p.city ?? '')}</td>
      <td>${esc(p.label)}</td>
      <td class="c">${inSitemap(p)}</td>
      <td class="c">${gscBadge(gscData[p.absUrl], gscConnected)}</td>
    </tr>`;
  }

  const kpiGSC = gscConnected
    ? `<div class="kpi"><div class="kpi-v good">${indexed}</div><div class="kpi-l">Indexiert</div></div>
       <div class="kpi${notIndexed > 0 ? ' kpi-warn' : ''}"><div class="kpi-v${notIndexed > 0 ? ' warn' : ''}">${notIndexed}</div><div class="kpi-l">Nicht indexiert</div></div>`
    : `<div class="kpi kpi-off"><div class="kpi-v">–</div><div class="kpi-l">Indexiert (GSC)</div></div>
       <div class="kpi kpi-off"><div class="kpi-v">–</div><div class="kpi-l">Nicht indexiert (GSC)</div></div>`;

  const gscNote = gscConnected
    ? ''
    : gscConfigured
      ? `<div class="gsc-banner">⚠ GSC: Service Account noch nicht autorisiert — Sobald <code>bb360-gsc@formal-momentum-431212-j0.iam.gserviceaccount.com</code> in der Search Console als Nutzer (Voll) hinzugefügt ist, wird die Indexierungs-Spalte automatisch befüllt.</div>`
      : `<div class="gsc-banner">⚠ GSC nicht verbunden — <code>GSC_SERVICE_ACCOUNT_JSON</code> / <code>GSC_SITE_URL</code> fehlen oder ungültig. Indexierungs-Spalte wird nach Setup automatisch befüllt.</div>`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Dashboard – dein-beauty-kurs.de</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,system-ui,sans-serif;background:#111;color:#FAF8F5;font-size:13px;min-height:100vh;padding-bottom:60px}
a{color:#C8962E;text-decoration:none}a:hover{text-decoration:underline}
code{font-family:monospace;font-size:11px;color:#C8962E}
.header{padding:24px 32px 18px;border-bottom:1px solid rgba(255,255,255,.08)}
.header h1{font-family:Georgia,Cambria,serif;font-size:22px;font-weight:600;color:#FAF8F5;letter-spacing:.01em}
.header p{font-size:11px;color:#666;margin-top:4px}
.kpis{display:flex;gap:12px;padding:18px 32px;border-bottom:1px solid rgba(255,255,255,.07);flex-wrap:wrap}
.kpi{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:7px;padding:12px 20px;min-width:120px}
.kpi-warn{border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.06)}
.kpi-off{border-color:rgba(255,255,255,.05);opacity:.5}
.kpi-v{font-size:28px;font-weight:700;color:#C8962E;line-height:1}
.kpi-v.good{color:#22c55e}.kpi-v.warn{color:#f59e0b}
.kpi-l{font-size:10px;color:#777;margin-top:3px;text-transform:uppercase;letter-spacing:.08em}
.gsc-banner{margin:16px 32px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:6px;padding:10px 14px;font-size:12px;color:#d97706}
section{padding:28px 32px;border-bottom:1px solid rgba(255,255,255,.06)}
section h2{font-family:Georgia,Cambria,serif;font-size:16px;font-weight:600;color:#C8962E;margin-bottom:14px;letter-spacing:.01em}
section h2 span{font-family:Inter,system-ui,sans-serif;font-size:11px;font-weight:400;color:#555;margin-left:8px}
.tbl-wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:12px}
th,td{padding:7px 11px;border:1px solid rgba(255,255,255,.07);text-align:left;white-space:nowrap}
th{background:rgba(255,255,255,.04);color:#888;font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
td.c{text-align:center}
tr:hover{background:rgba(255,255,255,.02)}
.url-link{font-family:monospace;font-size:11px;color:#C8962E}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:.04em;white-space:nowrap}
.badge-ok  {background:rgba(34,197,94,.15); color:#22c55e;border:1px solid rgba(34,197,94,.25)}
.badge-warn{background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.25)}
.badge-err {background:rgba(239,68,68,.12); color:#ef4444;border:1px solid rgba(239,68,68,.25)}
.badge-off {background:rgba(255,255,255,.05);color:#555;border:1px solid rgba(255,255,255,.09)}
.badge-unk {background:rgba(255,255,255,.05);color:#666;border:1px solid rgba(255,255,255,.08)}
.gap-row td{color:#ef4444}
.gap-row td:last-child code{color:#ef4444}
.empty{color:#444;font-style:italic;font-size:12px;padding:12px 0}
</style>
</head>
<body>

<div class="header">
  <h1>Dashboard – dein-beauty-kurs.de</h1>
  <p>Generiert: ${esc(ts)} · Quellen: dist/ (live), sitemap.xml, Supabase (Lücken)${gscConnected ? ', GSC URL Inspection API' : ''}</p>
</div>

<div class="kpis">
  <div class="kpi"><div class="kpi-v">${publicPages.length}</div><div class="kpi-l">Seiten live</div></div>
  ${kpiGSC}
  <div class="kpi${gaps.length > 0 ? ' kpi-warn' : ''}"><div class="kpi-v${gaps.length > 0 ? ' warn' : ' good'}">${gaps.length}</div><div class="kpi-l">Lücken / To-Do</div></div>
  <div class="kpi"><div class="kpi-v">${svcPages.length}</div><div class="kpi-l">SVC-Seiten</div></div>
  <div class="kpi"><div class="kpi-v">${dozPages.length}</div><div class="kpi-l">Dozentinnen</div></div>
</div>

${gscNote}

<!-- 1. Stadt × Modul -->
<section>
  <h2>1. Stadt × Modul <span>${svcPages.length} SVC-Seiten</span></h2>
  <div class="tbl-wrap">
  <table>
    <thead><tr><th>URL</th><th>Stadt</th><th>Modul</th><th class="c">Sitemap</th><th class="c">Indexiert</th></tr></thead>
    <tbody>${svcPages.sort((a,b)=>a.urlPath.localeCompare(b.urlPath)).map(svcRow).join('')}</tbody>
  </table>
  </div>
</section>

<!-- 2. Dozentinnen-Profile -->
<section>
  <h2>2. Dozentinnen-Profile <span>${dozPages.length} Seiten</span></h2>
  <div class="tbl-wrap">
  <table>
    <thead><tr><th>URL</th><th class="c">Sitemap</th><th class="c">Indexiert</th></tr></thead>
    <tbody>${dozPages.sort((a,b)=>a.urlPath.localeCompare(b.urlPath)).map(pageRow).join('')}</tbody>
  </table>
  </div>
</section>

<!-- 3. Ratgeber -->
<section>
  <h2>3. Ratgeber <span>${ratPages.length} Seiten</span></h2>
  ${ratPages.length > 0
    ? `<div class="tbl-wrap"><table><thead><tr><th>URL</th><th class="c">Sitemap</th><th class="c">Indexiert</th></tr></thead><tbody>${ratPages.map(pageRow).join('')}</tbody></table></div>`
    : '<div class="empty">Noch keine Ratgeber-Seiten gebaut.</div>'
  }
</section>

<!-- 4. Sonstige Seiten -->
<section>
  <h2>4. Sonstige Seiten <span>Stadtseiten, Landingpages, Rechtliches</span></h2>
  <div class="tbl-wrap">
  <table>
    <thead><tr><th>URL</th><th>Typ</th><th class="c">Sitemap</th><th class="c">Indexiert</th></tr></thead>
    <tbody>
      ${[...stadtPages, ...sonst].sort((a,b)=>a.urlPath.localeCompare(b.urlPath)).map(p => `<tr>
        <td><a href="${esc(p.urlPath)}" target="_blank" rel="noopener" class="url-link">${esc(p.urlPath)}</a></td>
        <td>${esc(p.type === 'stadt' ? 'Stadtseite' : 'Landingpage/Sonstige')}</td>
        <td class="c">${inSitemap(p)}</td>
        <td class="c">${gscBadge(gscData[p.absUrl], gscConnected)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  </div>
</section>

<!-- 5. Lücken / To-Do -->
<section>
  <h2>5. Lücken / To-Do <span>${gaps.length} fehlende Stadt×Service-Kombinationen</span></h2>
  ${gaps.length > 0
    ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Stadt</th><th>Service</th><th>Fehlende URL</th><th>Status</th></tr></thead>
        <tbody>${gaps.map(g => `<tr class="gap-row">
          <td>${esc(g.city)}</td>
          <td>${esc(g.service)}</td>
          <td><code>/${esc(g.citySlug)}/${esc(g.serviceSlug)}/</code></td>
          <td><span class="badge badge-warn">Kein Partner</span></td>
        </tr>`).join('')}</tbody>
      </table></div>`
    : '<div class="empty" style="color:#22c55e">✓ Alle Stadt×Service-Kombinationen sind abgedeckt.</div>'
  }

  ${roadmap
    ? `<h3 style="margin-top:20px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.06em">Geplante Ratgeber (roadmap.json)</h3>
       <div class="tbl-wrap" style="margin-top:10px"><table>
         <thead><tr><th>Titel / Thema</th><th>Status</th></tr></thead>
         <tbody>${(Array.isArray(roadmap) ? roadmap : roadmap.items ?? []).map(item => `<tr>
           <td>${esc(item.title ?? item.slug ?? JSON.stringify(item))}</td>
           <td><span class="badge ${item.status === 'gebaut' ? 'badge-ok' : 'badge-off'}">${esc(item.status ?? 'geplant')}</span></td>
         </tr>`).join('')}</tbody>
       </table></div>`
    : `<div class="empty" style="margin-top:14px">Kein <code>src/data/roadmap.json</code> gefunden – Platzhalter für geplante Ratgeber.</div>`
  }
</section>

</body>
</html>`;
}
