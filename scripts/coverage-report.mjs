/**
 * Coverage Report Generator
 * Reads Supabase (cities × services × dozentinnen), builds a full coverage
 * matrix, cross-checks against actually built dist/ pages, then writes:
 *   dist/client/coverage/index.html  (noindex – not linked)
 *   dist/client/coverage/coverage.json
 *
 * Fail-soft: any error logs a warning and exits 0, so the build never breaks.
 * Runs as part of postbuild (after link-graph).
 */

import { createClient } from '@supabase/supabase-js';
import { config }       from 'dotenv';
import fs               from 'node:fs';
import path             from 'node:path';

config(); // load .env

// ── HUB mapping (mirrors src/data/location-overrides.ts) ─────────────────────
const HUB_CITY_SLUG = {
  'dunya-said-hamburg':    'hamburg',
  'yvonne-klatt-elmshorn': 'hamburg',
  'katarina-hinz-wedel':   'hamburg',
};

const DIST    = path.resolve('dist/client');
const OUTPUTS = [
  path.join(DIST, 'coverage'),
  path.join(path.resolve('.vercel/output/static'), 'coverage'),
];

// ── Fail-soft entry point ─────────────────────────────────────────────────────
try {
  await run();
} catch (e) {
  console.warn('[coverage-report] Warning – report skipped:', e.message);
  process.exit(0);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  if (!fs.existsSync(DIST)) {
    console.warn('[coverage-report] dist/client not found – skipping.');
    return;
  }

  const url  = process.env.PUBLIC_SUPABASE_URL;
  const key  = process.env.PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set (PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY)');

  const supabase = createClient(url, key);

  // ── 1. Load data from Supabase ──────────────────────────────────────────────

  const [citiesRes, servicesRes, dozRes] = await Promise.all([
    supabase.from('cities').select('slug, name').order('name'),
    supabase.from('services').select('slug, name, category').eq('avgs_eligible', true).order('name'),
    supabase.from('dozentinnen').select(`
      slug,
      first_name,
      last_name,
      cities(slug, name),
      dozentin_services(
        services(slug, avgs_eligible)
      )
    `).eq('active', true),
  ]);

  if (citiesRes.error)   throw new Error(`cities: ${citiesRes.error.message}`);
  if (servicesRes.error) throw new Error(`services: ${servicesRes.error.message}`);
  if (dozRes.error)      throw new Error(`dozentinnen: ${dozRes.error.message}`);

  const allCities   = citiesRes.data   ?? [];
  const allServices = servicesRes.data ?? [];
  const allDoz      = dozRes.data      ?? [];

  // city slug → display name (from DB)
  const cityNameBySlug = Object.fromEntries(allCities.map(c => [c.slug, c.name]));

  // ── 2. Build coverage map ───────────────────────────────────────────────────
  // key: `${effectiveCitySlug}__${serviceSlug}` → [ dozentin.slug, … ]

  const coverageMap = new Map(); // key → Set of dozentin slugs

  for (const d of allDoz) {
    const city = Array.isArray(d.cities) ? d.cities[0] : d.cities;
    if (!city?.slug) continue;

    const effCity = HUB_CITY_SLUG[d.slug] ?? city.slug;

    const dsRows = Array.isArray(d.dozentin_services) ? d.dozentin_services : [];
    for (const ds of dsRows) {
      const svc = Array.isArray(ds?.services) ? ds.services[0] : ds?.services;
      if (!svc?.slug || !svc?.avgs_eligible) continue;

      const key = `${effCity}__${svc.slug}`;
      if (!coverageMap.has(key)) coverageMap.set(key, new Set());
      coverageMap.get(key).add(d.slug);
    }
  }

  // ── 3. Determine matrix rows (only cities with ≥1 active dozentin) ──────────

  const activeCitySlugs = new Set();
  for (const key of coverageMap.keys()) {
    activeCitySlugs.add(key.split('__')[0]);
  }

  // Sort cities alphabetically; fall back to slug if name unknown
  const matrixCities = [...activeCitySlugs]
    .map(slug => ({ slug, name: cityNameBySlug[slug] ?? slug }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const matrixServices = allServices; // all avgs_eligible, already sorted

  // ── 4. Build the matrix ─────────────────────────────────────────────────────

  const matrix = matrixCities.map(city => ({
    city,
    cells: matrixServices.map(svc => {
      const key   = `${city.slug}__${svc.slug}`;
      const dozSet = coverageMap.get(key) ?? new Set();
      return { svc, count: dozSet.size, dozentinnen: [...dozSet] };
    }),
  }));

  // ── 5. Scan dist/ for actually built SVC pages ──────────────────────────────

  const builtPages = new Set(); // `/${citySlug}/${serviceSlug}/`
  // Only scan known city dirs (activeCitySlugs) to avoid picking up /dozentinnen/* etc.
  for (const citySlug of activeCitySlugs) {
    const cityPath = path.join(DIST, citySlug);
    if (!fs.existsSync(cityPath)) continue;
    const svcDirs = fs.readdirSync(cityPath, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name);
    for (const svcDir of svcDirs) {
      if (fs.existsSync(path.join(cityPath, svcDir, 'index.html'))) {
        builtPages.add(`/${citySlug}/${svcDir}/`);
      }
    }
  }

  // ── 6. KPIs ─────────────────────────────────────────────────────────────────

  const dbExpected = new Set(
    [...coverageMap.entries()]
      .filter(([, s]) => s.size > 0)
      .map(([key]) => {
        const [c, s] = key.split('__');
        return `/${c}/${s}/`;
      })
  );

  const totalCells  = matrixCities.length * matrixServices.length;
  const coveredCells = matrix.reduce((sum, row) => sum + row.cells.filter(c => c.count > 0).length, 0);
  const gapCells     = totalCells - coveredCells;

  const builtNotInDB = [...builtPages].filter(p => !dbExpected.has(p)).sort();
  const inDBNotBuilt = [...dbExpected].filter(p => !builtPages.has(p)).sort();

  const gaps = matrix.flatMap(row =>
    row.cells
      .filter(c => c.count === 0)
      .map(c => ({ city: row.city.name, citySlug: row.city.slug, service: c.svc.name, serviceSlug: c.svc.slug }))
  );

  const kpis = {
    totalCells,
    coveredCells,
    gapCells,
    coveragePct: totalCells ? Math.round(coveredCells / totalCells * 100) : 0,
    builtPages:  builtPages.size,
    dbExpected:  dbExpected.size,
    builtNotInDB,
    inDBNotBuilt,
    gaps,
    generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC',
  };

  // ── 7. Write output ──────────────────────────────────────────────────────────

  const coverageJson = { kpis, matrix: matrix.map(row => ({
    city: row.city,
    cells: row.cells.map(c => ({ serviceSlug: c.svc.slug, count: c.count, dozentinnen: c.dozentinnen })),
  }))};

  const html = generateHtml(kpis, matrix, matrixServices);

  let written = 0;
  for (const dir of OUTPUTS) {
    const parent = path.dirname(dir);
    if (!fs.existsSync(parent)) {
      console.warn(`[coverage-report] Skipping ${dir} – parent not found`);
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'),    html,                          'utf8');
    fs.writeFileSync(path.join(dir, 'coverage.json'), JSON.stringify(coverageJson, null, 2), 'utf8');
    written++;
  }
  if (written === 0) console.warn('[coverage-report] No output written.');

  console.log(
    `[coverage-report] ${coveredCells}/${totalCells} Zellen gedeckt (${kpis.coveragePct}%) · ` +
    `${gapCells} Lücken · ${builtPages.size} Seiten gebaut`
  );
}

// ── HTML Generator ─────────────────────────────────────────────────────────────

function generateHtml(kpis, matrix, services) {
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // KPI cards
  const kpiCards = [
    { label: 'Zellen gesamt',  value: kpis.totalCells },
    { label: 'Gedeckt',        value: kpis.coveredCells, good: true },
    { label: 'Lücken',         value: kpis.gapCells,    warn: kpis.gapCells > 0 },
    { label: 'Coverage',       value: kpis.coveragePct + '%', good: kpis.coveragePct === 100 },
    { label: 'Seiten gebaut',  value: kpis.builtPages },
  ].map(c => {
    const cls = c.warn ? 'kpi kpi--warn' : c.good ? 'kpi kpi--good' : 'kpi';
    return `<div class="${cls}"><div class="kpi-v">${esc(c.value)}</div><div class="kpi-l">${esc(c.label)}</div></div>`;
  }).join('');

  // Matrix table header
  const thCells = services.map(s =>
    `<th title="${esc(s.name)}">${esc(shortSvc(s.slug))}</th>`
  ).join('');

  // Matrix rows
  const tbodyRows = matrix.map(row => {
    const cells = row.cells.map(c => {
      if (c.count > 0) {
        return `<td class="cell-ok" title="${c.dozentinnen.map(esc).join(', ')}">✓ ${c.count}</td>`;
      }
      return `<td class="cell-gap" title="Lücke">✗</td>`;
    }).join('');
    return `<tr><th class="city-header">${esc(row.city.name)}</th>${cells}</tr>`;
  }).join('');

  // Gap list
  const gapRows = kpis.gaps.length
    ? kpis.gaps.map(g =>
        `<tr><td>${esc(g.city)}</td><td>${esc(g.service)}</td><td><code>/${esc(g.citySlug)}/${esc(g.serviceSlug)}/</code></td></tr>`
      ).join('')
    : '<tr><td colspan="3" class="good">✓ Keine Lücken</td></tr>';

  // Drift rows
  const driftRows = [];
  if (kpis.builtNotInDB.length) {
    kpis.builtNotInDB.forEach(p => driftRows.push(`<div class="drift-row warn"><code>${esc(p)}</code> <span>gebaut, aber keine Dozentin in DB</span></div>`));
  }
  if (kpis.inDBNotBuilt.length) {
    kpis.inDBNotBuilt.forEach(p => driftRows.push(`<div class="drift-row bad"><code>${esc(p)}</code> <span>DB erwartet Seite, aber nicht gebaut</span></div>`));
  }
  const driftSection = driftRows.length
    ? driftRows.join('')
    : '<div class="good">✓ Kein Drift – DB und dist/ sind synchron</div>';

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Coverage Report – dein-beauty-kurs.de</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,system-ui,sans-serif;background:#0D0D0D;color:#F0EAE0;font-size:13px;min-height:100vh;padding:0 0 48px}
.header{padding:18px 28px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
.header h1{font-size:16px;font-weight:600}
.header p{font-size:11px;color:#666;margin-top:3px}
.kpis{display:flex;gap:12px;padding:16px 28px;border-bottom:1px solid rgba(255,255,255,.07);flex-wrap:wrap}
.kpi{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:6px;padding:10px 18px;min-width:110px}
.kpi--warn{border-color:#ef4444;background:rgba(239,68,68,.08)}
.kpi--good{border-color:#22c55e;background:rgba(34,197,94,.06)}
.kpi-v{font-size:26px;font-weight:700;color:#C8962E;line-height:1}
.kpi--warn .kpi-v{color:#ef4444}
.kpi--good .kpi-v{color:#22c55e}
.kpi-l{font-size:10px;color:#777;margin-top:3px;text-transform:uppercase;letter-spacing:.07em}
.section{padding:24px 28px;border-bottom:1px solid rgba(255,255,255,.06)}
.section h2{font-size:11px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:#C8962E;margin-bottom:14px}
/* Matrix */
.matrix-wrap{overflow-x:auto}
table.matrix{border-collapse:collapse;min-width:100%}
table.matrix th,table.matrix td{padding:7px 10px;border:1px solid rgba(255,255,255,.08);white-space:nowrap;font-size:12px}
table.matrix thead th{background:rgba(255,255,255,.04);color:#aaa;font-weight:500;text-align:center;font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis}
table.matrix thead th:first-child{text-align:left;min-width:90px}
.city-header{background:rgba(255,255,255,.03);font-weight:600;color:#F0EAE0;text-align:left}
.cell-ok{text-align:center;color:#22c55e;background:rgba(34,197,94,.07)}
.cell-gap{text-align:center;color:#ef4444;background:rgba(239,68,68,.06)}
/* Gap list */
table.gaps{border-collapse:collapse;width:100%}
table.gaps th,table.gaps td{padding:7px 12px;border:1px solid rgba(255,255,255,.07);font-size:12px}
table.gaps th{background:rgba(255,255,255,.04);color:#aaa;font-weight:500;text-align:left}
table.gaps td:last-child code{font-size:10px;color:#C8962E;font-family:monospace}
.good{color:#22c55e;font-size:12px}
/* Drift */
.drift-row{padding:5px 0;font-size:12px}
.drift-row code{font-family:monospace;color:#C8962E;margin-right:8px}
.drift-row.warn span{color:#f59e0b}
.drift-row.bad  span{color:#ef4444}
/* GSC note */
.gsc-note{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:12px 16px;font-size:12px;color:#888;margin-top:0}
.gsc-note strong{color:#aaa}
</style>
</head>
<body>

<div class="header">
  <h1>Coverage Report – dein-beauty-kurs.de</h1>
  <p>Generiert: ${kpis.generatedAt} · Quelle: Supabase (dozentinnen × services) + dist/</p>
</div>

<div class="kpis">${kpiCards}</div>

<div class="section">
  <h2>Stadt × Service Matrix</h2>
  <div class="matrix-wrap">
    <table class="matrix">
      <thead>
        <tr>
          <th>Stadt</th>
          ${thCells}
        </tr>
      </thead>
      <tbody>
        ${tbodyRows}
      </tbody>
    </table>
  </div>
  <p style="margin-top:10px;font-size:11px;color:#555">✓&nbsp;N = N Dozentinnen verfügbar &nbsp;·&nbsp; ✗ = Lücke (kein Partner)</p>
</div>

<div class="section">
  <h2>Lückenliste (${kpis.gapCells} fehlende Kombinationen)</h2>
  <table class="gaps">
    <thead><tr><th>Stadt</th><th>Service</th><th>Fehlende URL</th></tr></thead>
    <tbody>${gapRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>Indexierungs-Status</h2>
  <div class="gsc-note">
    <strong>Quelle: Google Search Console</strong> – dieser Report lässt die Indexierungs-Spalte bewusst leer.
    Sobald GSC-API angebunden ist, wird hier pro URL „indexiert / nicht indexiert / ausgeschlossen" angezeigt.
  </div>
</div>

<div class="section">
  <h2>Drift-Check: DB ↔ dist/ (${kpis.builtNotInDB.length + kpis.inDBNotBuilt.length} Abweichungen)</h2>
  ${driftSection}
</div>

</body>
</html>`;
}

// Shorten service slug for table header
function shortSvc(slug) {
  const m = {
    'powderbrows-ombrebrows-masterclass': 'PowderBrows',
    'velvet-lips-lipstick-masterclass':   'Velvet Lips',
    'microblading-masterclass':           'Microblading',
    'wimpernverlaengerung-masterclass':   'Wimpern',
    'camouflage-removal-masterclass':     'Camouflage',
    'fachkosmetikerin-ausbildung':        'Fachkosm.',
  };
  return m[slug] ?? slug.replace(/-masterclass$/, '').replace(/-/g, ' ');
}
