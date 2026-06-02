/**
 * Prebuild-Skript: Generiert einzigartigen Intro+FAQ+Galerie-Text für jede
 * /ausbildung/[modul]/[stadt]/-Seite via Anthropic API, cached das Ergebnis
 * und prüft Paarweise-Ähnlichkeit (Jaccard-Trigram-Gate).
 *
 * Fail-soft: Fehler werden geloggt, Build nie abgebrochen.
 * Cache: src/data/ausbildung-content.json (Key: "modul/stadtSlug")
 */

import { createClient }  from '@supabase/supabase-js';
import Anthropic         from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash }    from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config }        from 'dotenv';

config(); // .env laden

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const CACHE_PATH = join(ROOT, 'src', 'data', 'ausbildung-content.json');

// ── Statische Mappings (gespiegelt aus location-overrides.ts / .astro) ────────

const HUB_CITY_SLUG = {
  'dunya-said-hamburg':    'hamburg',
  'yvonne-klatt-elmshorn': 'hamburg',
  'katarina-hinz-wedel':   'hamburg',
};

const STANDORT_EXTRA = {
  'dunya-said-hamburg':    { stadtteil: 'Hamburg-Lurup', address: 'Eckhoffpl. 16, 22547 Hamburg', anfahrt: 'S-Bahn Linie S3 (Lurup), Parkplätze vor Ort.' },
  'katarina-hinz-wedel':   { stadtteil: 'Wedel (Kreis Pinneberg)', anfahrt: 'Ca. 20 km westlich von Hamburg, S-Bahn S1 Richtung Wedel.' },
  'yvonne-klatt-elmshorn': { stadtteil: 'Elmshorn (Schleswig-Holstein)', anfahrt: 'Ca. 35 km nordwestlich von Hamburg, S-Bahn S3 Richtung Elmshorn.' },
};

const MODUL_TO_SERVICE = {
  'powderbrows-ombrebrows':  'powderbrows-ombrebrows-masterclass',
  'velvet-lips-lipstick':    'velvet-lips-lipstick-masterclass',
  'microblading':            'microblading-masterclass',
  'wimpernverlaengerung':    'wimpernverlaengerung-masterclass',
  'camouflage-removal':      'camouflage-removal-masterclass',
};

const MODUL_INFO = {
  'powderbrows-ombrebrows': {
    display: 'PowderBrows & OmbreBrows MasterClass',
    technik: 'Powder-Shading und Ombré-Technik: weiche, gleichmäßige Pigmentierung für einen puderigen oder sanft verlaufenden Augenbrauen-Look. Schwerpunkte: Pigmentauswahl und -tiefe, Formkorrektur, Abheilungsverhalten, Übergänge – systematisch von Matrizen und Latex zu echten Modellen.',
  },
  'velvet-lips-lipstick': {
    display: 'Velvet Lips & LipStick Effekt MasterClass',
    technik: 'Vollflächige Lippen-PMU: präzise Konturlinie, gleichmäßige Flächenpigmentierung und sattes LipStick-Finish. Schwerpunkte: Farbwahl nach Hautton, Konturpräzision, weiche Übergänge, Korrekturen bestehender PMU – Matrizen- und Latexübungen vor Modellarbeit.',
  },
  'microblading': {
    display: 'Microblading MasterClass',
    technik: 'Manuelle Härchen-Strich-Technik: Klinge führen, Tiefe und Druck präzise steuern, natürliche Haarstruktur nachbilden. Schwerpunkte: Strichgleichmäßigkeit, Farbauswahl nach Haar- und Hautton, Abheilungsverhalten, Korrekturtechniken – von der Matrize zur Modellarbeit.',
  },
  'wimpernverlaengerung': {
    display: 'Wimpernverlängerung MasterClass',
    technik: '1:1-Technik und Volumentechnik (Fächerbau): Kleberauftrag, Trocknung, Isolierung, Styling nach Augenform. Schwerpunkte: Tragehaltbarkeit, Auffüllablauf, Fehlerbehebung, Entfernung – Training am Übungskopf, dann an echten Modellen.',
  },
  'camouflage-removal': {
    display: 'Camouflage & Tattoo Removal MasterClass',
    technik: 'Camouflage-Pigmentierung für Pigmentflecken, Narben und unerwünschte PMU sowie PMU-Removal mit Saline und Glycerin. Schwerpunkte: Farbkorrekturtechnik, Schichtenaufbau, Haut-Assessment, Kontraindikationen – Matrizen vor Modellarbeit.',
  },
};

