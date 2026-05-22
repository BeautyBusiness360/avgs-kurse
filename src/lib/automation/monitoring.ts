import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../email/resend';
import { log } from '../logging/logger';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function runMonitoring() {
  const issues: string[] = [];

  // Check 1: Supabase erreichbar
  const { error } = await supabase.from('leads').select('id').limit(1);
  if (error) issues.push(`Supabase nicht erreichbar: ${error.message}`);

  // Check 2: Letzter Lead älter als 48h (könnte auf Pipeline-Fehler hinweisen)
  const { data: lastLead } = await supabase
    .from('leads')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (lastLead) {
    const hours = (Date.now() - new Date(lastLead.created_at).getTime()) / 3600000;
    if (hours > 48) issues.push(`Kein Lead seit ${Math.round(hours)}h`);
  }

  // Check 3: Fehler in automation_logs (letzte 30 Min)
  const { data: errors } = await supabase
    .from('automation_logs')
    .select('scenario, message')
    .eq('status', 'error')
    .gte('created_at', new Date(Date.now() - 30 * 60000).toISOString());

  if (errors && errors.length > 0) {
    issues.push(`${errors.length} Automation-Fehler in letzten 30 Min`);
  }

  if (issues.length > 0) {
    await sendEmail(
      process.env.ADMIN_EMAIL!,
      `⚠️ System Alert – BeautyBusiness360`,
      `<h2>Monitoring Alert</h2><ul>${issues.map(i => `<li>${i}</li>`).join('')}</ul>`
    );
    await log('monitoring', 'warning', issues.join(' | '));
  } else {
    await log('monitoring', 'success', 'Alle Checks OK');
  }
}
