import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://dein-beauty-kurs.de',
  trailingSlash: 'always',
  build: {
    format: 'directory'
  }
});
