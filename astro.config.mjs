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
  }
});
