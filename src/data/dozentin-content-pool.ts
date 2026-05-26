// =============================================================
//  dozentin-content-pool.ts
//  Zentraler Content-Pool für alle Dozentinnen-Seiten.
//  Ziel: Duplicate Content vermeiden, indem jede Dozentin eine
//  eigene, feste (deterministische) Auswahl aus FAQ + Bio erhält.
//
//  Platzhalter in den Texten:
//    {name}    -> voller Name der Dozentin
//    {stadt}   -> Stadt
//    {service} -> Haupt-Dienstleistung (z.B. "Wimpernverlängerung")
//
//  Verwendung in [slug].astro:
//    import { getDozentinFaqs, getDozentinBio } from '../../data/dozentin-content-pool';
//    const faqs = getDozentinFaqs(dozentin.slug, { name: fullName, stadt: city.name, service: primaryService });
//    const bioText = getDozentinBio(dozentin.slug, { name: fullName, stadt: city.name, service: primaryService });
// =============================================================

export interface FaqItem {
  frage: string;
  antwort: string;
}

interface Vars {
  name: string;
  stadt: string;
  service: string;
}

// -------------------- FAQ-POOL (50) --------------------
export const faqPool: FaqItem[] = [
  { frage: "Für wen ist das Perfektionstraining bei {name} geeignet?", antwort: "Das Training richtet sich ausschließlich an erfahrene Teilnehmerinnen aus der Beauty-Branche. Voraussetzung ist, dass bereits praktische Kenntnisse im Bereich {service} vorhanden sind. Das Angebot dient der fachlichen Vertiefung und Spezialisierung." },
  { frage: "Kann ich als Anfängerin am Training teilnehmen?", antwort: "Nein, die Trainings von {name} sind keine Einsteigerkurse. Die Inhalte bauen auf vorhandener Praxiserfahrung im Bereich {service} auf. Ziel ist die professionelle Weiterentwicklung bereits tätiger Beauty-Expertinnen." },
  { frage: "Was kostet das Training bei {name}?", antwort: "Mit einem gültigen AVGS-Gutschein können die Kosten vollständig übernommen werden. Teilnehmerinnen aus {stadt} und Umgebung erhalten dadurch die Möglichkeit, sich professionell weiterzubilden. Ohne Förderung beraten wir gerne individuell zu den Möglichkeiten." },
  { frage: "Was ist ein AVGS-Gutschein?", antwort: "Der Aktivierungs- und Vermittlungsgutschein ist eine Förderung der Agentur für Arbeit oder des Jobcenters. Damit können qualifizierte Weiterbildungen wie das Perfektionstraining bei {name} finanziert werden. Die Bewilligung erfolgt durch die zuständige Stelle." },
  { frage: "Wie läuft die Anmeldung zum Training ab?", antwort: "Nach der Kontaktaufnahme erfolgt zunächst eine persönliche Beratung. Dabei wird geprüft, ob bereits Erfahrung im Bereich {service} vorhanden ist. Anschließend unterstützen wir bei den weiteren Schritten zur Anmeldung." },
  { frage: "Welche Inhalte werden im Perfektionstraining vermittelt?", antwort: "Die Inhalte orientieren sich an fortgeschrittenen Techniken, Präzision und professionellen Arbeitsabläufen. {name} vermittelt praxisnahes Wissen rund um {service}. Zusätzlich werden häufig Themen wie Hygiene, Kundenberatung und Fehlerkorrektur behandelt." },
  { frage: "Wie lange dauert das Training?", antwort: "Die Dauer kann je nach Schwerpunkt und individuellem Trainingsumfang variieren. In der Regel handelt es sich um intensive Praxiseinheiten mit Fokus auf Qualität und Technik. Genauere Informationen erhalten Teilnehmerinnen direkt bei der Beratung." },
  { frage: "Erhalte ich nach Abschluss ein Zertifikat?", antwort: "Ja, nach erfolgreicher Teilnahme wird ein Zertifikat ausgestellt. Dieses bestätigt die absolvierte Weiterbildung im Bereich {service}. Viele Teilnehmerinnen nutzen das Zertifikat zur professionellen Positionierung gegenüber Kundinnen." },
  { frage: "Findet das Training praxisorientiert statt?", antwort: "Ja, der Fokus liegt klar auf der praktischen Anwendung. {name} arbeitet mit realitätsnahen Übungen und individueller Begleitung. Ziel ist es, bestehende Fähigkeiten gezielt zu perfektionieren." },
  { frage: "Gibt es eine individuelle Betreuung während des Trainings?", antwort: "Die Teilnehmerinnen werden persönlich begleitet und erhalten direktes Feedback zu ihrer Technik. Dadurch kann gezielt an Schwächen gearbeitet werden. Besonders im Bereich {service} ist die individuelle Korrektur ein wichtiger Bestandteil." },
  { frage: "Kann ich das Training auch neben meiner Tätigkeit absolvieren?", antwort: "Viele Teilnehmerinnen arbeiten bereits aktiv in der Beauty-Branche. Je nach Organisation des Trainings sind flexible Lösungen möglich. Details dazu bespricht {name} individuell mit jeder Teilnehmerin." },
  { frage: "Welche Voraussetzungen muss ich erfüllen?", antwort: "Wichtig ist praktische Erfahrung im Beauty-Bereich und bereits vorhandenes Fachwissen. Das Training bei {name} richtet sich ausdrücklich an fortgeschrittene Teilnehmerinnen. Anfängerkenntnisse reichen hierfür nicht aus." },
  { frage: "Wird im Training auf aktuelle Beauty-Trends eingegangen?", antwort: "Ja, moderne Techniken und aktuelle Entwicklungen spielen eine wichtige Rolle. {name} legt Wert darauf, dass Teilnehmerinnen ihr Angebot zeitgemäß weiterentwickeln können. Dadurch bleibt das Wissen praxisnah und marktorientiert." },
  { frage: "Kann ich den AVGS auch nutzen, wenn ich bereits selbstständig bin?", antwort: "Das hängt von der individuellen Situation und der Entscheidung der zuständigen Behörde ab. In vielen Fällen ist eine Förderung möglich, wenn bestimmte Voraussetzungen erfüllt werden. Eine persönliche Beratung hilft bei der Einschätzung." },
  { frage: "Was sollte ich zum Training mitbringen?", antwort: "Je nach Schwerpunkt werden bestimmte Arbeitsmaterialien empfohlen. Genauere Informationen erhalten Teilnehmerinnen vor Beginn des Trainings. Wichtig ist vor allem die Bereitschaft, aktiv praktisch zu arbeiten." },
  { frage: "Wo findet das Perfektionstraining statt?", antwort: "Die Trainings werden in {stadt} durchgeführt und sind speziell auf professionelle Beauty-Dienstleistungen ausgerichtet. Die Lernumgebung ist praxisnah gestaltet. Dadurch können Techniken direkt unter realistischen Bedingungen geübt werden." },
  { frage: "Ist das Training eher theoretisch oder praktisch aufgebaut?", antwort: "Der Schwerpunkt liegt eindeutig auf der praktischen Umsetzung. Theorie wird gezielt eingesetzt, um Techniken und Abläufe besser zu verstehen. Im Mittelpunkt steht jedoch die professionelle Anwendung im Bereich {service}." },
  { frage: "Warum richtet sich das Training nur an erfahrene Teilnehmerinnen?", antwort: "Die Inhalte gehen deutlich über Grundlagenwissen hinaus. {name} arbeitet mit fortgeschrittenen Techniken, die bereits praktische Erfahrung voraussetzen. So kann die Trainingszeit gezielt für echte Weiterentwicklung genutzt werden." },
  { frage: "Kann ich meine Technik während des Trainings verbessern?", antwort: "Genau darauf ist das Perfektionstraining ausgelegt. Teilnehmerinnen erhalten konkrete Hinweise zur Optimierung ihrer Arbeitsweise. Ziel ist eine präzisere, sicherere und professionellere Umsetzung im Bereich {service}." },
  { frage: "Wie unterstützt mich {name} während des Lernprozesses?", antwort: "{name} begleitet die Teilnehmerinnen mit fachlichem Feedback und praxisnahen Korrekturen. Individuelle Fragen werden direkt im Training behandelt. Dadurch entsteht eine intensive Lernatmosphäre mit persönlicher Betreuung." },
  { frage: "Ist das Training für Quereinsteiger geeignet?", antwort: "Nein, ohne praktische Vorerfahrung ist das Training nicht geeignet. Die Weiterbildung baut auf bestehenden Kenntnissen im Beauty-Bereich auf. Teilnehmerinnen sollten bereits aktiv mit {service} gearbeitet haben." },
  { frage: "Welche Ziele verfolgt das Perfektionstraining?", antwort: "Im Fokus stehen Qualitätssteigerung, Technikverbesserung und professionelles Arbeiten. Teilnehmerinnen sollen ihre Fähigkeiten gezielt ausbauen und sicherer anwenden können. Besonders wichtig ist die Optimierung bestehender Praxiskenntnisse." },
  { frage: "Kann ich mich vorab beraten lassen?", antwort: "Ja, vor der Anmeldung findet in der Regel ein persönliches Beratungsgespräch statt. Dabei wird geprüft, ob das Training zu den vorhandenen Erfahrungen passt. Gleichzeitig können offene Fragen zur Förderung geklärt werden." },
  { frage: "Wie praxisnah ist das Training bei {name}?", antwort: "Die Inhalte sind direkt auf den Berufsalltag in der Beauty-Branche abgestimmt. {name} vermittelt Techniken und Abläufe, die sofort im Studioalltag angewendet werden können. Dadurch profitieren Teilnehmerinnen unmittelbar von der Weiterbildung." },
  { frage: "Welche Vorteile bietet ein gefördertes Perfektionstraining?", antwort: "Teilnehmerinnen können ihre fachlichen Fähigkeiten erweitern, ohne die Weiterbildungskosten selbst tragen zu müssen. Gleichzeitig verbessert sich häufig die berufliche Positionierung im Beauty-Markt. Besonders erfahrene Fachkräfte profitieren von einer gezielten Spezialisierung." },
  { frage: "Kann ich meine Fragen während des Trainings jederzeit stellen?", antwort: "Ja, individuelle Rückfragen sind ausdrücklich erwünscht. {name} legt Wert auf eine persönliche und offene Lernatmosphäre. Dadurch können Unsicherheiten direkt geklärt werden." },
  { frage: "Wird im Training auf Hygiene und Professionalität eingegangen?", antwort: "Ja, professionelle Standards gehören zu den zentralen Bestandteilen des Trainings. Neben Technik spielt auch ein hygienisches und kundenorientiertes Arbeiten eine wichtige Rolle. Das ist besonders im Bereich {service} entscheidend." },
  { frage: "Kann ich das Training nutzen, um mein Angebot zu erweitern?", antwort: "Viele Teilnehmerinnen nutzen die Weiterbildung, um ihre bestehende Dienstleistung professionell auszubauen. Das Training hilft dabei, neue Techniken sicherer umzusetzen. Dadurch kann das eigene Leistungsangebot gezielt aufgewertet werden." },
  { frage: "Ist die Teilnehmerzahl begrenzt?", antwort: "Kleinere Gruppen ermöglichen häufig eine intensivere Betreuung. Dadurch kann {name} individueller auf die Teilnehmerinnen eingehen. Genauere Informationen zur Gruppengröße werden bei der Beratung besprochen." },
  { frage: "Wie hilft mir das Training beruflich weiter?", antwort: "Durch die Vertiefung bestehender Kenntnisse können Teilnehmerinnen ihre Arbeit professioneller und sicherer ausführen. Das stärkt häufig auch das Vertrauen der Kundinnen. Gleichzeitig kann sich die Qualität der Ergebnisse deutlich verbessern." },
  { frage: "Welche Themen werden zusätzlich zur Technik behandelt?", antwort: "Neben der praktischen Arbeit werden oft auch Beratung, Kundenumgang und professionelle Abläufe thematisiert. Ziel ist ein ganzheitlicher Blick auf den Berufsalltag. Dadurch profitieren Teilnehmerinnen nicht nur technisch." },
  { frage: "Kann ich mich auch aus einer anderen Stadt anmelden?", antwort: "Ja, grundsätzlich können sich auch Teilnehmerinnen außerhalb von {stadt} bewerben. Wichtig ist vor allem die passende berufliche Erfahrung im Bereich {service}. Die Fördermöglichkeiten sollten vorab individuell geprüft werden." },
  { frage: "Wie intensiv ist das Training aufgebaut?", antwort: "Das Training ist bewusst kompakt und praxisorientiert gestaltet. Teilnehmerinnen arbeiten gezielt an ihrer Technik und erhalten direktes Feedback. Dadurch entsteht ein intensiver Lernprozess mit klarem Fokus auf Qualität." },
  { frage: "Warum ist praktische Erfahrung so wichtig?", antwort: "Die Inhalte setzen voraus, dass grundlegende Techniken bereits sicher beherrscht werden. Nur so kann im Training gezielt auf Feinheiten und professionelle Optimierung eingegangen werden. Das Niveau richtet sich klar an Fortgeschrittene." },
  { frage: "Wie läuft die Förderung über das Jobcenter oder die Agentur für Arbeit?", antwort: "Nach einem Beratungsgespräch kann ein AVGS-Gutschein beantragt werden. Wird dieser bewilligt, können die Weiterbildungskosten übernommen werden. {name} unterstützt Teilnehmerinnen gerne bei den notwendigen Informationen." },
  { frage: "Kann ich mich auf bestimmte Techniken spezialisieren?", antwort: "Je nach Schwerpunkt des Trainings können gezielt bestimmte Bereiche vertieft werden. Besonders erfahrene Teilnehmerinnen profitieren von spezialisierten Inhalten. Ziel ist die qualitative Weiterentwicklung im Bereich {service}." },
  { frage: "Wie unterscheidet sich das Training von einem klassischen Kurs?", antwort: "Das Perfektionstraining richtet sich nicht an Anfängerinnen, sondern an bereits aktive Fachkräfte. Statt Grundlagen stehen Optimierung, Präzision und professionelle Weiterentwicklung im Mittelpunkt. Dadurch ist das Niveau deutlich anspruchsvoller." },
  { frage: "Welche Rolle spielt die praktische Übung im Training?", antwort: "Praktische Anwendung ist der zentrale Bestandteil der Weiterbildung. Teilnehmerinnen arbeiten aktiv an ihrer Technik und erhalten direkte Korrekturen. So können Verbesserungen unmittelbar umgesetzt werden." },
  { frage: "Kann ich nach dem Training sicherer arbeiten?", antwort: "Viele Teilnehmerinnen berichten von mehr Sicherheit und Präzision nach der Weiterbildung. Durch intensives Feedback und praktische Übungen werden bestehende Fähigkeiten gefestigt. Besonders im Bereich {service} ist Routine entscheidend." },
  { frage: "Wird auf individuelle Schwächen eingegangen?", antwort: "Ja, die persönliche Betreuung ermöglicht gezielte Korrekturen und individuelle Unterstützung. {name} analysiert bestehende Techniken und gibt praxisnahe Verbesserungsvorschläge. Dadurch entsteht ein effektiver Lernprozess." },
  { frage: "Kann ich das Training auch zur Qualitätssteigerung nutzen?", antwort: "Genau dafür wurde das Perfektionstraining entwickelt. Ziel ist es, professionelle Standards weiter auszubauen und Ergebnisse zu optimieren. Teilnehmerinnen arbeiten gezielt an Präzision und Technik." },
  { frage: "Welche Vorteile bietet die Weiterbildung für Beauty-Profis?", antwort: "Erfahrene Fachkräfte können ihre Kenntnisse aktualisieren und ihre Technik weiter verfeinern. Gleichzeitig stärkt eine professionelle Weiterbildung häufig die Positionierung am Markt. Das Training unterstützt dabei, sich qualitativ weiterzuentwickeln." },
  { frage: "Ist das Training auf moderne Arbeitsweisen ausgerichtet?", antwort: "Ja, aktuelle Anforderungen aus der Beauty-Branche werden berücksichtigt. {name} vermittelt praxisnahe Inhalte, die sich am professionellen Studioalltag orientieren. Dadurch bleiben die Trainings relevant und zeitgemäß." },
  { frage: "Wie persönlich ist die Betreuung im Training?", antwort: "Die Teilnehmerinnen erhalten individuelles Feedback und direkte Unterstützung während der Praxisphasen. Das ermöglicht eine gezielte Weiterentwicklung der eigenen Technik. Besonders fortgeschrittene Teilnehmerinnen profitieren davon." },
  { frage: "Kann ich das Training mit einem bestehenden Studio kombinieren?", antwort: "Viele Teilnehmerinnen arbeiten bereits aktiv in ihrem eigenen oder einem bestehenden Studio. Das Training dient dazu, vorhandene Fähigkeiten professionell auszubauen. Dadurch lassen sich neue Techniken oft direkt im Alltag anwenden." },
  { frage: "Warum lohnt sich eine Spezialisierung im Bereich {service}?", antwort: "Spezialisierte Fachkenntnisse können helfen, die eigene Qualität und Professionalität sichtbar zu steigern. Kundinnen achten zunehmend auf präzise und hochwertige Ergebnisse. Eine gezielte Weiterbildung unterstützt dabei, sich fachlich weiterzuentwickeln." },
  { frage: "Wie professionell ist das Lernumfeld?", antwort: "Das Training ist auf professionelle Beauty-Dienstleistungen ausgerichtet und praxisnah organisiert. Teilnehmerinnen arbeiten in einer Umgebung, die den Studioalltag realistisch abbildet. Dadurch entsteht ein effektives und fokussiertes Lernen." },
  { frage: "Kann ich mich vor der Anmeldung über die Inhalte informieren?", antwort: "Ja, vor Beginn erhalten Interessentinnen Informationen zum Ablauf und den Trainingsschwerpunkten. So kann geprüft werden, ob das Angebot zu den eigenen Zielen passt. Besonders wichtig ist die vorhandene Erfahrung im Bereich {service}." },
  { frage: "Wird im Training auf Präzision und Detailarbeit geachtet?", antwort: "Ja, gerade im Beauty-Bereich spielt sauberes und präzises Arbeiten eine zentrale Rolle. {name} legt deshalb großen Wert auf professionelle Techniken und genaue Umsetzung. Kleine Details können oft den größten Unterschied machen." },
  { frage: "Welche Teilnehmerinnen profitieren besonders vom Training?", antwort: "Das Angebot richtet sich an erfahrene Beauty-Profis, die ihre Qualität gezielt verbessern möchten. Besonders Teilnehmerinnen mit praktischer Erfahrung im Bereich {service} profitieren von den vertiefenden Inhalten. Anfängerinnen sind nicht die Zielgruppe dieses Trainings." },
];

