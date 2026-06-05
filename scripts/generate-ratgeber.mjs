#!/usr/bin/env node
/**
 * Ratgeber Content-Pipeline
 *
 * Generates unique Ratgeber articles from the queue via Claude API,
 * runs a 3-gram Jaccard dedupe gate (threshold: 30%), and writes
 * each accepted article to src/content/ratgeber/{slug}.md.
 *
 * Usage:
 *   node scripts/generate-ratgeber.mjs --test          # 3-article smoke test
 *   node scripts/generate-ratgeber.mjs --limit=10      # first 10 unwritten entries
 *   node scripts/generate-ratgeber.mjs                 # full queue
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// dotenv – load .env if present (ANTHROPIC_API_KEY may be in shell env instead)
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch { /* optional */ }

const ROOT        = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'src', 'content', 'ratgeber');
const LOGS_DIR    = path.join(ROOT, 'logs');
const QUEUE_FILE  = path.join(ROOT, 'src', 'data', 'ratgeber-queue.json');
const FACTS_FILE  = path.join(ROOT, 'src', 'data', 'modul-fakten.json');

// ── CLI args ─────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const isTest    = args.includes('--test');
const limitArg  = args.find(a => a.startsWith('--limit='));
const runLimit  = isTest ? 3 : (limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity);

const DEDUPE_THRESHOLD = 0.30;  // 30% Jaccard → retry
const COMMIT_BATCH     = 10;    // commit every N accepted articles

