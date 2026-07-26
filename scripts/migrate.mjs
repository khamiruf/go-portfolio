// One-off: migrate content/**/*.md into the Notion Books and Posts databases.
//
//   node --env-file=.env scripts/migrate.mjs
//
// Requires NOTION_TOKEN, NOTION_BOOKS_DB, NOTION_POSTS_DB in .env (run
// setup-notion.mjs first). Idempotent: skips a page whose title already exists,
// so it is safe to re-run.
//
// Legacy images (content bodies + local book covers) are referenced as absolute
// URLs under SITE_URL; the files stay version-controlled in public/assets/media.

import { Client } from '@notionhq/client';
import { markdownToBlocks } from '@tryfabric/martian';
import matter from 'gray-matter';
import fs from 'node:fs';
import path from 'node:path';

const { NOTION_TOKEN, NOTION_BOOKS_DB, NOTION_POSTS_DB } = process.env;
const SITE_URL = (process.env.SITE_URL || 'https://khamiruf.pages.dev').replace(/\/$/, '');
if (!NOTION_TOKEN || !NOTION_BOOKS_DB || !NOTION_POSTS_DB) {
  console.error('Set NOTION_TOKEN, NOTION_BOOKS_DB, NOTION_POSTS_DB in .env first.');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

const richText = (s) => (s ? [{ type: 'text', text: { content: String(s) } }] : []);
const multi = (tags) => (tags ?? []).map((name) => ({ name: String(name) }));

/**
 * Rewrite site-relative image URLs in markdown to absolute before conversion.
 * martian only emits an image block for a valid http(s) URL — a relative
 * "/assets/..." would otherwise degrade to a text paragraph.
 */
function absolutizeMarkdown(md) {
  return md.replace(/(!\[[^\]]*\]\()(\/[^)\s]+)(\))/g, `$1${SITE_URL}$2$3`);
}

const toBlocks = (md) => absolutizeImages(markdownToBlocks(absolutizeMarkdown(md)));

/** Rewrite site-relative image URLs to absolute so Notion accepts them. */
function absolutizeImages(blocks) {
  for (const block of blocks) {
    if (block.type === 'image' && block.image?.type === 'external') {
      const url = block.image.external.url;
      if (url.startsWith('/')) block.image.external.url = SITE_URL + url;
    }
    const children = block[block.type]?.children;
    if (Array.isArray(children)) absolutizeImages(children);
  }
  return blocks;
}

/** The (single) data source id backing a database — needed by the 2025 API. */
async function dataSourceId(databaseId) {
  const db = await notion.databases.retrieve({ database_id: databaseId });
  const id = db.data_sources?.[0]?.id;
  if (!id) throw new Error(`No data source found for database ${databaseId}`);
  return id;
}

/** Collect the set of existing page titles (Name) in a data source. */
async function existingTitles(dsId) {
  const titles = new Set();
  let cursor;
  do {
    const res = await notion.dataSources.query({ data_source_id: dsId, start_cursor: cursor });
    for (const page of res.results) {
      const t = page.properties?.Name?.title?.[0]?.plain_text;
      if (t) titles.add(t);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return titles;
}

async function createPage({ dsId, properties, cover, blocks }) {
  const first = blocks.slice(0, 100);
  const rest = blocks.slice(100);
  const page = await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: dsId },
    properties,
    ...(cover ? { cover } : {}),
    children: first,
  });
  for (let i = 0; i < rest.length; i += 100) {
    await notion.blocks.children.append({ block_id: page.id, children: rest.slice(i, i + 100) });
  }
  return page;
}

function mdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => path.join(dir, f));
}

async function migrateBooks() {
  const dsId = await dataSourceId(NOTION_BOOKS_DB);
  const seen = await existingTitles(dsId);
  let created = 0, skipped = 0;
  for (const file of mdFiles('content/books')) {
    const { data } = matter(fs.readFileSync(file, 'utf8'));
    const title = data.title;
    if (!title) continue;
    if (seen.has(title)) { skipped++; continue; }

    const properties = {
      Name: { title: richText(title) },
      Author: { rich_text: richText(data.author) },
      Translator: { rich_text: richText(data.translator) },
      ISBN: { rich_text: richText(data.isbn) },
      Status: data.status ? { select: { name: String(data.status) } } : { select: null },
      Tags: { multi_select: multi(data.tags) },
      Published: { checkbox: true },
    };
    if (data.progress != null) properties.Progress = { number: Number(data.progress) };
    if (data.rating != null) properties.Rating = { number: Number(data.rating) };
    if (data.date_read) properties['Date Read'] = { date: { start: String(data.date_read) } };

    // Local cover with no ISBN → store as the page cover (absolute URL).
    let cover;
    if (!data.isbn && typeof data.cover === 'string' && data.cover.startsWith('/')) {
      cover = { type: 'external', external: { url: SITE_URL + data.cover } };
    }

    const blocks = data.note ? toBlocks(String(data.note)) : [];
    await createPage({ dsId, properties, cover, blocks });
    created++;
    console.log(`book  + ${title}`);
  }
  console.log(`Books: ${created} created, ${skipped} skipped.`);
}

async function migratePosts() {
  const dsId = await dataSourceId(NOTION_POSTS_DB);
  const seen = await existingTitles(dsId);
  const sections = ['learnings', 'projects', 'travel'];
  let created = 0, skipped = 0;
  for (const section of sections) {
    for (const file of mdFiles(path.join('content', section))) {
      const { data, content } = matter(fs.readFileSync(file, 'utf8'));
      const title = data.title || path.basename(file, '.md');
      if (seen.has(title)) { skipped++; continue; }

      const properties = {
        Name: { title: richText(title) },
        Section: { select: { name: section } },
        Tags: { multi_select: multi(data.tags) },
        Published: { checkbox: true },
      };
      if (data.date) properties.Date = { date: { start: String(data.date) } };

      const blocks = toBlocks(content);
      await createPage({ dsId, properties, blocks });
      created++;
      console.log(`${section} + ${title}`);
    }
  }
  console.log(`Posts: ${created} created, ${skipped} skipped.`);
}

await migrateBooks();
await migratePosts();
console.log('\nMigration complete.');