// -------------------- BIO-POOL (25) --------------------
export const bioPool: string[] = [
  "{name} ist erfahrene Expertin im Bereich {service} und begleitet Teilnehmerinnen auf ihrem Weg zur fachlichen Weiterentwicklung. In {stadt} vermittelt sie praxisnahes Wissen mit Fokus auf Präzision, Qualität und professionelle Umsetzung.",
  "{name} unterstützt erfahrene Beauty-Profis dabei, ihre Fähigkeiten im Bereich {service} gezielt zu perfektionieren. Ihr Training in {stadt} verbindet praktische Erfahrung mit individueller Betreuung.",
  "Als Dozentin für {service} legt {name} besonderen Wert auf praxisorientiertes Lernen und professionelle Standards. Teilnehmerinnen aus {stadt} profitieren von ihrem klar strukturierten und persönlichen Trainingsansatz.",
  "{name} begleitet erfahrene Teilnehmerinnen dabei, ihre Technik im Bereich {service} auf ein neues Niveau zu bringen. Ihr Fokus liegt auf Qualität, Präzision und praxisnaher Weiterbildung in {stadt}.",
  "Mit ihrer Erfahrung im Bereich {service} vermittelt {name} fundierte Kenntnisse für fortgeschrittene Beauty-Profis. In {stadt} schafft sie eine professionelle Lernatmosphäre mit individueller Unterstützung.",
  "{name} steht für praxisnahe Weiterbildung und professionelle Entwicklung im Bereich {service}. Teilnehmerinnen in {stadt} profitieren von ihrem fachlichen Know-how und ihrer persönlichen Betreuung.",
  "Im Mittelpunkt der Arbeit von {name} steht die gezielte Weiterentwicklung erfahrener Fachkräfte im Bereich {service}. Ihr Training in {stadt} ist praxisorientiert, modern und professionell aufgebaut.",
  "{name} vermittelt fortgeschrittene Techniken im Bereich {service} mit einem klaren Fokus auf Qualität und Präzision. In {stadt} begleitet sie Teilnehmerinnen individuell und praxisnah.",
  "Als erfahrene Dozentin unterstützt {name} Beauty-Profis dabei, ihre bestehenden Kenntnisse im Bereich {service} weiter auszubauen. Ihr Training in {stadt} richtet sich gezielt an fortgeschrittene Teilnehmerinnen.",
  "{name} kombiniert fachliche Erfahrung mit praxisorientierter Wissensvermittlung im Bereich {service}. Teilnehmerinnen aus {stadt} schätzen ihre professionelle und strukturierte Arbeitsweise.",
  "Die Trainings von {name} richten sich an erfahrene Beauty-Profis, die ihre Technik im Bereich {service} gezielt verbessern möchten. In {stadt} begleitet sie Teilnehmerinnen mit persönlichem Feedback und praxisnaher Unterstützung.",
  "{name} vermittelt professionelle Arbeitsweisen und moderne Techniken im Bereich {service}. Ihr Fokus in {stadt} liegt auf individueller Förderung und nachhaltiger Qualitätssteigerung.",
  "Mit ihrem praxisnahen Ansatz unterstützt {name} erfahrene Teilnehmerinnen dabei, ihre Fähigkeiten im Bereich {service} weiter zu perfektionieren. Das Training in {stadt} ist auf professionelle Weiterentwicklung ausgerichtet.",
  "{name} begleitet Beauty-Profis aus {stadt} bei ihrer fachlichen Spezialisierung im Bereich {service}. Ihre Trainings zeichnen sich durch persönliche Betreuung und praxisorientierte Inhalte aus.",
  "Im Bereich {service} steht {name} für professionelle Weiterbildung und individuelle Unterstützung. Teilnehmerinnen in {stadt} profitieren von ihrem klaren Fokus auf Präzision und Qualität.",
  "{name} gibt ihre Erfahrung im Bereich {service} praxisnah an fortgeschrittene Teilnehmerinnen weiter. In {stadt} schafft sie ein professionelles Lernumfeld mit persönlicher Begleitung.",
  "Die Arbeit von {name} konzentriert sich auf die fachliche Weiterentwicklung erfahrener Beauty-Profis im Bereich {service}. Ihr Training in {stadt} verbindet moderne Techniken mit individueller Betreuung.",
  "{name} unterstützt Teilnehmerinnen dabei, ihre Professionalität und Technik im Bereich {service} gezielt auszubauen. In {stadt} vermittelt sie praxisorientiertes Wissen mit hohem Qualitätsanspruch.",
  "Als erfahrene Fachdozentin vermittelt {name} fortgeschrittene Inhalte rund um {service}. Teilnehmerinnen aus {stadt} profitieren von ihrem praxisnahen und strukturierten Trainingsstil.",
  "{name} begleitet erfahrene Beauty-Profis mit einem klaren Fokus auf Qualität, Präzision und professionelle Weiterentwicklung im Bereich {service}. Ihre Trainings in {stadt} sind individuell und praxisnah gestaltet.",
  "Mit ihrem professionellen Ansatz unterstützt {name} Teilnehmerinnen dabei, ihre Kenntnisse im Bereich {service} gezielt weiterzuentwickeln. In {stadt} vermittelt sie praxisorientierte Techniken für fortgeschrittene Anwenderinnen.",
  "{name} steht für moderne Weiterbildung im Bereich {service} und begleitet erfahrene Teilnehmerinnen auf ihrem nächsten Entwicklungsschritt. Ihr Training in {stadt} ist praxisnah und professionell aufgebaut.",
  "Im Fokus von {name} steht die gezielte Perfektionierung bestehender Fähigkeiten im Bereich {service}. Teilnehmerinnen in {stadt} profitieren von ihrer praxisorientierten und persönlichen Arbeitsweise.",
  "{name} vermittelt professionelle Techniken und moderne Arbeitsweisen im Bereich {service}. In {stadt} begleitet sie erfahrene Beauty-Profis mit individuellem Feedback und praxisnaher Unterstützung.",
  "Als Dozentin im Bereich {service} unterstützt {name} erfahrene Teilnehmerinnen bei ihrer fachlichen Weiterentwicklung. Ihr Training in {stadt} verbindet praktische Anwendung mit professioneller Betreuung.",
];

