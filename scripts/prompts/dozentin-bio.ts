// TASK 28 — Prompt Template: Dozentin Bio Erweiterung
// Input: name, city, services[], rating, reviewCount
// Output: 120–150 Wörter, professionell, lokal, conversion-orientiert

export interface DozentinBioContext {
  firstName:   string;
  lastName:    string;
  city:        string;
  services:    string[];
  rating?:     number;
  reviewCount?: number;
}

export function getDozentinBioPrompt(ctx: DozentinBioContext): string {
  const ratingLine = ctx.rating && ctx.reviewCount
    ? `Bewertung: ${ctx.rating}/5 aus ${ctx.reviewCount} Bewertungen.`
    : '';

  const serviceList = ctx.services.join(', ');

  return `
Schreibe einen professionellen Bio-Absatz (120–150 Wörter) für eine Dozentin.

Person: ${ctx.firstName} ${ctx.lastName}
Stadt: ${ctx.city}
Spezialisierungen: ${serviceList}
${ratingLine}

Anforderungen:
- Professionell und vertrauenswürdig
- Lokal relevant (${ctx.city} erwähnen)
- Conversion-orientiert: Leserin soll Kontakt aufnehmen wollen
- AVGS-Förderung subtil erwähnen
- Keine Übertreibungen, keine Superlative
- Schreibe aus der Ich-Perspektive der Dozentin NICHT, sondern über sie

Format: ein Fließtext-Absatz, kein Markdown, kein HTML.
Sprache: Deutsch.
  `.trim();
}
