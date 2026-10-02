// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://khamiruf.com',
  integrations: [sitemap()],
  image: {
    // Remote images (Notion uploads, page covers) are downloaded and optimized
    // at build time. This is deliberately broad: Notion serves files from
    // several hosts (S3, notion.so, Unsplash for gallery covers), and any host
    // missing here would be hotlinked instead — Notion's S3 URLs expire after
    // an hour. With static output there is no runtime image endpoint, so the
    // breadth has no request-forgery exposure.
    remotePatterns: [{ protocol: 'https' }],
  },
});
