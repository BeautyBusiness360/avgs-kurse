import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'static',
  adapter: vercel(),
  site: 'https://dein-beauty-kurs.de',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    inlineStylesheets: 'always'
  },
  redirects: {
    '/berlin':             { status: 301, destination: '/berlin/' },
    '/luxbeauty':          { status: 301, destination: '/' },
    '/info-veranstaltung': { status: 301, destination: '/' },
    '/train-the-trainer':  { status: 301, destination: '/' },
  }
});
