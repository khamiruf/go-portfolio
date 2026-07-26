// One-off: add a `Published` checkbox to the Books database and set every
// existing book to checked, so gating the collection on Published doesn't hide
// anything already migrated.
//
//   node --env-file=.env scripts/add-books-published.mjs

import { Client } from '@notionhq/client';

const { NOTION_TOKEN, NOTION_BOOKS_DB } = process.env;
if (!NOTION_TOKEN || !NOTION_BOOKS_DB) {
  console.error('Set NOTION_TOKEN and NOTION_BOOKS_DB in .env first.');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

const db = await notion.databases.retrieve({ database_id: NOTION_BOOKS_DB });
const dsId = db.data_sources?.[0]?.id;
if (!dsId) throw new Error('No data source for Books database');

// 1. Add the property (merges into the existing schema).
await notion.dataSources.update({
  data_source_id: dsId,
  properties: { Published: { checkbox: {} } },
});
console.log('Added Published checkbox to Books.');

// 2. Backfill every existing book to Published = true.
let cursor, count = 0;
do {
  const res = await notion.dataSources.query({ data_source_id: dsId, start_cursor: cursor });
  for (const page of res.results) {
    await notion.pages.update({ page_id: page.id, properties: { Published: { checkbox: true } } });
    count++;
  }
  cursor = res.has_more ? res.next_cursor : undefined;
} while (cursor);

console.log(`Set Published = true on ${count} books.`);
