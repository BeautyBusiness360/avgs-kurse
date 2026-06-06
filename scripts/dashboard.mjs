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

  // 5b. Ratgeber register (soll/ist)
  const ratPages2 = pages.filter(p => p.type === 'ratgeber');
  const ratgeberRegister = getRatgeberRegister(ratPages2);

  // 6. Generate + write HTML
  const ts  = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  const linkCount = countInternalLinks();
  const html = generateHtml({ pages, sitemapUrls, gscData, gscConfigured, gaps, roadmap, ratgeberRegister, ts, linkCount });

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

// ── Internal link counter ─────────────────────────────────────────────────────

function countInternalLinks() {
  try {
    const htmlFiles = [];
    function scanDir(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !['link-graph','uebersicht','coverage','404'].includes(entry.name)) {
          scanDir(full);
        } else if (entry.isFile() && entry.name === 'index.html') {
          htmlFiles.push(full);
        }
      }
    }
    scanDir(DIST);
    let edges = 0;
    for (const f of htmlFiles) {
      const html = fs.readFileSync(f, 'utf8');
      const seen = new Set();
      for (const m of html.matchAll(/href="(\/[^"#?][^"]*?)"/g)) {
        const href = m[1].replace(/\/$/, '') || '/';
        if (!seen.has(href)) { seen.add(href); edges++; }
      }
    }
    return edges;
  } catch { return null; }
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

// ── Ratgeber-Plan + Soll/Ist-Register ────────────────────────────────────────

function getRatgeberRegister(ratPages) {
  const planPath = path.resolve('src/data/ratgeber-plan.json');
  if (!fs.existsSync(planPath)) return null;

  let plan;
  try { plan = JSON.parse(fs.readFileSync(planPath, 'utf8')); }
  catch { return null; }

  const builtSlugs = new Set(
    ratPages
      .filter(p => p.slug && p.slug !== 'index')
      .map(p => p.slug)
  );

  const planSlugs = new Set(plan.map(e => e.slug));

  const entries = plan.map(entry => {
    const contentExists = fs.existsSync(
      path.resolve(`src/content/ratgeber/${entry.slug}.md`)
    );
    const isLive = builtSlugs.has(entry.slug);

    let status;
    if (isLive)           status = 'live';
    else if (contentExists) status = 'erstellt';
    else                  status = 'geplant';

    return { ...entry, contentExists, isLive, status };
  });

  const orphans = [...builtSlugs].filter(slug => !planSlugs.has(slug));

  const live     = entries.filter(e => e.status === 'live').length;
  const erstellt = entries.filter(e => e.status === 'erstellt').length;
  const geplant  = entries.filter(e => e.status === 'geplant').length;

  return { entries, orphans, live, erstellt, geplant, total: plan.length };
}

// ── GSC status helpers ────────────────────────────────────────────────────────

