import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { getCollection, type CollectionEntry } from 'astro:content';
import { fileToImageAsset, fileToUrl } from 'notion-astro-loader';
import sharp from 'sharp';

export type BookEntry = CollectionEntry<'books'>;
export type PostEntry = CollectionEntry<'posts'>;

export const SECTIONS = ['readings', 'projects', 'learnings', 'travel'] as const;
export const POST_SECTIONS = ['projects', 'learnings', 'travel'] as const;
export type PostSection = (typeof POST_SECTIONS)[number];

/**
 * Slugify a title the way the previous site did, so existing URLs keep working:
 * lowercase, apostrophes dropped (not hyphenated), everything else collapsed to
 * single hyphens. e.g. "I'm Glad My Mom Died" -> "im-glad-my-mom-died".
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const slugMaps = new Map<string, Promise<Map<string, string>>>();

/**
 * Assign every entry in a collection a unique URL slug. Titles that slugify to
 * nothing (e.g. all-Japanese) fall back to the Notion page id, and titles that
 * collide within the same URL space get a short id suffix instead of silently
 * overwriting each other's page.
 */
function slugMap(collection: 'books' | 'posts'): Promise<Map<string, string>> {
  let cached = slugMaps.get(collection);
  if (!cached) {
    cached = getCollection(collection).then((entries) => {
      const map = new Map<string, string>();
      const taken = new Set<string>();
      for (const e of [...entries].sort((a, b) => a.id.localeCompare(b.id))) {
        const scope = e.collection === 'posts' ? e.data.properties.Section ?? '' : '';
        const shortId = e.id.replace(/-/g, '').slice(0, 6);
        let slug = slugify(e.data.properties.Name) || shortId;
        if (taken.has(`${scope}/${slug}`)) {
          console.warn(`[slugs] duplicate "${scope}/${slug}", using "${slug}-${shortId}" for ${e.id}`);
          slug = `${slug}-${shortId}`;
        }
        taken.add(`${scope}/${slug}`);
        map.set(e.id, slug);
      }
      return map;
    });
    slugMaps.set(collection, cached);
  }
  return cached;
}

export async function slugFor(entry: BookEntry | PostEntry): Promise<string> {
  return (await slugMap(entry.collection)).get(entry.id) ?? slugify(entry.data.properties.Name);
}

/** Root-relative URL of an entry's detail page. */
export async function hrefFor(entry: BookEntry | PostEntry): Promise<string> {
  const section = entry.collection === 'books' ? 'readings' : entry.data.properties.Section;
  return `/${section}/${await slugFor(entry)}/`;
}

/** Render an integer 0–5 rating as filled/empty dots. */
export function ratingDots(r: number | null | undefined): string {
  if (!r) return '';
  return '●'.repeat(r) + '○'.repeat(5 - r);
}

type NotionDate = { start: Date | string; end: Date | string | null; time_zone: string | null } | null;

/** Pull the start date out of a transformed Notion date property. */
export function dateStart(d: NotionDate): Date | null {
  if (!d || !d.start) return null;
  return d.start instanceof Date ? d.start : new Date(d.start);
}

// The Notion loader's content-layer cache can leave previously-synced entries
// in stale positions (it only repositions pages whose last_edited_time
// changed), so post lists must sort explicitly rather than trust collection
// order. Undated posts sink to the bottom; same-day posts fall back to title
// (numeric-aware, descending) so "Part 2" sits above "Part 1".
const titleCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Sort comparator: newest post first. */
export function byDateDesc(a: PostEntry, b: PostEntry): number {
  const aTime = dateStart(a.data.properties.Date)?.getTime() ?? -Infinity;
  const bTime = dateStart(b.data.properties.Date)?.getTime() ?? -Infinity;
  if (aTime !== bTime) return bTime > aTime ? 1 : -1;
  return titleCollator.compare(b.data.properties.Name ?? '', a.data.properties.Name ?? '');
}

