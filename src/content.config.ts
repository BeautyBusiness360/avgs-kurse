import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const ratgeber = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/ratgeber' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    modul: z.enum(['microblading', 'powderbrows', 'wimpernverlaengerung', 'camouflage-removal', 'velvet-lips', 'fachkosmetikerin']),
    stadt: z.string(),
    stadtSlug: z.string(),
    serviceSlug: z.string(),
    relatedDozentinSlug: z.string().optional(),
    relatedDozentinName: z.string().optional(),
    publishDate: z.date(),
    faq: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })).optional(),
  }),
});

export const collections = { ratgeber };
