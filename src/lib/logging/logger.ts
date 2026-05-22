import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function log(
  scenario: string,
  status: 'success' | 'error' | 'warning',
  message: string,
  payload?: object
) {
  await supabase.from('automation_logs').insert({
    scenario,
    status,
    message,
    payload: payload ?? null
  });
}
