# Setup — Notion-backed Astro site

The site is a static Astro build that pulls all content from two Notion
databases (`Books`, `Posts`). Below is the one-time setup.

## 1. Create a Notion integration (get a token)

1. Go to https://www.notion.so/my-integrations → **New integration** (internal).
2. Copy the **Internal Integration Secret** (`ntn_...` / `secret_...`).

## 2. Create a parent page and share it

1. In Notion, create an empty page (e.g. "Site CMS").
2. On that page: **⋯ menu → Connections → add your integration**.
3. Copy the page URL (the databases will be created inside it).

## 3. Fill in `.env`

```
cp .env.example .env
```

Set:

```
NOTION_TOKEN=ntn_xxx
NOTION_PARENT_PAGE=https://www.notion.so/....   # the page from step 2
```

## 4. Create the databases

```
npm run setup:notion
```

This creates `Books` and `Posts` and appends `NOTION_BOOKS_DB` /
`NOTION_POSTS_DB` to `.env`.

## 5. Migrate existing markdown into Notion (one-off)

```
npm run migrate
```

Reads `content/**/*.md` and creates a Notion page per book/post. Idempotent —
safe to re-run. Legacy images stay in `public/assets/media/` and are referenced
by absolute URL (`SITE_URL`, default `https://khamiruf.pages.dev`); override with
`SITE_URL=...` if the domain differs.

## 6. Build / develop

```
npm run dev      # local dev server
npm run build    # static output in dist/
```

## Day-to-day

Add or edit content in Notion. New `Posts` need `Section` set and `Published`
checked. Rebuild (locally or via the Cloudflare Pages deploy hook) to publish.

## Deploy (Cloudflare Pages)

- Framework preset: **Astro**. Build: `npm run build`. Output dir: `dist`.
- Set build env vars: `NOTION_TOKEN`, `NOTION_BOOKS_DB`, `NOTION_POSTS_DB`.
- Add a **Deploy Hook**; trigger it from a Notion automation (or a cron) so
  content changes rebuild the site.
