import { defineCollection, z } from 'astro:content';
import { notionLoader, notionPageSchema } from 'notion-astro-loader';
import { transformedPropertySchema as t } from 'notion-astro-loader/schemas';

const NOTION_TOKEN = import.meta.env.NOTION_TOKEN;

// Fail fast with a readable message instead of an opaque Notion API error.
const requiredEnv = {
  NOTION_TOKEN,
  NOTION_BOOKS_DB: import.meta.env.NOTION_BOOKS_DB,
  NOTION_POSTS_DB: import.meta.env.NOTION_POSTS_DB,
};
const missing = Object.entries(requiredEnv)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length > 0) {
  throw new Error(`Missing ${missing.join(', ')}. Copy .env.example to .env (see SETUP.md).`);
}

/**
 * Books collection — one Notion page per book. Page body = the reading note.
 * Covers are resolved at render time by `bookCover` (src/lib/notion.ts).
 */
const books = defineCollection({
  loader: notionLoader({
    auth: NOTION_TOKEN,
    database_id: import.meta.env.NOTION_BOOKS_DB,
    // Newest reads first; unread ones (no date) sink to the bottom.
    sorts: [{ property: 'Date Read', direction: 'descending' }],
    // Only surface published books.
    filter: { property: 'Published', checkbox: { equals: true } },
  }),
  schema: notionPageSchema({
    properties: z.object({
      Name: t.title,
      Author: t.rich_text,
      Translator: t.rich_text,
      ISBN: t.rich_text,
      Progress: t.number.nullable(),
      Status: t.select,
      Rating: t.number.nullable(),
      'Date Read': t.date.nullable(),
      Tags: t.multi_select,
      Published: t.checkbox,
    }),
  }),
});

/**
 * Posts collection — learnings, projects, travel share one database, split by
 * the `Section` select. Page body = the post content.
 */
const posts = defineCollection({
  loader: notionLoader({
    auth: NOTION_TOKEN,
    database_id: import.meta.env.NOTION_POSTS_DB,
    sorts: [{ property: 'Date', direction: 'descending' }],
    // Only surface published posts.
    filter: { property: 'Published', checkbox: { equals: true } },
  }),
  schema: notionPageSchema({
    properties: z.object({
      Name: t.title,
      Date: t.date.nullable(),
      Section: t.select,
      Tags: t.multi_select,
      Published: t.checkbox,
    }),
  }),
});

export const collections = { books, posts };
