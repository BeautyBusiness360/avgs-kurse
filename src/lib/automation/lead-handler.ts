import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../email/resend';
import { leadNotificationTemplate, leadConfirmationTemplate } from '../email/templates';
import { log } from '../logging/logger';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function handleNewLead(lead: {
  id: string; name: string; email: string; phone: string;
  dozentin_slug: string; city_slug: string; service_slug: string; consent: boolean;
}) {
  // 1. Dozentin E-Mail laden
  const { data: dozentin } = await supabase
    .from('dozentinnen')
    .select('email, first_name, last_name')
    .eq('slug', lead.dozentin_slug)
    .single();

  // 2. Benachrichtigung an Dozentin
  if (dozentin?.email) {
    const { subject, html } = leadNotificationTemplate(lead);
    const sent = await sendEmail(dozentin.email, subject, html);
    await log('lead-notification', sent ? 'success' : 'error',
      `Lead ${lead.id} → Dozentin ${lead.dozentin_slug}`, { leadId: lead.id });
  }

  // 3. Bestätigung an Interessentin (nur wenn consent = true)
  if (lead.consent && lead.email) {
    const { subject, html } = leadConfirmationTemplate(lead.name ?? 'Interessentin');
    const sent = await sendEmail(lead.email, subject, html);
    await log('lead-confirmation', sent ? 'success' : 'error',
      `Bestätigung → ${lead.email}`, { leadId: lead.id });
  }
}
