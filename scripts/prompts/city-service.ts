// TASK 27 — 5 Prompt-Varianten für City × Service Intro-Text
// Variante wird deterministisch bestimmt: (city.id + service.id) % 5

export interface CityServiceContext {
  city:             string;
  cityId:           string;
  service:          string;
  serviceId:        string;
  dozentinnenCount: number;
  avgsInfo:         string;
}

// Deterministischer Varianten-Index (kein Random)
function variantIndex(cityId: string, serviceId: string): 0 | 1 | 2 | 3 | 4 {
  const hash = [...cityId, ...serviceId].reduce(
    (acc, c) => (acc + c.charCodeAt(0)) % 5, 0
  );
  return hash as 0 | 1 | 2 | 3 | 4;
}

const variants: Array<(ctx: CityServiceContext) => string> = [
  // Variante 0 — Informativ, sachlich
  (ctx) => `
Schreibe einen 80–100 Wörter langen SEO-Einleitungstext für eine Landing Page.
Thema: ${ctx.service} Kurse in ${ctx.city}.
Fakten: ${ctx.dozentinnenCount} Dozentinnen verfügbar. ${ctx.avgsInfo}
Ton: informativ, sachlich, vertrauenswürdig.
Format: ein Fließtext-Absatz, kein Markdown, kein HTML.
Schreibe auf Deutsch.
  `.trim(),

  // Variante 1 — Conversion-fokussiert, direkte Ansprache
  (ctx) => `
Schreibe einen 80–100 Wörter langen Einleitungstext im Direct-Response-Stil.
Thema: ${ctx.service} Training in ${ctx.city} – AVGS-gefördert.
Fakten: ${ctx.dozentinnenCount} zertifizierte Expertinnen. ${ctx.avgsInfo}
Ton: direkt, handlungsauffordernd, Du-Form.
Format: ein Absatz, kein Markdown, kein HTML.
Schreibe auf Deutsch.
  `.trim(),

  // Variante 2 — Emotional, motivierend
  (ctx) => `
Schreibe einen 80–100 Wörter langen emotionalen Einleitungstext.
Thema: ${ctx.service} Weiterbildung in ${ctx.city}.
Botschaft: Karrierechance, staatlich gefördert, keine Kosten. ${ctx.avgsInfo}
Ton: inspirierend, motivierend, persönlich.
Zielgruppe: erfahrene Kosmetikerinnen die sich weiterentwickeln möchten.
Format: ein Absatz, kein Markdown, kein HTML. Deutsch.
  `.trim(),

  // Variante 3 — Lokal + SEO-optimiert
  (ctx) => `
Schreibe einen SEO-optimierten Einleitungstext (80–100 Wörter) für Google.
Haupt-Keyword: "${ctx.service} ${ctx.city}".
Fakten: ${ctx.dozentinnenCount} Anbieter. ${ctx.avgsInfo}
Anforderungen: Keyword natürlich 2x einbauen, lokale Relevanz betonen.
Format: ein Absatz, kein Markdown, kein HTML. Deutsch.
  `.trim(),

  // Variante 4 — Frage-basiert, neugierig machend
  (ctx) => `
Schreibe einen Einleitungstext (80–100 Wörter) der mit einer Frage beginnt.
Thema: Kostenfreies ${ctx.service} Training in ${ctx.city}.
Kontext: ${ctx.dozentinnenCount} Dozentinnen, vollständig AVGS-gefördert. ${ctx.avgsInfo}
Ton: neugierig, gesprächig, einladend.
Format: beginnt mit einer rhetorischen Frage, dann 1 Absatz. Kein Markdown, kein HTML. Deutsch.
  `.trim(),
];

export function getCityServicePrompt(ctx: CityServiceContext): string {
  const idx = variantIndex(ctx.cityId, ctx.serviceId);
  return variants[idx](ctx);
}
