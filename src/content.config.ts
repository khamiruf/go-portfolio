import { defineCollection, z } from 'astro:content';
import { notionLoader, notionPageSchema } from 'notion-astro-loader';
import { transformedPropertySchema as t } from 'notion-astro-loader/schemas';

const NOTION_TOKEN = import.meta.env.NOTION_TOKEN;

/**
 * Books collection — one Notion page per book. Page body = the reading note.
 * Cover art comes from the Notion page cover, or is derived from the ISBN at
 * render time (openlibrary), mirroring the old Go behaviour.
 */
const books = defineCollection({
  loader: notionLoader({
    auth: NOTION_TOKEN,
    database_id: import.meta.env.NOTION_BOOKS_DB,
    // Newest reads first; unread ones (no date) sink to the bottom.
    sorts: [{ property: 'Date Read', direction: 'descending' }],
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
