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
const args       = process.argv.slice(2);
const isTest     = args.includes('--test');
const isOverwrite = args.includes('--overwrite');
const isPreview  = args.includes('--preview');
const limitArg   = args.find(a => a.startsWith('--limit='));
const runLimit   = isTest ? 3 : isPreview ? 1 : (limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity);

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
    ? `\n⚠️  NEUVERSUCH ${attempt}: Vorheriger Text war zu kurz oder zu ähnlich. ` +
      `Schreibe den Artikel KOMPLETT NEU – andere Einleitung, andere Gliederung, andere Beispiele, andere Satzstrukturen. ` +
      `MINDESTENS 1.700 WÖRTER IM BODY. Schreibe ausführliche, vollständige Absätze – keine Stichpunkte als Textersatz.\n`
    : '';

  const today = new Date().toISOString().split('T')[0];

  // Pillar articles are city-neutral / national
  const frontmatterCityFields = entry.isPillar
    ? ``
    : `stadt: ${entry.relatedCityLabel}
stadtSlug: ${entry.relatedCity}
`;

  const internalLinkRule = entry.isPillar
    ? `8. **Interne Links:**
   - Zur Service-Seite (Beispiel Hamburg): [${entry.modulLabel} in Hamburg](/hamburg/${entry.modulServiceSlug}/)
   - Weitere Städte (wenn sinnvoll): verweise auf das bundesweite Netzwerk
   - KEINE Links zu einzelnen Dozentinnen-Profilen im Fließtext`
    : `8. **Interne Links:**
   - Zur Service-Seite: [${entry.modulLabel} in ${entry.relatedCityLabel}](/${entry.relatedCity}/${entry.modulServiceSlug}/)
   - KEINE Links zu einzelnen Dozentinnen-Profilen im Fließtext`;

  const ctaRule = entry.isPillar
    ? `9. **CTA am Ende:** Link auf /hamburg/${entry.modulServiceSlug}/ als Beispiel-Standort. Formuliere neutral: „Alle Termine und Fachdozentinnen im Netzwerk findest du auf der Kursseite." NICHT auf ein einzelnes Dozentinnen-Profil, NICHT auf /fachdozentin-werden/`
    : `9. **CTA am Ende:** Link auf /${entry.relatedCity}/${entry.modulServiceSlug}/ – Übersichtsseite mit allen Dozentinnen und Terminen in ${entry.relatedCityLabel}. NICHT auf ein einzelnes Dozentinnen-Profil, NICHT auf /fachdozentin-werden/`;

  const aufgabeCity = entry.isPillar
    ? `- **Reichweite:** Bundesweit – KEINE Stadt-Fixierung
- **Beispiel-Standort:** Hamburg → /hamburg/${entry.modulServiceSlug}/`
    : `- **Stadt:** ${entry.relatedCityLabel}
- **Service-Seite:** /${entry.relatedCity}/${entry.modulServiceSlug}/`;

  return `Du bist ein erfahrener Fachtexter für professionelle Beauty-Bildung. Schreibe einen hochwertigen Ratgeber-Artikel für dein-beauty-kurs.de.
${retryNote}
## AUSGABEFORMAT (exakt einhalten)
Schreibe eine vollständige Markdown-Datei, die MIT \`---\` beginnt (YAML Front Matter) und dann den Article-Body enthält. Beispielstruktur:

\`\`\`
---
title: "Exakter SEO-Titel mit Keyword"
description: "Max. 155 Zeichen. Enthält Keyword. Motiviert zum Klicken."
modul: ${entry.modul}
${frontmatterCityFields}serviceSlug: ${entry.modulServiceSlug}
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
${internalLinkRule}
${ctaRule}
10. **Keine Floskeln:** keine "In der heutigen Zeit", "Es ist allgemein bekannt", "Nicht zuletzt" etc.
11. **Sprache:** Direkt, fachlich, auf Augenhöhe. Du sprichst Profis an, nicht Einsteiger.
12. **VERBOTEN – Einzelne Dozentin namentlich:** Nenne im Fließtext KEINE einzelne Dozentin beim Namen. Schreibe neutral: „unsere Fachdozentinnen", „eine erfahrene Fachdozentin in deiner Nähe", „zertifizierte Fachdozentinnen im Netzwerk". Konkrete Profile erscheinen automatisch über die Kursseite.
${entry.isPillar ? `
## PILLAR-SEITE – BESONDERE ANFORDERUNGEN (verpflichtend)

