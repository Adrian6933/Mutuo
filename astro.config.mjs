import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  // al publicar, pon aquí la URL real (p. ej. 'https://mutuo.netlify.app') para canonical/og:url
  // site: 'https://TU-URL',
  integrations: [react()],
});