// -------------------- ROTATIONS-LOGIK --------------------

// Deterministischer Hash aus dem Slug (gleiche Dozentin -> immer gleiche Auswahl).
function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return h;
}

function applyVars(text: string, vars: Vars): string {
  return text
    .replaceAll("{name}", vars.name)
    .replaceAll("{stadt}", vars.stadt)
    .replaceAll("{service}", vars.service);
}

/**
 * Liefert eine feste, dozentinnen-spezifische Auswahl an FAQ.
 * Verschiedene Slugs -> verschiedene Startpunkte UND verschiedene
 * Schrittweiten, damit benachbarte Dozentinnen nicht dieselben Fragen zeigen.
 */
export function getDozentinFaqs(slug: string, vars: Vars, count = 7): FaqItem[] {
  const total = faqPool.length;
  const h = hashSlug(slug);
  const start = h % total;
  // Schrittweite teilerfremd zu total (50) wählen -> volle Streuung.
  const stepOptions = [7, 9, 11, 13, 17, 19, 21, 23];
  const step = stepOptions[h % stepOptions.length];
  const picked: FaqItem[] = [];
  const used = new Set<number>();
  let idx = start;
  while (picked.length < Math.min(count, total)) {
    if (!used.has(idx)) {
      used.add(idx);
      const item = faqPool[idx];
      picked.push({
        frage: applyVars(item.frage, vars),
        antwort: applyVars(item.antwort, vars),
      });
    }
    idx = (idx + step) % total;
    // Sicherheitsnetz, falls step ungünstig: linear weiterrücken.
    if (used.size >= total) break;
  }
  return picked;
}

/** Liefert genau einen festen Bio-Text für die Dozentin. */
export function getDozentinBio(slug: string, vars: Vars): string {
  const h = hashSlug(slug + "bio"); // anderer Seed als FAQ
  const bio = bioPool[h % bioPool.length];
  return applyVars(bio, vars);
}
