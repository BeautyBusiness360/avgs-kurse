#!/usr/bin/env node
/**
 * Generates src/data/ratgeber-queue.json from the 20 theme templates × 5 modules matrix.
 * Run: node scripts/build-ratgeber-queue.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── 5 Modules ──────────────────────────────────────────────────────────────
const MODULES = [
  {
    slug: 'microblading',
    svc:  'microblading-masterclass',
    label: 'Microblading',
    hamDoz: 'carina-ambrosia-hamburg',
    hamDozName: 'Carina Ambrosia',
  },
  {
    slug: 'powderbrows',
    svc:  'powderbrows-ombrebrows-masterclass',
    label: 'Powder Brows & Ombré Brows',
    hamDoz: 'carina-ambrosia-hamburg',
    hamDozName: 'Carina Ambrosia',
  },
  {
    slug: 'velvet-lips',
    svc:  'velvet-lips-lipstick-masterclass',
    label: 'Velvet Lips & LipStick',
    hamDoz: 'carina-ambrosia-hamburg',
    hamDozName: 'Carina Ambrosia',
  },
  {
    slug: 'camouflage-removal',
    svc:  'camouflage-removal-masterclass',
    label: 'Camouflage & Removal',
    hamDoz: 'carina-ambrosia-hamburg',
    hamDozName: 'Carina Ambrosia',
  },
  {
    slug: 'wimpernverlaengerung',
    svc:  'wimpernverlaengerung-masterclass',
    label: 'Wimpernverlängerung',
    hamDoz: 'dunya-said-hamburg',
    hamDozName: 'Dunya Said',
  },
];

// ── 20 Theme templates ──────────────────────────────────────────────────────
// {modul} = module.slug, {Modul} = module.label
const THEMES = [
  {
    id: 1,
    slugTpl:   '{modul}-perfektionstraining',
    keyTpl:    '{Modul} Perfektionstraining',
    angleTpl:  'Pillar-Seite: Überblick für wen das Training geeignet ist, detaillierter Ablauf, AVGS-Förderung, warum ein Perfektionstraining statt eines Anfängerkurses. Diese Seite verlinkt alle anderen Ratgeber zum selben Modul.',
    isPillar:  true,
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 2,
    slugTpl:   '{modul}-ausbildung-kosten',
    keyTpl:    '{Modul} Ausbildung Kosten',
    angleTpl:  'Preise am Markt für {Modul}-Kurse und der 0-€-Weg über den AVGS. Vergleich Marktpreise vs. staatlich gefördert. Warum ein Perfektionstraining für Profis sinnvoller ist als ein teurer Anfängerkurs.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 3,
    slugTpl:   '{modul}-mit-avgs-foerderung',
    keyTpl:    '{Modul} AVGS Förderung',
    angleTpl:  'AVGS Schritt für Schritt erklärt: Voraussetzungen, Antrag, Bewilligung, Ablauf der Maßnahme. Wer hat Anspruch (Arbeitssuchende, Angestellte, Selbstständige)? Unterschied zum Bildungsgutschein.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 4,
    slugTpl:   '{modul}-haltbarkeit',
    keyTpl:    'Wie lange hält {Modul}',
    angleTpl:  'Haltbarkeit der {Modul}-Behandlung in der Praxis: Einflussfaktoren (Hauttyp, Pflege, Technik), typische Haltbarkeits-Erwartungen, Wann und warum eine Auffrischung nötig ist. Fachlicher Blickwinkel für bereits tätige Profis.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 5,
    slugTpl:   '{modul}-nachbehandlung-pflege',
    keyTpl:    '{Modul} Nachbehandlung Pflege',
    angleTpl:  'Heilungsprozess nach der {Modul}-Behandlung: was in den ersten Wochen passiert, Do\'s & Don\'ts für die Kundin, wie die Fachkraft den Prozess richtig begleitet. Perspektive der behandelnden Kosmetikerin.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 6,
    slugTpl:   '{modul}-fehler-vermeiden',
    keyTpl:    '{Modul} Fehler vermeiden',
    angleTpl:  'Die häufigsten Fehler bei {Modul}-Behandlungen (Technik, Pigmentwahl, Nachsorge) und wie das Perfektionstraining genau diese behebt. Praxisnahe Fehleranalyse für erfahrene Kosmetikerinnen.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 7,
    slugTpl:   '{modul}-weiterbildung-kosmetikerin',
    keyTpl:    '{Modul} Weiterbildung Kosmetikerin',
    angleTpl:  'Für bereits ausgebildete Kosmetikerinnen: Warum lohnt sich eine {Modul}-Weiterbildung? Wie wertet man sein Leistungsportfolio auf, was unterscheidet eine gute von einer sehr guten Fachkraft, und wie kommt man über AVGS kostenlos an eine Profi-Weiterbildung.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 8,
    slugTpl:   'mit-{modul}-selbststaendig-machen',
    keyTpl:    '{Modul} selbstständig machen',
    angleTpl:  'Mit {Modul} in die Selbstständigkeit: Was braucht man wirklich (Ausrüstung, Zertifikate, Rechtliches), welche Einnahmen sind realistisch, und wie hilft das Perfektionstraining beim Einstieg oder beim Qualitätssprung.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 9,
    slugTpl:   '{modul}-verdienst-preise',
    keyTpl:    '{Modul} Preise Verdienst',
    angleTpl:  'Was können Fachkräfte für {Modul}-Behandlungen verlangen? Kalkulation und Preisgestaltung, Positionierungsstrategie (Einstiegs- vs. Premium-Preise), und wie ein nachweisbares Perfektionstraining die eigene Preismacht steigert.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 10,
    slugTpl:   '{modul}-auffrischung',
    keyTpl:    '{Modul} Auffrischung',
    angleTpl:  'Die {Modul}-Auffrischungsbehandlung als Umsatzquelle: Wann ist sie fällig, was ist zu beachten, wie kommuniziert man sie zur Kundin, und wie trainiert man die Auffrischungstechnik gezielt im Perfektionstraining.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 11,
    slugTpl:   '{modul}-fuer-anfaenger-vs-profis',
    keyTpl:    '{Modul} Fortgeschrittene Unterschied',
    angleTpl:  'Unterschied zwischen einem Anfängerkurs und einem Perfektionstraining für {Modul}: Was lernt man in welcher Phase, warum ist ein Anfängerkurs keine Weiterbildung für Profis, und woran erkennt man ein wirklich gutes Fortgeschrittenen-Angebot.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 12,
    slugTpl:   '{modul}-hauttypen',
    keyTpl:    '{Modul} Hauttypen',
    angleTpl:  'Wie verändert sich die {Modul}-Technik je nach Hauttyp? Fettige Haut, trockene Haut, reife Haut, sensible Haut – fachliche Unterschiede in Pigmentwahl, Technik und Heilungserwartung. Für erfahrene Fachkräfte, die ihre Anpassungsfähigkeit ausbauen.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 13,
    slugTpl:   '{modul}-zertifikat-anerkennung',
    keyTpl:    '{Modul} Zertifikat Anerkennung',
    angleTpl:  'Welches {Modul}-Zertifikat zählt wirklich? Unterschied zwischen Zertifikaten von Online-Kursen, Produktherstellern, und AZAV-zugelassenen Bildungsträgern. Warum ein anerkanntes Zertifikat Kundinnen überzeugt und rechtliche Sicherheit gibt.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 14,
    slugTpl:   '{modul}-online-vs-praesenz',
    keyTpl:    '{Modul} online lernen',
    angleTpl:  'Online-Kurs vs. Präsenztraining bei {Modul}: Was kann man wirklich online lernen, was geht nur in der Praxis, und warum ist Praxis am Kundenmodell durch nichts zu ersetzen. Kritische Analyse für Profis, die eine Weiterbildung planen.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 15,
    slugTpl:   '{modul}-trends',
    keyTpl:    '{Modul} Trends aktuell',
    angleTpl:  'Aktuelle Trends und Techniken bei {Modul}: Welche Stile sind gefragt, was wollen Kundinnen, welche Technik-Varianten setzen sich durch. Fachlich gehaltener Überblick für Profis, die am Puls der Zeit bleiben wollen.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 16,
    slugTpl:   '{modul}-kundengewinnung-marketing',
    keyTpl:    '{Modul} Kunden gewinnen Marketing',
    angleTpl:  'Marketing und Kundengewinnung für {Modul}-Fachkräfte: Wie man das eigene Portfolio präsentiert, welche Kanäle funktionieren, und wie die 10 UE Marketing & Vertrieb aus dem Perfektionstraining direkt in die Praxis umgesetzt werden können.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
  },
  {
    id: 17,
    slugTpl:   '{modul}-perfektionstraining-hamburg',
    keyTpl:    '{Modul} Kurs Hamburg',
    angleTpl:  'Stadtseite Hamburg: {Modul} Perfektionstraining in Hamburg – lokal, AVGS-gefördert, mit der Hamburger Dozentin. Details zum Standort Hamburg, warum Hamburg ein starker Markt für Beauty-Dienstleistungen ist, und wie man sich anmeldet.',
    citySlug:  'hamburg',
    cityLabel: 'Hamburg',
    isCity:    true,
  },
];

// City entries for Berlin / Essen / Ulm – relatedDozentin must be filled in manually
// or via a Supabase lookup before running the pipeline
const CITY_EXTRAS = [
  { id: 18, slugTpl: '{modul}-perfektionstraining-berlin', keyTpl: '{Modul} Kurs Berlin',
    angleTpl: 'Stadtseite Berlin: {Modul} Perfektionstraining in Berlin – lokal, AVGS-gefördert, Dozentin vor Ort. Details zum Berliner Markt und zur Anmeldung.',
    citySlug: 'berlin', cityLabel: 'Berlin', isCity: true, requiresLookup: true },
  { id: 19, slugTpl: '{modul}-perfektionstraining-essen', keyTpl: '{Modul} Kurs Essen',
    angleTpl: 'Stadtseite Essen: {Modul} Perfektionstraining in Essen – lokal, AVGS-gefördert, Dozentin vor Ort. Details zum Essener Markt und zur Anmeldung.',
    citySlug: 'essen', cityLabel: 'Essen', isCity: true, requiresLookup: true },
  { id: 20, slugTpl: '{modul}-perfektionstraining-ulm', keyTpl: '{Modul} Kurs Ulm',
    angleTpl: 'Stadtseite Ulm: {Modul} Perfektionstraining in Ulm – lokal, AVGS-gefördert, Dozentin vor Ort. Details zum Ulmer Markt und zur Anmeldung.',
    citySlug: 'ulm', cityLabel: 'Ulm', isCity: true, requiresLookup: true },
];

const ALL_THEMES = [...THEMES, ...CITY_EXTRAS];

// ── Generate entries ─────────────────────────────────────────────────────────
const entries = [];

for (const theme of ALL_THEMES) {
  for (const mod of MODULES) {
    const slug    = theme.slugTpl.replace(/{modul}/g, mod.slug);
    const keyword = theme.keyTpl.replace(/{Modul}/g, mod.label);
    const angle   = theme.angleTpl.replace(/{Modul}/g, mod.label).replace(/{modul}/g, mod.slug);

    entries.push({
      slug,
      modul:          mod.slug,
      modulServiceSlug: mod.svc,
      modulLabel:     mod.label,
      themeId:        theme.id,
      isPillar:       theme.isPillar ?? false,
      isCity:         theme.isCity ?? false,
      keyword,
      angle,
      relatedDozentin:     theme.requiresLookup ? null : mod.hamDoz,
      relatedDozentinName: theme.requiresLookup ? null : mod.hamDozName,
      relatedCity:    theme.citySlug,
      relatedCityLabel: theme.cityLabel,
      requiresLookup: theme.requiresLookup ?? false,
    });
  }
}

// ── Write output ─────────────────────────────────────────────────────────────
const outPath = path.join(ROOT, 'src/data/ratgeber-queue.json');
fs.writeFileSync(outPath, JSON.stringify(entries, null, 2) + '\n', 'utf8');

console.log(`✅ ratgeber-queue.json: ${entries.length} Einträge geschrieben`);
console.log(`   Hamburg (direkt):     ${entries.filter(e => !e.requiresLookup).length}`);
console.log(`   requiresLookup:       ${entries.filter(e => e.requiresLookup).length}`);
