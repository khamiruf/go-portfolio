// One-off: create the Books and Posts databases under a parent Notion page.
//
//   node --env-file=.env scripts/setup-notion.mjs
//
// Requires in .env:
//   NOTION_TOKEN        internal integration secret (ntn_... / secret_...)
//   NOTION_PARENT_PAGE  a page (URL or id) shared with the integration; the
//                       two databases are created as its children.
//
// On success it appends NOTION_BOOKS_DB / NOTION_POSTS_DB to .env.

import { Client } from '@notionhq/client';
import fs from 'node:fs';

const { NOTION_TOKEN, NOTION_PARENT_PAGE } = process.env;
if (!NOTION_TOKEN || !NOTION_PARENT_PAGE) {
  console.error('Set NOTION_TOKEN and NOTION_PARENT_PAGE in .env first.');
  process.exit(1);
}

/** Accept a raw id or any Notion URL and return a dashed UUID. */
function toId(input) {
  const hex = input.replace(/-/g, '').match(/[0-9a-f]{32}/i);
  if (!hex) throw new Error(`Could not find a Notion id in "${input}"`);
  const s = hex[0];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

const notion = new Client({ auth: NOTION_TOKEN });
const parent = { type: 'page_id', page_id: toId(NOTION_PARENT_PAGE) };

const booksProps = {
  Name: { title: {} },
  Author: { rich_text: {} },
  Translator: { rich_text: {} },
  ISBN: { rich_text: {} },
  Progress: { number: {} },
  Status: {
    select: {
      options: [
        { name: 'reading', color: 'blue' },
        { name: 'read', color: 'green' },
        { name: 'want-to-read', color: 'gray' },
      ],
    },
  },
  Rating: { number: {} },
  'Date Read': { date: {} },
  Tags: { multi_select: { options: [] } },
};

const postsProps = {
  Name: { title: {} },
  Date: { date: {} },
  Section: {
    select: {
      options: [
        { name: 'learnings', color: 'purple' },
        { name: 'projects', color: 'orange' },
        { name: 'travel', color: 'yellow' },
      ],
    },
  },
  Tags: { multi_select: { options: [] } },
  Published: { checkbox: {} },
};

async function createDb(title, properties) {
  const res = await notion.databases.create({
    parent,
    title: [{ type: 'text', text: { content: title } }],
    initial_data_source: { properties },
  });
  console.log(`Created "${title}" → ${res.id}`);
  return res.id;
}

const booksId = await createDb('Books', booksProps);
const postsId = await createDb('Posts', postsProps);

fs.appendFileSync(
  '.env',
  `\n# Created by setup-notion.mjs\nNOTION_BOOKS_DB=${booksId}\nNOTION_POSTS_DB=${postsId}\n`,
);
console.log('\nWrote NOTION_BOOKS_DB and NOTION_POSTS_DB to .env');