⚠️ NATIONAL – KEINE STADT-FIXIERUNG:
- Titel und H1 KEIN Stadtname (nicht „Hamburg", nicht „Berlin" etc.)
- Inhalt bezieht sich auf das bundesweite Netzwerk: zertifizierte Schulungsstandorte in ganz Deutschland, über 13 Fachdozentinnen
- Hamburg darf als Beispiel-Standort genannt werden, aber KEINE einzelne Dozentin namentlich im Fließtext
- Interne Links dürfen auf Hamburg-Seiten als Beispiel zeigen, aber nicht wie eine Hamburg-Seite klingen
- Im YAML Front Matter: kein \`stadt:\`, kein \`stadtSlug:\` – diese Felder weglassen

Diese Seite ist die zentrale Pillar-Seite für das Modul ${modFacts.bezeichnung}. Sie muss die umfangreichste und vollständigste Seite zu diesem Thema sein. Halte dich exakt an diese Pflicht-Abschnitte und baue jeden vollständig aus – kein Abschnitt darf kürzer als 150 Wörter sein:

1. **Überblick** – Was ist das Perfektionstraining, was unterscheidet es von einem Anfängerkurs, was ist das konkrete Versprechen?
2. **Für wen** – Wer ist die ideale Zielgruppe (Voraussetzungen, Erfahrungslevel, berufliche Situation)? Wer ist explizit ausgeschlossen?
3. **Trainingsablauf im Detail** – Die 40 UE Schritt für Schritt: Praxistage (Matrizenübung, Arbeit am Kundenmodell), 10 UE Online (Marketing & Vertrieb), Zeiteinteilung, Abschlusszertifikat.
4. **Fachliche Perfektions-Schwerpunkte** – Die 5–6 konkreten Techniken/Probleme, die im Training bearbeitet werden (aus dem Modul-Faktenblatt).
5. **AVGS-Förderung kompakt** – Was ist der AVGS, wer bekommt ihn, wie beantragt man ihn, warum kein Rechtsanspruch, warum AVGS statt Bildungsgutschein, USP.
6. **Modul-Kontext** – Wie verhält sich ${modFacts.bezeichnung} zu verwandten Techniken im Beauty-Bereich? Für welche Kundenwünsche ist es besonders geeignet?

**Länge:** MINDESTENS 1.700 Wörter im Body. Das ist keine Empfehlung – es ist eine harte Untergrenze. Schreibe vollständige, ausformulierte Absätze, keine Bullet-Point-Listen als Ersatz für Text.
**FAQ:** MINDESTENS 5 Einträge im Front Matter (nicht 4), je Antwort 3–4 Sätze.
` : `
## CLUSTER-ARTIKEL – PFLICHT-STRUKTUR (verpflichtend)

⚠️ MINDESTENS 1.700 WÖRTER IM BODY – harte Untergrenze, keine Empfehlung.

Verwende exakt diese Gliederung (passe H2-Titel sinnvoll auf das Keyword an):

1. **Einleitung** (kein H2, mind. 150 Wörter) – Situation/Problem erfahrener Profis, warum dieses Thema für sie relevant ist
2. **H2: [Thematischer Hauptabschnitt 1]** (mind. 250 Wörter) – mit 2 H3-Unterpunkten, vollständige Absätze
3. **H2: [Thematischer Hauptabschnitt 2]** (mind. 250 Wörter) – mit 1–2 H3-Unterpunkten
4. **H2: [Thematischer Hauptabschnitt 3]** (mind. 200 Wörter)
5. **H2: Praxis / Häufige Fehler / Handlungsempfehlungen** (mind. 200 Wörter) – konkrete, anwendbare Tipps
6. **H2: AVGS-Förderung: Das Wichtigste** (mind. 150 Wörter) – § 45 SGB III, AZAV, kein Rechtsanspruch, USP
7. **H2: Nächster Schritt** (mind. 100 Wörter) – CTA zur Service-Seite /${entry.relatedCity}/${entry.modulServiceSlug}/ mit allen Terminen und Dozentinnen. NICHT zu einem einzelnen Dozentinnen-Profil, NICHT /fachdozentin-werden/

Fülle jeden Abschnitt mit vollständigem Fließtext. Keine Platzhalter. Keine Stichpunktlisten als Textersatz.
`}
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
${aufgabeCity}

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
    if (fs.existsSync(dest) && !isOverwrite && !isPreview) {
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
  let totalInputTokensSonnet  = 0;
  let totalOutputTokensSonnet = 0;
  let totalInputTokensHaiku   = 0;
  let totalOutputTokensHaiku  = 0;

  console.log(`\n${'─'.repeat(60)}`);
  if (isTest) {
    console.log(`  🧪  TEST-LAUF – ${todo.length} Artikel`);
  } else {
    console.log(`  🚀  PIPELINE – ${todo.length} Artikel`);
  }
  console.log(`${'─'.repeat(60)}\n`);

  for (let i = 0; i < todo.length; i++) {
    const entry = todo[i];
    const modelName = entry.isPillar ? 'sonnet-4-6' : 'haiku-4-5';
    console.log(`[${i + 1}/${todo.length}]  ${entry.slug}  [${modelName}]`);

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
          model: entry.isPillar ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001',
          max_tokens: entry.isPillar ? 7000 : 6000,
          messages: [{ role: 'user', content: buildPrompt(entry, facts, attempt) }],
        });
        rawText = response.content[0].text.trim();
        if (entry.isPillar) {
          totalInputTokensSonnet  += response.usage?.input_tokens  ?? 0;
          totalOutputTokensSonnet += response.usage?.output_tokens ?? 0;
        } else {
          totalInputTokensHaiku  += response.usage?.input_tokens  ?? 0;
          totalOutputTokensHaiku += response.usage?.output_tokens ?? 0;
        }
      } catch (err) {
        console.error(`   ❌  API-Fehler: ${err.message}`);
        finalStatus = 'api-error';
        break;
      }

      // Clean up: some models wrap in code fences
      const md = rawText.replace(/^```(?:markdown|yaml|md)?\n/i, '').replace(/\n```\s*$/, '').trim();

      const body = extractBody(md);
      wordCount = countWords(body);

      // Word count gate – max 1 retry (attempt 0 → retry; attempt 1+ → accept regardless)
      if (wordCount < 1500 && attempt < 1) {
        console.log(`   ⚠️   Zu kurz: ${wordCount} Wörter – einmal neu generieren`);
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

    // Preview mode: print and exit, do not write
    if (isPreview) {
      console.log('\n' + '═'.repeat(60));
      console.log('  PREVIEW – nicht gespeichert');
      console.log('═'.repeat(60) + '\n');
      console.log(finalMd);
      console.log('\n' + '═'.repeat(60) + '\n');
      return;
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

  const wordsAll = results.filter(r => r.status === 'ok').map(r => r.wordCount);
  const wordMin  = wordsAll.length ? Math.min(...wordsAll) : 0;
  const wordMax  = wordsAll.length ? Math.max(...wordsAll) : 0;
  const maxSimAll = Math.max(0, ...results.map(r => r.maxSim ?? 0));

  // Sonnet 4-6: $3/MTok in, $15/MTok out | Haiku 4-5: $0.80/MTok in, $4/MTok out
  const costUSD =
    (totalInputTokensSonnet / 1_000_000 * 3)    + (totalOutputTokensSonnet / 1_000_000 * 15) +
    (totalInputTokensHaiku  / 1_000_000 * 0.80) + (totalOutputTokensHaiku  / 1_000_000 * 4);
  const costEUR = costUSD * 0.92;

  console.log(`\n  Erstellt: ${okCount}  |  Übersprungen: ${skippedCount}  |  Gesamt: ${results.length}`);
  if (wordsAll.length) console.log(`  Wortzahl-Spanne: ${wordMin}–${wordMax} Wörter`);
  console.log(`  Höchste Ähnlichkeit: ${(maxSimAll * 100).toFixed(1)}%`);
  console.log(`  Tokens Sonnet: ${totalInputTokensSonnet.toLocaleString('de')} in / ${totalOutputTokensSonnet.toLocaleString('de')} out`);
  console.log(`  Tokens Haiku:  ${totalInputTokensHaiku.toLocaleString('de')} in / ${totalOutputTokensHaiku.toLocaleString('de')} out`);
  console.log(`  Kosten (geschätzt): $${costUSD.toFixed(2)} ≈ ${costEUR.toFixed(2)} €`);
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
