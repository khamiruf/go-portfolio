// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://khamiruf.pages.dev',
  image: {
    // Allow optimizing remote images served from Notion's S3 buckets and
    // OpenLibrary covers.
    domains: ['covers.openlibrary.org'],
    remotePatterns: [{ protocol: 'https' }],
  },
});
