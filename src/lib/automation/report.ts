import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../email/resend';
import { weeklyReportTemplate } from '../email/templates';
import { log } from '../logging/logger';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function runWeeklyReport() {
  const since = new Date(Date.now() - 7 * 24 * 3600000).toISOString();

  const [leadsRes, citiesRes, dozRes, topRes] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact' }).gte('created_at', since),
    supabase.from('cities').select('id', { count: 'exact' }),
    supabase.from('dozentinnen').select('id', { count: 'exact' }).eq('active', true),
    supabase.from('leads').select('dozentin_slug').gte('created_at', since)
  ]);

  // Top Dozentinnen aggregieren
  const counts: Record<string, number> = {};
  (topRes.data ?? []).forEach(r => {
    counts[r.dozentin_slug] = (counts[r.dozentin_slug] ?? 0) + 1;
  });
  const topLeads = Object.entries(counts)
    .map(([dozentin_slug, count]) => ({ dozentin_slug, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const { subject, html } = weeklyReportTemplate({
    leads: leadsRes.count ?? 0,
    cities: citiesRes.count ?? 0,
    dozentinnen: dozRes.count ?? 0,
    topLeads
  });

  await sendEmail(process.env.ADMIN_EMAIL!, subject, html);
  await log('weekly-report', 'success', `Report gesendet: ${leadsRes.count} Leads`);
}
