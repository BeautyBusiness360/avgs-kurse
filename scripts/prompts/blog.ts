// TASK 29 — Prompt Template: Blog-Artikel (AVGS + Leistung + Stadt)
// Output: 600–800 Wörter, HTML (kein Markdown), DB-ready

export interface BlogContext {
  keyword:  string;
  city:     string;
  service:  string;
  avgsInfo: string;
}

export function getBlogPrompt(ctx: BlogContext): string {
  return `
Schreibe einen vollständigen Blog-Artikel auf Deutsch.

Hauptkeyword: "${ctx.keyword}"
Ort: ${ctx.city}
Thema/Service: ${ctx.service}
AVGS-Info: ${ctx.avgsInfo}

Länge: 600–800 Wörter.

Struktur (HTML-formatiert, KEIN Markdown):
1. <h1> mit Hauptkeyword
2. Einleitungsabsatz (2–3 Sätze, Keyword natürlich einbauen)
3. <h2>Was ist ${ctx.service}?</h2> + Erklär-Absatz
4. <h2>Warum in ${ctx.city}?</h2> + lokaler Absatz
5. <h2>AVGS-Förderung: So funktioniert es</h2> + Erklärung der Förderung
6. <h2>Häufige Fragen</h2> + 3 FAQ als <p><strong>Frage</strong></p><p>Antwort</p>
7. <h2>Jetzt kostenfreie Unterlagen anfordern</h2> + CTA-Absatz

Anforderungen:
- Reines HTML: <h1>, <h2>, <p>, <strong> erlaubt — kein Markdown, kein CSS
- Keyword mindestens 4x natürlich einbauen
- Professionell, informativ, conversion-orientiert
- Keine erfundenen Fakten, keine Preisangaben
- Zielgruppe: erfahrene Kosmetikerinnen/PMU-Artists

Gib NUR den HTML-Inhalt zurück, ohne <!DOCTYPE> oder <html> tags.
  `.trim();
}
