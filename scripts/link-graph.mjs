/**
 * Link Graph Generator
 * Crawls dist/client/, validates internal links, writes an interactive
 * D3 force-graph to dist/client/link-graph/index.html (+ .vercel/output/static/).
 * All errors are caught – the build never fails because of this script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve('dist/client');
const OUTPUTS = [
  path.join(DIST, 'link-graph'),
  path.join(path.resolve('.vercel/output/static'), 'link-graph'),
];

try {
  run();
} catch (e) {
  console.warn('\n[link-graph] Warning – graph generation skipped:', e.message);
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────
function run() {
  if (!fs.existsSync(DIST)) {
    console.warn('[link-graph] dist/client not found – skipping.');
    return;
  }

  // 1. Collect all HTML files ──────────────────────────────────
  const htmlFiles = fs.readdirSync(DIST, { recursive: true, encoding: 'utf8' })
    .filter(f => f.endsWith('.html') && !f.includes('link-graph'));

  const pages = new Map(); // url → { filePath, type }
  for (const rel of htmlFiles) {
    const url = fileToUrl(rel);
    pages.set(url, { filePath: path.join(DIST, rel), type: classify(url) });
  }

  // 2. Extract all internal links ──────────────────────────────
  const edgesRaw = [];
  for (const [url, { filePath }] of pages) {
    let html;
    try { html = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
    for (const to of extractLinks(html)) {
      edgesRaw.push({ from: url, to });
    }
  }

  // 3. Validate & deduplicate edges ────────────────────────────
  const edgeMap = new Map();
  let totalLinksRaw = 0;
  for (const { from, to } of edgesRaw) {
    totalLinksRaw++;
    const key = `${from}→${to}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, { from, to, valid: pages.has(to), count: 0 });
    }
    edgeMap.get(key).count++;
  }
  const edges = Array.from(edgeMap.values());

  // 4. Compute incoming counts ─────────────────────────────────
  const incoming = new Map();
  for (const { from, to } of edges) {
    incoming.set(to, (incoming.get(to) ?? 0) + 1);
  }

  // 5. Build node list (pages + broken targets as phantoms) ────
  const allUrls = new Set(pages.keys());
  for (const { to, valid } of edges) if (!valid) allUrls.add(to);

  const nodes = Array.from(allUrls).map(url => ({
    url,
    type: classify(url),
    incoming: incoming.get(url) ?? 0,
    isOrphan: (incoming.get(url) ?? 0) === 0 && url !== '/',
    exists: pages.has(url),
  }));

  // 6. KPIs ────────────────────────────────────────────────────
  const existingNodes = nodes.filter(n => n.exists);
  const byType = {};
  for (const { type } of existingNodes) byType[type] = (byType[type] ?? 0) + 1;

  const brokenEdges = edges.filter(e => !e.valid);
  const orphans = existingNodes.filter(n => n.isOrphan);
  const mostIncoming = [...existingNodes].sort((a, b) => b.incoming - a.incoming).slice(0, 6);

  const edgeTypeStats = {};
  for (const { from, to } of edges) {
    const k = `${classify(from)}→${classify(to)}`;
    edgeTypeStats[k] = (edgeTypeStats[k] ?? 0) + 1;
  }

  const kpis = {
    totalPages: existingNodes.length,
    byType,
    totalLinks: totalLinksRaw,
    uniqueEdges: edges.length,
    brokenCount: brokenEdges.length,
    orphanCount: orphans.length,
    mostIncoming: mostIncoming.map(n => ({ url: n.url, count: n.incoming })),
    edgeTypeStats,
    brokenEdges: brokenEdges.map(e => ({ from: e.from, to: e.to })),
    orphanUrls: orphans.map(n => n.url),
    generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC',
  };

  // 7. Write output ────────────────────────────────────────────
  const graphData = {
    nodes: nodes.map(({ url, type, incoming, isOrphan, exists }) =>
      ({ url, type, incoming, isOrphan, exists })),
    edges: edges.map(({ from, to, valid, count }) => ({ from, to, valid, count })),
  };

  const html = generateHtml(kpis, graphData);

  let written = 0;
  for (const dir of OUTPUTS) {
    const parent = path.dirname(dir);
    if (!fs.existsSync(parent)) {
      console.warn(`[link-graph] Skipping ${dir} – parent not found`);
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    console.log(`[link-graph] ✓ Written → ${path.join(dir, 'index.html')}`);
    written++;
  }
  if (written === 0) console.warn('[link-graph] No output written (no valid output dirs).');

  console.log(
    `[link-graph] ${kpis.totalPages} pages · ${kpis.totalLinks} links · ` +
    `${kpis.uniqueEdges} unique edges · ${kpis.brokenCount} broken · ${kpis.orphanCount} orphans`
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fileToUrl(rel) {
  const r = rel.replace(/\\/g, '/');
  if (r === 'index.html') return '/';
  if (r === '404.html') return '/404/';
  return '/' + r.replace(/\/index\.html$/, '/').replace(/\.html$/, '/');
}

function classify(url) {
  if (url === '/') return 'startseite';
  if (/^\/(berlin|essen|hamburg|mainz|ulm)\/$/.test(url)) return 'stadt';
  if (/^\/dozentinnen\//.test(url)) return 'dozentin';
  if (/fachkosmetikerin-ausbildung/.test(url)) return 'ausbildung';
  if (/\/(impressum|datenschutz)\//.test(url)) return 'rechtlich';
  if (/^\/(berlin|essen|hamburg|mainz|ulm)\//.test(url)) return 'modul';
  return 'sonstiges';
}

function extractLinks(html) {
  const links = new Set();
  const re = /href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    if (/\.(ico|svg|webp|png|jpg|jpeg|css|js|xml|txt|json|woff2?)($|\?)/.test(href)) continue;
    if (href.startsWith('/_astro/') || href.startsWith('/images/')) continue;
    href = href.split('#')[0].split('?')[0];
    if (!href) continue;
    if (!href.endsWith('/') && !href.includes('.')) href += '/';
    links.add(href);
  }
  return links;
}

// ─────────────────────────────────────────────────────────────
// HTML Generator
// ─────────────────────────────────────────────────────────────

function generateHtml(kpis, graphData) {
  const safeJson = s => JSON.stringify(s).replace(/<\/script>/gi, '<\\/script>');

  const TYPE_COLORS = {
    startseite: '#C8962E',
    stadt:      '#3B82F6',
    modul:      '#10B981',
    dozentin:   '#A855F7',
    ausbildung: '#1A5E3A',
    rechtlich:  '#6B7280',
    sonstiges:  '#9CA3AF',
  };
  const TYPE_LABELS = {
    startseite: 'Startseite',
    stadt:      'Stadtseite',
    modul:      'Modulseite',
    dozentin:   'Dozentinnen-Profil',
    ausbildung: 'Ausbildungsseite',
    rechtlich:  'Rechtliches',
    sonstiges:  'Sonstiges',
  };

  const kpiCards = [
    { label: 'Seiten',        value: kpis.totalPages },
    { label: 'Links gesamt',  value: kpis.totalLinks },
    { label: 'Unique Kanten', value: kpis.uniqueEdges },
    { label: 'Kaputte Links', value: kpis.brokenCount, warn: kpis.brokenCount > 0 },
    { label: 'Orphan-Seiten', value: kpis.orphanCount, warn: kpis.orphanCount > 0 },
  ].map(c => `<div class="kpi${c.warn ? ' kpi--warn' : ''}"><div class="kpi-v">${c.value}</div><div class="kpi-l">${c.label}</div></div>`).join('');

  const byTypeRows = Object.entries(kpis.byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `<div class="sr"><span class="dot" style="background:${TYPE_COLORS[t]??'#aaa'}"></span><span>${TYPE_LABELS[t]??t}</span><span class="sv">${n}</span></div>`)
    .join('');

  const edgeRows = Object.entries(kpis.edgeTypeStats)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, n]) => `<div class="sr"><span>${k.replace('→',' → ')}</span><span class="sv">${n}</span></div>`)
    .join('');

  const topInRows = kpis.mostIncoming
    .map(n => `<div class="sr"><code>${n.url}</code><span class="sv">${n.count}</span></div>`)
    .join('');

  const brokenRows = kpis.brokenEdges.length
    ? kpis.brokenEdges.map(e => `<div class="sr broken-row"><code>${e.from}</code><span>→</span><code class="red">${e.to}</code></div>`).join('')
    : '<div class="sr good">✓ Keine kaputten Links</div>';

  const orphanRows = kpis.orphanUrls.length
    ? kpis.orphanUrls.map(u => `<div class="sr"><code class="red">${u}</code></div>`).join('')
    : '<div class="sr good">✓ Keine Orphan-Seiten</div>';

  const legendItems = Object.entries(TYPE_COLORS)
    .map(([t, c]) => `<div class="li"><span class="dot" style="background:${c}"></span>${TYPE_LABELS[t]??t}</div>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Link Graph – dein-beauty-kurs.de</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,system-ui,sans-serif;background:#0D0D0D;color:#F0EAE0;font-size:13px;height:100vh;display:flex;flex-direction:column;overflow:hidden}
@keyframes dash-fwd{to{stroke-dashoffset:-12}}
@keyframes dash-rev{to{stroke-dashoffset:12}}
.header{padding:14px 24px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
.header h1{font-size:15px;font-weight:600;color:#F0EAE0}
.header p{font-size:11px;color:#666;margin-top:2px}
.kpis{display:flex;gap:12px;padding:12px 24px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0;flex-wrap:wrap}
.kpi{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:6px;padding:10px 16px;min-width:100px}
.kpi--warn{border-color:#ef4444;background:rgba(239,68,68,.08)}
.kpi-v{font-size:24px;font-weight:700;color:#C8962E;line-height:1}
.kpi--warn .kpi-v{color:#ef4444}
.kpi-l{font-size:10px;color:#777;margin-top:3px;text-transform:uppercase;letter-spacing:.07em}
.body{display:flex;flex:1;overflow:hidden;min-height:0}
.graph-area{flex:1;position:relative;background:#080808;overflow:hidden}
#svg{width:100%;height:100%;display:block}
.hint{position:absolute;bottom:10px;left:12px;font-size:10px;color:rgba(255,255,255,.2);pointer-events:none}
.sidebar{width:300px;flex-shrink:0;border-left:1px solid rgba(255,255,255,.07);overflow-y:auto;display:flex;flex-direction:column;gap:0}
.sb{padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06)}
.sb h2{font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#C8962E;margin-bottom:10px}
.sr{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04);flex-wrap:wrap;color:#bbb;line-height:1.4}
.sr:last-child{border-bottom:none}
.sv{margin-left:auto;font-weight:600;color:#F0EAE0;flex-shrink:0}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
code{font-size:10px;font-family:monospace;color:#C8962E;word-break:break-all}
code.red{color:#ef4444}
.broken-row{flex-direction:column;align-items:flex-start;gap:1px}
.good{color:#22c55e}
.legend{display:flex;flex-direction:column;gap:5px}
.li{display:flex;align-items:center;gap:7px;font-size:12px;color:#bbb}
.edge-samp{width:28px;height:2px;flex-shrink:0}
.ev{background:repeating-linear-gradient(90deg,#22c55e 0 5px,transparent 5px 9px)}
.eb{background:repeating-linear-gradient(90deg,#ef4444 0 5px,transparent 5px 9px)}
.tip{position:fixed;background:rgba(10,10,10,.95);border:1px solid rgba(200,150,46,.35);border-radius:6px;padding:8px 12px;font-size:12px;pointer-events:none;z-index:200;max-width:240px;display:none}
.tip-url{font-weight:600;color:#C8962E;word-break:break-all}
.tip-type{color:#888;margin-top:2px}
.tip-stat{color:#ccc;margin-top:3px}
</style>
</head>
<body>

<div class="header">
  <h1>🔗 Internal Link Graph – dein-beauty-kurs.de</h1>
  <p>Generiert: ${kpis.generatedAt} · Scroll = Zoom · Drag = Pan · Knoten ziehbar</p>
</div>

<div class="kpis">${kpiCards}</div>

<div class="body">
  <div class="graph-area">
    <svg id="svg"></svg>
    <div class="hint">Scroll = Zoom · Drag = Pan</div>
  </div>
  <div class="sidebar">
    <div class="sb"><h2>Seiten nach Typ</h2>${byTypeRows}</div>
    <div class="sb"><h2>Top Kanten-Typen</h2>${edgeRows}</div>
    <div class="sb"><h2>Meiste eingehende Links</h2>${topInRows}</div>
    <div class="sb">
      <h2>Legende</h2>
      <div class="legend">
        ${legendItems}
        <div style="margin-top:6px;font-size:10px;color:#666">Kanten (animiert fließend):</div>
        <div class="li"><span class="edge-samp ev"></span>Gültige Verlinkung</div>
        <div class="li"><span class="edge-samp eb"></span>Kaputte Verlinkung</div>
        <div class="li"><span style="width:12px;height:12px;border:2px solid #ef4444;border-radius:50%;display:inline-block;flex-shrink:0"></span>Orphan-Seite</div>
      </div>
    </div>
    <div class="sb"><h2>Kaputte Links (${kpis.brokenCount})</h2>${brokenRows}</div>
    <div class="sb"><h2>Orphan-Seiten (${kpis.orphanCount})</h2>${orphanRows}</div>
  </div>
</div>

<div id="tip" class="tip"></div>

<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script>
const G = ${safeJson(graphData)};
const TC = ${safeJson(TYPE_COLORS)};
const TL = ${safeJson(TYPE_LABELS)};

(function(){
  const wrap = document.querySelector('.graph-area');
  const W = wrap.clientWidth, H = wrap.clientHeight;
  const svg = d3.select('#svg').attr('viewBox', \`0 0 \${W} \${H}\`);

  // Deduplicate edges for rendering
  const edgeMap = new Map();
  for (const e of G.edges) {
    const k = e.from + '→' + e.to;
    if (!edgeMap.has(k)) edgeMap.set(k, e);
  }
  const links = Array.from(edgeMap.values()).map(e => ({
    source: e.from, target: e.to, valid: e.valid, count: e.count
  }));

  svg.append('defs').html(\`
    <marker id="av" viewBox="0 -4 8 8" refX="8" refY="0" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M0,-4L8,0L0,4" fill="#22c55e" opacity=".7"/>
    </marker>
    <marker id="ab" viewBox="0 -4 8 8" refX="8" refY="0" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M0,-4L8,0L0,4" fill="#ef4444" opacity=".7"/>
    </marker>
  \`);

  const root = svg.append('g');

  const sim = d3.forceSimulation(G.nodes)
    .alphaDecay(0.025)
    .force('link', d3.forceLink(links).id(d => d.url)
      .distance(d => {
        const s = d.source.type, t = d.target.type;
        if (s === 'startseite' || t === 'startseite') return 130;
        if (s === 'stadt' || t === 'stadt') return 100;
        return 65;
      })
      .strength(0.4))
    .force('charge', d3.forceManyBody().strength(d => d.url === '/' ? -600 : -220))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collide', d3.forceCollide().radius(d => nr(d) + 10));

  // Pin startseite to center
  const start = G.nodes.find(n => n.url === '/');
  if (start) { start.fx = W / 2; start.fy = H / 2; }

  // Edges
  const edgeSel = root.append('g').selectAll('path')
    .data(links).join('path')
    .attr('fill', 'none')
    .attr('stroke', d => d.valid ? '#22c55e' : '#ef4444')
    .attr('stroke-opacity', 0.55)
    .attr('stroke-width', d => Math.min(0.8 + d.count * 0.15, 2.5))
    .attr('stroke-dasharray', '6 4')
    .attr('marker-end', d => d.valid ? 'url(#av)' : 'url(#ab)')
    .style('animation', d => d.valid ? 'dash-fwd 2s linear infinite' : 'dash-rev 0.9s linear infinite');

  // Nodes
  const nodeSel = root.append('g').selectAll('g')
    .data(G.nodes).join('g')
    .attr('cursor', 'grab')
    .call(d3.drag()
      .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0); if (d.url !== '/') { d.fx = null; d.fy = null; } })
    );

  nodeSel.append('circle')
    .attr('r', d => nr(d))
    .attr('fill', d => TC[d.type] ?? '#aaa')
    .attr('fill-opacity', d => d.exists ? 0.85 : 0.35)
    .attr('stroke', d => d.isOrphan ? '#ef4444' : 'rgba(255,255,255,.18)')
    .attr('stroke-width', d => d.isOrphan ? 2.5 : 1);

  nodeSel.append('text')
    .attr('dy', '0.35em').attr('text-anchor', 'middle')
    .attr('font-size', d => d.url === '/' ? 10 : 8)
    .attr('font-family', 'Inter,system-ui,sans-serif')
    .attr('fill', '#fff').attr('fill-opacity', 0.75)
    .attr('pointer-events', 'none')
    .text(d => shortLabel(d.url));

  // Tooltip
  const tip = document.getElementById('tip');
  nodeSel
    .on('mouseover', (ev, d) => {
      tip.style.display = 'block';
      tip.innerHTML = \`<div class="tip-url">\${d.url}</div><div class="tip-type">\${TL[d.type]??d.type}</div><div class="tip-stat">\${d.incoming} eingehende Links\${d.isOrphan?' · <span style="color:#ef4444">ORPHAN</span>':''}</div>\`;
    })
    .on('mousemove', ev => {
      tip.style.left = (ev.clientX + 14) + 'px';
      tip.style.top = (ev.clientY - 10) + 'px';
    })
    .on('mouseleave', () => { tip.style.display = 'none'; });

  // Zoom
  svg.call(d3.zoom().scaleExtent([0.15, 5]).on('zoom', ev => root.attr('transform', ev.transform)));

  // Tick
  sim.on('tick', () => {
    edgeSel.attr('d', d => {
      const sx = d.source.x, sy = d.source.y;
      const tx = d.target.x, ty = d.target.y;
      const dx = tx - sx, dy = ty - sy;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const r = nr(d.target) + 5;
      const ex = tx - (dx/dist)*r, ey = ty - (dy/dist)*r;
      const cx = (sx+tx)/2 - dy*0.12, cy = (sy+ty)/2 + dx*0.12;
      return \`M\${sx},\${sy}Q\${cx},\${cy}\${ex},\${ey}\`;
    });
    nodeSel.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
  });

  function nr(d) {
    if (d.url === '/') return 20;
    if (d.type === 'stadt') return 14;
    if (d.type === 'modul' || d.type === 'dozentin') return 10;
    if (d.type === 'ausbildung') return 12;
    return 8;
  }
  function shortLabel(url) {
    if (url === '/') return 'Start';
    const parts = url.replace(/\\/$/, '').split('/').filter(Boolean);
    const last = parts[parts.length - 1] ?? '';
    return last.length > 10 ? last.slice(0, 9) + '…' : last;
  }
})();
</script>
</body>
</html>`;
}
