export function leadNotificationTemplate(lead: {
  name: string; email: string; phone: string;
  dozentin_slug: string; city_slug: string; service_slug: string;
}) {
  return {
    subject: `Neue Kursanfrage – ${lead.name}`,
    html: `
      <h2>Neue Anfrage über deine Kursseite</h2>
      <table>
        <tr><td><strong>Name</strong></td><td>${lead.name}</td></tr>
        <tr><td><strong>E-Mail</strong></td><td>${lead.email}</td></tr>
        <tr><td><strong>Telefon</strong></td><td>${lead.phone}</td></tr>
        <tr><td><strong>Stadt</strong></td><td>${lead.city_slug}</td></tr>
        <tr><td><strong>Kurs</strong></td><td>${lead.service_slug}</td></tr>
      </table>
      <p>Bitte melde dich zeitnah bei der Interessentin.</p>
    `
  };
}

export function leadConfirmationTemplate(name: string) {
  return {
    subject: 'Deine Kursanfrage – Nächste Schritte',
    html: `
      <h2>Vielen Dank, ${name}!</h2>
      <p>Wir haben deine Anfrage erhalten.</p>
      <h3>Deine nächsten Schritte:</h3>
      <ol>
        <li>Termin bei der Arbeitsagentur oder dem Jobcenter vereinbaren</li>
        <li>AVGS-Gutschein beantragen (die Unterlagen helfen dabei)</li>
        <li>Mit dem Gutschein direkt die Dozentin kontaktieren</li>
      </ol>
      <p>Bei Fragen stehen wir dir jederzeit zur Verfügung.</p>
    `
  };
}

export function onboardingTemplate(dozentin: {
  first_name: string; last_name: string;
}) {
  return {
    subject: `Willkommen im BeautyBusiness360 System, ${dozentin.first_name}!`,
    html: `
      <h2>Hallo ${dozentin.first_name}!</h2>
      <p>Du bist jetzt Teil des BeautyBusiness360 Netzwerks.</p>
      <h3>Deine nächsten Schritte:</h3>
      <ol>
        <li>Profilfoto hochladen</li>
        <li>Bio vervollständigen</li>
        <li>Jotform-Formular für deine Kurse einrichten</li>
        <li>Kurse (Module) in deinem Profil bestätigen</li>
      </ol>
      <p>Wir melden uns in Kürze mit weiteren Infos.</p>
    `
  };
}

export function weeklyReportTemplate(data: {
  leads: number; cities: number; dozentinnen: number;
  topLeads: { dozentin_slug: string; count: number }[];
}) {
  const topList = data.topLeads
    .map(t => `<li>${t.dozentin_slug}: ${t.count} Leads</li>`)
    .join('');

  return {
    subject: `Wochenbericht BeautyBusiness360 – KW ${getCalendarWeek()}`,
    html: `
      <h2>Wochenbericht</h2>
      <table>
        <tr><td><strong>Neue Leads</strong></td><td>${data.leads}</td></tr>
        <tr><td><strong>Aktive Städte</strong></td><td>${data.cities}</td></tr>
        <tr><td><strong>Aktive Dozentinnen</strong></td><td>${data.dozentinnen}</td></tr>
      </table>
      <h3>Top Dozentinnen nach Leads:</h3>
      <ol>${topList}</ol>
    `
  };
}

function getCalendarWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}
