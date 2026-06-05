import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { supabase } from '../lib/supabase';
import { HUB_CITY_SLUG } from '../data/location-overrides';

export const prerender = true;

export const GET: APIRoute = async () => {
  const BASE_URL = 'https://dein-beauty-kurs.de';
  const today = new Date().toISOString().split('T')[0];

  const urls = new Set<string>();

  // Static pages
  urls.add(`${BASE_URL}/`);
  urls.add(`${BASE_URL}/fachdozentin-werden/`);
  urls.add(`${BASE_URL}/essen/fachkosmetikerin-ausbildung/`);
  urls.add(`${BASE_URL}/ratgeber/`);

  // Ratgeber articles (content collection)
  const ratgeberArticles = await getCollection('ratgeber');
  for (const entry of ratgeberArticles) {
    urls.add(`${BASE_URL}/ratgeber/${entry.id}/`);
  }

  // Dozentin pages + city/service combinations
  const { data: dozentinnen } = await supabase
    .from('dozentinnen')
    .select(`
      slug,
      cities(slug),
      dozentin_services(
        services(slug, avgs_eligible)
      )
    `)
    .eq('active', true);

  // Satellite cities: those whose dozentinnen have a different hub city
  const satelliteCities = new Set<string>();
  for (const d of dozentinnen ?? []) {
    const hubSlug = HUB_CITY_SLUG[d.slug ?? ''];
    const city = Array.isArray(d.cities) ? d.cities[0] : d.cities;
    if (hubSlug && city?.slug && hubSlug !== city.slug) {
      satelliteCities.add(city.slug);
    }
  }

  // Hub city pages only (exclude satellites)
  const { data: cities } = await supabase
    .from('cities')
    .select('slug');

  for (const city of cities ?? []) {
    if (city?.slug && !satelliteCities.has(city.slug)) {
      urls.add(`${BASE_URL}/${city.slug}/`);
    }
  }

  for (const d of dozentinnen ?? []) {
    if (d?.slug) urls.add(`${BASE_URL}/dozentinnen/${d.slug}/`);

    const city = Array.isArray(d.cities) ? d.cities[0] : d.cities;
    if (!city?.slug) continue;

    // Satellite dozentinnen: use hub city slug for service URLs
    const effectiveCitySlug = HUB_CITY_SLUG[d.slug ?? ''] ?? city.slug;

    const dsRows = Array.isArray(d.dozentin_services) ? d.dozentin_services : [];
    for (const ds of dsRows) {
      const service = Array.isArray(ds?.services) ? ds.services[0] : ds?.services;
      // Only include avgs_eligible services — those are the only pages actually built
      if (service?.slug && service?.avgs_eligible) {
        urls.add(`${BASE_URL}/${effectiveCitySlug}/${service.slug}/`);
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
