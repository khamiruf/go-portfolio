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
checked; new `Books` need `Published` checked to appear. Rebuild (locally or via
the Cloudflare Pages deploy hook) to publish. Unchecking `Published` hides an item
on the next build.

## Deploy (Cloudflare Pages)

1. Connect the repo in Cloudflare Pages. Framework preset: **Astro**.
   Build command `npm run build`, output dir `dist`.
2. Build env vars: `NOTION_TOKEN`, `NOTION_BOOKS_DB`, `NOTION_POSTS_DB`.
   (Node is pinned to 22 via `.nvmrc`.)
3. Push to the connected branch → Cloudflare builds and deploys.

## Rebuild when Notion changes (event-driven)

Content edits in Notion don't touch git, so a **Deploy Hook** rebuilds the site.

1. **Create the Deploy Hook.** CF Pages → your project → **Settings → Builds &
   deployments → Deploy hooks → Add** → name it, pick the production branch →
   copy the URL. Treat this URL as a secret (anyone with it can trigger builds).
2. **Wire a Notion automation to it — in BOTH databases.** Both `Posts` and
   `Books` have a `Published` checkbox. In each: **•••  → Automations → New
   automation**:
   - **Trigger:** `Published` **is set to** checked. (Gate on this explicit
     signal — do NOT trigger on "any edit", or Notion fires on every autosave and
     you get a rebuild storm.)
   - **Action:** **Send webhook** → paste the **same** Deploy Hook URL, method
     `POST`. No body or headers needed — the hook ignores them.

   One hook, two automations (Posts + Books). Any trigger rebuilds the whole site
   (the build re-pulls both databases).
3. **For editing already-published content** (e.g. fixing a note without touching
   a property): property automations don't fire on page-body edits, so rebuild
   manually — `curl -X POST "<hook-url>"`, or CF Pages → Deployments → **Create
   deployment**, or toggle `Published` off/on.

Requires Notion **automations** (paid plans). If unavailable, fall back to a cron
(GitHub Action or CF cron trigger) that `POST`s the Deploy Hook every ~30–60 min.

Rebuilds are cheap: Astro's Content Layer caches by `last_edited_time`, so only
changed pages re-render.