function gscBadge(gscResult, gscConnected) {
  if (!gscConnected) return '<span class="badge muted">–</span>';
  if (!gscResult)    return '<span class="badge muted">–</span>';
  const { verdict, coverageState } = gscResult;
  if (verdict === 'PASS')    return `<span class="badge ok"    title="${esc(coverageState)}">✓ Indexiert</span>`;
  if (verdict === 'ERROR')   return `<span class="badge err"   title="${esc(coverageState)}">Fehler</span>`;
  if (verdict === 'FAIL')    return `<span class="badge err"   title="${esc(coverageState)}">✗ ${esc(shortState(coverageState))}</span>`;
  if (verdict === 'NEUTRAL') return `<span class="badge muted" title="${esc(coverageState)}">${esc(shortState(coverageState))}</span>`;
  return `<span class="badge muted" title="${esc(coverageState)}">–</span>`;
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

function generateHtml({ pages, sitemapUrls, gscData, gscConfigured, gaps, roadmap, ratgeberRegister, ts, linkCount }) {
  const gscConnected = Object.keys(gscData).length > 0;

  const svcPages   = pages.filter(p => p.type === 'svc');
  const dozPages   = pages.filter(p => p.type === 'dozentinnen');
  const ratPages   = pages.filter(p => p.type === 'ratgeber');
  const stadtPages = pages.filter(p => p.type === 'stadt');
  const sonst      = pages.filter(p => p.type === 'sonstige');
  const publicPages = pages.filter(p => !p.noindex);

  function inSitemap(page) {
    const n = page.absUrl.replace(/\/$/, '');
    return sitemapUrls.has(n)
      ? '<span class="badge ok">✓</span>'
      : '<span class="badge muted">–</span>';
  }

  const gscTh = gscConnected ? '<th class="c">Indexiert</th>' : '';

  function pageRow(p) {
    const gscTd = gscConnected ? `<td class="c">${gscBadge(gscData[p.absUrl], true)}</td>` : '';
    return `<tr>
      <td><a href="${esc(p.absUrl)}" target="_blank" rel="noopener" class="url-link">${esc(p.urlPath)}</a></td>
      <td class="c">${inSitemap(p)}</td>${gscTd}
    </tr>`;
  }

  function svcRow(p) {
    const gscTd = gscConnected ? `<td class="c">${gscBadge(gscData[p.absUrl], true)}</td>` : '';
    return `<tr>
      <td><a href="${esc(p.absUrl)}" target="_blank" rel="noopener" class="url-link">${esc(p.urlPath)}</a></td>
      <td>${esc(CITY_LABEL[p.city] ?? p.city ?? '')}</td>
      <td>${esc(p.label)}</td>
      <td class="c">${inSitemap(p)}</td>${gscTd}
    </tr>`;
  }

  const kpiData = [
    { label: 'Seiten live',             value: publicPages.length,                      mod: 'gold'  },
    { label: 'Ratgeber live',           value: ratgeberRegister?.live ?? ratPages.length, mod: 'green' },
    { label: 'Interne Verlinkungen',    value: linkCount ?? '–',                         mod: 'teal'  },
    { label: 'SVC-Seiten',             value: svcPages.length,                          mod: 'teal'  },
    { label: 'Dozentinnen',            value: dozPages.length,                          mod: 'teal'  },
    { label: 'Lücken / To-Do',         value: gaps.length,                              mod: gaps.length > 0 ? 'red' : 'green' },
  ];

  const kpiCards = kpiData.map(k => `
    <div class="kpi kpi--${k.mod}">
      <div class="kpi-v">${typeof k.value === 'number' ? k.value.toLocaleString('de') : k.value}</div>
      <div class="kpi-l">${esc(k.label)}</div>
    </div>`).join('');

  const gscNote = !gscConnected && gscConfigured
    ? `<div class="banner">Service Account noch nicht autorisiert — füge <code>bb360-gsc@formal-momentum-431212-j0.iam.gserviceaccount.com</code> in der Search Console als Nutzer (Voll) hinzu, damit die Indexierungs-Spalte automatisch befüllt wird.</div>`
    : '';

  const MODUL_LABEL = {
    microblading: 'Microblading', powderbrows: 'Powder Brows',
    wimpernverlaengerung: 'Wimpernverlängerung', 'camouflage-removal': 'Camouflage Removal',
    'velvet-lips': 'Velvet Lips', fachkosmetikerin: 'Fachkosmetikerin',
  };

  let ratgeberSection = '';
  if (ratgeberRegister) {
    const { entries, orphans, live, erstellt, geplant } = ratgeberRegister;
    const total    = entries.length;
    const donePct  = Math.round((live + erstellt) / (total || 1) * 100);
    const livePct  = Math.round(live / (total || 1) * 100);
    const rows = entries.map(e => {
      const statusBadge = (e.status === 'live' || e.status === 'erstellt')
        ? `<span class="badge ok">${e.status === 'live' ? 'Live' : 'Erstellt'}</span>`
        : `<span class="badge muted">Geplant</span>`;
      const gscTd = gscConnected
        ? `<td class="c">${e.isLive ? gscBadge(gscData[`${BASE_URL}${e.url}`], true) : '<span class="badge muted">–</span>'}</td>`
        : '';
      const urlCell = (e.isLive || e.status === 'erstellt')
        ? `<a href="${esc(BASE_URL + e.url)}" target="_blank" rel="noopener" class="url-link">${esc(e.url)}</a>`
        : `<span class="muted-text">${esc(e.url)}</span>`;
      return `<tr>
        <td>${urlCell}</td>
        <td>${esc(MODUL_LABEL[e.modul] ?? e.modul)}</td>
        <td>${esc(e.stadt ?? '—')}</td>
        <td class="c">${statusBadge}</td>${gscTd}
      </tr>`;
    }).join('');
    const orphanHtml = orphans.length > 0
      ? `<div class="orphan-list"><span class="orphan-label">Verwaiste Artikel (${orphans.length})</span>
         ${orphans.map(s=>`<a href="${esc(BASE_URL)}/ratgeber/${esc(s)}/" target="_blank" class="url-link">/ratgeber/${esc(s)}/</a>`).join(' ')}</div>`
      : '';
    ratgeberSection = `
      <div class="progress-block">
        <div class="progress-labels">
          <span class="pl-green">● Live: ${live}</span>
          <span class="pl-green-dim">● Erstellt: ${erstellt}</span>
          <span class="pl-muted">● Geplant: ${geplant}</span>
          <span class="pl-pct">${donePct}% fertig</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${livePct}%"></div>
          <div class="progress-fill-dim" style="width:${donePct}%"></div>
        </div>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>URL</th><th>Modul</th><th>Stadt</th><th class="c">Status</th>${gscTh}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>${orphanHtml}`;
  } else {
    ratgeberSection = ratPages.length > 0
      ? `<div class="tbl-wrap"><table>
          <thead><tr><th>URL</th><th class="c">Sitemap</th>${gscTh}</tr></thead>
          <tbody>${ratPages.map(pageRow).join('')}</tbody>
        </table></div>`
      : '<div class="empty">Noch keine Ratgeber-Seiten gebaut.</div>';
  }

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Dashboard · dein-beauty-kurs.de</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07071a;--bg-card:rgba(255,255,255,.035);
  --border:rgba(255,255,255,.08);--border-hi:rgba(255,255,255,.14);
  --gold:#C8962E;--gold-dim:rgba(200,150,46,.15);--gold-ring:rgba(200,150,46,.30);
  --teal:#0891b2;--teal-dim:rgba(8,145,178,.12);--teal-ring:rgba(8,145,178,.28);
  --green:#10b981;--green-dim:rgba(16,185,129,.12);
  --red:#ef4444;--red-dim:rgba(239,68,68,.12);
  --cream:rgba(240,234,224,.88);--muted:rgba(255,255,255,.35);
  --sans:Inter,system-ui,sans-serif;
  --mono:'JetBrains Mono','Fira Code',ui-monospace,monospace;
}
html{scroll-behavior:smooth}
body{font-family:var(--sans);background:var(--bg);color:var(--cream);font-size:13px;min-height:100vh;padding-bottom:80px;line-height:1.5}
a{color:var(--gold);text-decoration:none}a:hover{text-decoration:underline;color:#d4a94a}
code{font-family:var(--mono);font-size:11px;color:var(--teal);background:var(--teal-dim);padding:1px 5px;border-radius:3px}
.wrap{max-width:1440px;margin:0 auto;padding:0 clamp(16px,3vw,52px)}
/* Header */
.hdr{padding:32px 0 24px;border-bottom:1px solid var(--border);margin-bottom:0}
.hdr-inner{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.hdr h1{font-family:Georgia,Cambria,serif;font-size:24px;font-weight:600;color:var(--cream);letter-spacing:-.01em}
.hdr h1 em{color:var(--gold);font-style:normal}
.hdr-ts{font-family:var(--mono);font-size:11px;color:var(--muted)}
/* KPI grid */
.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:12px;padding:28px 0}
.kpi{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:22px 22px 16px;position:relative;overflow:hidden;transition:border-color .2s,box-shadow .2s}
.kpi::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;border-radius:14px 14px 0 0;opacity:.8}
.kpi:hover{border-color:var(--border-hi);box-shadow:0 4px 28px rgba(0,0,0,.35)}
.kpi--gold::after{background:var(--gold)}.kpi--gold:hover{border-color:var(--gold-ring);box-shadow:0 0 22px var(--gold-dim)}
.kpi--teal::after{background:var(--teal)}.kpi--teal:hover{border-color:var(--teal-ring);box-shadow:0 0 22px var(--teal-dim)}
.kpi--green::after{background:var(--green)}.kpi--green:hover{border-color:rgba(16,185,129,.35);box-shadow:0 0 22px var(--green-dim)}
.kpi--red::after{background:var(--red)}.kpi--red:hover{border-color:rgba(239,68,68,.35);box-shadow:0 0 22px var(--red-dim)}
.kpi-v{font-family:var(--mono);font-size:38px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.kpi--gold .kpi-v{color:var(--gold)}.kpi--teal .kpi-v{color:var(--teal)}.kpi--green .kpi-v{color:var(--green)}.kpi--red .kpi-v{color:var(--red)}
.kpi-l{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:8px}
/* Banner */
.banner{margin:0 0 20px;padding:12px 18px;border-radius:8px;font-size:12px;line-height:1.6;background:rgba(200,150,46,.07);border:1px solid var(--gold-ring);color:#d4a54a}
/* Sections */
section{padding:32px 0;border-bottom:1px solid var(--border)}
.sec-head{display:flex;align-items:baseline;gap:10px;margin-bottom:20px;flex-wrap:wrap}
.sec-head h2{font-family:Georgia,Cambria,serif;font-size:17px;font-weight:600;color:var(--cream);letter-spacing:-.005em}
.sec-head h2 .num{color:var(--gold)}
.sec-ct{font-family:var(--mono);font-size:11px;color:var(--muted);background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:20px;padding:2px 10px}
/* Progress */
.progress-block{margin-bottom:20px}
.progress-labels{display:flex;gap:18px;font-size:12px;margin-bottom:10px;flex-wrap:wrap;align-items:center}
.pl-green{color:var(--green)}.pl-green-dim{color:rgba(16,185,129,.55)}.pl-muted{color:var(--muted)}.pl-pct{color:var(--muted);font-family:var(--mono);font-size:11px;margin-left:auto}
.progress-track{background:rgba(255,255,255,.06);border-radius:6px;height:8px;overflow:hidden;position:relative}
.progress-fill-dim{position:absolute;top:0;left:0;height:100%;border-radius:6px;background:rgba(16,185,129,.25);transition:width .4s}
.progress-fill{position:absolute;top:0;left:0;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--gold) 0%,#e6b84a 40%,var(--teal) 100%);transition:width .4s;z-index:1}
/* Tables */
.tbl-wrap{overflow-x:auto;border-radius:10px;border:1px solid var(--border)}
table{border-collapse:collapse;width:100%;font-size:12px}
thead th{background:rgba(10,10,28,.9);color:var(--muted);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.09em;padding:10px 13px;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:1;white-space:nowrap;backdrop-filter:blur(8px)}
tbody td{padding:9px 13px;border-bottom:1px solid rgba(255,255,255,.04);white-space:nowrap;color:var(--cream)}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:rgba(200,150,46,.05)}
td.c{text-align:center}
.url-link{font-family:var(--mono);font-size:11px;color:var(--teal)}
.url-link:hover{color:#22d3ee;text-decoration:underline}
.muted-text{color:rgba(255,255,255,.2);font-family:var(--mono);font-size:11px}
/* Badges */
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:.04em;white-space:nowrap}
.badge.ok{background:var(--green-dim);color:var(--green);border:1px solid rgba(16,185,129,.25)}
.badge.err{background:var(--red-dim);color:var(--red);border:1px solid rgba(239,68,68,.25)}
.badge.muted{background:rgba(255,255,255,.04);color:rgba(255,255,255,.28);border:1px solid rgba(255,255,255,.08)}
.gap-row td{color:rgba(239,68,68,.75)}
.badge.gap-mark{background:var(--red-dim);color:var(--red);border:1px solid rgba(239,68,68,.2)}
.orphan-list{margin-top:14px;padding:12px 16px;background:var(--red-dim);border:1px solid rgba(239,68,68,.2);border-radius:8px}
.orphan-label{display:block;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--red);margin-bottom:8px}
.orphan-list .url-link{display:inline-block;margin:2px 6px 2px 0;color:var(--red)}
.empty{color:rgba(255,255,255,.22);font-style:italic;font-size:12px;padding:14px 0}
.empty.ok{color:var(--green)}
@media(max-width:640px){.kpi-v{font-size:28px}.hdr h1{font-size:20px}.kpis{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}}
</style>
</head>
<body>
<div class="wrap">

<header class="hdr">
  <div class="hdr-inner">
    <h1>Dashboard <em>·</em> dein-beauty-kurs.de</h1>
    <span class="hdr-ts">${esc(ts)}${gscConnected ? ' · GSC aktiv' : ''}</span>
  </div>
</header>

<div class="kpis">${kpiCards}</div>

${gscNote}

<section>
  <div class="sec-head">
    <h2><span class="num">1.</span> Stadt × Modul</h2>
    <span class="sec-ct">${svcPages.length} Seiten</span>
  </div>
  <div class="tbl-wrap"><table>
    <thead><tr><th>URL</th><th>Stadt</th><th>Modul</th><th class="c">Sitemap</th>${gscTh}</tr></thead>
    <tbody>${svcPages.sort((a,b)=>a.urlPath.localeCompare(b.urlPath)).map(svcRow).join('')}</tbody>
  </table></div>
</section>

<section>
  <div class="sec-head">
    <h2><span class="num">2.</span> Dozentinnen-Profile</h2>
    <span class="sec-ct">${dozPages.length} Seiten</span>
  </div>
  <div class="tbl-wrap"><table>
    <thead><tr><th>URL</th><th class="c">Sitemap</th>${gscTh}</tr></thead>
    <tbody>${dozPages.sort((a,b)=>a.urlPath.localeCompare(b.urlPath)).map(pageRow).join('')}</tbody>
  </table></div>
</section>

<section>
  <div class="sec-head">
    <h2><span class="num">3.</span> Ratgeber Content-Register</h2>
    <span class="sec-ct">${ratPages.length} live · ${ratgeberRegister ? ratgeberRegister.total : '–'} geplant</span>
  </div>
  ${ratgeberSection}
</section>

<section>
  <div class="sec-head">
    <h2><span class="num">4.</span> Sonstige Seiten</h2>
    <span class="sec-ct">Stadtseiten · Landingpages · Rechtliches</span>
  </div>
  <div class="tbl-wrap"><table>
    <thead><tr><th>URL</th><th>Typ</th><th class="c">Sitemap</th>${gscTh}</tr></thead>
    <tbody>${[...stadtPages,...sonst].sort((a,b)=>a.urlPath.localeCompare(b.urlPath)).map(p=>{
      const gscTd = gscConnected ? `<td class="c">${gscBadge(gscData[p.absUrl], true)}</td>` : '';
      return `<tr>
        <td><a href="${esc(p.absUrl)}" target="_blank" rel="noopener" class="url-link">${esc(p.urlPath)}</a></td>
        <td>${esc(p.type === 'stadt' ? 'Stadtseite' : 'Landingpage')}</td>
        <td class="c">${inSitemap(p)}</td>${gscTd}
      </tr>`;
    }).join('')}</tbody>
  </table></div>
</section>

<section>
  <div class="sec-head">
    <h2><span class="num">5.</span> Lücken / To-Do</h2>
    <span class="sec-ct">${gaps.length} fehlende Kombinationen</span>
  </div>
  ${gaps.length > 0
    ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Stadt</th><th>Service</th><th>Fehlende URL</th><th class="c">Status</th></tr></thead>
        <tbody>${gaps.map(g=>`<tr class="gap-row">
          <td>${esc(g.city)}</td><td>${esc(g.service)}</td>
          <td class="url-link">/${esc(g.citySlug)}/${esc(g.serviceSlug)}/</td>
          <td class="c"><span class="badge gap-mark">Kein Partner</span></td>
        </tr>`).join('')}</tbody>
      </table></div>`
    : '<div class="empty ok">✓ Alle Stadt × Service-Kombinationen sind abgedeckt.</div>'}
  ${roadmap ? `<div style="margin-top:24px">
    <div class="sec-head" style="margin-bottom:12px"><h2 style="font-size:13px"><span class="num">↳</span> Geplante Ratgeber (roadmap.json)</h2></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Titel / Thema</th><th class="c">Status</th></tr></thead>
      <tbody>${(Array.isArray(roadmap)?roadmap:roadmap.items??[]).map(item=>`<tr>
        <td>${esc(item.title??item.slug??JSON.stringify(item))}</td>
        <td class="c"><span class="badge ${item.status==='gebaut'?'ok':'muted'}">${esc(item.status??'geplant')}</span></td>
      </tr>`).join('')}</tbody>
    </table></div></div>` : ''}
</section>

</div>
</body>
</html>`;
}
