import type { APIRoute } from 'astro';
import { supabase } from '../lib/supabase';

export const prerender = true;

export const GET: APIRoute = async () => {
  const BASE_URL = 'https://avgs-kurse.vercel.app';
  const today = new Date().toISOString().split('T')[0];

  const urls = new Set<string>();

  // All city pages
  const { data: cities } = await supabase
    .from('cities')
    .select('slug');

  for (const city of cities ?? []) {
    if (city?.slug) urls.add(`${BASE_URL}/${city.slug}`);
  }

  // Dozentin pages + city/service combinations
  const { data: dozentinnen } = await supabase
    .from('dozentinnen')
    .select(`
      slug,
      cities(slug),
      dozentin_services(
        services(slug)
      )
    `)
    .eq('active', true);

  for (const d of dozentinnen ?? []) {
    if (d?.slug) urls.add(`${BASE_URL}/dozentinnen/${d.slug}`);

    const city = Array.isArray(d.cities) ? d.cities[0] : d.cities;
    if (!city?.slug) continue;

    const dsRows = Array.isArray(d.dozentin_services) ? d.dozentin_services : [];
    for (const ds of dsRows) {
      const service = Array.isArray(ds?.services) ? ds.services[0] : ds?.services;
      if (service?.slug) {
        urls.add(`${BASE_URL}/${city.slug}/${service.slug}`);
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from(urls)
  .map(
    url => `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