const CITY_NAMES = {
  hamburg: 'Hamburg',
  berlin:  'Berlin',
  essen:   'Essen',
  mainz:   'Mainz',
  ulm:     'Ulm',
};

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────

function inputHash(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 12);
}

function wordTrigrams(text) {
  const words = text.toLowerCase()
    .replace(/[^\wäöüß\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
  const tgs = new Set();
  for (let i = 0; i < words.length - 2; i++) {
    tgs.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return tgs;
}

function jaccard(a, b) {
  const inter = [...a].filter(x => b.has(x)).length;
  const unionSize = new Set([...a, ...b]).size;
  return unionSize === 0 ? 0 : inter / unionSize;
}

function pageText(entry) {
  const faqText = (entry.faq ?? []).map(f => `${f.q} ${f.a}`).join(' ');
  return `${entry.intro ?? ''} ${faqText} ${entry.galerie_caption ?? ''}`;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Anthropic API-Call ─────────────────────────────────────────────────────────

async function callAI(client, prompt, retryNote = '') {
  const fullPrompt = retryNote ? `${prompt}\n\n---\n${retryNote}` : prompt;

  const msg = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1300,
    temperature: 1,
    messages:   [{ role: 'user', content: fullPrompt }],
  });

  const raw = msg.content[0]?.text?.trim() ?? '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Kein JSON in Antwort: ${raw.slice(0, 200)}`);

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.intro || !Array.isArray(parsed.faq) || parsed.faq.length < 4 || !parsed.galerie_caption) {
    throw new Error(`Ungültige JSON-Struktur: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  return parsed;
}

// ── Prompt-Builder ─────────────────────────────────────────────────────────────

function buildPrompt(modul, stadtSlug, dozentinnen, otherModuleDisplayNames = []) {
  const modulInfo  = MODUL_INFO[modul];
  const stadtName  = CITY_NAMES[stadtSlug] ?? stadtSlug;

  const dozText = dozentinnen.map(d => {
    const extra    = STANDORT_EXTRA[d.slug] ?? null;
    const standort = extra?.stadtteil ?? stadtName;
    const adresse  = extra?.address   ? ` | Adresse: ${extra.address}` : '';
    const anfahrt  = extra?.anfahrt   ? ` | Anfahrt: ${extra.anfahrt}` : '';
    const bio      = d.bio_short?.trim() ? `"${d.bio_short.trim()}"` : 'AZAV-zertifizierte Fachdozentin.';
    return `• ${d.first_name} ${d.last_name}: Standort ${standort}${adresse}${anfahrt} – Bio: ${bio}`;
  }).join('\n');

  const singleDozHint = (dozentinnen.length === 1 && otherModuleDisplayNames.length > 0)
    ? `\nWICHTIG – Einzeldozentin mit mehreren Modulseiten: ${dozentinnen[0].first_name} ${dozentinnen[0].last_name} unterrichtet in ${stadtName} auch: ${otherModuleDisplayNames.join(', ')}. Der MODUL-INHALT dieser Seite (Technik, Schwerpunkte, typische Ergebnisse) MUSS das Rückgrat von Intro und FAQ bilden – nicht die Dozentin allein.`
    : '';

  return `Du bist SEO-Texter für eine deutschsprachige Beauty-Weiterbildungsplattform.

AUFGABE: Schreibe einzigartigen, eigenständig wirkenden Content für genau diese Seite.

SEITE: /ausbildung/${modul}/${stadtSlug}/
MODUL: ${modulInfo.display}
TECHNIK (einweben): ${modulInfo.technik}
STADT: ${stadtName}

DOZENTIN(NEN):
${dozText}
${singleDozHint}

REGELN:
1. Sprache: Deutsch. Zielgruppe: ERFAHRENE Beauty-Fachkräfte mit Vorkenntnissen – kein Einsteigerkurs.
2. "Weiterbildung" / "Perfektionstraining" via AVGS – KEINE Berufsausbildung nach BBiG.
3. Keine Fördergarantie erwähnen? Ja – nur "bei AVGS-Bewilligung" reicht.
4. STRENGE ERDUNG – verwende NUR Fakten aus den übergebenen Datenfeldern. Erfinde NICHTS: keine Preise, Gruppengrößen, Zertifikate, ÖPNV-Linien, Fahrzeiten, Stadtteile, die nicht in den Daten stehen. Fehlt eine Info → weglassen oder "Adresse nach Anmeldung" schreiben. Format ist IMMER 1:1-Einzelcoaching – niemals Gruppengrößen erfinden.
5. KEINE individuellen Dozentinnennamen im generierten Text (Intro/FAQ). Nutze generische Bezüge: "die Dozentinnen vor Ort", "das Hamburger Team", "die Berliner Fachkraft". Aggregiere Spezialgebiete ohne Namensnennung. Echte Namen erscheinen nur in den Dozentinnen-Cards (live aus der DB, nicht aus diesem Text).
6. Intro: 120–180 Wörter. Kein Eröffnungssatz mit "Mit dem AVGS" oder "Die Agentur für Arbeit". Keine Bulletpoints (die stehen bereits auf der Seite). Kein Satz "Diese Weiterbildung richtet sich an…".
7. FAQ: exakt 4 Fragen. Wähle ABWECHSLUNGSREICH aus diesem Pool – nicht immer dieselben 4:
   LOKAL/STANDORT: Wo genau findet das Training statt? | Gibt es Parkmöglichkeiten / ÖPNV-Anbindung (nur wenn Daten vorhanden)?
   MODUL-TECHNISCH: Welche Techniken werden vertieft? | Was ist der Unterschied zu Grundlagenkursen? | Wie läuft ein typischer Trainingstag ab? | Was bringe ich mit?
   FÖRDERUNG/ORGANISATION: Wie lange dauert das Training? | In welcher Sprache (nur wenn Daten vorhanden)? | Wann kann ich starten? | Kann ich mehrere Module kombinieren?
   Mindestens 1 Frage LOKAL/STANDORT-BEZOGEN, mindestens 1 MODUL-TECHNISCH.
8. galerie_caption: 1 kurzer prägnanter Satz. Kombiniert konkret Modul-Ergebnis mit Stadt.
9. VARIATION: Kein wiederkehrender Eröffnungssatz über Seiten. Wechsle Satzstruktur, Einstiegsperspektive (Du-Ansprache, Frage, Situation, Einordnung). Jede Seite eigenständig.

OUTPUT: Nur valides JSON, kein Markdown, keine Kommentare:
{
  "intro": "...",
  "faq": [
    {"q": "...", "a": "..."},
    {"q": "...", "a": "..."},
    {"q": "...", "a": "..."},
    {"q": "...", "a": "..."}
  ],
  "galerie_caption": "..."
}`;
}

// ── Hauptfunktion ──────────────────────────────────────────────────────────────

async function main() {
  console.log('\n[gen-ausbildung] ═══ Start ═══');

  // Cache-Datei sicherstellen (muss vor dem Astro-Build existieren)
  if (!existsSync(CACHE_PATH)) {
    writeFileSync(CACHE_PATH, '{}', 'utf-8');
    console.log('[gen-ausbildung] Leere Cache-Datei angelegt.');
  }

  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[gen-ausbildung] WARN: Supabase-Vars fehlen → Generator übersprungen.');
    return;
  }
  if (!anthropicKey) {
    console.warn('[gen-ausbildung] WARN: ANTHROPIC_API_KEY nicht gesetzt → Generator übersprungen (vorhandener Cache wird genutzt).');
    return;
  }

  // Cache laden
  let cache = {};
  try {
    cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
    console.log(`[gen-ausbildung] Cache geladen: ${Object.keys(cache).length} Einträge`);
  } catch {
    cache = {};
  }

  const supabase  = createClient(supabaseUrl, supabaseKey);
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // Supabase-Daten holen (identische Query wie getStaticPaths)
  const { data: dozentinnen, error } = await supabase
    .from('dozentinnen')
    .select('slug, first_name, last_name, bio_short, cities(slug, name), dozentin_services(services(slug, avgs_eligible))')
    .eq('active', true);

  if (error || !dozentinnen) {
    console.error('[gen-ausbildung] Supabase-Fehler:', error?.message ?? 'keine Daten');
    return;
  }

  const serviceToModul = Object.fromEntries(
    Object.entries(MODUL_TO_SERVICE).map(([m, s]) => [s, m])
  );

  // pageMap aufbauen (identische Logik wie getStaticPaths)
  const pageMap = new Map(); // "modul/stadtSlug" → { modul, stadtSlug, dozentinnen[] }

  for (const d of dozentinnen) {
    const city = Array.isArray(d.cities) ? d.cities[0] : d.cities;
    if (!city?.slug) continue;
    const hubSlug = HUB_CITY_SLUG[d.slug] ?? city.slug;

    const dsRows = Array.isArray(d.dozentin_services) ? d.dozentin_services : [];
    for (const ds of dsRows) {
      const svc = Array.isArray(ds?.services) ? ds.services[0] : ds?.services;
      if (!svc?.slug || !svc?.avgs_eligible) continue;
      const modulSlug = serviceToModul[svc.slug];
      if (!modulSlug) continue;

      const key = `${modulSlug}/${hubSlug}`;
      if (!pageMap.has(key)) {
        pageMap.set(key, { modul: modulSlug, stadtSlug: hubSlug, dozentinnen: [] });
      }
      const entry = pageMap.get(key);
      if (!entry.dozentinnen.some(x => x.slug === d.slug)) {
        entry.dozentinnen.push({ slug: d.slug, first_name: d.first_name, last_name: d.last_name, bio_short: d.bio_short });
      }
    }
  }

  console.log(`[gen-ausbildung] ${pageMap.size} Seiten gefunden`);

  // ── Generierung: nur neue/geänderte Einträge ────────────────────────────────
  let genCount   = 0;
  let cacheCount = 0;
  let errCount   = 0;

  for (const [key, page] of pageMap) {
    const hashInput = {
      modul:      page.modul,
      stadtSlug:  page.stadtSlug,
      dozentinnen: page.dozentinnen.map(d => ({ slug: d.slug, bio_short: d.bio_short }))
        .sort((a, b) => a.slug.localeCompare(b.slug)),
    };
    const hval = inputHash(hashInput);

    if (cache[key]?.inputHash === hval && cache[key]?.intro) {
      cacheCount++;
      continue;
    }

    // Andere Module derselben Dozentin in derselben Stadt ermitteln
    const otherModuleDisplayNames = [];
    if (page.dozentinnen.length === 1) {
      const dozSlug = page.dozentinnen[0].slug;
      for (const [otherKey, otherPage] of pageMap) {
        if (otherKey !== key && otherPage.stadtSlug === page.stadtSlug &&
            otherPage.dozentinnen.some(d => d.slug === dozSlug)) {
          const dn = MODUL_INFO[otherPage.modul]?.display ?? otherPage.modul;
          otherModuleDisplayNames.push(dn);
        }
      }
    }

    console.log(`[gen-ausbildung] Generiere: ${key} …`);
    try {
      const prompt = buildPrompt(page.modul, page.stadtSlug, page.dozentinnen, otherModuleDisplayNames);
      const result = await callAI(anthropic, prompt);
      cache[key] = { inputHash: hval, ...result };
      genCount++;
      await delay(600);
    } catch (e) {
      console.error(`[gen-ausbildung] API-Fehler (${key}):`, e.message);
      errCount++;
    }
  }

  console.log(`[gen-ausbildung] Generiert: ${genCount}, Cache-Hits: ${cacheCount}, Fehler: ${errCount}`);

  // Zwischenspeichern (vor Gate-Regenerierung)
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');

  // ── Duplikat-Gate ────────────────────────────────────────────────────────────
  const MAX_PASSES = 3;
  const keys = [...pageMap.keys()].filter(k => cache[k]?.intro);

  console.log(`\n[gen-ausbildung] Duplikat-Gate: ${keys.length} Seiten, ${keys.length * (keys.length - 1) / 2} Paare …`);

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const trigrams = new Map();
    for (const k of keys) trigrams.set(k, wordTrigrams(pageText(cache[k])));

    const highPairs = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const sim = jaccard(trigrams.get(keys[i]), trigrams.get(keys[j]));
        if (sim >= 0.25) highPairs.push({ a: keys[i], b: keys[j], sim });
      }
    }

    if (highPairs.length === 0) {
      console.log(`[gen-ausbildung] Pass ${pass}: alle Paare unter 25% – Gate bestanden.`);
      break;
    }

    highPairs.sort((a, b) => b.sim - a.sim);
    console.log(`[gen-ausbildung] Pass ${pass}: ${highPairs.length} Paare ≥25%. Höchste: ${(highPairs[0].sim * 100).toFixed(1)}% (${highPairs[0].a} ↔ ${highPairs[0].b})`);

    let anyRegenerated = false;
    for (const pair of highPairs) {
      const pageB = pageMap.get(pair.b);
      if (!pageB) continue;

      const sharedSamples = [...trigrams.get(pair.a)]
        .filter(t => trigrams.get(pair.b).has(t))
        .slice(0, 6)
        .join('", "');

      const retryNote = `ACHTUNG REGENERIERUNG (Pass ${pass}): Dein Entwurf für /${pair.b}/ ist zu ähnlich zu /${pair.a}/ (Jaccard: ${(pair.sim * 100).toFixed(0)}%). Gemeinsame Trigrams: "${sharedSamples}". Schreibe KOMPLETT NEU: völlig andere Satzstruktur, andere Perspektive, andere Wortwahl, anderer Einstieg. Denk daran: KEINE individuellen Namen im Text. Das einzigartige Rückgrat dieser Seite: Modul ${MODUL_INFO[pageB.modul]?.display} in ${CITY_NAMES[pageB.stadtSlug]} – Technik-Schwerpunkt: ${MODUL_INFO[pageB.modul]?.technik?.split('.')[0]}.`;

      const otherModules = [];
      if (pageB.dozentinnen.length === 1) {
        const dozSlug = pageB.dozentinnen[0].slug;
        for (const [ok, op] of pageMap) {
          if (ok !== pair.b && op.stadtSlug === pageB.stadtSlug &&
              op.dozentinnen.some(d => d.slug === dozSlug)) {
            otherModules.push(MODUL_INFO[op.modul]?.display ?? op.modul);
          }
        }
      }

      console.log(`  Regeneriere ${pair.b} (${(pair.sim * 100).toFixed(0)}% zu ${pair.a}) …`);
      try {
        const prompt = buildPrompt(pageB.modul, pageB.stadtSlug, pageB.dozentinnen, otherModules);
        const result = await callAI(anthropic, prompt, retryNote);
        cache[pair.b] = { ...cache[pair.b], ...result };
        anyRegenerated = true;
        await delay(600);
      } catch (e) {
        console.error(`  Regenerierungs-Fehler (${pair.b}):`, e.message);
      }
    }

    if (!anyRegenerated) break;
  }

  // ── Abschluss-Bericht ────────────────────────────────────────────────────────
  const finalTrigrams = new Map();
  for (const k of keys) finalTrigrams.set(k, wordTrigrams(pageText(cache[k])));

  const allPairs = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const sim = jaccard(finalTrigrams.get(keys[i]), finalTrigrams.get(keys[j]));
      allPairs.push({ a: keys[i], b: keys[j], sim });
    }
  }
  allPairs.sort((a, b) => b.sim - a.sim);

  const maxSim     = allPairs[0]?.sim ?? 0;
  const above30    = allPairs.filter(p => p.sim >= 0.30);
  const above25    = allPairs.filter(p => p.sim >= 0.25);

  console.log('\n[gen-ausbildung] ═══ Gate-Report ═══');
  console.log(`Höchste Paar-Ähnlichkeit: ${(maxSim * 100).toFixed(1)}%  (${allPairs[0]?.a} ↔ ${allPairs[0]?.b})`);
  console.log(`Paare ≥25%: ${above25.length}  |  Paare ≥30% (Konsolidierung erwägen): ${above30.length}`);
  if (above30.length > 0) {
    console.log('Paare ≥30%:');
    for (const p of above30) {
      console.log(`  ${(p.sim * 100).toFixed(1)}%: ${p.a}  ↔  ${p.b}`);
    }
  }

  // Cache final speichern
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
  console.log(`\n[gen-ausbildung] Cache gespeichert → ${CACHE_PATH}`);
  console.log('[gen-ausbildung] ═══ Fertig ═══\n');
}

main().catch(e => {
  console.error('[gen-ausbildung] Kritischer Fehler (fail-soft, Build läuft weiter):', e.message);
  process.exit(0);
});