// ── Helpers: 3-gram Jaccard ──────────────────────────────────────────────────
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-zäöüß0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function shingles(text, n = 3) {
  const words = tokenize(text);
  const s = new Set();
  for (let i = 0; i <= words.length - n; i++) {
    s.add(words.slice(i, i + n).join('⁠')); // word-joiner as separator
  }
  return s;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function maxJaccard(candidate, existing) {
  const cs = shingles(candidate);
  let max = 0;
  for (const body of existing) {
    const sim = jaccard(cs, shingles(body));
    if (sim > max) max = sim;
  }
  return max;
}

// ── Helpers: markdown parsing ────────────────────────────────────────────────
function extractBody(md) {
  // Strip YAML front matter (---...---) and return remaining body
  const match = md.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  return match ? match[1].trim() : md.trim();
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

// ── Prompt builder ───────────────────────────────────────────────────────────
function buildPrompt(entry, facts, attempt = 0) {
  const modFacts  = facts[entry.modul];
  const avgsFacts = facts.avgs;

  const retryNote = attempt > 0
    ? `\n⚠️  NEUVERSUCH ${attempt}: Bitte formuliere den Artikel komplett anders als zuvor. ` +
      `Andere Einleitung, andere Reihenfolge der Argumente, andere Beispiele, andere Satzstrukturen. ` +
      `Der inhaltliche Kern bleibt derselbe, aber der Text muss sprachlich eigenständig sein.\n`
    : '';

  const today = new Date().toISOString().split('T')[0];

  return `Du bist ein erfahrener Fachtexter für professionelle Beauty-Bildung. Schreibe einen hochwertigen Ratgeber-Artikel für dein-beauty-kurs.de.
${retryNote}
## AUSGABEFORMAT (exakt einhalten)
Schreibe eine vollständige Markdown-Datei, die MIT \`---\` beginnt (YAML Front Matter) und dann den Article-Body enthält. Beispielstruktur:

\`\`\`
---
title: "Exakter SEO-Titel mit Keyword"
description: "Max. 155 Zeichen. Enthält Keyword. Motiviert zum Klicken."
modul: ${entry.modul}
stadt: ${entry.relatedCityLabel}
stadtSlug: ${entry.relatedCity}
serviceSlug: ${entry.modulServiceSlug}
relatedDozentinSlug: ${entry.relatedDozentin}
relatedDozentinName: "${entry.relatedDozentinName}"
publishDate: ${today}
faq:
  - question: "Frage 1?"
    answer: "Antwort 1 (2–4 Sätze)."
  - question: "Frage 2?"
    answer: "Antwort 2."
  - question: "Frage 3?"
    answer: "Antwort 3."
  - question: "Frage 4?"
    answer: "Antwort 4."
---

[Body hier – mind. 1.700 Wörter]
\`\`\`

## SCHREIBREGELN (verpflichtend)

1. **Zielgruppe:** Erfahrene Beauty-Profis (Kosmetikerinnen, PMU-Artists, Selbstständige) – KEIN Anfänger-Ton
2. **Länge:** Mindestens 1.700 Wörter im Body (ohne Front Matter)
3. **Struktur:** Mind. 4 H2-Abschnitte (##), bei Bedarf H3 darunter; kein H1 im Body
4. **FAQ:** Mind. 4 Einträge im Front Matter (question/answer), je Antwort 2–4 Sätze
5. **Keine erfundenen Fakten:** Nur Fakten aus den nachfolgenden Faktenblättern verwenden. Keine Preise, Statistiken oder Tagesabläufe erfinden.
6. **AVGS korrekt darstellen:**
   - Rechtsgrundlage: § 45 SGB III
   - Kein Rechtsanspruch; immer Ermessensentscheidung
   - Muss vor Maßnahmenbeginn beantragt sein
   - Nur bei AZAV-zugelassenem Träger
   - Offen für Arbeitssuchende, Angestellte (Einzelfall), Selbstständige (Einzelfall)
   - USP: einziger Anbieter für Perfektionstrainings über AVGS in Deutschland
7. **Perfektionstraining = 40 UE:** 3 Praxistage à ca. 8 Std + 10 UE online (Marketing & Vertrieb); rein praktisch, keine Theorie
8. **Interne Links:**
   - Zur Service-Seite: [${entry.modulLabel} in ${entry.relatedCityLabel}](/${entry.relatedCity}/${entry.modulServiceSlug}/)
   - Zur Dozentin: [${entry.relatedDozentinName}](/dozentinnen/${entry.relatedDozentin}/)
9. **CTA am Ende:** Link auf /dozentinnen/${entry.relatedDozentin}/ (NICHT auf /fachdozentin-werden/)
10. **Keine Floskeln:** keine "In der heutigen Zeit", "Es ist allgemein bekannt", "Nicht zuletzt" etc.
11. **Sprache:** Direkt, fachlich, auf Augenhöhe. Du sprichst Profis an, nicht Einsteiger.

## AVGS-FAKTENBLATT

- Bezeichnung: ${avgsFacts.bezeichnung}
- Rechtsgrundlage: ${avgsFacts.rechtsgrundlage}
- Finanzierung: ${avgsFacts.finanzierung}
- Rechtsanspruch: ${avgsFacts.rechtsanspruch}
- Voraussetzung: ${avgsFacts.voraussetzung}
- Zielgruppe: ${avgsFacts.zielgruppe.join(' | ')}
- Unterschied Bildungsgutschein: ${avgsFacts.unterschied_bildungsgutschein}
- USP: ${avgsFacts.usp}
- Format: ${avgsFacts.format.gesamt_ue} UE = ${avgsFacts.format.praxistage} Praxistage à ${avgsFacts.format.std_pro_praxistag} + ${avgsFacts.format.online_ue} UE online (${avgsFacts.format.online_inhalt})
- Praxis-Inhalte: ${avgsFacts.format.praesenz_inhalte.join(' | ')}
- Theorie: ${avgsFacts.format.theorie}
- Abschluss: ${avgsFacts.format.abschluss}
- Netzwerk: ${avgsFacts.netzwerk}

## MODUL-FAKTENBLATT: ${modFacts.bezeichnung}

${Object.entries(modFacts)
  .filter(([k]) => k !== 'bezeichnung')
  .map(([k, v]) => `- **${k}:** ${Array.isArray(v) ? v.join(' | ') : v}`)
  .join('\n')}

## AUFGABE

- **Keyword:** ${entry.keyword}
- **Schwerpunkt / Angle:** ${entry.angle}
- **Modul:** ${modFacts.bezeichnung}
- **Stadt:** ${entry.relatedCityLabel}
- **Dozentin:** ${entry.relatedDozentinName} → /dozentinnen/${entry.relatedDozentin}/

Schreibe jetzt den vollständigen Artikel. Beginne direkt mit \`---\` (kein Text davor).`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('\n❌  ANTHROPIC_API_KEY nicht gesetzt.');
    console.error('   Setze ihn in deiner Shell: export ANTHROPIC_API_KEY=sk-...\n');
    process.exit(1);
  }

  // Load data
  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  const facts = JSON.parse(fs.readFileSync(FACTS_FILE, 'utf8'));

  // Ensure directories exist
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  // Pre-load existing article bodies for dedupe
  const acceptedBodies = [];
  for (const file of fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'))) {
    const body = extractBody(fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8'));
    acceptedBodies.push(body);
  }

  // Filter queue: skip existing files + skip requiresLookup without dozentin
  const todo = queue.filter(entry => {
    if (!entry.modul || !entry.slug) return false;
    if (entry.requiresLookup && !entry.relatedDozentin) return false;
    const dest = path.join(CONTENT_DIR, `${entry.slug}.md`);
    if (fs.existsSync(dest)) {
      if (isTest) console.log(`  ⏭️  Bereits vorhanden: ${entry.slug}`);
      return false;
    }
    return true;
  }).slice(0, runLimit);

  if (todo.length === 0) {
    console.log('\n✅  Alle Einträge bereits geschrieben – nichts zu tun.\n');
    return;
  }

  const client = new Anthropic({ apiKey });
  const dedupeReport = { generated: [], skipped: [], retried: [] };
  const results = [];
  let accepted = 0;

  console.log(`\n${'─'.repeat(60)}`);
  if (isTest) {
    console.log(`  🧪  TEST-LAUF – ${todo.length} Artikel`);
  } else {
    console.log(`  🚀  PIPELINE – ${todo.length} Artikel`);
  }
  console.log(`${'─'.repeat(60)}\n`);

  for (let i = 0; i < todo.length; i++) {
    const entry = todo[i];
    console.log(`[${i + 1}/${todo.length}]  ${entry.slug}`);

    let finalMd    = null;
    let wordCount  = 0;
    let maxSim     = 0;
    let finalStatus = 'ok';

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        console.log(`   ↻  Versuch ${attempt + 1} (${attempt === 1 ? 'zu kurz oder Duplikat' : 'nochmals'})`);
        dedupeReport.retried.push({ slug: entry.slug, attempt });
      }

      let rawText;
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          messages: [{ role: 'user', content: buildPrompt(entry, facts, attempt) }],
        });
        rawText = response.content[0].text.trim();
      } catch (err) {
        console.error(`   ❌  API-Fehler: ${err.message}`);
        finalStatus = 'api-error';
        break;
      }

      // Clean up: some models wrap in code fences
      const md = rawText.replace(/^```(?:markdown|yaml|md)?\n/i, '').replace(/\n```\s*$/, '').trim();

      const body = extractBody(md);
      wordCount = countWords(body);

      // Word count gate
      if (wordCount < 1400 && attempt < 2) {
        console.log(`   ⚠️   Zu kurz: ${wordCount} Wörter – nochmals generieren`);
        continue;
      }

      // Dedupe gate
      maxSim = maxJaccard(body, acceptedBodies);
      if (maxSim >= DEDUPE_THRESHOLD && attempt < 2) {
        console.log(`   ⚠️   Ähnlichkeit ${(maxSim * 100).toFixed(1)}% ≥ ${DEDUPE_THRESHOLD * 100}% – nochmals generieren`);
        continue;
      }

      finalMd = md;
      break;
    }

    // Handle failures
    if (!finalMd || finalStatus === 'api-error') {
      const reason = finalStatus === 'api-error' ? 'api-error' : 'max-retries';
      console.log(`   ✗   Übersprungen (${reason})\n`);
      dedupeReport.skipped.push({ slug: entry.slug, reason, wordCount, maxSim });
      results.push({ slug: entry.slug, status: reason, wordCount, maxSim });
      continue;
    }

    // Write file
    const dest = path.join(CONTENT_DIR, `${entry.slug}.md`);
    fs.writeFileSync(dest, finalMd, 'utf8');
    acceptedBodies.push(extractBody(finalMd));
    accepted++;

    const simStr = maxSim === 0
      ? '0.0% (kein Vergleich)'
      : `${(maxSim * 100).toFixed(1)}%`;
    console.log(`   ✓   Wörter: ${wordCount}  |  Max. Ähnlichkeit: ${simStr}\n`);

    dedupeReport.generated.push({ slug: entry.slug, wordCount, maxSim });
    results.push({ slug: entry.slug, status: 'ok', wordCount, maxSim });

    // Batch commit (skip in test mode)
    if (!isTest && accepted % COMMIT_BATCH === 0) {
      const batch = Math.ceil(accepted / COMMIT_BATCH);
      try {
        execSync(
          `git add src/content/ratgeber/ && git commit -m "feat(content): ratgeber batch ${batch} (${COMMIT_BATCH} Artikel)"`,
          { cwd: ROOT, stdio: 'inherit' }
        );
      } catch (e) {
        console.warn(`   ⚠️   git commit fehlgeschlagen: ${e.message}`);
      }
    }
  }

  // Write dedup report
  fs.writeFileSync(
    path.join(LOGS_DIR, 'dedupe-report.json'),
    JSON.stringify(dedupeReport, null, 2) + '\n',
    'utf8'
  );

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`${'─'.repeat(60)}`);
  console.log(`  ${isTest ? '🧪  TEST-ERGEBNIS' : '📊  ERGEBNIS'}\n`);

  for (const r of results) {
    const icon = r.status === 'ok' ? '✓' : '✗';
    const sim  = r.maxSim === 0 ? '0.0%' : `${(r.maxSim * 100).toFixed(1)}%`;
    console.log(`  ${icon}  ${r.slug}`);
    console.log(`     Wörter: ${r.wordCount}  |  Max. Ähnlichkeit: ${sim}`);
  }

  const okCount      = results.filter(r => r.status === 'ok').length;
  const skippedCount = results.filter(r => r.status !== 'ok').length;

  console.log(`\n  Erstellt: ${okCount}  |  Übersprungen: ${skippedCount}  |  Gesamt: ${results.length}`);
  console.log(`  Deduplizierungsbericht: logs/dedupe-report.json`);
  console.log(`${'─'.repeat(60)}\n`);

  if (isTest) {
    console.log(`  ℹ️   Test abgeschlossen. Für den vollen Lauf: node scripts/generate-ratgeber.mjs\n`);
  }
}

main().catch(err => {
  console.error('\n❌  Unbehandelter Fehler:', err.message);
  process.exit(1);
});
