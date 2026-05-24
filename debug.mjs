import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://oigyvamkcmtimhbtqbif.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pZ3l2YW1rY210aW1oYnRxYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTMzNTcsImV4cCI6MjA5NDg4OTM1N30.nn_6HjKNyJDtn2gll2ZLd4z6R2RAMVUfeyYCq3eJEKw'
);

const { data, error } = await supabase
  .from('dozentinnen')
  .select(`
    slug,
    active,
    cities(slug, name),
    dozentin_services(
      services(slug, name)
    )
  `)
  .eq('active', true);

if (error) {
  console.log('FEHLER:', error);
  process.exit(1);
}

for (const d of data) {
  console.log('---');
  console.log('dozentin:', d.slug);
  console.log('cities:', JSON.stringify(d.cities));
  console.log('dozentin_services:', JSON.stringify(d.dozentin_services));
}