// en-CA formats as YYYY-MM-DD. Dates are shown in Singapore time: a Notion
// date-only value parses as UTC midnight (still the same day at UTC+8), and a
// date with a time no longer slips back a day when it falls before 08:00 SGT.
const siteDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "2026-06-10" style. */
export function isoDate(d: Date | null): string {
  if (!d) return '';
  return siteDate.format(d);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

/** Decode character references (rehype emits e.g. `&#x26;` for "&"). */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[ref.toLowerCase()] ?? match;
  });
}

/**
 * Plain-text summary of rendered HTML — for meta descriptions and RSS. The
 * result is unescaped text; Astro and @astrojs/rss escape it on output.
 */
export function excerpt(html: string, max = 160): string {
  const text = decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text;
}

const sizeCache = new Map<string, Promise<{ width: number; height: number } | null>>();
const PUBLIC_DIR = resolve(process.cwd(), 'public');

/**
 * Intrinsic size of a file under public/, or null if it can't be read. The
 * path comes from post HTML, so refuse anything that resolves outside public/
 * (e.g. `/assets/%2e%2e/%2e%2e/...`).
 */
function publicImageSize(path: string) {
  let cached = sizeCache.get(path);
  if (!cached) {
    let file: string;
    try {
      file = resolve(PUBLIC_DIR, `.${decodeURIComponent(path)}`);
    } catch {
      return Promise.resolve(null); // malformed percent-encoding
    }
    if (!file.startsWith(PUBLIC_DIR + sep)) return Promise.resolve(null);
    cached = readFile(file)
      .then((buf) => sharp(buf).metadata())
      .then((m) => (m.width && m.height ? { width: m.width, height: m.height } : null))
      .catch(() => null);
    sizeCache.set(path, cached);
  }
  return cached;
}

/**
 * Post-process rendered Notion HTML:
 * - Legacy images live in public/assets and were referenced by absolute URL so
 *   Notion would accept them. Strip the host back to a root-relative path so
 *   they resolve on any domain and are served straight from the build output.
 * - Lazy-load every image after the first (the first is likely above the fold)
 *   and decode off the main thread.
 * - Give local images intrinsic width/height so the page doesn't jump as they
 *   arrive.
 */
export async function prepareHtml(html: string): Promise<string> {
  const localized = html.replace(/https?:\/\/[^/"']+(\/assets\/)/g, '$1');
  const tags = [...localized.matchAll(/<img\b[^>]*>/g)];
  const replacements = await Promise.all(
    tags.map(async ([tag], i) => {
      let attrs = '';
      if (i > 0 && !/\sloading=/.test(tag)) attrs += ' loading="lazy"';
      if (!/\sdecoding=/.test(tag)) attrs += ' decoding="async"';
      const src = tag.match(/\ssrc="(\/assets\/[^"]+)"/)?.[1];
      if (src && !/\swidth=/.test(tag)) {
        const size = await publicImageSize(src);
        if (size) attrs += ` width="${size.width}" height="${size.height}"`;
      }
      return tag.replace(/^<img\b/, `<img${attrs}`);
    }),
  );
  let i = 0;
  return localized.replace(/<img\b[^>]*>/g, () => replacements[i++]);
}

/** Word count + read time (~200 wpm, min 1) from rendered HTML. */
export function readingStats(html: string): { words: number; minutes: number } {
  const text = html.replace(/<[^>]+>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return { words, minutes };
}

/**
 * Resolve a book cover URL. Prefer the stable OpenLibrary cover derived from the
 * ISBN; fall back to the Notion page cover (downloaded and
 * optimized through astro:assets); otherwise none.
 *
 * `default=false` makes OpenLibrary 404 when it has no cover, instead of
 * serving a 1×1 blank image — so the client-side fallback can show the title
 * placeholder rather than an empty box.
 */
export async function bookCover(entry: BookEntry): Promise<string | null> {
  const isbn = entry.data.properties.ISBN?.replace(/[^0-9Xx]/g, '');
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
  }
  const cover = entry.data.cover;
  if (cover) {
    try {
      return (await fileToImageAsset(cover)).src;
    } catch {
      return fileToUrl(cover) ?? null;
    }
  }
  return null;
}
